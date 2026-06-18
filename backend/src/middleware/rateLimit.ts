import rateLimit from "express-rate-limit";

export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please retry later."
    }
  }
});

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "LOGIN_RATE_LIMITED",
      message: "Too many login attempts. Please retry later."
    }
  }
});

export const verificationCodeRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "CODE_RATE_LIMITED",
      message: "Too many verification code requests. Please retry later."
    }
  }
});

export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: 6,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "PASSWORD_RESET_RATE_LIMITED",
      message: "Too many password reset requests. Please retry later."
    }
  }
});
