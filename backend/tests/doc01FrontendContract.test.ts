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

const setupAuthDomStart = html.indexOf("function setupAuthDom()");
const quickLoginStart = html.indexOf("window.quickLogin = async function()", setupAuthDomStart);
assert.ok(setupAuthDomStart >= 0, "DOC-01 final auth script must define setupAuthDom.");
assert.ok(quickLoginStart > setupAuthDomStart, "DOC-01 final auth script must define quickLogin after setupAuthDom.");

const setupAuthDomBlock = html.slice(setupAuthDomStart, quickLoginStart);
assert.ok(
  setupAuthDomBlock.includes("legalWasChecked"),
  "DOC-01 login must preserve the already-checked legal consent when setupAuthDom re-renders the auth form."
);
assert.ok(
  setupAuthDomBlock.includes('if($("legalAgree")) $("legalAgree").checked = legalWasChecked;'),
  "DOC-01 setupAuthDom must restore legalAgree.checked after rewriting the legal consent markup."
);
assert.ok(
  setupAuthDomBlock.includes("rememberPasswordWasChecked"),
  "DOC-01 setupAuthDom must preserve the first remember-login checkbox when the form is re-rendered."
);
assert.ok(
  setupAuthDomBlock.includes("rememberMeWasChecked"),
  "DOC-01 setupAuthDom must preserve the final remember-me checkbox when the form is re-rendered."
);
assert.ok(
  setupAuthDomBlock.includes("setAuthVariantFinal(S.authVariant || currentAuthVariantFromUrl());"),
  "DOC-01 setupAuthDom must keep the user-selected auth variant instead of forcing the variant from the URL during submit."
);
assert.ok(
  !setupAuthDomBlock.includes("setAuthVariantFinal(currentAuthVariantFromUrl());"),
  "DOC-01 setupAuthDom must not send a user who switched to login back to register only because the URL has action=register."
);

const updatePasswordStart = html.indexOf("function updatePasswordStrengthFinal()");
const updatePasswordEnd = html.indexOf("window.updatePasswordStrength = updatePasswordStrengthFinal;", updatePasswordStart);
assert.ok(updatePasswordStart >= 0 && updatePasswordEnd > updatePasswordStart, "DOC-01 final auth script must define updatePasswordStrengthFinal.");
const updatePasswordBlock = html.slice(updatePasswordStart, updatePasswordEnd);
assert.ok(
  updatePasswordBlock.includes('cbar.style.width = confirm ? (confirm === pwd ? width + "%" : "45%") : "0%";'),
  "DOC-01 confirm password bar must mirror the password strength width when both passwords match."
);
assert.ok(
  updatePasswordBlock.includes('cbar.style.background = confirm === pwd ? color : "#c34242";'),
  "DOC-01 confirm password bar must mirror the password strength color when matching and use error color only when mismatched."
);

const polishStart = html.lastIndexOf("function applyStrengthBars()");
const polishEnd = html.indexOf("function bind()", polishStart);
assert.ok(polishStart >= 0 && polishEnd > polishStart, "DOC-01 password polish script must define applyStrengthBars.");
const polishBlock = html.slice(polishStart, polishEnd);
assert.ok(
  polishBlock.includes("confirm && confirm !== pwd"),
  "DOC-01 password polish must explicitly distinguish matched and mismatched confirm-password states."
);

assert.ok(
  html.includes("如果你是第一次使用，请先点击下方“注册体验”创建账号。"),
  "DOC-01 login errors must guide first-time users to registration instead of only saying the password is wrong."
);
assert.ok(
  html.includes("请输入密码；如果还没有账号，请先点击下方“注册体验”。"),
  "DOC-01 missing-password validation must include a clear registration path for first-time users."
);

console.log("DOC-01 frontend contract checks passed.");
