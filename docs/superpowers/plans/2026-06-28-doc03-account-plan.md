# DOC-03 Account And Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build DOC-03 account, plans, API credit balance, recharge, usage, and commercial-grade account pages on top of the existing DOC-01 system.

**Architecture:** Extend the existing Express + Prisma backend instead of rebuilding. Keep real billing, credit calculation, balances, and payment verification on the backend; the frontend only displays returned results and drives safe placeholder payment flows until real Alipay/WeChat credentials are configured in Render.

**Tech Stack:** Node.js 20, Express, TypeScript, Prisma, PostgreSQL, static Cloudflare Pages frontend (`frontend/GEOFlow-Integrated-Final-White.html`), PowerShell verification commands.

---

## Files

- Modify: `backend/prisma/schema.prisma` - add DOC-03 credit account, transactions, recharge orders, model pricing, and subscription order primitives while preserving existing `Plan`, `Subscription`, `Order`, and `PaymentCallback`.
- Create: `backend/prisma/migrations/20260628103000_doc03_account_credits/migration.sql` - database migration for DOC-03 tables and indexes.
- Modify: `backend/prisma/seed.ts` - seed DOC-03 plans and model pricing.
- Modify: `backend/src/services/entitlements.ts` - align four plans with DOC-03 prices, limits, and model access.
- Create: `backend/src/services/credits.ts` - backend-only `CreditService` for balance, pricing, cost estimate, atomic deduction, trend, transactions, and recharge order lifecycle.
- Create: `backend/src/routes/account.ts` - canonical `/api/v1/account/*`, `/api/v1/plans`, `/api/v1/recharge/*`, and `/api/v1/subscriptions/*` routes.
- Modify: `backend/src/app.ts` - mount canonical DOC-03 routes.
- Create: `backend/tests/doc03AccountContract.test.ts` - contract tests for schema, route mounting, and service safety.
- Create: `backend/tests/doc03FrontendContract.test.ts` - contract tests for account pages and UI behavior.
- Modify: `backend/package.json` - add `test:doc03`.
- Modify: `frontend/_redirects` - add account route redirects for Cloudflare Pages.
- Modify: `frontend/GEOFlow-Integrated-Final-White.html` - add account routes, side navigation entry, account overview, plan, credits, usage, profile, security, and billing UI using existing static app style.

## Task 1: Backend Contract Tests

**Files:**
- Create: `backend/tests/doc03AccountContract.test.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Add failing DOC-03 backend contract test**

```ts
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

for (const model of ["CreditAccount", "CreditTransaction", "RechargeOrder", "ModelPricing", "SubscriptionOrder"]) {
  assert.ok(schema.includes(`model ${model}`), `DOC-03 Prisma schema must define ${model}.`);
}

for (const table of ["credit_accounts", "credit_transactions", "recharge_orders", "model_pricing", "subscription_orders"]) {
  assert.ok(schema.includes(`@@map("${table}")`), `DOC-03 schema must map ${table}.`);
}

assert.ok(appSource.includes('app.use("/api/v1/account"'), "DOC-03 must mount /api/v1/account routes.");
assert.ok(appSource.includes('app.use("/api/v1/plans"'), "DOC-03 must mount /api/v1/plans routes.");
assert.ok(appSource.includes('app.use("/api/v1/recharge"'), "DOC-03 must mount /api/v1/recharge routes.");
assert.ok(appSource.includes('app.use("/api/v1/subscriptions"'), "DOC-03 must mount /api/v1/subscriptions routes.");
assert.ok(appSource.includes('app.use("/api/v1/payment/callback"'), "DOC-03 must mount payment callback routes.");

for (const method of ["deductCredits", "checkBalance", "getUnitPrice", "estimateCost", "getConsumptionTrend"]) {
  assert.ok(creditService.includes(method), `CreditService must implement ${method}.`);
}

assert.ok(/\\$queryRaw[\\s\\S]*FOR UPDATE/.test(creditService), "Credit deduction must lock credit_accounts with SELECT FOR UPDATE.");
assert.ok(creditService.includes("INSUFFICIENT_BALANCE"), "Credit deduction must return INSUFFICIENT_BALANCE when balance is not enough.");
assert.ok(!creditService.includes("service_rate") || !accountRoutes.includes("service_rate"), "Frontend routes must not expose service_rate.");

for (const plan of ["免费版", "个人版", "专业版", "企业版"]) {
  assert.ok(entitlements.includes(plan), `DOC-03 plan seed must include ${plan}.`);
}
for (const price of ["49_900", "89_900", "399_900", "499_900", "899_900", "3_999_900"]) {
  assert.ok(entitlements.includes(price), `DOC-03 plan seed must include price cents ${price}.`);
}

const server = createServer(createApp());
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const publicPlans = await fetch(`${baseUrl}/api/v1/plans`);
  assert.equal(publicPlans.status, 200, "GET /api/v1/plans should be public.");
  const protectedCredits = await fetch(`${baseUrl}/api/v1/account/credits`);
  assert.equal(protectedCredits.status, 401, "GET /api/v1/account/credits must require login.");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

console.log("DOC-03 backend account contract checks passed.");
```

- [ ] **Step 2: Add package script**

```json
"test:doc03": "tsx tests/doc03AccountContract.test.ts && tsx tests/doc03FrontendContract.test.ts"
```

- [ ] **Step 3: Run test and confirm expected failure**

Run: `npm.cmd run test:doc03`

Expected: FAIL because `credits.ts`, `account.ts`, and DOC-03 schema models are not implemented yet.

## Task 2: Prisma Schema, Migration, And Seeds

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260628103000_doc03_account_credits/migration.sql`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/src/services/entitlements.ts`

- [ ] **Step 1: Add DOC-03 enums and models**

Add enums:

```prisma
enum CreditTransactionType {
  CHARGE
  CONSUME
  REFUND
  ADJUST
}

enum RechargeOrderStatus {
  PENDING
  PAID
  FAILED
  EXPIRED
  CANCELLED
}
```

Add models mapped to `credit_accounts`, `credit_transactions`, `recharge_orders`, `subscription_orders`, and `model_pricing`.

- [ ] **Step 2: Preserve current data compatibility**

Keep `User.apiBalance`, `Plan`, `Subscription`, `Order`, `PaymentCallback`, and `AiUsageLog.costCents`; do not delete or rename them. Add relations from `User` to credit/recharge/subscription-order tables.

- [ ] **Step 3: Align plan seeds to DOC-03**

Use these plan codes and visible names:

```ts
free: 免费版, monthly 0
personal_month: 个人版, monthly 49900
personal_year: 个人版, yearly 499900
pro_month: 专业版, monthly 89900
pro_year: 专业版, yearly 899900
enterprise_month: 企业版, monthly 399900
enterprise_year: 企业版, yearly 3999900
```

Professional must be marked as recommended in `featureFlags.recommended = true`.

- [ ] **Step 4: Seed model pricing**

Seed 10 models: doubao, deepseek, wenxin, tongyi, yuanbao, zhipu, kimi, metaso, ai360, xinghuo. Store `apiCost`, `serviceRate`, and backend-calculated `userPrice`; frontend responses can only expose `userPrice`.

- [ ] **Step 5: Validate schema**

Run:

```powershell
$env:DATABASE_URL='postgresql://geo:geo@127.0.0.1:5432/geo'; npm.cmd run prisma:validate
```

Expected: schema validates.

## Task 3: Credit Service And Account APIs

**Files:**
- Create: `backend/src/services/credits.ts`
- Create: `backend/src/routes/account.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Implement `CreditService`**

Required exported functions:

```ts
ensureCreditAccount(userId: string)
checkBalance(userId: string, requiredAmount: Decimal | number | string)
getUnitPrice(modelKey: string)
estimateCost(models: string[], operationType: string)
deductCredits(input)
getTransactions(userId, query)
getConsumptionTrend(userId, days)
createRechargeOrder(userId, input)
startRechargePayment(userId, orderId)
getRechargeOrderStatus(userId, orderId)
processRechargeCallback(provider, body)
createSubscriptionOrder(userId, input)
startSubscriptionPayment(userId, orderId)
```

- [ ] **Step 2: Use database transaction and row lock for deduction**

`deductCredits` must lock the account row:

```ts
await tx.$queryRaw`SELECT id FROM credit_accounts WHERE user_id = ${userId}::uuid FOR UPDATE`;
```

Then check balance, update balance, insert a negative `CONSUME` transaction, and record `AiUsageLog` when possible. If balance is insufficient, throw `HttpError(402, "INSUFFICIENT_BALANCE", "...")`.

- [ ] **Step 3: Implement canonical routes**

Routes:

```txt
GET/PUT /api/v1/account/profile
PUT /api/v1/account/password
GET /api/v1/account/plan
GET /api/v1/plans
GET /api/v1/account/usage
GET /api/v1/account/credits
GET /api/v1/account/credits/transactions
GET /api/v1/account/credits/consumption-trend
POST /api/v1/recharge/orders
POST /api/v1/recharge/orders/:id/pay
GET /api/v1/recharge/orders/:id/status
POST /api/v1/payment/callback/alipay
POST /api/v1/payment/callback/wechat
POST /api/v1/subscriptions/orders
POST /api/v1/subscriptions/orders/:id/pay
```

- [ ] **Step 4: Keep payment placeholder safe**

Until real merchant keys are configured, `pay` returns a placeholder QR payload and status remains `pending`. A manual placeholder callback with accepted test signature can mark paid in non-production only; production requires configured callback secret or real provider verification.

- [ ] **Step 5: Run backend contract test**

Run: `npm.cmd run test:doc03`

Expected: backend contract passes once frontend contract exists.

## Task 4: Frontend Contract Test And Account UI

**Files:**
- Create: `backend/tests/doc03FrontendContract.test.ts`
- Modify: `frontend/GEOFlow-Integrated-Final-White.html`
- Modify: `frontend/_redirects`

- [ ] **Step 1: Add frontend contract test**

Assert the HTML contains:

```txt
id="account"
id="accountPlan"
id="accountCredits"
id="accountUsage"
id="accountProfile"
id="accountSecurity"
id="accountBilling"
function buildAccountOverview()
function buildAccountPlan()
function buildAccountCredits()
function openRechargeModal()
function createRechargeOrder()
function startRechargePolling()
function animateBalanceCountUp()
/api/v1/account/credits
/api/v1/recharge/orders
/api/v1/account/credits/transactions
/api/v1/account/credits/consumption-trend
/api/v1/plans
专业版
推荐
```

- [ ] **Step 2: Add account sections and routes**

Add sections: `account`, `accountPlan`, `accountCredits`, `accountUsage`, `accountProfile`, `accountSecurity`, `accountBilling`. Add page metadata and tabs, route aliases from `/account/*` into the correct section, and Cloudflare redirects.

- [ ] **Step 3: Replace old single billing page with DOC-03 account experience**

Keep old `billing` entry compatible by redirecting it internally to `accountPlan` or rendering the new account billing content. Add left navigation under “账户与套餐” with account overview, plan, credits, usage, profile, security, billing.

- [ ] **Step 4: Add commercial account UI**

Account overview: current plan, expiry, billing cycle, balance, usage progress.

Plan page: four cards, current highlight, professional recommended pulse badge, monthly/yearly switch, detail expand, upgrade modal.

Credits page: balance card, low-balance warnings, quick recharge, model pricing table, 30-day trend, transaction list.

Recharge modal: amounts 50/100/200/500/1000/2000/custom, Alipay/WeChat toggle, safe placeholder QR, 5-minute countdown, 3-second status polling, button loading state, success toast, balance count-up.

- [ ] **Step 5: Run frontend contract**

Run: `npm.cmd run test:doc03`

Expected: frontend contract passes.

## Task 5: Verification And Packaging

**Files:**
- Modify or create under `outputs/doc03-account-plans/`

- [ ] **Step 1: Run full verification**

```powershell
cd C:\Users\路\Desktop\GEO\citeox-geo-doc01-worktree\backend
npm.cmd run test:doc01
npm.cmd run test:doc03
$env:DATABASE_URL='postgresql://geo:geo@127.0.0.1:5432/geo'; npm.cmd run prisma:validate
npm.cmd run build
```

Expected: all commands pass.

- [ ] **Step 2: Build Cloudflare Pages package**

Package root must include `index.html`, `GEOFlow-Integrated-Final-White.html`, `_redirects`, `_headers`, and `assets`.

- [ ] **Step 3: Build GitHub source package**

Zip source while excluding `node_modules`, `dist`, `.env`, logs, caches, and old output zips.

- [ ] **Step 4: Final git commit**

```powershell
git status --short
git add backend frontend docs package.json
git commit -m "feat: implement doc03 account plans and credits"
```

Expected: clean or only ignored output artifacts after commit; final response includes both package paths.

## Acceptance Checklist

- [ ] `/api/v1/plans` returns DOC-03 free/personal/pro/enterprise plans and professional recommended flag.
- [ ] `/api/v1/account/credits` requires login and returns balance plus model unit prices without exposing service rate.
- [ ] Credit deduction uses backend-only calculation and row lock.
- [ ] Recharge order flow creates order, returns placeholder payment payload, polls status, and records transaction after verified paid callback.
- [ ] Account pages exist for overview, plan, credits, usage, profile, security, and billing.
- [ ] Professional plan is visually recommended.
- [ ] All money values show `¥128.50` style.
- [ ] Low balance and zero balance states display clear Chinese actions.
- [ ] No payment key, database password, or `.env` value is read or packaged.
- [ ] Cloudflare package and GitHub source package are produced.
