import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(process.cwd(), "../frontend/GEOFlow-Integrated-Final-White.html"), "utf8");
const redirects = readFileSync(resolve(process.cwd(), "../frontend/_redirects"), "utf8");

for (const id of [
  "account",
  "accountPlan",
  "accountCredits",
  "accountUsage",
  "accountProfile",
  "accountSecurity",
  "accountBilling"
]) {
  assert.ok(html.includes(`id="${id}"`), `DOC-03 frontend must include section ${id}.`);
}

for (const fn of [
  "function buildAccountOverview()",
  "function buildAccountPlan()",
  "function buildAccountCredits()",
  "function openRechargeModal(",
  "function createRechargeOrder(",
  "function startRechargePolling(",
  "function animateBalanceCountUp(",
  "function openUpgradeModal(",
  "function renderDoc03AccountPages("
]) {
  assert.ok(html.includes(fn), `DOC-03 frontend must include ${fn}.`);
}

for (const endpoint of [
  "/api/v1/account/profile",
  "/api/v1/account/password",
  "/api/v1/account/plan",
  "/api/v1/account/usage",
  "/api/v1/account/credits",
  "/api/v1/account/credits/transactions",
  "/api/v1/account/credits/consumption-trend",
  "/api/v1/recharge/orders",
  "/api/v1/plans",
  "/api/v1/subscriptions/orders"
]) {
  assert.ok(html.includes(endpoint), `DOC-03 frontend must call ${endpoint}.`);
}

for (const text of [
  "账户与套餐",
  "账户概览",
  "套餐管理",
  "API调用额度",
  "专业版",
  "推荐",
  "¥899/月",
  "¥8,999/年",
  "充值API额度",
  "余额不足",
  "count-up"
]) {
  assert.ok(html.includes(text), `DOC-03 frontend must show ${text}.`);
}

assert.ok(html.includes("pulse-badge"), "DOC-03 professional recommended badge must use pulse animation.");
assert.ok(html.includes("setInterval") && html.includes("3000"), "DOC-03 recharge polling must check status every 3 seconds.");
assert.ok(html.includes("5分00秒后过期") || html.includes("300"), "DOC-03 recharge modal must include 5 minute expiry countdown.");
assert.ok(!html.includes("199 元/月"), "DOC-03 frontend must not show stale 199/month starter price.");
assert.ok(!html.includes("699 元/月"), "DOC-03 frontend must not show stale 699/month professional price.");
assert.ok(!html.includes("1999 元/月"), "DOC-03 frontend must not show stale 1999/month enterprise price.");

for (const route of [
  "/account",
  "/account/plan",
  "/account/credits",
  "/account/usage",
  "/account/profile",
  "/account/security",
  "/account/billing"
]) {
  assert.ok(
    redirects.includes(`${route} /GEOFlow-Integrated-Final-White`),
    `Cloudflare redirects must route ${route} into the app.`
  );
}

console.log("DOC-03 frontend contract checks passed.");
