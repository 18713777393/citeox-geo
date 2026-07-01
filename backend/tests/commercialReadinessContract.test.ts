import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getCommercialReadiness,
  requiredProductionIntegrationKeys
} from "../src/services/commercialReadiness.js";

const appSource = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
const systemRoutes = readFileSync(resolve(process.cwd(), "src/routes/system.ts"), "utf8");
const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
const renderYaml = readFileSync(resolve(process.cwd(), "../render.yaml"), "utf8");

const readiness = getCommercialReadiness({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/citeox",
  JWT_SECRET: "x".repeat(64),
  JWT_REFRESH_SECRET: "y".repeat(64),
  ENCRYPTION_KEY: Buffer.from("z".repeat(32)).toString("base64"),
  REDIS_URL: "redis://localhost:6379"
});

assert.equal(readiness.ready, false, "Commercial readiness must fail when real providers are not configured.");
assert.ok(readiness.requiredAction.length >= 4, "Readiness report must tell the operator what real services to connect.");
assert.ok(
  readiness.requiredAction.some((item) => item.includes("Resend")),
  "Readiness report must remind the operator to connect real Resend email."
);
assert.ok(
  readiness.requiredAction.some((item) => item.includes("支付宝") || item.includes("微信")),
  "Readiness report must remind the operator to connect real payment providers."
);
assert.ok(
  readiness.requiredAction.some((item) => item.includes("AI")),
  "Readiness report must remind the operator to connect real AI provider keys."
);
assert.ok(
  readiness.checks.every((check) => check.status !== "unknown"),
  "Every readiness check must expose a clear status."
);
assert.ok(
  requiredProductionIntegrationKeys.includes("RESEND_API_KEY"),
  "Readiness keys must include real email delivery."
);
assert.ok(
  requiredProductionIntegrationKeys.includes("ALIPAY_APP_ID"),
  "Readiness keys must include Alipay merchant configuration."
);
assert.ok(
  requiredProductionIntegrationKeys.includes("WECHAT_MCH_ID"),
  "Readiness keys must include WeChat merchant configuration."
);
assert.ok(
  requiredProductionIntegrationKeys.includes("DEEPSEEK_API_KEY"),
  "Readiness keys must include at least one real AI provider key."
);
for (const aiKey of [
  "DOUBAO_API_KEY",
  "TONGYI_API_KEY",
  "YUANBAO_API_KEY",
  "KIMI_API_KEY",
  "QIANFAN_API_KEY",
  "ZHIPU_API_KEY",
  "PERPLEXITY_API_KEY",
  "XUNFEI_API_KEY",
  "AI360_API_KEY"
]) {
  assert.ok(
    requiredProductionIntegrationKeys.includes(aiKey),
    `Readiness keys must list supported AI provider key ${aiKey}.`
  );
}
for (const key of requiredProductionIntegrationKeys) {
  assert.ok(renderYaml.includes(`key: ${key}`), `render.yaml must expose ${key} as a Render environment variable.`);
}

const ai360OnlyReadiness = getCommercialReadiness({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/citeox",
  JWT_SECRET: "x".repeat(64),
  JWT_REFRESH_SECRET: "y".repeat(64),
  ENCRYPTION_KEY: Buffer.from("z".repeat(32)).toString("base64"),
  REDIS_URL: "redis://localhost:6379",
  RESEND_API_KEY: "re_test",
  PAYMENT_CALLBACK_BASE: "https://citeox.com",
  ALIPAY_APP_ID: "alipay_app",
  ALIPAY_PRIVATE_KEY: "alipay_private",
  ALIPAY_PUBLIC_KEY: "alipay_public",
  WECHAT_APP_ID: "wechat_app",
  WECHAT_MCH_ID: "wechat_mch",
  WECHAT_API_KEY: "wechat_key",
  AI360_API_KEY: "ai360_key"
});

assert.equal(
  ai360OnlyReadiness.checks.find((check) => check.id === "ai-providers")?.status,
  "ready",
  "Any supported real AI provider key should satisfy the AI readiness check."
);
assert.ok(
  appSource.includes("/api/v1/system") && systemRoutes.includes("/commercial-readiness"),
  "Commercial readiness must be exposed as an authenticated system endpoint."
);
assert.ok(
  systemRoutes.includes("requireAdmin"),
  "Commercial readiness must be restricted to admin users."
);
assert.ok(
  packageJson.includes("commercialReadinessContract.test.ts"),
  "package.json must expose a commercial readiness test script."
);

console.log("Commercial readiness contract checks passed.");
