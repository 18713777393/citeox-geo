import rateLimit from "express-rate-limit";

export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "请求太频繁，请稍后再试。"
    }
  }
});

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "LOGIN_RATE_LIMITED",
      message: "登录尝试过多，请等待 15 分钟后再试。"
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
      message: "验证码发送过于频繁，请稍后再试。"
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
      message: "找回密码操作过于频繁，请稍后再试。"
    }
  }
});
