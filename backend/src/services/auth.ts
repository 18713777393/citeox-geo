import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  AuthSessionStatus,
  LegalConsentType,
  UserRole,
  UserStatus,
  VerificationCodePurpose,
  type InviteCode,
  type User
} from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { getRedis } from "../lib/redis.js";
import { HttpError } from "../middleware/error.js";
import {
  ensureDefaultSubscription,
  formatEntitlementsForClient,
  getEntitlementSnapshotForUser
} from "./entitlements.js";
import {
  assertEmailAllowed,
  assertPasswordAllowed,
  decryptSensitive,
  emailDomainSuggestion,
  encryptSensitive,
  hashEmail,
  hashPhone,
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
  publicEmail,
  publicPhone,
  usernameSuggestions,
  validateIndustry,
  validatePhoneOrThrow,
  validateUsername
} from "./authSecurity.js";

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
  type: "access" | "refresh";
}

const jwtIssuer = "citeox-geo-api";
const loginLockThreshold = 5;
const loginLockMs = 15 * 60_000;
const loginFailureTtlSeconds = Math.ceil(loginLockMs / 1000);
const memoryLoginFailures = new Map<string, { count: number; lockedUntil?: number; updatedAt: number }>();

const loginFailureStore = {
  async get(account: string) {
    const redis = env.REDIS_URL ? getRedis() : null;
    const key = loginFailureKey(account);

    if (redis) {
      const [countValue, lockedUntilValue] = await Promise.all([
        redis.get(`auth:login_fail:${key}`),
        redis.get(`auth:login_lock:${key}`)
      ]);
      return {
        count: Number(countValue ?? 0),
        lockedUntil: lockedUntilValue ? Number(lockedUntilValue) : undefined,
        updatedAt: Date.now()
      };
    }

    const record = memoryLoginFailures.get(key);
    if (!record) {
      return { count: 0, updatedAt: Date.now() };
    }

    if ((record.lockedUntil && record.lockedUntil <= Date.now()) || record.updatedAt + loginLockMs <= Date.now()) {
      memoryLoginFailures.delete(key);
      return { count: 0, updatedAt: Date.now() };
    }

    return record;
  },

  async registerFailure(account: string) {
    const redis = env.REDIS_URL ? getRedis() : null;
    const key = loginFailureKey(account);
    const now = Date.now();

    if (redis) {
      const failKey = `auth:login_fail:${key}`;
      const lockKey = `auth:login_lock:${key}`;
      const nextCount = await redis.incr(failKey);
      await redis.expire(failKey, loginFailureTtlSeconds);

      if (nextCount >= loginLockThreshold) {
        await redis.set(lockKey, String(now + loginLockMs), "PX", loginLockMs);
      }
      return;
    }

    const record = memoryLoginFailures.get(key) ?? { count: 0, updatedAt: now };
    const nextCount = record.count + 1;
    memoryLoginFailures.set(key, {
      count: nextCount,
      updatedAt: now,
      lockedUntil: nextCount >= loginLockThreshold ? now + loginLockMs : record.lockedUntil
    });
  },

  async clear(account: string) {
    const redis = env.REDIS_URL ? getRedis() : null;
    const key = loginFailureKey(account);

    if (redis) {
      await redis.del(`auth:login_fail:${key}`, `auth:login_lock:${key}`);
      return;
    }

    memoryLoginFailures.delete(key);
  }
};

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

export function publicUser(
  user: Pick<
    User,
    | "id"
    | "organizationId"
    | "username"
    | "email"
    | "phone"
    | "displayName"
    | "role"
    | "status"
    | "hasBrand"
    | "createdAt"
    | "lastLoginAt"
  >
) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    username: user.username,
    name: user.displayName || user.username || "Citeox 用户",
    email: publicEmail(user.email),
    phone: publicPhone(user.phone),
    role: toApiRole(user.role),
    status: user.status.toLowerCase(),
    hasBrand: user.hasBrand,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null
  };
}

export async function checkUsernameAvailability(username: string) {
  const clean = normalizeUsername(username);
  const base = validateUsername(clean);

  if (!base.valid) {
    return {
      available: false,
      reason: base.message,
      severity: "error" as const,
      suggestions: usernameSuggestions(clean)
    };
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: clean }, { displayName: clean }] },
    select: { id: true }
  });

  if (existing) {
    return {
      available: false,
      reason: "该账号名称已被使用，请换一个名称。",
      severity: "error" as const,
      suggestions: usernameSuggestions(clean)
    };
  }

  return {
    available: true,
    reason: base.message,
    severity: base.severity ?? "success",
    suggestions: base.severity === "warning" ? usernameSuggestions(clean) : []
  };
}

export async function validateInviteCode(code?: string) {
  if (!code) {
    return { valid: true, benefit: null };
  }

  if (!/^\d{8}$/.test(code)) {
    return { valid: false, message: "邀请码格式不正确，应为 8 位数字。" };
  }

  const invite = await prisma.inviteCode.findUnique({ where: { code } });
  if (!isInviteUsable(invite)) {
    return { valid: false, message: "邀请码无效或已过期；没有邀请码也可以直接跳过。" };
  }

  return { valid: true, benefit: invite?.benefit ?? "额外体验权益" };
}

export function validateIndustryName(industry: string) {
  return validateIndustry(industry);
}

export async function registerUser(input: {
  name: string;
  username?: string;
  email: string;
  phone: string;
  password: string;
  industry: string;
  inviteCode?: string;
  accountType: AccountType;
  companyName?: string;
  legalConsentVersion: string;
  smsCode?: string;
  verifyCode?: string;
  request: RequestMetadata;
}) {
  const username = normalizeUsername(input.username || input.name);
  const email = normalizeEmail(input.email);
  const phone = validatePhoneOrThrow(input.phone);

  const usernameDecision = await checkUsernameAvailability(username);
  if (!usernameDecision.available) {
    throw new HttpError(409, "USERNAME_EXISTS", usernameDecision.reason || "账号名称不可用。");
  }

  assertEmailAllowed(email);
  assertPasswordAllowed(input.password, username);

  const industryDecision = validateIndustry(input.industry);
  if (!industryDecision.valid) {
    throw new HttpError(400, "VALIDATION_ERROR", industryDecision.message);
  }

  const inviteDecision = await validateInviteCode(input.inviteCode);
  if (!inviteDecision.valid) {
    throw new HttpError(400, "INVITE_CODE_INVALID", inviteDecision.message || "邀请码无效。");
  }

  await assertVerificationCode({
    email,
    purpose: "register",
    code: input.smsCode || input.verifyCode
  });

  const emailHash = hashEmail(email);
  const phoneHash = hashPhone(phone);
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { emailHash }, { phoneHash }, { email }, { phone }]
    }
  });

  if (existing) {
    throw new HttpError(409, "ACCOUNT_EXISTS", "该账号名称、邮箱或手机号已注册，请直接登录或更换信息。");
  }

  const invite = input.inviteCode
    ? await prisma.inviteCode.findUnique({ where: { code: input.inviteCode } })
    : null;
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_COST);
  const organizationName =
    input.accountType === "business" ? input.companyName || username : `${username} 的工作区`;

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
        username,
        email: encryptSensitive(email),
        emailHash,
        phone: encryptSensitive(phone),
        phoneHash,
        passwordHash,
        displayName: input.name,
        industry: input.industry,
        inviteCodeId: invite?.id,
        role: roleFromAccountType(input.accountType),
        status: UserStatus.ACTIVE,
        apiBalance: 0,
        hasBrand: false
      }
    });

    await tx.organization.update({
      where: { id: organization.id },
      data: { ownerId: user.id }
    });

    if (invite) {
      await tx.inviteCode.update({
        where: { id: invite.id },
        data: { usedCount: { increment: 1 } }
      });
    }

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
  remember?: boolean;
  request: RequestMetadata;
}) {
  const account = input.account.trim();
  await assertLoginAllowed(account);

  let user = await findUserByAccount(account);
  user = await ensureConfiguredAdminCanLogin(user, account, input.password);

  if (!user?.passwordHash) {
    await registerLoginFailure(account);
    throw new HttpError(401, "INVALID_CREDENTIALS", "账号或密码错误，请检查后重新输入。");
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    await registerLoginFailure(account);
    throw new HttpError(401, "INVALID_CREDENTIALS", "账号或密码错误，请检查后重新输入。");
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new HttpError(403, "ACCOUNT_DISABLED", "账号已被停用，请联系管理员处理。");
  }

  await clearLoginFailures(account);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: input.request.ipAddress
    }
  });

  return createAuthResponse(user.id, input.request, input.remember);
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
  if (!input.email && !input.phone) {
    throw new HttpError(400, "VALIDATION_ERROR", "请填写邮箱或手机号。");
  }

  const normalizedEmail = input.email ? normalizeEmail(input.email) : undefined;
  if (normalizedEmail) {
    assertEmailAllowed(normalizedEmail);
  }

  const normalizedPhone = input.phone ? normalizePhone(input.phone) : undefined;
  const purpose = toVerificationPurpose(input.purpose);
  const cooldownSince = new Date(Date.now() - env.AUTH_CODE_RESEND_SECONDS * 1000);
  const recent = await prisma.verificationCode.findFirst({
    where: {
      purpose,
      phone: normalizedPhone,
      email: normalizedEmail,
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
  const user = await findUserByAccount(normalizedEmail || normalizedPhone || "");

  await prisma.verificationCode.updateMany({
    where: {
      purpose,
      phone: normalizedPhone,
      email: normalizedEmail,
      consumedAt: null
    },
    data: { consumedAt: new Date() }
  });

  await prisma.verificationCode.create({
    data: {
      userId: user?.id,
      phone: normalizedPhone,
      email: normalizedEmail,
      purpose,
      codeHash,
      expiresAt: minutesFromNow(env.AUTH_CODE_TTL_MINUTES),
      metadata: {
        provider: normalizedEmail ? "resend" : env.SMS_PROVIDER || "placeholder",
        ipAddress: input.request.ipAddress
      }
    }
  });

  if (normalizedEmail) {
    await sendVerificationEmail({
      to: normalizedEmail,
      code,
      purpose: input.purpose,
      expiresInMinutes: env.AUTH_CODE_TTL_MINUTES
    });
  } else if (env.NODE_ENV === "production") {
    throw new HttpError(501, "SMS_NOT_CONFIGURED", "短信验证码暂未开通，请使用邮箱验证码。");
  }

  return {
    sent: true,
    expiresInSeconds: env.AUTH_CODE_TTL_MINUTES * 60,
    resendAfterSeconds: env.AUTH_CODE_RESEND_SECONDS,
    provider: normalizedEmail ? "resend" : env.SMS_PROVIDER || "placeholder",
    demoCode: env.NODE_ENV === "production" ? undefined : code
  };
}

export async function requestPasswordReset(input: {
  account: string;
  request: RequestMetadata;
}) {
  const account = input.account.trim();
  const user = await findUserByAccount(account);

  if (!user) {
    return { sent: true, expiresInSeconds: env.PASSWORD_RESET_TTL_MINUTES * 60 };
  }

  const email = decryptSensitive(user.email);
  if (!email || !email.includes("@")) {
    return { sent: true, expiresInSeconds: env.PASSWORD_RESET_TTL_MINUTES * 60 };
  }

  const code = createNumericCode();
  const token = randomBytes(24).toString("hex");

  await prisma.$transaction([
    prisma.verificationCode.create({
      data: {
        userId: user.id,
        phone: user.phone,
        email,
        purpose: VerificationCodePurpose.PASSWORD_RESET,
        codeHash: await bcrypt.hash(code, env.BCRYPT_COST),
        expiresAt: minutesFromNow(env.PASSWORD_RESET_TTL_MINUTES),
        metadata: {
          delivery: "resend",
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

  await sendPasswordResetEmail({
    to: email,
    code,
    resetToken: token,
    expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES
  });

  return {
    sent: true,
    expiresInSeconds: env.PASSWORD_RESET_TTL_MINUTES * 60,
    demoCode: env.NODE_ENV === "production" ? undefined : code,
    demoResetToken: env.NODE_ENV === "production" ? undefined : token
  };
}

export async function resetPassword(input: {
  account?: string;
  code?: string;
  resetToken?: string;
  newPassword: string;
}) {
  const user = input.account
    ? await findUserByAccount(input.account)
    : input.resetToken
      ? await findUserByResetToken(input.resetToken)
      : null;
  if (!user) {
    throw new HttpError(400, "RESET_INVALID", "重置链接或验证码已失效，请重新申请。");
  }

  assertPasswordAllowed(input.newPassword, user.username ?? user.displayName ?? undefined);
  const email = decryptSensitive(user.email) || input.account;
  let verified = false;

  if (input.code) {
    verified = await verifyAndConsumeCode({
      userId: user.id,
      phone: user.phone ?? undefined,
      email,
      purpose: VerificationCodePurpose.PASSWORD_RESET,
      code: input.code
    });
  }

  if (!verified && input.resetToken) {
    verified = await verifyAndConsumeResetToken(user.id, input.resetToken);
  }

  if (!verified) {
    throw new HttpError(400, "RESET_INVALID", "重置链接或验证码已失效，请重新申请。");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_COST);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.authSession.updateMany({
      where: { userId: user.id, status: AuthSessionStatus.ACTIVE },
      data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() }
    })
  ]);

  return { reset: true };
}

export async function verifyAuthToken(token: string): Promise<TokenContext> {
  const payload = jwt.verify(token, jwtSecret(), { issuer: jwtIssuer }) as JwtPayload;
  if (payload.type !== "access") {
    throw new HttpError(401, "UNAUTHENTICATED", "请先登录后再继续操作。");
  }

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

export async function refreshAuthSession(refreshToken: string, request: RequestMetadata) {
  const payload = jwt.verify(refreshToken, refreshSecret(), { issuer: jwtIssuer }) as JwtPayload;
  if (payload.type !== "refresh") {
    throw new HttpError(401, "UNAUTHENTICATED", "登录状态已失效，请重新登录。");
  }

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
    session.user.status !== UserStatus.ACTIVE
  ) {
    throw new HttpError(401, "UNAUTHENTICATED", "登录状态已失效，请重新登录。");
  }

  return createAuthResponse(session.userId, request, true);
}

export async function getCurrentUserPayload(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const snapshot = await getEntitlementSnapshotForUser(user.id);

  return {
    user: publicUser(user),
    role: toApiRole(user.role),
    subscription: snapshot?.subscription ?? null,
    entitlements: formatEntitlementsForClient(snapshot)
  };
}

async function createAuthResponse(userId: string, request: RequestMetadata, remember = true) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.organizationId) {
    throw new HttpError(403, "ORGANIZATION_REQUIRED", "账号组织信息缺失，请联系管理员。");
  }

  const tokenId = randomUUID();
  const sessionExpiresAt = parseJwtExpiry(remember ? env.JWT_REFRESH_EXPIRES_IN : env.JWT_EXPIRES_IN);
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenId,
      expiresAt: sessionExpiresAt,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent
    }
  });

  const payloadBase = {
    sub: user.id,
    sid: session.id,
    jti: tokenId,
    organizationId: user.organizationId,
    role: toApiRole(user.role)
  };
  const accessExpiresAt = parseJwtExpiry(env.JWT_EXPIRES_IN);
  const accessToken = jwt.sign({ ...payloadBase, type: "access" }, jwtSecret(), {
    expiresIn: env.JWT_EXPIRES_IN as never,
    issuer: jwtIssuer
  });
  const refreshToken = jwt.sign({ ...payloadBase, type: "refresh" }, refreshSecret(), {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as never,
    issuer: jwtIssuer
  });
  const snapshot = await getEntitlementSnapshotForUser(user.id);

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresAt: accessExpiresAt.toISOString(),
    user: publicUser(user),
    role: toApiRole(user.role),
    subscription: snapshot?.subscription ?? null,
    entitlements: formatEntitlementsForClient(snapshot)
  };
}

async function assertVerificationCode(input: {
  email?: string;
  purpose: CodePurpose;
  code?: string;
}) {
  if (!input.code) {
    throw new HttpError(400, "VERIFICATION_REQUIRED", "请填写邮箱验证码。");
  }

  if (env.AUTH_DEMO_CODE && input.code === env.AUTH_DEMO_CODE) {
    return;
  }

  const verified = await verifyAndConsumeCode({
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
  if (env.AUTH_DEMO_CODE && input.code === env.AUTH_DEMO_CODE) {
    return true;
  }

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
    where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
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

async function findUserByResetToken(resetToken: string) {
  const tokens = await prisma.passwordResetToken.findMany({
    where: { consumedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  for (const token of tokens) {
    if (await bcrypt.compare(resetToken, token.tokenHash)) {
      return token.user;
    }
  }

  return null;
}

async function findUserByAccount(account: string) {
  const clean = account.trim();
  if (!clean) {
    return null;
  }

  if (clean.includes("@")) {
    const email = normalizeEmail(clean);
    return prisma.user.findFirst({
      where: { OR: [{ emailHash: hashEmail(email) }, { email }] }
    });
  }

  const phone = normalizePhone(clean);
  if (/^1[3-9]\d{9}$/.test(phone)) {
    return prisma.user.findFirst({
      where: { OR: [{ phoneHash: hashPhone(phone) }, { phone }] }
    });
  }

  const username = normalizeUsername(clean);
  return prisma.user.findFirst({
    where: { OR: [{ username }, { displayName: username }] }
  });
}

async function ensureConfiguredAdminCanLogin(user: User | null, account: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

  if (!adminEmail || !adminPassword || account.trim().toLowerCase() !== adminEmail) {
    return user;
  }

  const configuredPasswordMatches = password === adminPassword;
  if (!user && !configuredPasswordMatches) {
    return user;
  }

  if (!user) {
    return upsertConfiguredAdmin(adminEmail, adminPassword);
  }

  const currentPasswordMatches = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!configuredPasswordMatches && !currentPasswordMatches) {
    return user;
  }

  if (user.role === UserRole.SUPER_ADMIN && user.status === UserStatus.ACTIVE && user.organizationId) {
    return user;
  }

  return upsertConfiguredAdmin(adminEmail, configuredPasswordMatches ? adminPassword : undefined, user.id);
}

async function upsertConfiguredAdmin(email: string, password?: string, existingUserId?: string) {
  const organization = await prisma.organization.upsert({
    where: { slug: "platform-admin" },
    update: {},
    create: { name: "Citeox GEO 平台管理", slug: "platform-admin", industry: "platform" }
  });

  const passwordHash = password ? await bcrypt.hash(password, env.BCRYPT_COST) : undefined;
  const data = {
    organizationId: organization.id,
    username: "platform_admin",
    displayName: process.env.ADMIN_NAME || "平台管理员",
    emailHash: hashEmail(email),
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    hasBrand: true,
    ...(passwordHash ? { passwordHash } : {})
  };

  const admin = existingUserId
    ? await prisma.user.update({ where: { id: existingUserId }, data })
    : await prisma.user.create({
        data: {
          ...data,
          email: encryptSensitive(email)
        }
      });

  await prisma.organization.update({ where: { id: organization.id }, data: { ownerId: admin.id } });
  return admin;
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

function isInviteUsable(invite?: InviteCode | null) {
  if (!invite || !invite.isActive) {
    return false;
  }
  if (invite.expiresAt && invite.expiresAt <= new Date()) {
    return false;
  }
  return invite.usedCount < invite.maxUses;
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
  const purposeText = input.purpose === "password_reset" ? "找回密码" : "注册验证";
  await sendEmail({
    to: input.to,
    subject: `[Citeox] ${purposeText}验证码：${input.code}`,
    text: `你的验证码是 ${input.code}，有效期 ${input.expiresInMinutes} 分钟。请勿泄露给他人。`,
    html: `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#172033"><h2>Citeox ${purposeText}</h2><p>你的验证码是：</p><p style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f5f7fb;padding:18px;text-align:center;border-radius:10px">${input.code}</p><p>验证码 ${input.expiresInMinutes} 分钟内有效，请勿泄露给他人。</p><p style="color:#64748b">如非本人操作，请忽略这封邮件。</p></div>`
  });
}

async function sendPasswordResetEmail(input: {
  to: string;
  code: string;
  resetToken: string;
  expiresInMinutes: number;
}) {
  const link = `${env.APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(input.resetToken)}`;
  await sendEmail({
    to: input.to,
    subject: "[Citeox] 密码重置请求",
    text: `你的验证码是 ${input.code}。你也可以打开重置链接：${link}。链接 ${input.expiresInMinutes} 分钟内有效。`,
    html: `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#172033"><h2>Citeox 密码重置</h2><p>你的验证码是：</p><p style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f5f7fb;padding:18px;text-align:center;border-radius:10px">${input.code}</p><p><a href="${link}" style="display:inline-block;background:#5969f3;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">打开重置密码页面</a></p><p>链接 ${input.expiresInMinutes} 分钟内有效。如非本人操作，请忽略这封邮件。</p></div>`
  });
}

async function sendEmail(input: { to: string; subject: string; text: string; html: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (env.NODE_ENV === "production") {
      throw new HttpError(501, "EMAIL_NOT_CONFIGURED", "邮箱服务暂未配置，请联系管理员。");
    }
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html
    })
  });

  if (!response.ok) {
    throw new HttpError(502, "EMAIL_SEND_FAILED", "邮件发送失败，请稍后重试。");
  }
}

function loginFailureKey(account: string) {
  return createHash("sha256").update(account.trim().toLowerCase()).digest("hex");
}

async function assertLoginAllowed(account: string) {
  const record = await loginFailureStore.get(account);
  if (record.lockedUntil && record.lockedUntil > Date.now()) {
    throw new HttpError(429, "LOGIN_LOCKED", "登录尝试次数过多，请 15 分钟后再试。");
  }
}

async function registerLoginFailure(account: string) {
  await loginFailureStore.registerFailure(account);
}

async function clearLoginFailures(account: string) {
  await loginFailureStore.clear(account);
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
    return new Date(Date.now() + 2 * 60 * 60 * 1000);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return new Date(Date.now() + amount * multiplier);
}

function jwtSecret() {
  return env.JWT_SECRET || "dev-only-citeox-geo-access-secret-change-before-production";
}

function refreshSecret() {
  return env.JWT_REFRESH_SECRET || "dev-only-citeox-geo-refresh-secret-change-before-production";
}

export { emailDomainSuggestion };
