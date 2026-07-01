type EnvLike = Record<string, string | undefined>;

export type CommercialReadinessStatus = "ready" | "missing" | "warning";

export interface CommercialReadinessCheck {
  id: string;
  label: string;
  status: CommercialReadinessStatus;
  requiredKeys: string[];
  configuredKeys: string[];
  missingKeys: string[];
  message: string;
}

export interface CommercialReadinessReport {
  ready: boolean;
  environment: string;
  checkedAt: string;
  checks: CommercialReadinessCheck[];
  requiredAction: string[];
}

export const requiredProductionIntegrationKeys = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "ENCRYPTION_KEY",
  "RESEND_API_KEY",
  "PAYMENT_CALLBACK_BASE",
  "ALIPAY_APP_ID",
  "ALIPAY_PRIVATE_KEY",
  "ALIPAY_PUBLIC_KEY",
  "WECHAT_APP_ID",
  "WECHAT_MCH_ID",
  "WECHAT_API_KEY",
  "DEEPSEEK_API_KEY",
  "DOUBAO_API_KEY",
  "TONGYI_API_KEY",
  "YUANBAO_API_KEY",
  "KIMI_API_KEY",
  "QIANFAN_API_KEY",
  "ZHIPU_API_KEY",
  "PERPLEXITY_API_KEY",
  "XUNFEI_API_KEY",
  "AI360_API_KEY"
] as const;

const productionChecks = [
  {
    id: "core-security",
    label: "核心安全配置",
    keys: ["DATABASE_URL", "JWT_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY"],
    message: "数据库、JWT 和字段加密密钥必须配置完成。"
  },
  {
    id: "redis-queue",
    label: "Render Redis / BullMQ / WebSocket",
    keys: ["REDIS_URL"],
    message: "诊断队列、验证码限流和任务进度推送需要接入真实 Redis。"
  },
  {
    id: "email",
    label: "Resend 邮件服务",
    keys: ["RESEND_API_KEY"],
    message: "注册验证码、找回密码和欢迎邮件需要接入真实 Resend 邮件。"
  },
  {
    id: "payment-alipay",
    label: "支付宝支付",
    keys: ["PAYMENT_CALLBACK_BASE", "ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"],
    message: "套餐升级和充值上线前需要配置支付宝商户参数和回调地址。"
  },
  {
    id: "payment-wechat",
    label: "微信支付",
    keys: ["PAYMENT_CALLBACK_BASE", "WECHAT_APP_ID", "WECHAT_MCH_ID", "WECHAT_API_KEY"],
    message: "套餐升级和充值上线前需要配置微信支付商户参数和回调地址。"
  }
] as const;

const aiProviderKeys = [
  "DEEPSEEK_API_KEY",
  "DOUBAO_API_KEY",
  "TONGYI_API_KEY",
  "YUANBAO_API_KEY",
  "KIMI_API_KEY",
  "QIANFAN_API_KEY",
  "ZHIPU_API_KEY",
  "PERPLEXITY_API_KEY",
  "XUNFEI_API_KEY",
  "AI360_API_KEY"
] as const;

export function getCommercialReadiness(source: EnvLike = process.env): CommercialReadinessReport {
  const checks = productionChecks.map((check) => buildCheck(check.id, check.label, check.keys, check.message, source));
  checks.push(buildAiProviderCheck(source));

  const requiredAction = checks
    .filter((check) => check.status !== "ready")
    .map((check) => `${check.label}：${check.message} 缺少 ${check.missingKeys.join("、")}。`);

  return {
    ready: checks.every((check) => check.status === "ready"),
    environment: source.NODE_ENV || "development",
    checkedAt: new Date().toISOString(),
    checks,
    requiredAction
  };
}

function buildCheck(
  id: string,
  label: string,
  keys: readonly string[],
  message: string,
  source: EnvLike
): CommercialReadinessCheck {
  const configuredKeys = keys.filter((key) => hasValue(source[key]));
  const missingKeys = keys.filter((key) => !hasValue(source[key]));

  return {
    id,
    label,
    status: missingKeys.length ? "missing" : "ready",
    requiredKeys: [...keys],
    configuredKeys,
    missingKeys,
    message: missingKeys.length ? message : `${label}已配置。`
  };
}

function buildAiProviderCheck(source: EnvLike): CommercialReadinessCheck {
  const configuredKeys = aiProviderKeys.filter((key) => hasValue(source[key]));
  const missingKeys = aiProviderKeys.filter((key) => !hasValue(source[key]));

  return {
    id: "ai-providers",
    label: "真实 AI 平台 API",
    status: configuredKeys.length ? "ready" : "missing",
    requiredKeys: [...aiProviderKeys],
    configuredKeys,
    missingKeys,
    message: configuredKeys.length
      ? "至少一个真实 AI 平台已配置，可以继续做真实诊断链路验收。"
      : "品牌诊断、AI 回答监控和内容生成需要至少接入一个真实 AI 平台 API。"
  };
}

function hasValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}
