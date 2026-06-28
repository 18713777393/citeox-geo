import rateLimit from "express-rate-limit";

function rateLimitMessage(code: string, message: string) {
  return {
    error: {
      code,
      message
    }
  };
}

export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("RATE_LIMIT", "请求过于频繁，请稍后再试。")
});

export const usernameCheckRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("RATE_LIMIT", "账号名称检测过于频繁，请稍后再试。")
});

export const validationRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("RATE_LIMIT", "校验请求过于频繁，请稍后再试。")
});

export const registerRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("RATE_LIMIT", "注册请求过于频繁，请稍后再试。")
});

export const loginRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("LOGIN_RATE_LIMITED", "登录尝试过于频繁，请稍后再试。")
});

// Per-email 60 second resend protection is enforced in createVerificationCode via verification_codes.last_sent_at.
export const verificationCodeRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("CODE_RATE_LIMITED", "验证码发送过于频繁，请稍后再试。")
});

export const passwordResetRateLimit = rateLimit({
  windowMs: 30 * 60_000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("PASSWORD_RESET_RATE_LIMITED", "找回密码操作过于频繁，请稍后再试。")
});
