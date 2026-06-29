import { createHash, createHmac } from "node:crypto";
import { PaymentProvider } from "@prisma/client";
import { HttpError } from "../middleware/error.js";

export type PaymentMethod = "alipay" | "wechat_pay" | "manual";

export interface PaymentIntentInput {
  orderNo: string;
  amount: number;
  subject: string;
  method: PaymentMethod;
  expiresAt: Date;
  callbackPath: string;
}

export interface PaymentIntent {
  mode: "provider" | "manual";
  provider: PaymentMethod;
  qrPayload: string | null;
  paymentUrl: string | null;
  pollIntervalSeconds: number;
  expiresAt: string;
  message: string;
}

export function normalizePaymentMethod(value: PaymentProvider | string | undefined): PaymentMethod {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("ali") || normalized.includes("支付宝")) return "alipay";
  if (normalized.includes("wechat") || normalized.includes("wx") || normalized.includes("微信")) return "wechat_pay";
  return "manual";
}

export function assertPaymentProviderConfigured(method: PaymentMethod) {
  if (method === "manual") {
    if (isProduction()) {
      throw paymentConfigError("manual");
    }
    return;
  }

  const missing = missingProviderKeys(method);
  if (missing.length > 0) {
    throw paymentConfigError(method, missing);
  }
}

export async function createPaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
  const method = normalizePaymentMethod(input.method);
  assertPaymentProviderConfigured(method);

  if (method === "manual") {
    return {
      mode: "manual",
      provider: method,
      qrPayload: manualPaymentPayload(input),
      paymentUrl: null,
      pollIntervalSeconds: 3,
      expiresAt: input.expiresAt.toISOString(),
      message: "Local manual payment mode is enabled for development and test only."
    };
  }

  const paymentUrl = paymentUrlFromTemplate(method, input);
  const qrPayload = paymentUrl ?? providerHandoffPayload(method, input);

  return {
    mode: "provider",
    provider: method,
    qrPayload,
    paymentUrl,
    pollIntervalSeconds: 3,
    expiresAt: input.expiresAt.toISOString(),
    message: "Payment provider handoff is ready. The order is activated only after a verified callback."
  };
}

export function verifyProviderCallback(method: PaymentProvider | PaymentMethod | string, body: Record<string, unknown>) {
  const normalized = normalizePaymentMethod(String(method));
  const signature = stringFrom(body.signature, "");
  const secret = callbackSecret(normalized);
  const canonical = canonicalPayload(body);

  if (!secret) {
    return !isProduction() && signature === "doc03-manual";
  }

  const expectedHmac = createHmac("sha256", secret).update(canonical).digest("hex");
  const expectedSha = createHash("sha256").update(`${secret}:${canonical}`).digest("hex");
  return signature === expectedHmac || signature === expectedSha;
}

function missingProviderKeys(method: PaymentMethod) {
  const common = ["PAYMENT_CALLBACK_BASE"];
  const alipay = ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"];
  const wechat = ["WECHAT_APP_ID", "WECHAT_MCH_ID", "WECHAT_API_KEY"];
  const keys = method === "alipay" ? [...common, ...alipay] : [...common, ...wechat];
  return keys.filter((key) => !envAny(key, aliasFor(key)));
}

function aliasFor(key: string) {
  const aliases: Record<string, string[]> = {
    WECHAT_APP_ID: ["WECHAT_PAY_APP_ID"],
    WECHAT_MCH_ID: ["WECHAT_PAY_MCH_ID"],
    WECHAT_API_KEY: ["WECHAT_PAY_API_KEY", "WECHAT_PAY_CALLBACK_SECRET"]
  };
  return aliases[key] ?? [];
}

function paymentConfigError(method: PaymentMethod, missing: string[] = []) {
  const detail = missing.length ? ` Missing: ${missing.join(", ")}.` : "";
  return new HttpError(
    503,
    "PAYMENT_PROVIDER_NOT_CONFIGURED",
    `支付商户参数未配置，请先在 Render 环境变量中配置支付宝或微信商户信息。${detail}`
  );
}

function paymentUrlFromTemplate(method: PaymentMethod, input: PaymentIntentInput) {
  const template = envAny(
    method === "alipay" ? "ALIPAY_PAYMENT_URL_TEMPLATE" : "WECHAT_PAYMENT_URL_TEMPLATE",
    ["PAYMENT_URL_TEMPLATE"]
  );

  if (!template) {
    return null;
  }

  const values: Record<string, string> = {
    orderNo: encodeURIComponent(input.orderNo),
    amount: encodeURIComponent(input.amount.toFixed(2)),
    subject: encodeURIComponent(input.subject),
    callbackUrl: encodeURIComponent(callbackUrl(input.callbackPath)),
    expiresAt: encodeURIComponent(input.expiresAt.toISOString())
  };

  return template.replace(/\{(orderNo|amount|subject|callbackUrl|expiresAt)\}/g, (_match, key) => values[key] ?? "");
}

function providerHandoffPayload(method: PaymentMethod, input: PaymentIntentInput) {
  const payload = {
    provider: method,
    orderNo: input.orderNo,
    amount: input.amount.toFixed(2),
    subject: input.subject,
    callbackUrl: callbackUrl(input.callbackPath),
    expiresAt: input.expiresAt.toISOString()
  };

  return JSON.stringify({
    ...payload,
    signature: createHash("sha256").update(JSON.stringify(payload)).digest("hex")
  });
}

function manualPaymentPayload(input: PaymentIntentInput) {
  return JSON.stringify({
    mode: "manual",
    orderNo: input.orderNo,
    amount: input.amount.toFixed(2),
    expiresAt: input.expiresAt.toISOString()
  });
}

function callbackUrl(path: string) {
  const base = envAny("PAYMENT_CALLBACK_BASE", ["APP_URL"]) || "";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function callbackSecret(method: PaymentMethod) {
  if (method === "alipay") {
    return envAny("ALIPAY_CALLBACK_SECRET", ["PAYMENT_CALLBACK_SECRET", "ALIPAY_PUBLIC_KEY"]);
  }

  if (method === "wechat_pay") {
    return envAny("WECHAT_PAY_CALLBACK_SECRET", ["PAYMENT_CALLBACK_SECRET", "WECHAT_API_KEY", "WECHAT_PAY_API_KEY"]);
  }

  return envAny("MANUAL_PAY_CALLBACK_SECRET", ["PAYMENT_CALLBACK_SECRET"]);
}

function canonicalPayload(body: Record<string, unknown>) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(body).filter(([key]) => key !== "signature").sort(([a], [b]) => a.localeCompare(b)))
  );
}

function envAny(key: string, aliases: string[] = []) {
  for (const candidate of [key, ...aliases]) {
    const value = process.env[candidate];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}
