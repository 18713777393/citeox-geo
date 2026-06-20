import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import {
  AuthSessionStatus,
  LegalConsentType,
  UserRole,
  UserStatus,
  VerificationCodePurpose,
  type User
} from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import {
  ensureDefaultSubscription,
  formatEntitlementsForClient,
  getEntitlementSnapshotForUser
} from "./entitlements.js";

export type ApiRole = "user" | "business_user" | "admin" | "super_admin";
export type AccountType = "personal" | "business";
export type CodePurpose = "register" | "login" | "password_reset";

export interface TokenContext {
  userId: string;
  sessionId: string;
  tokenId: string;
  organizationId: string;
  role: ApiRole;
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

interface JwtPayload {
  sub: string;
  sid: string;
  jti: string;
  organizationId: string;
  role: ApiRole;
}

const jwtIssuer = "zhiyin-geo-api";

export function toApiRole(role: UserRole): ApiRole {
  switch (role) {
    case UserRole.BUSINESS_USER:
      return "business_user";
    case UserRole.ADMIN:
      return "admin";
    case UserRole.SUPER_ADMIN:
      return "super_admin";
    default:
      return "user";
  }
}

export function roleFromAccountType(accountType: AccountType): UserRole {
  return accountType === "business" ? UserRole.BUSINESS_USER : UserRole.USER;
}

export function publicUser(user: Pick<User, "id" | "organizationId" | "email" | "phone" | "displayName" | "role" | "status" | "createdAt" | "lastLoginAt">) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    name: user.displayName,
    email: user.email,
    phone: user.phone,
    role: toApiRole(user.role),
    status: user.status.toLowerCase(),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null
  };
}

export async function registerUser(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  industry: string;
  inviteCode?: string;
  accountType: AccountType;
  companyName?: string;
  legalConsentVersion: string;
  smsCode?: string;
  request: RequestMetadata;
}) {
  if (input.phone) {
    await assertVerificationCode({
      phone: input.phone,
      purpose: "register",
      code: input.smsCode
    });
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])]
    }
  });

  if (existing) {
    throw new HttpError(409, "ACCOUNT_EXISTS", "该邮箱或手机号已注册，请直接登录。");
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_COST);
  const organizationName =
    input.accountType === "business"
      ? input.companyName || input.name
      : `${input.name} 的工作区`;

  const created = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: organizationName,
        slug: await uniqueOrganizationSlug(organizationName),
        industry: input.industry,
        settings: {
          accountType: input.accountType,
          inviteCode: input.inviteCode || null
        }
      }
    });

    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        email: input.email,
        phone: input.phone,
        passwordHash,
        displayName: input.name,
        role: roleFromAccountType(input.accountType),
        status: UserStatus.ACTIVE
      }
    });

    await tx.organization.update({
      where: { id: organization.id },
      data: { ownerId: user.id }
    });

    await tx.legalConsent.createMany({
      data: [LegalConsentType.TERMS, LegalConsentType.PRIVACY].map((consentType) => ({
        userId: user.id,
        organizationId: organization.id,
        consentType,
        version: input.legalConsentVersion,
        ipAddress: input.request.ipAddress,
        userAgent: input.request.userAgent,
        metadata: {
          scene: "register",
          accountType: input.accountType
        }
      })),
      skipDuplicates: true
    });

    return { organization, user };
  });

  await ensureDefaultSubscription(created.organization.id);
  return createAuthResponse(created.user.id, input.request);
}

export async function loginUser(input: {
  account: string;
  password: string;
  request: RequestMetadata;
}) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.account }, { phone: input.account }]
    }
  });

  if (!user?.passwordHash) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "账号或密码不正确，请检查后重试。");
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordOk) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "账号或密码不正确，请检查后重试。");
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new HttpError(403, "ACCOUNT_DISABLED", "账号当前不可用，请联系管理员。");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  return createAuthResponse(user.id, input.request);
}

export async function logoutSession(context: TokenContext) {
  await prisma.authSession.updateMany({
    where: {
      id: context.sessionId,
      userId: context.userId,
      status: AuthSessionStatus.ACTIVE
    },
    data: {
      status: AuthSessionStatus.REVOKED,
      revokedAt: new Date()
    }
  });
}

export async function createVerificationCode(input: {
  phone?: string;
  email?: string;
  purpose: CodePurpose;
  request: RequestMetadata;
}) {
  if (!input.phone && !input.email) {
    throw new HttpError(400, "VALIDATION_ERROR", "请填写手机号或邮箱。");
  }

  const purpose = toVerificationPurpose(input.purpose);
  const cooldownSince = new Date(Date.now() - env.AUTH_CODE_RESEND_SECONDS * 1000);
  const recent = await prisma.verificationCode.findFirst({
    where: {
      purpose,
      phone: input.phone,
      email: input.email,
      lastSentAt: { gt: cooldownSince },
      consumedAt: null
    },
    orderBy: { lastSentAt: "desc" }
  });

  if (recent) {
    throw new HttpError(429, "CODE_RATE_LIMITED", "验证码发送过于频繁，请稍后再试。");
  }

  const code = createNumericCode();
  const codeHash = await bcrypt.hash(code, env.BCRYPT_COST);
  const user = await findUserByAccount(input.email || input.phone || "");

  await prisma.verificationCode.updateMany({
    where: {
      purpose,
      phone: input.phone,
      email: input.email,
      consumedAt: null
    },
    data: { consumedAt: new Date() }
  });

  await prisma.verificationCode.create({
    data: {
      userId: user?.id,
      phone: input.phone,
      email: input.email,
      purpose,
      codeHash,
      expiresAt: minutesFromNow(env.AUTH_CODE_TTL_MINUTES),
      metadata: {
        smsProvider: env.SMS_PROVIDER || "placeholder",
        delivery: "placeholder",
        ipAddress: input.request.ipAddress
      }
    }
  });

  if (input.email) {
    await sendVerificationEmail({
      to: input.email,
      code,
      purpose: input.purpose,
      expiresInMinutes: env.AUTH_CODE_TTL_MINUTES
    });
  } else if (input.phone && env.NODE_ENV === "production") {
    throw new HttpError(501, "SMS_NOT_CONFIGURED", "短信验证码暂未开通，请使用邮箱验证码。");
  }

  return {
    sent: true,
    expiresInSeconds: env.AUTH_CODE_TTL_MINUTES * 60,
    provider: input.email ? env.EMAIL_PROVIDER || "email-placeholder" : env.SMS_PROVIDER || "placeholder",
    demoCode: env.NODE_ENV === "production" ? undefined : code
  };
}

export async function requestPasswordReset(input: {
  account: string;
  request: RequestMetadata;
}) {
  const user = await findUserByAccount(input.account);

  if (!user) {
    return {
      sent: true,
      expiresInSeconds: env.PASSWORD_RESET_TTL_MINUTES * 60,
      demoCode: env.NODE_ENV === "production" ? undefined : "not-created"
    };
  }

  const code = createNumericCode();
  const token = randomBytes(24).toString("hex");

  await prisma.$transaction([
    prisma.verificationCode.create({
      data: {
        userId: user.id,
        phone: user.phone,
        email: user.email,
        purpose: VerificationCodePurpose.PASSWORD_RESET,
        codeHash: await bcrypt.hash(code, env.BCRYPT_COST),
        expiresAt: minutesFromNow(env.PASSWORD_RESET_TTL_MINUTES),
        metadata: {
          delivery: "placeholder",
          ipAddress: input.request.ipAddress
        }
      }
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(token, env.BCRYPT_COST),
        expiresAt: minutesFromNow(env.PASSWORD_RESET_TTL_MINUTES)
      }
    })
  ]);

  if (user.email) {
    await sendVerificationEmail({
      to: user.email,
      code,
      purpose: "password_reset",
      expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES
    });
  }

  return {
    sent: true,
    expiresInSeconds: env.PASSWORD_RESET_TTL_MINUTES * 60,
    demoCode: env.NODE_ENV === "production" ? undefined : code,
    demoResetToken: env.NODE_ENV === "production" ? undefined : token
  };
}

export async function resetPassword(input: {
  account: string;
  code?: string;
  resetToken?: string;
  newPassword: string;
}) {
  const user = await findUserByAccount(input.account);

  if (!user) {
    throw new HttpError(400, "RESET_INVALID", "找回密码请求无效或已过期，请重新获取验证码。");
  }

  let verified = false;

  if (input.code) {
    verified = await verifyAndConsumeCode({
      userId: user.id,
      phone: user.phone ?? undefined,
      email: user.email,
      purpose: VerificationCodePurpose.PASSWORD_RESET,
      code: input.code
    });
  }

  if (!verified && input.resetToken) {
    verified = await verifyAndConsumeResetToken(user.id, input.resetToken);
  }

  if (!verified) {
    throw new HttpError(400, "RESET_INVALID", "找回密码请求无效或已过期，请重新获取验证码。");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_COST);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    }),
    prisma.authSession.updateMany({
      where: { userId: user.id, status: AuthSessionStatus.ACTIVE },
      data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() }
    })
  ]);

  return { reset: true };
}

export async function verifyAuthToken(token: string): Promise<TokenContext> {
  const payload = jwt.verify(token, jwtSecret(), {
    issuer: jwtIssuer
  }) as JwtPayload;

  const session = await prisma.authSession.findUnique({
    where: { tokenId: payload.jti },
    include: { user: true }
  });

  if (
    !session ||
    session.id !== payload.sid ||
    session.userId !== payload.sub ||
    session.status !== AuthSessionStatus.ACTIVE ||
    session.expiresAt <= new Date() ||
    session.user.status !== UserStatus.ACTIVE ||
    !session.user.organizationId
  ) {
    throw new HttpError(401, "UNAUTHENTICATED", "请先登录后再继续操作。");
  }

  return {
    userId: session.user.id,
    sessionId: session.id,
    tokenId: session.tokenId,
    organizationId: session.user.organizationId,
    role: toApiRole(session.user.role)
  };
}

export async function getCurrentUserPayload(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId }
  });
  const snapshot = await getEntitlementSnapshotForUser(user.id);

  return {
    user: publicUser(user),
    role: toApiRole(user.role),
    subscription: snapshot?.subscription ?? null,
    entitlements: formatEntitlementsForClient(snapshot)
  };
}

async function createAuthResponse(userId: string, request: RequestMetadata) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId }
  });

  if (!user.organizationId) {
    throw new HttpError(403, "ORGANIZATION_REQUIRED", "账号组织信息缺失，请联系管理员。");
  }

  const tokenId = randomUUID();
  const expiresAt = parseJwtExpiry(env.JWT_EXPIRES_IN);
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenId,
      expiresAt,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent
    }
  });
  const payload: JwtPayload = {
    sub: user.id,
    sid: session.id,
    jti: tokenId,
    organizationId: user.organizationId,
    role: toApiRole(user.role)
  };
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    issuer: jwtIssuer
  };
  const token = jwt.sign(payload, jwtSecret(), options);
  const snapshot = await getEntitlementSnapshotForUser(user.id);

  return {
    token,
    tokenType: "Bearer",
    expiresAt: expiresAt.toISOString(),
    user: publicUser(user),
    role: toApiRole(user.role),
    subscription: snapshot?.subscription ?? null,
    entitlements: formatEntitlementsForClient(snapshot)
  };
}

async function assertVerificationCode(input: {
  phone?: string;
  email?: string;
  purpose: CodePurpose;
  code?: string;
}) {
  if (!input.code) {
    throw new HttpError(400, "VERIFICATION_REQUIRED", "请填写短信验证码。");
  }

  const verified = await verifyAndConsumeCode({
    phone: input.phone,
    email: input.email,
    purpose: toVerificationPurpose(input.purpose),
    code: input.code
  });

  if (!verified) {
    throw new HttpError(400, "VERIFICATION_INVALID", "验证码不正确或已过期，请重新获取。");
  }
}

async function verifyAndConsumeCode(input: {
  userId?: string;
  phone?: string;
  email?: string;
  purpose: VerificationCodePurpose;
  code: string;
}) {
  const code = await prisma.verificationCode.findFirst({
    where: {
      userId: input.userId,
      phone: input.phone,
      email: input.email,
      purpose: input.purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!code) {
    return false;
  }

  const ok = await bcrypt.compare(input.code, code.codeHash);

  if (!ok) {
    return false;
  }

  await prisma.verificationCode.update({
    where: { id: code.id },
    data: { consumedAt: new Date() }
  });

  return true;
}

async function verifyAndConsumeResetToken(userId: string, resetToken: string) {
  const tokens = await prisma.passwordResetToken.findMany({
    where: {
      userId,
      consumedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" },
    take: 5
  });

  for (const token of tokens) {
    if (await bcrypt.compare(resetToken, token.tokenHash)) {
      await prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() }
      });
      return true;
    }
  }

  return false;
}

async function findUserByAccount(account: string) {
  return prisma.user.findFirst({
    where: {
      OR: [{ email: account }, { phone: account }]
    }
  });
}

async function uniqueOrganizationSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org";
  let slug = `${base}-${randomBytes(3).toString("hex")}`;

  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${base}-${randomBytes(3).toString("hex")}`;
  }

  return slug;
}

function createNumericCode() {
  if (env.AUTH_DEMO_CODE) {
    return env.AUTH_DEMO_CODE;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendVerificationEmail(input: {
  to: string;
  code: string;
  purpose: CodePurpose;
  expiresInMinutes: number;
}) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (env.NODE_ENV === "production") {
      throw new HttpError(501, "EMAIL_NOT_CONFIGURED", "邮箱验证码服务暂未配置，请联系管理员。");
    }
    return;
  }

  const purposeText = input.purpose === "password_reset" ? "找回密码" : "注册验证";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: `CiteOX ${purposeText}验证码`,
      text: `你的验证码是 ${input.code}，有效期 ${input.expiresInMinutes} 分钟。请勿泄露给他人。`,
      html: `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#172033"><h2>CiteOX ${purposeText}</h2><p>你的验证码是：</p><p style="font-size:28px;font-weight:800;letter-spacing:4px">${input.code}</p><p>有效期 ${input.expiresInMinutes} 分钟，请勿泄露给他人。</p></div>`
    })
  });

  if (!response.ok) {
    throw new HttpError(502, "EMAIL_SEND_FAILED", "邮箱验证码发送失败，请稍后再试。");
  }
}

function toVerificationPurpose(purpose: CodePurpose) {
  switch (purpose) {
    case "login":
      return VerificationCodePurpose.LOGIN;
    case "password_reset":
      return VerificationCodePurpose.PASSWORD_RESET;
    default:
      return VerificationCodePurpose.REGISTER;
  }
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

function parseJwtExpiry(value: string) {
  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return new Date(Date.now() + numeric * 1000);
  }

  const match = value.match(/^(\d+)([smhd])$/);

  if (!match) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return new Date(Date.now() + amount * multiplier);
}

function jwtSecret() {
  return env.JWT_SECRET || "dev-only-zhiyin-geo-jwt-secret-change-before-production";
}
