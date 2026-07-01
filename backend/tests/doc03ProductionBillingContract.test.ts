import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const credits = readFileSync(resolve(process.cwd(), "src/services/credits.ts"), "utf8");
const accountRoutes = readFileSync(resolve(process.cwd(), "src/routes/account.ts"), "utf8");
const legacyBillingRoutes = readFileSync(resolve(process.cwd(), "src/routes/billing.ts"), "utf8");
const authMiddleware = readFileSync(resolve(process.cwd(), "src/middleware/auth.ts"), "utf8");
const paymentProviders = readFileSync(resolve(process.cwd(), "src/services/paymentProviders.ts"), "utf8");
const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");

assert.ok(paymentProviders.includes("createPaymentIntent"), "DOC-03 payments must go through a provider adapter.");
assert.ok(paymentProviders.includes("assertPaymentProviderConfigured"), "Provider config must be checked before starting payment.");
assert.ok(paymentProviders.includes("PAYMENT_PROVIDER_NOT_CONFIGURED"), "Production payment must fail clearly when merchant keys are missing.");
assert.ok(paymentProviders.includes("verifyProviderCallback"), "Provider callbacks must use a dedicated verification helper.");
assert.ok(!credits.includes("https://citeox.com/pay/placeholder"), "Production billing code must not return placeholder URLs.");
assert.ok(!credits.includes("Citeox DOC-03 placeholder"), "Production billing code must not emit DOC-03 placeholder payment labels.");
assert.ok(credits.includes("createPaymentIntent"), "Recharge and subscription payments must use the provider adapter.");
assert.ok(credits.includes("processSubscriptionCallback"), "Subscription payment callback must be implemented.");
assert.ok(credits.includes("applySubscriptionPaid"), "Paid subscription orders must activate entitlements.");
assert.ok(credits.includes("expireExistingSubscriptions"), "Subscription activation must retire prior active/trial subscriptions.");
assert.ok(accountRoutes.includes('"/recharge/:provider"'), "Recharge callbacks must have a dedicated callback route.");
assert.ok(accountRoutes.includes('"/subscription/:provider"'), "Subscription callbacks must have a dedicated callback route.");
assert.ok(!legacyBillingRoutes.includes("createBillingOrder"), "Legacy /api/billing must not create placeholder subscription orders.");
assert.ok(!legacyBillingRoutes.includes("requestInvoicePlaceholder"), "Legacy /api/billing must not create placeholder invoices.");
assert.ok(legacyBillingRoutes.includes("BILLING_ROUTE_DEPRECATED"), "Legacy /api/billing write routes must return a clear deprecation error.");
assert.ok(legacyBillingRoutes.includes("/api/v1/subscriptions/orders"), "Legacy billing errors must guide clients to the production subscription route.");
assert.ok(authMiddleware.includes("requirePlanLevel"), "DOC-03 must expose a plan-level middleware alias.");
assert.ok(authMiddleware.includes("checkUsageLimit"), "DOC-03 must expose a usage-limit middleware alias.");
assert.ok(packageJson.includes("doc03ProductionBillingContract.test.ts"), "test:doc03 must run production billing contract.");

console.log("DOC-03 production billing contract checks passed.");
