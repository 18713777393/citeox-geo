import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(process.cwd(), "../frontend/GEOFlow-Integrated-Final-White.html"), "utf8");
const redirects = readFileSync(resolve(process.cwd(), "../frontend/_redirects"), "utf8");
const legacyPaySelectedBlock = blockBetween(
  html,
  "async function paySelected(payMethod)",
  "async function inviteUnlock()"
);
const legacyPaySelectedFailureBlock = blockBetween(
  legacyPaySelectedBlock,
  "}catch(err){",
  "}save();toastMsg"
);

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
  "function setRechargeAmount(",
  "function syncRechargeAmountFromInput(",
  "function updateRechargeAmountButtons(",
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
assert.ok(html.includes("doc03-plan-free"), "DOC-03 free plan must have its own visual theme.");
assert.ok(html.includes("doc03-plan-personal"), "DOC-03 personal plan must have its own visual theme.");
assert.ok(html.includes("doc03-plan-pro"), "DOC-03 professional plan must have its own green visual theme.");
assert.ok(html.includes("doc03-plan-enterprise"), "DOC-03 enterprise plan must have its own gold visual theme.");
assert.ok(html.includes("doc03-current-plan"), "DOC-03 current plan card must have a visible highlight class.");
assert.ok(html.includes("doc03-discount-badge"), "DOC-03 yearly cards must show the -17% discount badge.");
assert.ok(html.includes("toggleDoc03PlanDetail"), "DOC-03 plan cards must support expand/collapse details.");
assert.ok(html.includes("doc03-plan-detail"), "DOC-03 plan card detail panel must exist.");
assert.ok(html.includes("doc03ApproxCalls"), "DOC-03 recharge amounts must show approximate call counts.");
assert.ok(html.includes("doc03-currency-prefix"), "DOC-03 custom recharge input must show a visible currency prefix.");
assert.ok(html.includes("PAYMENT_PROVIDER_NOT_CONFIGURED"), "DOC-03 frontend must handle missing merchant config.");
assert.ok(html.includes("支付商户参数未配置"), "DOC-03 frontend must show a clear payment config message.");
assert.ok(!html.includes("Citeox DOC-03 placeholder payment"), "DOC-03 frontend must not fake recharge payment success with placeholder text.");
assert.ok(!html.includes("Citeox DOC-03 placeholder subscription order"), "DOC-03 frontend must not fake subscription payment success with placeholder text.");
assert.ok(
  !legacyPaySelectedFailureBlock.includes("activatePlan"),
  "DOC-03 legacy payment flow must not activate a plan when the billing API fails."
);
assert.ok(html.includes(".btn.green") && html.includes(".btn.gold") && html.includes(".btn.blue"), "DOC-03 plan CTAs must support distinct colors.");
assert.ok(html.includes("doc03-amount-btn") && html.includes("data-amount") && html.includes("aria-pressed"), "DOC-03 recharge amount buttons must expose selected state.");
assert.ok(html.includes("syncRechargeAmountFromInput(this.value)"), "DOC-03 custom recharge input must sync the selected preset state.");
assert.ok(html.includes("同步中...") && html.includes("doc03-refresh-button"), "DOC-03 refresh actions must show a visible loading state.");
assert.ok(html.includes("doc03-account-view") && html.includes(".content>.hero"), "DOC-03 account pages must hide the old dashboard shell.");
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

function blockBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `Expected source block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `Expected source block end: ${end}`);
  return source.slice(startIndex, endIndex);
}
