import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import {
  loginRateLimit,
  passwordResetRateLimit,
  registerRateLimit,
  usernameCheckRateLimit,
  validationRateLimit,
  verificationCodeRateLimit
} from "../middleware/rateLimit.js";
import {
  checkUsernameAvailability,
  createVerificationCode,
  emailDomainSuggestion,
  getCurrentUserPayload,
  loginUser,
  logoutSession,
  refreshAuthSession,
  registerUser,
  requestPasswordReset,
  resetPassword,
  validateIndustryName,
  validateInviteCode
} from "../services/auth.js";
import { recordAuditEvent } from "../services/audit.js";

export const authRouter = Router();

const optionalCleanString = (schema: z.ZodString) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional()
  );

const passwordSchema = z
  .string()
  .min(8, "密码至少需要 8 个字符。")
  .max(32, "密码最多 32 个字符。")
  .regex(/[A-Za-z]/, "密码至少需要包含字母。")
  .regex(/\d/, "密码至少需要包含数字。");

const registerSchema = z
  .object({
    name: z.string().trim().min(1, "请输入你的名字。").max(80, "名字最多 80 个字符。"),
    username: optionalCleanString(z.string().trim().max(20, "账号名称最多 20 个字符。")),
    email: z
      .string()
      .trim()
      .email("邮箱格式不正确，请输入有效邮箱。")
      .max(160)
      .transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(1, "手机号为必填项，请输入手机号。").max(32),
    password: passwordSchema,
    confirmPassword: z.string().optional(),
    passwordConfirm: z.string().optional(),
    industry: z.string().trim().min(1, "请选择或输入你的行业。").max(100),
    inviteCode: optionalCleanString(z.string().trim().max(8)),
    accountType: z.enum(["personal", "business"]).default("personal"),
    companyName: optionalCleanString(z.string().trim().max(120)),
    legalConsentVersion: z.string().trim().min(1).max(40),
    smsCode: z.string().trim().length(6, "请输入 6 位邮箱验证码。").optional(),
    verifyCode: z.string().trim().length(6, "请输入 6 位邮箱验证码。").optional()
  })
  .superRefine((value, ctx) => {
    const confirmed = value.confirmPassword || value.passwordConfirm;
    if (confirmed !== undefined && confirmed !== value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "两次输入的密码不一致。"
      });
    }
  });

const loginSchema = z
  .object({
    account: z.string().trim().min(1, "请输入账号。").max(160).optional(),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(32).optional(),
    password: z.string().min(1, "请输入密码。"),
    remember: z.boolean().optional()
  })
  .transform((value) => ({
    account: value.account || value.email || value.phone || "",
    password: value.password,
    remember: value.remember ?? true
  }))
  .pipe(
    z.object({
      account: z.string().trim().min(1, "请输入账号。").max(160),
      password: z.string().min(1, "请输入密码。"),
      remember: z.boolean()
    })
  );

const sendCodeSchema = z.object({
  phone: optionalCleanString(z.string().trim().min(6).max(32)),
  email: z.string().trim().email("邮箱格式不正确，请检查后重试。").max(160).optional(),
  purpose: z.enum(["register", "login", "password_reset"]).default("register")
});

const accountSchema = z
  .object({
    account: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(32).optional()
  })
  .transform((value) => ({ account: value.account || value.email || value.phone || "" }))
  .pipe(z.object({ account: z.string().trim().min(1, "请输入账号或邮箱。").max(160) }));

const resetPasswordSchema = z
  .object({
    account: optionalCleanString(z.string().trim().max(160)),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(32).optional(),
    code: z.string().trim().length(6, "请输入 6 位验证码。").optional(),
    resetToken: z.string().trim().min(12).optional(),
    token: z.string().trim().min(12).optional(),
    newPassword: passwordSchema,
    confirmPassword: z.string().optional(),
    passwordConfirm: z.string().optional()
  })
  .transform((value) => ({
    account: value.account || value.email || value.phone || undefined,
    code: value.code,
    resetToken: value.resetToken || value.token,
    newPassword: value.newPassword,
    confirmPassword: value.confirmPassword || value.passwordConfirm
  }))
  .pipe(
    z
      .object({
        account: z.string().trim().max(160).optional(),
        code: z.string().trim().length(6, "请输入 6 位验证码。").optional(),
        resetToken: z.string().trim().min(12).optional(),
        newPassword: passwordSchema,
        confirmPassword: z.string().optional()
      })
      .superRefine((value, ctx) => {
        if (!value.account && !value.resetToken) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["account"],
            message: "请输入账号或使用邮件里的重置链接。"
          });
        }
        if (!value.code && !value.resetToken) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["code"],
            message: "请输入验证码或使用邮件里的重置链接。"
          });
        }
        if (value.confirmPassword !== undefined && value.confirmPassword !== value.newPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["confirmPassword"],
            message: "两次输入的密码不一致。"
          });
        }
      })
  );

authRouter.post(
  "/check-username",
  usernameCheckRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ username: z.string().trim().min(1).max(80) }), req);
    res.json(await checkUsernameAvailability(body.username));
  })
);

authRouter.post(
  "/validate-invite-code",
  validationRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ code: z.string().trim().optional() }), req);
    res.json(await validateInviteCode(body.code));
  })
);

authRouter.post(
  "/validate-industry",
  validationRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ industry: z.string().trim().min(1).max(100) }), req);
    res.json(validateIndustryName(body.industry));
  })
);

authRouter.post(
  ["/send-code", "/send-verify-code"],
  verificationCodeRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(sendCodeSchema, req);
    const result = await createVerificationCode({ ...body, request: requestMeta(req) });

    await recordAuditEvent({
      action: "auth.send_code",
      resourceType: "verification_code",
      severity: "info",
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
      metadata: {
        purpose: body.purpose,
        target: maskAccount(body.phone || body.email || "")
      }
    });

    res.json(result);
  })
);

authRouter.post(
  "/register",
  registerRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req);
    const result = await registerUser({ ...body, request: requestMeta(req) });

    setAuthCookies(res, result);
    await recordAuditEvent({
      organizationId: result.user.organizationId ?? undefined,
      actorUserId: result.user.id,
      action: "auth.register",
      resourceType: "user",
      resourceId: result.user.id,
      severity: "info",
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
      metadata: {
        accountType: body.accountType,
        legalConsentVersion: body.legalConsentVersion
      }
    });

    res.status(201).json(result);
  })
);

authRouter.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req);

    try {
      const result = await loginUser({ ...body, request: requestMeta(req) });
      setAuthCookies(res, result);
      await recordAuditEvent({
        organizationId: result.user.organizationId ?? undefined,
        actorUserId: result.user.id,
        action: "auth.login_success",
        resourceType: "user",
        resourceId: result.user.id,
        severity: "info",
        ipAddress: req.ip,
        userAgent: req.header("user-agent")
      });

      res.json(result);
    } catch (error) {
      await recordAuditEvent({
        action: "auth.login_failed",
        resourceType: "user",
        severity: "warning",
        ipAddress: req.ip,
        userAgent: req.header("user-agent"),
        metadata: { account: maskAccount(body.account) }
      });
      throw error;
    }
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = getCookie(req, "citeox_refresh_token") || req.body?.refreshToken;
    if (!refreshToken) {
      throw new HttpError(401, "UNAUTHENTICATED", "登录状态已失效，请重新登录。");
    }
    const result = await refreshAuthSession(refreshToken, requestMeta(req));
    setAuthCookies(res, result);
    res.json(result);
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await logoutSession(req.auth!);
    clearAuthCookies(res);
    await recordAuditEvent({
      organizationId: req.auth!.organizationId,
      actorUserId: req.auth!.userId,
      action: "auth.logout",
      resourceType: "auth_session",
      resourceId: req.auth!.sessionId,
      severity: "info",
      ipAddress: req.ip,
      userAgent: req.header("user-agent")
    });

    res.json({ loggedOut: true });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getCurrentUserPayload(req.auth!.userId));
  })
);

authRouter.post(
  ["/request-password-reset", "/forgot-password"],
  passwordResetRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(accountSchema, req);
    const result = await requestPasswordReset({ ...body, request: requestMeta(req) });

    await recordAuditEvent({
      action: "auth.password_reset_requested",
      resourceType: "user",
      severity: "info",
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
      metadata: { account: maskAccount(body.account) }
    });

    res.json({
      ...result,
      message: "如果账号存在，重置邮件会发送到对应邮箱，请留意收件箱和垃圾邮件。"
    });
  })
);

authRouter.post(
  "/reset-password",
  passwordResetRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(resetPasswordSchema, req);
    const result = await resetPassword(body);

    await recordAuditEvent({
      action: "auth.password_reset_completed",
      resourceType: "user",
      severity: "info",
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
      metadata: { account: maskAccount(body.account || ""), viaToken: Boolean(body.resetToken) }
    });

    res.json(result);
  })
);

authRouter.post(
  "/email-suggestion",
  validationRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ email: z.string().trim().min(1).max(160) }), req);
    res.json({ suggestion: emailDomainSuggestion(body.email) });
  })
);

function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request): z.output<T> {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "填写内容不完整或格式不正确，请检查后重试。";
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }
  return parsed.data;
}

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.header("user-agent")
  };
}

function setAuthCookies(res: Response, result: { accessToken?: string; token?: string; refreshToken?: string }) {
  const secure = process.env.NODE_ENV === "production";
  const accessToken = result.accessToken || result.token;
  if (accessToken) {
    res.cookie("citeox_access_token", accessToken, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      maxAge: 2 * 60 * 60 * 1000,
      path: "/"
    });
  }
  if (result.refreshToken) {
    res.cookie("citeox_refresh_token", result.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/"
    });
  }
}

function clearAuthCookies(res: Response) {
  res.clearCookie("citeox_access_token", { path: "/" });
  res.clearCookie("citeox_refresh_token", { path: "/" });
}

function getCookie(req: Request, name: string) {
  const cookie = req.header("cookie") || "";
  const item = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function maskAccount(account: string) {
  if (!account) {
    return "";
  }
  if (account.includes("@")) {
    const [name, domain] = account.split("@");
    return `${(name ?? "").slice(0, 2)}***@${domain ?? ""}`;
  }
  return `${account.slice(0, 3)}***${account.slice(-2)}`;
}
