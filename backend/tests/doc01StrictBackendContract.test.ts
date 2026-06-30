import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as authSecurity from "../src/services/authSecurity.js";

const authSecuritySource = readFileSync(resolve(process.cwd(), "src/services/authSecurity.ts"), "utf8");
const authSource = readFileSync(resolve(process.cwd(), "src/services/auth.ts"), "utf8");
const routeSource = readFileSync(resolve(process.cwd(), "src/routes/auth.ts"), "utf8");
const rateLimitSource = readFileSync(resolve(process.cwd(), "src/middleware/rateLimit.ts"), "utf8");
const envSource = readFileSync(resolve(process.cwd(), "src/config/env.ts"), "utf8");

assert.ok(
  "authSecurityPolicyStats" in authSecurity,
  "DOC-01 authSecurity must expose policy stats so deployment checks can verify dictionary sizes."
);

const { emailDomainSuggestion, validateIndustry } = authSecurity;
const authSecurityPolicyStats = authSecurity.authSecurityPolicyStats as {
  commonEmailDomains: number;
  disposableDomains: number;
  sensitiveWords: number;
  weakPasswords: number;
  industryTerms: number;
};

assert.equal(emailDomainSuggestion("demo@gmial.com"), "demo@gmail.com", "Email correction must fix @gmial.com.");
assert.equal(emailDomainSuggestion("demo@qq.con"), "demo@qq.com", "Email correction must fix @qq.con.");
assert.equal(emailDomainSuggestion("demo@163.cm"), "demo@163.com", "Email correction must fix @163.cm.");
assert.equal(emailDomainSuggestion("demo@hotmai.com"), "demo@hotmail.com", "Email correction must fix @hotmai.com.");
assert.equal(emailDomainSuggestion("demo@outloo.com"), "demo@outlook.com", "Email correction must fix @outloo.com.");

assert.ok(authSecurityPolicyStats.commonEmailDomains >= 25, "DOC-01 common email whitelist must include domestic, international, and enterprise domains.");
assert.ok(authSecurityPolicyStats.disposableDomains >= 200, "DOC-01 temporary email blacklist must include at least 200 domains.");
assert.ok(authSecurityPolicyStats.sensitiveWords >= 200, "DOC-01 sensitive username dictionary must include at least 200 terms.");
assert.ok(authSecurityPolicyStats.weakPasswords >= 500, "DOC-01 weak password dictionary must include at least 500 entries.");
assert.ok(authSecurityPolicyStats.industryTerms >= 500, "DOC-01 industry dictionary must include at least 500 terms.");

for (const domain of ["mail.com", "yandex.com", "aol.com", "gmail.com", "qq.com", "feishu.cn"]) {
  assert.match(authSecuritySource, new RegExp(`"${domain.replace(".", "\\.")}"`), `Common email whitelist must include ${domain}.`);
}

const industryResult = validateIndustry("医疗健康");
assert.equal(industryResult.valid, true, "Known industry must validate successfully.");
assert.equal(validateIndustry("aaaa").valid, false, "Meaningless short Latin industry text must be rejected.");

assert.doesNotMatch(rateLimitSource, /璇|鐧|娉|楠|鎵|銆|棰|绻/, "Rate-limit responses must be readable Chinese, not mojibake.");
assert.match(rateLimitSource, /注册请求过于频繁，请稍后再试。/, "Register rate-limit message must be actionable Chinese.");
assert.match(rateLimitSource, /登录尝试过于频繁，请稍后再试。/, "Login rate-limit message must be actionable Chinese.");
assert.match(rateLimitSource, /验证码发送过于频繁，请稍后再试。/, "Verification-code rate-limit message must be actionable Chinese.");

assert.match(routeSource, /maxAge:\s*2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, "Access token cookie must expire in 2 hours.");
assert.match(routeSource, /maxAge:\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, "Refresh token cookie must expire in 7 days.");
assert.match(routeSource, /httpOnly:\s*true/, "JWT cookies must be httpOnly.");
assert.match(routeSource, /sameSite:\s*"strict"/, "JWT cookies must use sameSite=strict.");
assert.match(routeSource, /secure,/, "JWT cookies must set secure in production.");

assert.match(authSource, /bcrypt\.hash\(input\.password,\s*env\.BCRYPT_COST\)/, "Register password must be bcrypt hashed with configured cost.");
assert.match(envSource, /BCRYPT_COST:[\s\S]*default\(12\)/, "Default bcrypt cost must be 12.");
assert.match(authSource, /encryptSensitive\(email\)/, "Email must be encrypted before storage.");
assert.match(authSource, /encryptSensitive\(phone\)/, "Phone must be encrypted before storage.");
assert.match(authSource, /emailHash/, "Email hash must be stored for lookup.");
assert.match(authSource, /phoneHash/, "Phone hash must be stored for lookup.");
assert.match(authSource, /apiBalance:\s*0/, "New users must start with API balance 0.");
assert.match(authSource, /ensureDefaultSubscription/, "Register must create default free subscription.");

assert.match(envSource, /EMAIL_FROM:[\s\S]*default\("Citeox <noreply@citeox\.com>"\)/, "Resend sender must default to Citeox <noreply@citeox.com>.");
assert.match(authSource, /\[Citeox\] 邮箱验证码：/, "Verification email subject must match DOC-01.");
assert.match(authSource, /验证码5分钟内有效，请勿泄露/, "Verification email body must include the DOC-01 security warning.");
assert.match(authSource, /如非本人操作，请忽略此邮件/, "Email templates must include the non-owner safety note.");
assert.match(authSource, /重置链接已发送/, "Forgot-password flow must use a unified success message to prevent email enumeration.");

console.log("DOC-01 strict backend contract checks passed.");
