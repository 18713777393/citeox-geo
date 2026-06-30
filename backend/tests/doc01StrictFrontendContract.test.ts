import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const frontendPath = resolve(process.cwd(), "../frontend/GEOFlow-Integrated-Final-White.html");
const html = readFileSync(frontendPath, "utf8");

function mustContain(value: string, message: string) {
  assert.ok(html.includes(value), message);
}

function mustNotContain(value: string, message: string) {
  assert.ok(!html.includes(value), message);
}

mustContain("doc01StrictAuthStyle", "DOC-01 needs a final strict auth style layer.");
mustContain("grid-template-columns:40% 60%", "Desktop auth layout must be left 40% brand area and right 60% form area.");
mustContain("linear-gradient(135deg,#1e40af 0%,#7c3aed 100%)", "Left auth brand panel must use the documented deep-blue to purple gradient.");
mustContain("max-width:440px", "Register/login form body must be constrained to 440px.");
mustContain("max-width:480px", "Forgot/reset password card must be constrained to 480px.");
mustContain("让品牌在 AI 时代被看见、理解、引用、推荐", "Left brand value proposition must match DOC-01.");

for (const label of [
  "账号名称 *",
  "邮箱 *",
  "手机号 *",
  "密码 *",
  "确认密码 *",
  "行业 *",
  "邮箱验证码 *"
]) {
  mustContain(label, `Register form must show required label: ${label}`);
}

mustContain("usernameDuplicateCount", "Username duplicate checks must count repeated collisions.");
mustContain("试试这些名称：", "After 3 duplicate username checks the UI must show recommended names.");
mustContain("账号名称过于简单，建议使用更有辨识度的名称", "Username simplicity warning must be visible and non-blocking.");
mustContain("账号名称不能为纯数字", "Username pure-number validation must use the documented Chinese copy.");

mustContain("gmial.com", "Email smart correction must cover @gmial.com.");
mustContain("qq.con", "Email smart correction must cover @qq.con.");
mustContain("点击修正", "Email correction banner must include a clickable fix action.");
mustContain("Levenshtein", "Email correction code must document/use Levenshtein distance logic.");

mustContain("138 1234 5678", "Phone helper or formatter must show the documented 3-4-4 display format.");
mustContain("手机号仅用于账号安全和重要通知，我们将严格保密", "Phone privacy helper text must be visible.");
mustContain(".code-boxes input{width:44px;height:44px", "Email code boxes must be 44px square.");
mustContain("Backspace", "Email code boxes must support Backspace navigation.");
mustContain("clipboardData", "Email code boxes must support pasting a 6-digit code.");

mustContain("#EF4444", "Password strength weak state must use DOC-01 red #EF4444.");
mustContain("#F59E0B", "Password strength medium state must use DOC-01 yellow #F59E0B.");
mustContain("#10B981", "Password strength strong state must use DOC-01 green #10B981.");
mustContain("密码强度：强 ✅", "Strong password copy must match DOC-01.");
mustContain("两次输入的密码不一致", "Confirm password mismatch copy must be visible.");
mustContain("密码一致 ✅", "Confirm password success copy must be visible.");

mustContain("authIndustryPanel", "Industry field must be a combobox with a custom suggestion panel.");
mustContain("ArrowDown", "Industry combobox must support ArrowDown.");
mustContain("ArrowUp", "Industry combobox must support ArrowUp.");
mustContain("Enter", "Auth keyboard handling must support Enter.");
mustContain("Escape", "Auth keyboard handling must support Escape.");

mustContain("inviteTooltip", "Invite code field must include a tooltip.");
mustContain("300", "Tooltip delay / debounce timings must preserve the documented 300ms behavior.");
mustContain("@keyframes shake", "Legal consent row must use the documented shake animation.");
mustContain('href="/terms"', "User agreement link must open /terms.");
mustContain('href="/privacy"', "Privacy policy link must open /privacy.");

mustContain("forgotPasswordFinal", "Login form must include the forgot-password link.");
mustContain("clearAccountBtn", "Login account input must include one-click clear.");
mustNotContain("#forgotPasswordFinal{display:none!important}", "Strict DOC-01 login must not hide the forgot-password link.");
mustNotContain("#clearAccountBtn{display:none!important}", "Strict DOC-01 login must not hide the one-click clear button.");
mustNotContain("hideForgotPasswordShortcut", "Strict DOC-01 login must not remove the forgot-password shortcut.");
mustNotContain("removeClearAccountButton", "Strict DOC-01 login must not remove the clear-account button.");

mustContain("AbortController", "Register submit must enforce the documented 15 second timeout.");
mustContain("网络连接超时，请检查网络后重试", "Register timeout must show the documented actionable Chinese copy.");
mustContain("注册成功，欢迎加入 Citeox", "Register success toast must use DOC-01 welcome copy.");
mustContain("1500", "Register success must wait 1.5 seconds before routing to /brand/create.");
mustContain("citeox_register_draft", "Register draft must use the documented localStorage key.");
mustContain("setInterval(saveDraft, 3000)", "Register draft must auto-save every 3 seconds.");

mustContain("toastDoc01", "DOC-01 auth flow must use a typed toast helper.");
mustContain("right:24px", "Toast must appear at the top-right.");
mustContain("top:24px", "Toast must appear at the top-right.");
mustContain("#10B981", "Success toast must use green.");
mustContain("#EF4444", "Error toast must use red.");
mustContain("#F59E0B", "Warning toast must use orange.");
mustContain("type === \"error\" ? 5000 : type === \"warning\" ? 5000 : 3000", "Toast durations must be success 3s, error/warning 5s.");

console.log("DOC-01 strict frontend contract checks passed.");
