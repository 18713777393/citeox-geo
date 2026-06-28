import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "../src/app.js";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
const creditService = readFileSync(resolve(process.cwd(), "src/services/credits.ts"), "utf8");
const accountRoutes = readFileSync(resolve(process.cwd(), "src/routes/account.ts"), "utf8");
const entitlements = readFileSync(resolve(process.cwd(), "src/services/entitlements.ts"), "utf8");
const seedSource = readFileSync(resolve(process.cwd(), "prisma/seed.ts"), "utf8");

for (const model of ["CreditAccount", "CreditTransaction", "RechargeOrder", "ModelPricing", "SubscriptionOrder"]) {
  assert.ok(schema.includes(`model ${model}`), `DOC-03 Prisma schema must define ${model}.`);
}

for (const table of ["credit_accounts", "credit_transactions", "recharge_orders", "model_pricing", "subscription_orders"]) {
  assert.ok(schema.includes(`@@map("${table}")`), `DOC-03 schema must map ${table}.`);
}

for (const route of [
  'app.use("/api/v1/account"',
  'app.use("/api/v1/plans"',
  'app.use("/api/v1/recharge"',
  'app.use("/api/v1/subscriptions"',
  'app.use("/api/v1/payment/callback"'
]) {
  assert.ok(appSource.includes(route), `DOC-03 app must mount ${route}.`);
}

for (const method of [
  "deductCredits",
  "checkBalance",
  "getUnitPrice",
  "estimateCost",
  "getConsumptionTrend",
  "createRechargeOrder",
  "startRechargePayment",
  "createSubscriptionOrder"
]) {
  assert.ok(creditService.includes(method), `CreditService must implement ${method}.`);
}

assert.ok(/\$queryRaw[\s\S]*FOR UPDATE/.test(creditService), "Credit deduction must lock credit_accounts with SELECT FOR UPDATE.");
assert.ok(creditService.includes("INSUFFICIENT_BALANCE"), "Credit deduction must return INSUFFICIENT_BALANCE when balance is not enough.");
assert.ok(!accountRoutes.includes("serviceRate"), "Account APIs must not expose backend serviceRate.");
assert.ok(!accountRoutes.includes("apiCost"), "Account APIs must not expose backend apiCost.");

for (const plan of ["免费版", "个人版", "专业版", "企业版"]) {
  assert.ok(entitlements.includes(plan), `DOC-03 plan seed must include ${plan}.`);
}

for (const price of ["49_900", "89_900", "399_900", "499_900", "899_900", "3_999_900"]) {
  assert.ok(entitlements.includes(price), `DOC-03 plan seed must include price cents ${price}.`);
}

for (const modelKey of ["doubao", "deepseek", "wenxin", "tongyi", "yuanbao", "zhipu", "kimi", "metaso", "ai360", "xinghuo"]) {
  assert.ok(creditService.includes(modelKey), `DOC-03 model pricing seed must include ${modelKey}.`);
}

assert.ok(seedSource.includes("seedModelPricing"), "DOC-03 seed must initialize model pricing.");

for (const route of [
  '"/profile"',
  '"/password"',
  '"/plan"',
  '"/usage"',
  '"/credits"',
  '"/credits/transactions"',
  '"/credits/consumption-trend"',
  '"/orders"',
  '"/orders/:id/pay"',
  '"/orders/:id/status"'
]) {
  assert.ok(accountRoutes.includes(route), `DOC-03 routes must include ${route}.`);
}

const server = createServer(createApp());
await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === "object", "Expected local test server address.");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const protectedCredits = await fetch(`${baseUrl}/api/v1/account/credits`);
  assert.equal(protectedCredits.status, 401, "GET /api/v1/account/credits must require login.");

  const protectedRecharge = await fetch(`${baseUrl}/api/v1/recharge/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 100, paymentMethod: "alipay" })
  });
  assert.equal(protectedRecharge.status, 401, "POST /api/v1/recharge/orders must require login.");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

console.log("DOC-03 backend account contract checks passed.");
