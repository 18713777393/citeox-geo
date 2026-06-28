# DOC-01 Auth Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing `18713777393/citeox-geo` source code into full DOC-01 commercial-grade registration and login compliance without rewriting the landing page or creating a parallel application.

**Architecture:** The existing repository already has `backend/` Express + Prisma code, static frontend HTML under `frontend/`, DOC-01 auth routes, auth service, auth security helpers, Prisma auth models, Render deployment config, and DOC-01 tests. Implementation must audit and improve those existing files in place. The backend remains the source of truth for validation, encryption, sessions, rate limits, audit logs, and redirect data; the frontend keeps the current static integrated page and only changes auth behavior needed to match DOC-01.

**Tech Stack:** Node.js 20, Express, TypeScript, Prisma, PostgreSQL 16, Redis 7 where required by DOC-01, bcryptjs, jsonwebtoken, Zod, Helmet, express-rate-limit, static HTML frontend, Render Node Web Service.

## Global Constraints

- Deployment platform: Render.com Web Service.
- Repository: `https://github.com/18713777393/citeox-geo`.
- Render root directory: `backend`.
- Build command from `render.yaml`: `npm install --include=dev && npm run prisma:generate && npm run build && npx prisma migrate deploy && npm run prisma:seed`.
- Start command from `render.yaml`: `npm run start:prod`.
- Existing landing page must not be redesigned or rewritten.
- Auth API must support `/api/v1/auth/*`; legacy `/api/auth/*` may stay for compatibility.
- DOC-01 routes: `/register`, `/login`, `/forgot-password`, `/reset-password`.
- Registration success target: `/brand/create`.
- Login success target: `/dashboard` when `hasBrand=true`, otherwise `/brand/create`.
- Password storage: bcrypt cost at least 12.
- Email and phone storage: encrypted values plus hash fields for lookup.
- JWT cookies: access token 2 hours, refresh token 7 days, `httpOnly`, `secure` in production, `sameSite=strict`.
- Sensitive auth rate limits: register 5/min/IP, login 10/min/IP plus 5 failed attempts lock for 15 minutes, verification code 1/60s/email, forgot password 3/30min/email.
- User-facing errors must be Chinese, specific, actionable, and must not expose technical internals.
- Secrets must stay in Render environment variables and must never be committed.
- Current local Git binary path: `C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe`. Use this full path until Git is added to PATH.

---

## File Structure

Use the existing source map in `docs/superpowers/plans/2026-06-27-auth-login-source-map.md`.

Actual repository paths to work in after cloning:

- `backend/package.json`
- `backend/src/app.ts`
- `backend/src/config/env.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/middleware/error.ts`
- `backend/src/middleware/rateLimit.ts`
- `backend/src/routes/auth.ts`
- `backend/src/services/auth.ts`
- `backend/src/services/authSecurity.ts`
- `backend/src/services/audit.ts`
- `backend/src/services/entitlements.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260621090000_doc01_auth_commercial_fields/migration.sql`
- `backend/tests/doc01AuthPublicRoutes.test.ts`
- `backend/tests/doc01AuthHttpContract.test.ts`
- `backend/tests/doc01FrontendContract.test.ts`
- `frontend/GEOFlow-Integrated-Final-White.html`
- `frontend/智引GEO-官网宣传页.html`
- `render.yaml`

Do not create `src/server`, `src/client`, or a new Vite React app unless the existing static frontend is intentionally replaced in a later, separately approved plan.

---

### Task 1: Clone Existing Source Safely

**Files:**
- Create local checkout directory: `C:\Users\路\Desktop\GEO\citeox-geo-src`
- Modify: none
- Test: local git status

**Interfaces:**
- Consumes: GitHub repository `18713777393/citeox-geo`.
- Produces: a local checkout that can be tested and modified without overwriting the current requirements folder.

- [ ] **Step 1: Confirm Git binary works**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' --version
```

Expected: prints `git version 2.54.0.windows.1` or newer.

- [ ] **Step 2: Clone into a safe subdirectory**

Run from `C:\Users\路\Desktop\GEO`:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' clone https://github.com/18713777393/citeox-geo.git citeox-geo-src
```

Expected: new folder `C:\Users\路\Desktop\GEO\citeox-geo-src` contains `backend`, `frontend`, `render.yaml`, and `package.json`.

If `citeox-geo-src` already exists, run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C citeox-geo-src status --short
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C citeox-geo-src remote -v
```

Expected: no unexpected local changes before pulling or editing.

- [ ] **Step 3: Copy planning docs into the source checkout**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'C:\Users\路\Desktop\GEO\citeox-geo-src\docs\superpowers\specs' | Out-Null
New-Item -ItemType Directory -Force -Path 'C:\Users\路\Desktop\GEO\citeox-geo-src\docs\superpowers\plans' | Out-Null
Copy-Item -LiteralPath 'C:\Users\路\Desktop\GEO\docs\superpowers\specs\2026-06-27-auth-login-design.md' -Destination 'C:\Users\路\Desktop\GEO\citeox-geo-src\docs\superpowers\specs\2026-06-27-auth-login-design.md' -Force
Copy-Item -LiteralPath 'C:\Users\路\Desktop\GEO\docs\superpowers\plans\2026-06-27-auth-login-source-map.md' -Destination 'C:\Users\路\Desktop\GEO\citeox-geo-src\docs\superpowers\plans\2026-06-27-auth-login-source-map.md' -Force
Copy-Item -LiteralPath 'C:\Users\路\Desktop\GEO\docs\superpowers\plans\2026-06-27-auth-login-implementation.md' -Destination 'C:\Users\路\Desktop\GEO\citeox-geo-src\docs\superpowers\plans\2026-06-27-auth-login-implementation.md' -Force
```

Expected: source repo contains the new DOC-01 spec and plan files.

- [ ] **Step 4: Commit planning docs**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C citeox-geo-src add docs/superpowers/specs/2026-06-27-auth-login-design.md docs/superpowers/plans/2026-06-27-auth-login-source-map.md docs/superpowers/plans/2026-06-27-auth-login-implementation.md
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C citeox-geo-src commit -m "docs: add DOC-01 auth implementation plan"
```

Expected: commit succeeds. If Git asks for identity, run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C citeox-geo-src config user.name "Citeox"
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C citeox-geo-src config user.email "dev@citeox.com"
```

Then rerun the commit.

---

### Task 2: Run Baseline Build And Existing DOC-01 Tests

**Files:**
- Modify: none
- Test:
  - `backend/package.json`
  - `backend/tests/doc01AuthPublicRoutes.test.ts`
  - `backend/tests/doc01AuthHttpContract.test.ts`
  - `backend/tests/doc01FrontendContract.test.ts`

**Interfaces:**
- Consumes existing code and tests.
- Produces a baseline pass/fail report before changes.

- [ ] **Step 1: Install backend dependencies**

Run:

```powershell
Set-Location 'C:\Users\路\Desktop\GEO\citeox-geo-src\backend'
npm install
```

Expected: dependencies install without critical errors.

- [ ] **Step 2: Validate Prisma schema**

Run:

```powershell
npm run prisma:validate
```

Expected: Prisma schema validates.

- [ ] **Step 3: Build backend**

Run:

```powershell
npm run build
```

Expected: TypeScript build passes.

- [ ] **Step 4: Run existing DOC-01 test suite**

Run:

```powershell
npm run test:doc01
```

Expected: current route, HTTP, and frontend contract tests pass. If any fail, record the exact failing message in `docs/superpowers/plans/2026-06-27-auth-login-baseline.md`.

- [ ] **Step 5: Create baseline report**

Create `docs/superpowers/plans/2026-06-27-auth-login-baseline.md`:

```markdown
# DOC-01 Baseline Report

## Commands

- npm install
- npm run prisma:validate
- npm run build
- npm run test:doc01

## Result

- Prisma validation:
- TypeScript build:
- DOC-01 tests:

## Blocking Failures

- None recorded when all commands pass.

## Notes

- Existing implementation already contains auth routes, auth service, auth security helpers, Prisma auth models, and frontend DOC-01 contract tests.
```

Fill the result lines with `pass` or the exact failing command and message.

- [ ] **Step 6: Commit baseline report**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' add docs/superpowers/plans/2026-06-27-auth-login-baseline.md
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' commit -m "test: record DOC-01 auth baseline"
```

---

### Task 3: Align DOC-01 Rate Limits And Verification TTL

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/middleware/rateLimit.ts`
- Modify: `backend/tests/doc01AuthHttpContract.test.ts`

**Interfaces:**
- Consumes existing `express-rate-limit` middleware and auth service cooldown logic.
- Produces DOC-01-aligned defaults:
  - Register: 5/min/IP.
  - Login: 10/min/IP.
  - Verification code TTL: 5 minutes.
  - Verification resend: 60 seconds.
  - Forgot password: 3/30min/IP plus service-level account protection.

- [ ] **Step 1: Add contract assertions for rate-limit constants**

Modify `backend/tests/doc01AuthHttpContract.test.ts` to include source-level checks:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rateLimitSource = readFileSync(resolve(process.cwd(), "src/middleware/rateLimit.ts"), "utf8");
const envSource = readFileSync(resolve(process.cwd(), "src/config/env.ts"), "utf8");

assert.ok(rateLimitSource.includes("export const registerRateLimit"));
assert.ok(rateLimitSource.includes("limit: 5"), "DOC-01 register limit must be 5/min/IP.");
assert.ok(rateLimitSource.includes("export const loginRateLimit"));
assert.ok(rateLimitSource.includes("limit: 10"), "DOC-01 login limit must be 10/min/IP.");
assert.ok(rateLimitSource.includes("export const passwordResetRateLimit"));
assert.ok(rateLimitSource.includes("limit: 3"), "DOC-01 forgot-password limit must be 3 per 30 minutes.");
assert.ok(envSource.includes("AUTH_CODE_TTL_MINUTES"));
assert.ok(envSource.includes("default(5)"), "DOC-01 email code TTL must default to 5 minutes.");
```

- [ ] **Step 2: Run DOC-01 test to verify failure if values are not aligned**

Run:

```powershell
Set-Location 'C:\Users\路\Desktop\GEO\citeox-geo-src\backend'
npm run test:doc01
```

Expected before edits: FAIL if current defaults are still register 8/min, login 30/15min, password reset 8/30min, or code TTL 10 minutes.

- [ ] **Step 3: Update env defaults**

Modify `backend/src/config/env.ts`:

```ts
AUTH_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(5),
AUTH_CODE_RESEND_SECONDS: z.coerce.number().int().positive().default(60),
PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
```

- [ ] **Step 4: Update rate limits**

Modify `backend/src/middleware/rateLimit.ts`:

```ts
export const registerRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("RATE_LIMIT", "注册请求过于频繁，请稍后再试。")
});

export const loginRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("LOGIN_RATE_LIMITED", "登录尝试过于频繁，请稍后再试。")
});

export const passwordResetRateLimit = rateLimit({
  windowMs: 30 * 60_000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage("PASSWORD_RESET_RATE_LIMITED", "找回密码操作过于频繁，请稍后再试。")
});
```

Keep `verificationCodeRateLimit` as a broad IP-level guard only if service-level resend cooldown already enforces 60 seconds per email. Add this comment above it:

```ts
// Per-email 60 second resend protection is enforced in createVerificationCode via verification_codes.last_sent_at.
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm run build
npm run test:doc01
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' add backend/src/config/env.ts backend/src/middleware/rateLimit.ts backend/tests/doc01AuthHttpContract.test.ts
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' commit -m "fix: align DOC-01 auth rate limits"
```

---

### Task 4: Move Login Failure Locking To Durable Store

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/config/env.ts`
- Create: `backend/src/lib/redis.ts`
- Modify: `backend/src/services/auth.ts`
- Test: `backend/tests/doc01AuthHttpContract.test.ts`

**Interfaces:**
- Consumes existing `loginFailures` Map behavior in `backend/src/services/auth.ts`.
- Produces a durable login lock that uses Redis when `REDIS_URL` is configured and falls back to in-memory storage only for local development.

- [ ] **Step 1: Add test that rejects Map-only production locking**

Modify `backend/tests/doc01AuthHttpContract.test.ts`:

```ts
const authServiceSource = readFileSync(resolve(process.cwd(), "src/services/auth.ts"), "utf8");
assert.ok(
  authServiceSource.includes("loginFailureStore"),
  "DOC-01 login failure lock must use loginFailureStore instead of a route-local Map only."
);
assert.ok(
  authServiceSource.includes("REDIS_URL"),
  "DOC-01 login failure lock must use Redis when REDIS_URL is configured."
);
```

- [ ] **Step 2: Add Redis dependency**

Run:

```powershell
Set-Location 'C:\Users\路\Desktop\GEO\citeox-geo-src\backend'
npm install ioredis
```

Expected: `backend/package.json` and `backend/package-lock.json` include `ioredis`.

- [ ] **Step 3: Create Redis helper**

Create `backend/src/lib/redis.ts`:

```ts
import Redis from "ioredis";
import { env } from "../config/env.js";

let client: Redis | null = null;

export function getRedis() {
  if (!env.REDIS_URL) {
    return null;
  }
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true
    });
  }
  return client;
}
```

- [ ] **Step 4: Replace Map-only login failure tracking**

In `backend/src/services/auth.ts`, replace direct use of:

```ts
const loginFailures = new Map<string, { count: number; lockedUntil?: number; updatedAt: number }>();
```

with a small `loginFailureStore` that:

- Uses Redis keys `auth:login_fail:{hash}` and `auth:login_lock:{hash}` when Redis exists.
- Keeps the existing Map fallback when Redis is not configured.
- Locks after 5 failed attempts for 15 minutes.
- Clears failure counters on successful login.

The exported behavior of `assertLoginAllowed`, `registerLoginFailure`, and `clearLoginFailures` must remain the same for callers.

- [ ] **Step 5: Run tests**

Run:

```powershell
npm run build
npm run test:doc01
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' add backend/package.json backend/package-lock.json backend/src/config/env.ts backend/src/lib/redis.ts backend/src/services/auth.ts backend/tests/doc01AuthHttpContract.test.ts
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' commit -m "fix: persist login failure locks with Redis"
```

---

### Task 5: Verify And Harden Sensitive Data Storage

**Files:**
- Modify: `backend/src/services/authSecurity.ts`
- Modify: `backend/tests/doc01AuthHttpContract.test.ts`
- Modify if needed: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes existing `encryptSensitive`, `decryptSensitive`, `hashEmail`, `hashPhone`, `publicEmail`, `publicPhone`.
- Produces tests proving plaintext email and phone are not stored when `ENCRYPTION_KEY` is configured.

- [ ] **Step 1: Add auth security contract checks**

Modify `backend/tests/doc01AuthHttpContract.test.ts`:

```ts
const authSecuritySource = readFileSync(resolve(process.cwd(), "src/services/authSecurity.ts"), "utf8");
assert.ok(authSecuritySource.includes("createCipheriv(\"aes-256-gcm\""), "DOC-01 requires AES-256-GCM encryption.");
assert.ok(authSecuritySource.includes("createDecipheriv(\"aes-256-gcm\""), "DOC-01 requires AES-256-GCM decryption.");
assert.ok(authSecuritySource.includes("hashEmail"), "DOC-01 requires email hash lookup.");
assert.ok(authSecuritySource.includes("hashPhone"), "DOC-01 requires phone hash lookup.");
assert.ok(authSecuritySource.includes("publicEmail"), "DOC-01 API responses must return masked email.");
assert.ok(authSecuritySource.includes("publicPhone"), "DOC-01 API responses must return masked phone.");
```

- [ ] **Step 2: Confirm production does not allow missing encryption key**

Verify `backend/src/config/env.ts` contains:

```ts
if (env.NODE_ENV === "production" && !env.ENCRYPTION_KEY) {
  console.error("ENCRYPTION_KEY is required in production.");
  process.exit(1);
}
```

If missing, add it.

- [ ] **Step 3: Remove accidental plaintext fallback from production paths**

Keep the current development fallback only if `NODE_ENV !== "production"`. Ensure `encryptSensitive` cannot return plaintext in production when `ENCRYPTION_KEY` is absent because app startup exits first.

- [ ] **Step 4: Run tests**

Run:

```powershell
npm run build
npm run test:doc01
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' add backend/src/config/env.ts backend/src/services/authSecurity.ts backend/tests/doc01AuthHttpContract.test.ts backend/prisma/schema.prisma
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' commit -m "test: enforce DOC-01 sensitive data storage"
```

If `backend/prisma/schema.prisma` was not changed, omit it from `git add`.

---

### Task 6: Align Password Reset Link Experience

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/services/auth.ts`
- Modify: `frontend/GEOFlow-Integrated-Final-White.html`
- Modify: `backend/tests/doc01FrontendContract.test.ts`
- Modify: `backend/tests/doc01AuthHttpContract.test.ts`

**Interfaces:**
- Consumes existing `/forgot-password`, `/reset-password`, `requestPasswordReset`, and static frontend reset form.
- Produces DOC-01-compatible `/reset-password?token=xxx` user experience while preserving existing account+code fallback.

- [ ] **Step 1: Add frontend contract assertion**

Modify `backend/tests/doc01FrontendContract.test.ts`:

```ts
assert.ok(
  html.includes("/reset-password?token=") || html.includes("resetToken"),
  "DOC-01 reset password flow must support token-based reset links."
);
```

- [ ] **Step 2: Add backend contract assertion**

Modify `backend/tests/doc01AuthHttpContract.test.ts`:

```ts
const authRouteSource = readFileSync(resolve(process.cwd(), "src/routes/auth.ts"), "utf8");
assert.ok(
  authRouteSource.includes("resetToken") || authRouteSource.includes("token"),
  "DOC-01 reset-password API must accept a reset token from the email link."
);
```

- [ ] **Step 3: Preserve existing reset modes**

Keep support for:

- account + code.
- account + resetToken.

Add support for:

- resetToken alone when the token maps to a user through `password_reset_tokens`.

When token alone is valid, backend must not require the user to retype the account.

- [ ] **Step 4: Update frontend reset page behavior**

In `frontend/GEOFlow-Integrated-Final-White.html`, ensure reset mode reads:

- `token` query parameter.
- `resetToken` query parameter.

If a token is present, the form should ask only for new password and confirm password. If no token is present, keep the current account + code fallback.

- [ ] **Step 5: Run tests**

Run:

```powershell
Set-Location 'C:\Users\路\Desktop\GEO\citeox-geo-src\backend'
npm run build
npm run test:doc01
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' add backend/src/routes/auth.ts backend/src/services/auth.ts backend/tests/doc01AuthHttpContract.test.ts backend/tests/doc01FrontendContract.test.ts frontend/GEOFlow-Integrated-Final-White.html
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' commit -m "fix: support DOC-01 reset token links"
```

---

### Task 7: Frontend Auth Journey QA

**Files:**
- Modify: `frontend/GEOFlow-Integrated-Final-White.html`
- Modify if needed: `frontend/_redirects`
- Modify if needed: `frontend/_headers`
- Modify: `backend/tests/doc01FrontendContract.test.ts`

**Interfaces:**
- Consumes static frontend contract and existing integrated auth DOM.
- Produces a user-facing registration and login flow that satisfies DOC-01 without changing the landing page marketing content.

- [ ] **Step 1: Extend frontend contract for final user-facing routes**

Modify `backend/tests/doc01FrontendContract.test.ts`:

```ts
assert.ok(html.includes("/brand/create"), "DOC-01 register success must route to /brand/create.");
assert.ok(html.includes("/dashboard"), "DOC-01 login with an existing brand must route to /dashboard.");
assert.ok(html.includes("验证码已发送"), "DOC-01 verification send success must be visible in Chinese.");
assert.ok(html.includes("注册中") || html.includes("提交中"), "DOC-01 submit buttons must show loading copy.");
```

- [ ] **Step 2: Confirm auth buttons do not silently fail**

In `frontend/GEOFlow-Integrated-Final-White.html`, ensure:

- Register submit disables the button immediately.
- Login submit disables the button immediately.
- Send verification code button shows countdown.
- Network/CORS failures render inline guidance near the form.
- All form errors are visible for more than a transient toast.

- [ ] **Step 3: Confirm route redirects**

Ensure frontend success logic uses backend `user.hasBrand`:

```js
if (user && user.hasBrand) {
  location.href = "/dashboard";
} else {
  location.href = "/brand/create";
}
```

Registration success must always route to `/brand/create`.

- [ ] **Step 4: Run tests**

Run:

```powershell
Set-Location 'C:\Users\路\Desktop\GEO\citeox-geo-src\backend'
npm run test:doc01
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' add frontend/GEOFlow-Integrated-Final-White.html frontend/_redirects frontend/_headers backend/tests/doc01FrontendContract.test.ts
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' commit -m "fix: harden DOC-01 frontend auth flow"
```

If `_redirects` or `_headers` were not changed, omit them from `git add`.

---

### Task 8: Production Environment And Render Runbook

**Files:**
- Modify: `ENVIRONMENT.md`
- Modify: `DEPLOYMENT.md`
- Modify: `SECURITY.md`
- Modify: `render.yaml` only if missing required env var keys
- Create: `docs/runbooks/doc01-auth-login-runbook.md`

**Interfaces:**
- Produces a non-secret checklist for the user to configure Render safely.

- [ ] **Step 1: Create DOC-01 runbook**

Create `docs/runbooks/doc01-auth-login-runbook.md`:

```markdown
# DOC-01 注册登录上线检查

## Render 必填环境变量

- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- JWT_REFRESH_SECRET
- ENCRYPTION_KEY
- RESEND_API_KEY
- EMAIL_FROM
- CORS_ORIGIN
- APP_URL

## 不要放进代码的内容

- 数据库地址
- Redis 地址
- JWT 密钥
- 加密密钥
- 邮件 API Key
- 管理员初始密码

## 成功标志

1. https://citeox.com/api/health 返回正常。
2. https://citeox.com/register 可以注册。
3. 邮箱验证码可以收到。
4. 注册后进入 /brand/create。
5. https://citeox.com/login 可以登录。
6. 忘记密码邮件可以收到。
7. 重置密码后可以用新密码登录。
8. 数据库里看不到明文密码、邮箱、手机号。
9. 连续输错密码 5 次会锁定。
10. 手机端注册登录页面不变形。

## 排查步骤

- 页面打不开：检查 Render 服务是否运行、域名是否指向正确服务。
- 验证码收不到：检查 RESEND_API_KEY、EMAIL_FROM、发件域名验证、垃圾邮件箱。
- 注册失败：检查 DATABASE_URL、迁移是否执行、验证码是否过期。
- 登录失败：检查账号是否存在、是否锁定、Cookie 是否被浏览器拦截。
- 跨域失败：检查 CORS_ORIGIN 是否包含 https://citeox.com 和 https://www.citeox.com。
```

- [ ] **Step 2: Ensure docs mention Redis is required for production auth locks**

In `ENVIRONMENT.md` and `SECURITY.md`, add or confirm:

```text
生产环境必须配置 REDIS_URL，用于认证限流、验证码冷却和登录失败锁定。
```

- [ ] **Step 3: Run docs-independent checks**

Run:

```powershell
Set-Location 'C:\Users\路\Desktop\GEO\citeox-geo-src\backend'
npm run build
npm run test:doc01
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' add ENVIRONMENT.md DEPLOYMENT.md SECURITY.md render.yaml docs/runbooks/doc01-auth-login-runbook.md
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' commit -m "docs: add DOC-01 auth runbook"
```

If `render.yaml` was not changed, omit it from `git add`.

---

### Task 9: Final DOC-01 Verification

**Files:**
- Modify: `docs/智引GEO-最终上线前检查报告.md`
- Test: full backend build and DOC-01 suite

**Interfaces:**
- Produces final completion report for the user.

- [ ] **Step 1: Run final local checks**

Run:

```powershell
Set-Location 'C:\Users\路\Desktop\GEO\citeox-geo-src\backend'
npm run prisma:validate
npm run build
npm run test:doc01
```

Expected: all PASS.

- [ ] **Step 2: Review changed files**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' status --short
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' log --oneline -5
```

Expected: no uncommitted changes except the final report.

- [ ] **Step 3: Update final report**

Append to `docs/智引GEO-最终上线前检查报告.md`:

```markdown
## DOC-01 注册登录复核

- Prisma 校验：通过
- TypeScript 构建：通过
- DOC-01 认证路由测试：通过
- DOC-01 HTTP 合同测试：通过
- DOC-01 前端合同测试：通过
- 注册入口：已对齐 /register
- 登录入口：已对齐 /login
- 注册成功跳转：/brand/create
- 登录成功跳转：hasBrand=true 到 /dashboard，否则 /brand/create
- 生产环境敏感变量：必须在 Render 设置，不写入代码
```

- [ ] **Step 4: Commit final report**

Run:

```powershell
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' add docs/智引GEO-最终上线前检查报告.md
& 'C:\Users\路\AppData\Local\Programs\Git\cmd\git.exe' -C 'C:\Users\路\Desktop\GEO\citeox-geo-src' commit -m "docs: record DOC-01 auth verification"
```

---

## Self-Review

Spec coverage:

- Registration and login routes are covered by existing `backend/src/routes/auth.ts` plus Tasks 3, 6, and 7.
- Backend validation, password hashing, encrypted contact storage, auth cookies, and audit logs are covered by existing `backend/src/services/auth.ts`, `backend/src/services/authSecurity.ts`, and Tasks 4-6.
- Existing Prisma models cover users, verification codes, password reset tokens, auth sessions, legal consent, subscriptions, invite codes, and audit logs.
- Existing tests are reused rather than replaced.
- Landing page redesign is explicitly excluded.
- The plan preserves the existing source tree and does not create a duplicate app.

Known gaps to verify during execution:

- Current workspace has planning docs only; source must be cloned into `citeox-geo-src`.
- Git is installed but not on PATH; use the full Git path until PATH is fixed.
- Existing code uses an in-memory login failure map; Task 4 moves production locking to Redis.
- Existing defaults observed remotely differ from DOC-01 in some rate limits and verification TTL; Task 3 aligns them.
- Existing reset flow supports reset token plus account/code patterns; Task 6 ensures DOC-01 `/reset-password?token=xxx` is user-friendly.

No placeholder tasks remain. Every task has exact files, commands, expected results, and commit instructions.
