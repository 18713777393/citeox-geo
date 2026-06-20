import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import {
  loginRateLimit,
  passwordResetRateLimit,
  verificationCodeRateLimit
} from "../middleware/rateLimit.js";
import {
  createVerificationCode,
  getCurrentUserPayload,
  loginUser,
  logoutSession,
  registerUser,
  requestPasswordReset,
  resetPassword
} from "../services/auth.js";
import { recordAuditEvent } from "../services/audit.js";

export const authRouter = Router();

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Za-z]/, "Password must contain a letter.")
  .regex(/\d/, "Password must contain a number.");

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  phone: z.string().trim().transform((value) => value || undefined).pipe(z.string().min(6).max(32).optional()),
  password: passwordSchema,
  industry: z.string().trim().min(1).max(80),
  inviteCode: z.string().trim().transform((value) => value || undefined).pipe(z.string().max(80).optional()),
  accountType: z.enum(["personal", "business"]),
  companyName: z.string().trim().transform((value) => value || undefined).pipe(z.string().max(120).optional()),
  legalConsentVersion: z.string().trim().min(1).max(40),
  smsCode: z.string().trim().length(6).optional()
});

const loginSchema = z
  .object({
    account: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(32).optional(),
    password: z.string().min(1)
  })
  .transform((value) => ({
    account: value.account || value.email || value.phone || "",
    password: value.password
  }))
  .pipe(
    z.object({
      account: z.string().trim().min(1).max(160),
      password: z.string().min(1)
    })
  );

const sendCodeSchema = z.object({
  phone: z.string().trim().min(6).max(32).optional(),
  email: z.string().trim().email().max(160).optional(),
  purpose: z.enum(["register", "login", "password_reset"]).default("register")
});

const requestPasswordResetSchema = z
  .object({
    account: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(32).optional()
  })
  .transform((value) => ({
    account: value.account || value.email || value.phone || ""
  }))
  .pipe(
    z.object({
      account: z.string().trim().min(1).max(160)
    })
  );

const resetPasswordSchema = z
  .object({
    account: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(32).optional(),
    code: z.string().trim().length(6).optional(),
    resetToken: z.string().trim().min(12).optional(),
    newPassword: passwordSchema
  })
  .transform((value) => ({
    account: value.account || value.email || value.phone || "",
    code: value.code,
    resetToken: value.resetToken,
    newPassword: value.newPassword
  }))
  .pipe(
    z.object({
      account: z.string().trim().min(1).max(160),
      code: z.string().trim().length(6).optional(),
      resetToken: z.string().trim().min(12).optional(),
      newPassword: passwordSchema
    })
  );

authRouter.post(
  "/send-code",
  verificationCodeRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(sendCodeSchema, req);
    const result = await createVerificationCode({
      ...body,
      request: requestMeta(req)
    });

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
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req);
    const result = await registerUser({
      ...body,
      request: requestMeta(req)
    });

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
    await recordAuditEvent({
      organizationId: result.user.organizationId ?? undefined,
      actorUserId: result.user.id,
      action: "auth.legal_consent_accepted",
      resourceType: "legal_consent",
      resourceId: result.user.id,
      severity: "info",
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
      metadata: {
        legalConsentVersion: body.legalConsentVersion,
        documents: ["terms", "privacy"],
        scene: "register"
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
      const result = await loginUser({
        ...body,
        request: requestMeta(req)
      });

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
        metadata: {
          account: maskAccount(body.account)
        }
      });

      throw error;
    }
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await logoutSession(req.auth!);
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
  "/request-password-reset",
  passwordResetRateLimit,
  asyncHandler(async (req, res) => {
    const body = parseBody(requestPasswordResetSchema, req);
    const result = await requestPasswordReset({
      ...body,
      request: requestMeta(req)
    });

    await recordAuditEvent({
      action: "auth.password_reset_requested",
      resourceType: "user",
      severity: "info",
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
      metadata: {
        account: maskAccount(body.account)
      }
    });

    res.json(result);
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
      metadata: {
        account: maskAccount(body.account)
      }
    });

    res.json(result);
  })
);

function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request): z.output<T> {
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request body.";
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }

  return parsed.data;
}

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
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
