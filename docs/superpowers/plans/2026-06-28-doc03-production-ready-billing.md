# DOC-03 Production Ready Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade DOC-03 from a safe demo/payment placeholder into a production-ready account, credit, payment, and subscription foundation that can be promoted after real merchant credentials are configured.

**Architecture:** Keep the current DOC-01/DOC-03 code and add a narrow payment provider boundary. Backend controls payment creation, callback verification, subscription activation, balance changes, entitlement checks, and usage checks; frontend displays clear states and never treats unconfigured payment as successful.

**Tech Stack:** Node.js 20, Express, TypeScript, Prisma, PostgreSQL, static Cloudflare Pages frontend, PowerShell verification commands.

---

## Files

- Create: `backend/src/services/paymentProviders.ts` - provider adapter for Alipay/WeChat/manual local mode, required environment checks, callback signature helper, and payment payload formatting.
- Modify: `backend/src/services/credits.ts` - remove production placeholder payment success path, use provider adapter, add subscription callback activation, idempotency, and clear `PAYMENT_PROVIDER_NOT_CONFIGURED` behavior.
- Modify: `backend/src/routes/account.ts` - route payment callbacks to recharge or subscription orders and expose subscription status query route if needed by the UI.
- Modify: `backend/src/middleware/auth.ts` - add plan-level and usage-limit middleware aliases matching DOC-03 language without breaking existing `requireEntitlement`.
- Create: `backend/tests/doc03ProductionBillingContract.test.ts` - failing tests for no placeholder payment in production, subscription callback activation, provider config checks, and middleware contracts.
- Modify: `backend/tests/doc03FrontendContract.test.ts` - assert plan highlights, yearly discount, detail toggle, approximate-call labels, payment unavailable state, and absence of placeholder fallback text in production UI.
- Modify: `backend/package.json` - include production billing contract in `test:doc03`.
- Modify: `frontend/GEOFlow-Integrated-Final-White.html` - align plan cards, recharge modal, upgrade modal, and payment status handling with DOC-03.
- Modify: `docs/runbooks/doc03-account-billing-runbook.md` - explain the user-provided production config and success/failure signs in Chinese.

## Task 1: Production Billing Tests

**Files:**
- Create: `backend/tests/doc03ProductionBillingContract.test.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write failing production contract test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const credits = readFileSync(resolve(process.cwd(), "src/services/credits.ts"), "utf8");
const accountRoutes = readFileSync(resolve(process.cwd(), "src/routes/account.ts"), "utf8");
const authMiddleware = readFileSync(resolve(process.cwd(), "src/middleware/auth.ts"), "utf8");
const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");

assert.ok(credits.includes("createPaymentIntent"), "DOC-03 payments must go through a provider adapter.");
assert.ok(credits.includes("PAYMENT_PROVIDER_NOT_CONFIGURED"), "Production payment must fail clearly when merchant keys are missing.");
assert.ok(!credits.includes("https://citeox.com/pay/placeholder"), "Production billing code must not return placeholder URLs.");
assert.ok(credits.includes("processSubscriptionCallback"), "Subscription payment callback must be implemented.");
assert.ok(credits.includes("applySubscriptionPaid"), "Paid subscription orders must activate entitlements.");
assert.ok(accountRoutes.includes('"/subscription/:provider"'), "Subscription callbacks must have a dedicated callback route.");
assert.ok(authMiddleware.includes("requirePlanLevel"), "DOC-03 must expose a plan-level middleware alias.");
assert.ok(authMiddleware.includes("checkUsageLimit"), "DOC-03 must expose a usage-limit middleware alias.");
assert.ok(packageJson.includes("doc03ProductionBillingContract.test.ts"), "test:doc03 must run production billing contract.");
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
cd C:\Users\路\Desktop\GEO\citeox-geo-doc01-worktree\backend
npx.cmd tsx tests/doc03ProductionBillingContract.test.ts
```

Expected: FAIL because `createPaymentIntent`, `processSubscriptionCallback`, and the middleware aliases are not implemented yet.

- [ ] **Step 3: Add the test script to `test:doc03`**

Set:

```json
"test:doc03": "prisma generate --schema prisma/schema.prisma && tsx tests/doc03AccountContract.test.ts && tsx tests/doc03ProductionBillingContract.test.ts && tsx tests/doc03FrontendContract.test.ts"
```

## Task 2: Payment Provider Boundary

**Files:**
- Create: `backend/src/services/paymentProviders.ts`
- Modify: `backend/src/services/credits.ts`

- [ ] **Step 1: Implement provider config checks**

Create exported helpers:

```ts
export type PaymentMethod = "alipay" | "wechat_pay" | "manual";
export interface PaymentIntentInput { orderNo: string; amount: number; subject: string; method: PaymentMethod; expiresAt: Date; callbackPath: string; }
export interface PaymentIntent { mode: "provider" | "manual"; provider: PaymentMethod; qrPayload: string | null; paymentUrl: string | null; pollIntervalSeconds: number; expiresAt: string; message: string; }
export function assertPaymentProviderConfigured(method: PaymentMethod): void;
export async function createPaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent>;
export function verifyProviderCallback(method: PaymentMethod, body: Record<string, unknown>): boolean;
```

Production rules:

```txt
alipay requires ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY, PAYMENT_CALLBACK_BASE
wechat_pay requires WECHAT_APP_ID, WECHAT_MCH_ID, WECHAT_API_KEY, PAYMENT_CALLBACK_BASE
manual is allowed only outside production
missing config throws HttpError(503, "PAYMENT_PROVIDER_NOT_CONFIGURED", "支付商户参数未配置，请先在 Render 环境变量中配置。")
```

- [ ] **Step 2: Replace recharge placeholder start**

In `startRechargePayment`, call:

```ts
const payment = await createPaymentIntent({
  orderNo: order.orderNo,
  amount: toNumber(order.amount),
  subject: "Citeox API credit recharge",
  method: normalizePaymentMethod(order.paymentMethod),
  expiresAt: order.expiresAt,
  callbackPath: "/api/v1/payment/callback/recharge/" + order.paymentMethod.toLowerCase()
});
```

Save `payment.qrPayload` and `payment.paymentUrl`. Do not write `placeholder` metadata in production.

- [ ] **Step 3: Keep local manual mode honest**

In development/test only, manual mode may return `mode: "manual"` with a message saying this is local/manual verification, not real payment. Production must not return manual placeholder success.

## Task 3: Subscription Callback And Entitlement Activation

**Files:**
- Modify: `backend/src/services/credits.ts`
- Modify: `backend/src/routes/account.ts`

- [ ] **Step 1: Add `processSubscriptionCallback(provider, body)`**

Behavior:

```txt
verify callback signature
resolve orderNo from orderNo/outTradeNo/out_trade_no
find SubscriptionOrder by orderNo
reject amount mismatch
if already PAID return duplicate true
otherwise call applySubscriptionPaid(order)
```

- [ ] **Step 2: Add `applySubscriptionPaid(order)`**

Transaction behavior:

```txt
load user organizationId
expire existing ACTIVE/TRIALING subscription rows for that organization
create ACTIVE subscription for the paid plan
set currentPeriodStart now
set currentPeriodEnd one month or one year from now
set provider from payment method
set order status PAID and paidAt
record audit event subscriptions.order.paid
```

- [ ] **Step 3: Add callback routes**

Routes:

```txt
POST /api/v1/payment/callback/recharge/:provider -> processRechargeCallback
POST /api/v1/payment/callback/subscription/:provider -> processSubscriptionCallback
POST /api/v1/payment/callback/:provider -> keep compatibility and route to recharge first
```

## Task 4: Plan And Usage Middleware Names

**Files:**
- Modify: `backend/src/middleware/auth.ts`

- [ ] **Step 1: Add plan alias**

Add:

```ts
export type RequiredPlanLevel = "free" | "personal" | "pro" | "enterprise";
export function requirePlanLevel(level: RequiredPlanLevel) { return requireEntitlement(planLevelToFeature(level)); }
```

Map `pro` to an entitlement that free/personal cannot use, such as `distribution.publish`; map `enterprise` to `team.manage`; map `free` to `questions.generate`.

- [ ] **Step 2: Add usage alias**

Add:

```ts
export function checkUsageLimit(featureKey: EntitlementKey) { return requireEntitlement(featureKey); }
```

This keeps the existing entitlement engine and exposes DOC-03 wording for future modules.

## Task 5: Frontend DOC-03 Detail Polish

**Files:**
- Modify: `backend/tests/doc03FrontendContract.test.ts`
- Modify: `frontend/GEOFlow-Integrated-Final-White.html`

- [ ] **Step 1: Add failing frontend assertions**

Add assertions for:

```txt
doc03-current-plan
doc03-discount-badge
toggleDoc03PlanDetail
doc03-plan-detail
doc03ApproxCalls
doc03-currency-prefix
PAYMENT_PROVIDER_NOT_CONFIGURED
支付商户参数未配置
```

Also assert the frontend no longer contains `Citeox DOC-03 placeholder payment`.

- [ ] **Step 2: Implement plan card details**

Plan card must include:

```html
<div class="doc03-plan-detail" hidden>...</div>
<button onclick="toggleDoc03PlanDetail('pro')">展开详情</button>
<span class="doc03-discount-badge">-17%</span>
```

Current plan card must have class `doc03-current-plan`.

- [ ] **Step 3: Implement recharge amount labels**

Preset amount buttons must show:

```txt
¥50
约 33 次豆包调用
```

Custom amount input must be visually wrapped with `¥` prefix via `doc03-currency-prefix`.

- [ ] **Step 4: Implement payment unavailable UI**

When API error code is `PAYMENT_PROVIDER_NOT_CONFIGURED`, show:

```txt
支付商户参数未配置，请先在 Render 环境变量中配置支付宝或微信商户信息。
```

Do not create local fake paid state.

## Task 6: Verification, Packaging, And Commit

**Files:**
- Create/update: `outputs/doc03-production-ready/`

- [ ] **Step 1: Run verification**

```powershell
cd C:\Users\路\Desktop\GEO\citeox-geo-doc01-worktree\backend
npm.cmd run test:doc01
npm.cmd run test:doc03
$env:DATABASE_URL='postgresql://geo:geo@127.0.0.1:5432/geo'; npm.cmd run prisma:validate
npm.cmd run build
```

- [ ] **Step 2: Parse DOC-03 frontend script**

```powershell
cd C:\Users\路\Desktop\GEO\citeox-geo-doc01-worktree\backend
@'
const fs = require('fs');
const html = fs.readFileSync('../frontend/GEOFlow-Integrated-Final-White.html', 'utf8');
const match = html.match(/<script id="citeox-doc03-account-plans-final">([\s\S]*?)<\/script>/);
if (!match) throw new Error('DOC-03 script not found');
new Function(match[1]);
console.log('DOC-03 account script parses.');
'@ | node
```

- [ ] **Step 3: Build cumulative packages**

Create:

```txt
outputs/doc03-production-ready/citeox-doc03-production-cloudflare-pages.zip
outputs/doc03-production-ready/citeox-doc03-production-github-source.zip
```

Cloudflare package root includes `index.html`, `GEOFlow-Integrated-Final-White.html`, `_redirects`, `_headers`, and `assets`. Source package excludes `.git`, `node_modules`, `dist`, `.env`, caches, logs, and old zip files.

- [ ] **Step 4: Commit**

```powershell
git add backend frontend docs
git commit -m "feat: harden doc03 production billing readiness"
```

## Acceptance Checklist

- [ ] Production no longer returns placeholder payment URLs.
- [ ] Missing Alipay/WeChat config produces `PAYMENT_PROVIDER_NOT_CONFIGURED`.
- [ ] Recharge callback still verifies signature and is idempotent.
- [ ] Subscription callback verifies signature, marks order paid, and activates the paid plan.
- [ ] DOC-03 exposes plan and usage middleware names for later modules.
- [ ] Current plan card is visibly highlighted.
- [ ] Professional recommendation badge follows the DOC-03 pulse behavior.
- [ ] Yearly plans show `-17%`.
- [ ] Plan cards expand/collapse details.
- [ ] Recharge buttons show approximate call counts.
- [ ] Custom recharge amount has a visible `¥` prefix.
- [ ] Frontend handles payment not configured without pretending payment succeeded.
- [ ] DOC-01 tests, DOC-03 tests, Prisma validation, build, and frontend script parse pass.
- [ ] Two new cumulative packages are created.
