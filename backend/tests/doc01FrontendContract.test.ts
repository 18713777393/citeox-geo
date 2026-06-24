import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const frontendPath = resolve(process.cwd(), "../frontend/GEOFlow-Integrated-Final-White.html");
const html = readFileSync(frontendPath, "utf8");

assert.ok(
  !html.includes("/api/auth/"),
  "DOC-01 requires frontend auth calls to use /api/v1/auth/*, not legacy /api/auth/*."
);

assert.ok(
  html.includes('api:{base:"https://citeox-geo.onrender.com"'),
  "DOC-01 frontend must point to the live Render service domain citeox-geo.onrender.com."
);

assert.ok(
  !html.includes("https://citeox-api.onrender.com"),
  "DOC-01 frontend must not call the old Render service domain citeox-api.onrender.com."
);

for (const endpoint of [
  "/api/v1/auth/check-username",
  "/api/v1/auth/email-suggestion",
  "/api/v1/auth/validate-industry",
  "/api/v1/auth/validate-invite-code",
  "/api/v1/auth/send-verify-code",
  "/api/v1/auth/request-password-reset",
  "/api/v1/auth/reset-password",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/me",
  "/api/v1/auth/logout"
]) {
  assert.ok(html.includes(endpoint), `Missing DOC-01 auth endpoint ${endpoint}.`);
}

assert.ok(
  html.includes('storageKey = "citeox_register_draft"'),
  "DOC-01 requires registration draft storage key citeox_register_draft."
);

assert.ok(!html.includes("手机号（选填）"), "DOC-01 requires phone to be presented as required.");
assert.ok(!html.includes("手机号可选填"), "DOC-01 requires phone to be presented as required.");
assert.ok(!html.includes("可填写联系方式"), "DOC-01 phone helper text must not imply phone is optional.");
assert.ok(html.includes("手机号（必填）"), "DOC-01 requires visible phone label to say 手机号（必填）.");

console.log("DOC-01 frontend contract checks passed.");
