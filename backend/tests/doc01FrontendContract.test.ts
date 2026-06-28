import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const frontendPath = resolve(process.cwd(), "../frontend/GEOFlow-Integrated-Final-White.html");
const html = readFileSync(frontendPath, "utf8");
const redirects = readFileSync(resolve(process.cwd(), "../frontend/_redirects"), "utf8");

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

assert.ok(
  html.includes("function getResetTokenFromUrl()"),
  "DOC-01 reset password page must read token/resetToken from the URL."
);
assert.ok(
  html.includes("applyResetTokenMode"),
  "DOC-01 reset password page must switch the form when a reset token is present."
);
assert.ok(
  html.includes('classList.toggle("token-reset-mode"'),
  "DOC-01 token reset mode must hide account/code fields and ask only for the new password."
);
assert.ok(
  html.includes("S.authDraft.resetTokenFromUrl"),
  "DOC-01 reset form must remember the URL reset token for submit."
);
assert.ok(html.includes("/brand/create"), "DOC-01 register success must route to /brand/create.");
assert.ok(html.includes("/dashboard"), "DOC-01 login with an existing brand must route to /dashboard.");
assert.ok(
  html.includes("authRouteForTarget"),
  "DOC-01 frontend must map internal auth success targets to browser routes."
);
assert.ok(
  html.includes("brandCreate"),
  "DOC-01 frontend must distinguish brand creation target from the internal project section."
);
assert.ok(
  redirects.includes("/brand/create /GEOFlow-Integrated-Final-White"),
  "DOC-01 Cloudflare redirects must serve the app at /brand/create."
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

const loginUsernameTip =
  "\u8bf7\u8f93\u5165\u5df2\u6ce8\u518c\u8d26\u53f7\u3001\u90ae\u7bb1\u6216\u624b\u673a\u53f7\u3002\u65b0\u7528\u6237\u8bf7\u70b9\u51fb\u4e0b\u65b9\u201c\u6ce8\u518c\u4f53\u9a8c\u201d\u3002";
assert.ok(
  html.includes(`var loginUsernameTip = "${loginUsernameTip}";`),
  "DOC-01 login mode must define a dedicated account helper instead of reusing registration availability text."
);

const checkUsernameStart = html.indexOf("async function checkUsername()");
const checkUsernameEnd = html.indexOf("async function checkEmailSuggestion()", checkUsernameStart);
assert.ok(checkUsernameStart >= 0 && checkUsernameEnd > checkUsernameStart, "DOC-01 final auth script must define checkUsername.");
const checkUsernameBlock = html.slice(checkUsernameStart, checkUsernameEnd);
assert.ok(
  checkUsernameBlock.includes('if(S.authVariant !== "register"){ setTip("usernameTip", loginUsernameTip, ""); return; }'),
  "DOC-01 login mode must clear registration username availability checks and show login-specific account guidance."
);
assert.ok(
  !checkUsernameBlock.includes('if(S.authVariant !== "register") return;'),
  "DOC-01 checkUsername must not silently leave stale registration availability text in login mode."
);

const setAuthVariantStart = html.indexOf("function setAuthVariantFinal(variant)");
const setAuthVariantEnd = html.indexOf("function setupAuthDomShallow()", setAuthVariantStart);
assert.ok(setAuthVariantStart >= 0 && setAuthVariantEnd > setAuthVariantStart, "DOC-01 final auth script must define setAuthVariantFinal.");
const setAuthVariantBlock = html.slice(setAuthVariantStart, setAuthVariantEnd);
assert.ok(
  setAuthVariantBlock.includes('setTip("usernameTip", variant === "login" ? loginUsernameTip : "", "");'),
  "DOC-01 switching auth variants must reset usernameTip so login never inherits registration availability state."
);

const filePreviewLoginMessage =
  "\u5f53\u524d\u662f\u672c\u5730 file:// \u9884\u89c8\uff0c\u6d4f\u89c8\u5668\u4f1a\u62e6\u622a\u767b\u5f55\u8bf7\u6c42\u3002\u8bf7\u90e8\u7f72\u5230 citeox.com \u540e\u6d4b\u8bd5\u767b\u5f55\uff1b\u5982\u9700\u672c\u5730\u670d\u52a1\u5668\u6d4b\u8bd5\uff0c\u9700\u5148\u628a\u672c\u5730\u5730\u5740\u52a0\u5165 Render CORS_ORIGIN\u3002";
assert.ok(
  html.includes(`var filePreviewLoginMessage = "${filePreviewLoginMessage}";`),
  "DOC-01 login must explain file:// preview CORS failures instead of looking like the button did nothing."
);
assert.ok(
  html.includes('function loginConnectionMessage(error){'),
  "DOC-01 login must centralize network/CORS guidance for visible inline feedback."
);
assert.ok(
  html.includes('if(error && error.code === "NETWORK_ERROR" && location.protocol === "file:") return filePreviewLoginMessage;'),
  "DOC-01 login must detect local file preview network failures."
);

const finalQuickLoginStart = html.indexOf("window.quickLogin = async function()");
const finalQuickLoginEnd = html.indexOf("try{ quickLogin = window.quickLogin; }catch(e){}", finalQuickLoginStart);
assert.ok(finalQuickLoginStart >= 0 && finalQuickLoginEnd > finalQuickLoginStart, "DOC-01 final auth script must define quickLogin.");
const finalQuickLoginBlock = html.slice(finalQuickLoginStart, finalQuickLoginEnd);
assert.ok(
  finalQuickLoginBlock.includes("guideLoginRecovery(loginConnectionMessage(e));"),
  "DOC-01 non-credential login failures must be shown inline near the password field, not only as a transient toast."
);

assert.ok(
  html.includes('id="citeox-auth-login-polish-final"'),
  "DOC-01 must include the final login/logout polish script."
);
assert.ok(
  html.includes('id="authBackHomeFinal"'),
  "DOC-01 login page must include a visible return-home button."
);
assert.ok(
  html.includes("返回首页"),
  "DOC-01 login page must show 返回首页 so users can switch back to the promo page."
);
assert.ok(
  html.includes("function returnHomeFromAuth()"),
  "DOC-01 login page must provide a return-home handler."
);
assert.ok(
  html.includes("function hideLoginPasswordStrengthHint()"),
  "DOC-01 login mode must hide password strength guidance for existing accounts."
);
assert.ok(
  html.includes(".loginCard.login-mode #passwordStrengthText{display:none!important}"),
  "DOC-01 login mode must not show password strength guidance."
);
assert.ok(
  html.includes("function logoutToLoginPage()"),
  "DOC-01 logout must clear the session and return to the login page."
);
assert.ok(
  html.includes('showLogin("personal","login")'),
  "DOC-01 logout should show the login form after clearing the session."
);
assert.ok(
  html.includes("function hideForgotPasswordShortcut()"),
  "DOC-01 login page must remove the forgot-password shortcut from the visible login form."
);
assert.ok(
  html.includes("#forgotPasswordFinal{display:none!important}"),
  "DOC-01 login page must hide the visible forgot-password button."
);
assert.ok(
  html.includes("function removeClearAccountButton()"),
  "DOC-01 auth form must remove the unused clear-account button."
);
assert.ok(
  html.includes("#clearAccountBtn{display:none!important}"),
  "DOC-01 auth form must not show the clear-account button."
);
assert.ok(
  html.includes("function clearRegisterExperienceFields()"),
  "DOC-01 register experience must clear stale login/register values before display."
);
assert.ok(
  html.includes('if(variant === "register") clearRegisterExperienceFields();'),
  "DOC-01 switching to register must start from a blank form."
);
assert.ok(
  html.includes("function navigateToPromoHome()"),
  "DOC-01 return-home must use a dedicated no-flicker navigation helper."
);
assert.ok(
  html.includes('classList.add("return-home-pending")'),
  "DOC-01 return-home must hide the current single-page app before navigating."
);
assert.ok(
  html.includes('location.replace("/")'),
  "DOC-01 return-home must replace the current auth route with the real promo homepage."
);
assert.ok(
  html.includes("html.return-home-pending body{visibility:hidden!important}"),
  "DOC-01 return-home must prevent the embedded fallback landing page from flashing."
);

console.log("DOC-01 frontend contract checks passed.");
