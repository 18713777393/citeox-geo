# DOC-01 Auth Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Citeox registration, login, password reset, and auth security into verifiable alignment with DOC-01 while preserving the existing Express/Prisma backend.

**Architecture:** Keep the current backend auth module and Prisma schema as the base, but add tests and fill missing DOC-01 behavior incrementally. Replace the current single-file auth UI behavior with explicit `/register`, `/login`, `/forgot-password`, and `/reset-password` flows or a router-compatible equivalent that renders distinct states for each route.

**Tech Stack:** Node.js 20, Express, TypeScript, Prisma, PostgreSQL, bcryptjs, JWT, Render, static frontend HTML currently served by `citeox.com`.

## Global Constraints

- Do not rewrite the whole system; preserve existing database/API structure where possible.
- All auth field validation must run on the backend, not only frontend.
- Passwords must use bcrypt cost >= 12.
- Email and phone must be encrypted with AES-256-GCM in storage and deduplicated via hashes.
- JWT access token must be 2h and refresh token 7d, stored in httpOnly + secure + sameSite=strict cookies in production.
- Auth endpoints must use Chinese, specific, actionable errors without leaking technical details.
- Registration/login buttons must disable immediately and show loading state.
- Registration/login, verification code, and password reset must be rate limited.
- `/register`, `/login`, `/forgot-password`, and `/reset-password` must be directly visitable and render the matching flow.
- Completion requires fresh verification against local code and live API where credentials/config permit.

---

## Current Coverage Snapshot

**Live domain checked:** `https://citeox.com/register` and `https://citeox.com/login` return the same single-page HTML with title `智引GEO - GEO 自动优化系统`.

**Backend health checked:** `https://citeox-api.onrender.com/api/health` returns 200 with `{"status":"ok","service":"zhiyin-geo-backend"}`.

**Blocking live issue:** `POST https://citeox-api.onrender.com/api/v1/auth/check-username` currently returns 401 `UNAUTHENTICATED`, but DOC-01 requires this endpoint to be available before login.

**Implemented or partially implemented backend pieces:**
- Auth routes exist in `backend/src/routes/auth.ts`.
- Auth service exists in `backend/src/services/auth.ts`.
- Security helpers exist in `backend/src/services/authSecurity.ts`.
- Prisma models exist for users, invite codes, auth sessions, verification codes, password reset tokens, audit logs, and legal consents.
- Email/phone encryption helpers, hash helpers, username validation, disposable email blocking, email typo suggestion, password weak-list checking, JWT session creation, and audit records are present.

**Major frontend gaps:**
- Current frontend is a single large file: `frontend/GEOFlow-Integrated-Final-White.html`.
- `/register` and `/login` are path-detected states, not clean DOC-01 pages.
- Register form labels still include `名字`; DOC-01 requires `账号名称`.
- Phone is currently presented as optional in initial markup, but DOC-01 requires phone as required.
- Registration draft key is `citeox_auth_register_draft_v1`; DOC-01 requires `citeox_register_draft`.
- Frontend calls `/api/auth/*` compatibility paths, while DOC-01 standard is `/api/v1/auth/*`.
- UI does not yet fully prove 9-field DOC-01 registration behavior, username duplicate suggestions after 3 collisions, industry combobox, invite tooltip, terms/privacy pages, and all specified loading/error states.

## Requirement Matrix

| DOC-01 Area | Status | Evidence | Required Fix |
| --- | --- | --- | --- |
| `/register`, `/login`, `/forgot-password`, `/reset-password` routes | Partial | Live routes return same single-page HTML and state switching | Make direct routes render exact matching auth states and keep browser URL meaningful |
| 9-field registration | Partial | Frontend has name/email/phone/code/password/confirm/industry/invite/legal, but semantics differ | Rename and validate as DOC-01: username, email, required phone, password, confirm, industry, invite, email code, legal consent |
| Username check | Broken live | Live `/api/v1/auth/check-username` returns 401 | Ensure public auth route mounts before any authenticated compatibility middleware in deployed version |
| Email validation and typo correction | Partial | Backend has `emailDomainSuggestion`; frontend has partial logic | Wire DOC-01 yellow correction UI and backend `/email-suggestion` or inline helper |
| Phone required and formatted | Partial | Current UI originally says phone optional; later JS enforces it | Make label/copy/validation consistently required and format `138 1234 5678` |
| Password strength and weak-password block | Partial | Backend weak password list exists; frontend strength bar exists | Add tests for weak-password cases and ensure visual states match DOC-01 |
| Industry combobox | Partial | Backend validates terms; frontend has plain input | Implement accessible combobox with suggestions and keyboard operations |
| Invite code | Partial | Backend validation exists; frontend plain input | Add tooltip, exact error/success copy, and 8-digit validation |
| Email verification code | Partial | Backend stores hashed codes and sends email if configured; frontend has code input | Confirm 6-box UI, resend states, countdown, and no code returned in production |
| Legal agreement | Partial | Legal consent backend exists; frontend checkbox exists | Ensure `/terms` and `/privacy` pages exist and registration sends `legalConsentVersion` |
| Login | Partial | Backend login exists; frontend login exists | Ensure username/email/phone login, clear button, remember-me, 5-error lock, and redirect by `hasBrand` |
| Forgot/reset password | Partial | Backend request/reset exists; frontend reset panel exists | Support `/forgot-password` and `/reset-password?token=xxx` direct routes and token-based reset UX |
| Rate limiting | Partial | express-rate-limit is configured; login failure lock is in-memory | Confirm DOC-01 limits; move login failure lock to Redis-compatible store if production requires multi-instance correctness |
| Audit logs | Partial | Auth audit events are recorded | Add tests or scripts proving register/login/logout/reset audit rows are written |
| Deployment | Partial | Render config exists; live API health is up | Fix deployed auth route behavior and verify CORS/cookies from `https://citeox.com` |

## Task 1: Add Auth Contract Tests

**Files:**
- Create: `backend/tests/authSecurity.test.ts`
- Create: `backend/tests/authRoutes.public.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: exported helpers from `backend/src/services/authSecurity.ts`.
- Produces: repeatable tests proving DOC-01 validation and public endpoint behavior.

- [ ] **Step 1: Add test script entries**

Add scripts:

```json
{
  "test:auth-security": "tsx tests/authSecurity.test.ts",
  "test:auth-public": "tsx tests/authRoutes.public.test.ts"
}
```

- [ ] **Step 2: Write failing security helper tests**

Cover username validation, phone validation, email typo suggestions, disposable email rejection, weak password rejection, and AES encryption format when `ENCRYPTION_KEY` is present.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
cd backend
npm run test:auth-security
```

Expected before fixes: at least one missing or mismatched DOC-01 assertion fails.

- [ ] **Step 4: Implement the minimal helper fixes**

Adjust only `backend/src/services/authSecurity.ts` and env defaults as needed.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
cd backend
npm run test:auth-security
```

Expected: all auth security tests pass.

## Task 2: Fix Public Auth Route Availability

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/src/routes/compat.ts` only if route ordering or path conflicts require it.
- Test: `backend/tests/authRoutes.public.test.ts`

**Interfaces:**
- Consumes: Express `createApp()`.
- Produces: unauthenticated `POST /api/v1/auth/check-username`, `/validate-industry`, `/validate-invite-code`, `/send-verify-code`, `/forgot-password` behavior.

- [ ] **Step 1: Write failing public route test**

Assert unauthenticated `/api/v1/auth/check-username` returns 200/409-style availability payload, not 401.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
cd backend
npm run test:auth-public
```

Expected: test fails if public auth routes are incorrectly protected.

- [ ] **Step 3: Fix route mounting or deployed path mismatch**

Ensure `app.use("/api/v1/auth", authRouter)` is evaluated before any authenticated catch-all route and no deployment artifact is serving older code.

- [ ] **Step 4: Run local and live checks**

Run:

```bash
cd backend
npm run build
curl -X POST https://citeox-api.onrender.com/api/v1/auth/check-username -H "Content-Type: application/json" -d "{\"username\":\"doc01_probe_user\"}"
```

Expected live response: JSON availability result, not `UNAUTHENTICATED`.

## Task 3: Normalize DOC-01 Auth UI Routes

**Files:**
- Modify: `frontend/GEOFlow-Integrated-Final-White.html`
- Create or modify deployment routing config if static hosting supports rewrites.

**Interfaces:**
- Consumes: backend `/api/v1/auth/*`.
- Produces: direct route states for `/register`, `/login`, `/forgot-password`, `/reset-password?token=xxx`.

- [ ] **Step 1: Write a manual route checklist**

Expected:

```text
/register => register mode, title 注册, 9-field form visible.
/login => login mode, account/password form visible.
/forgot-password => forgot-password card visible.
/reset-password?token=abc => reset-password card visible.
```

- [ ] **Step 2: Replace compatibility API paths**

Change auth calls from `/api/auth/*` to `/api/v1/auth/*` unless a deliberate compatibility reason is documented.

- [ ] **Step 3: Fix route-state detection**

Keep existing static-page approach if necessary, but make each path render the correct mode without relying only on query params.

- [ ] **Step 4: Verify direct route rendering**

Run against local static server or deployed staging:

```bash
curl -I https://citeox.com/register
curl -I https://citeox.com/login
curl -I https://citeox.com/forgot-password
curl -I "https://citeox.com/reset-password?token=test"
```

Expected: 200 for all, with browser-rendered matching forms.

## Task 4: Complete Registration Form Behavior

**Files:**
- Modify: `frontend/GEOFlow-Integrated-Final-White.html`

**Interfaces:**
- Consumes: `/api/v1/auth/check-username`, `/api/v1/auth/email-suggestion`, `/api/v1/auth/validate-industry`, `/api/v1/auth/validate-invite-code`, `/api/v1/auth/send-verify-code`, `/api/v1/auth/register`.
- Produces: DOC-01 registration UX and request payload.

- [ ] **Step 1: Fix labels and field semantics**

Use:

```text
账号名称, 邮箱, 手机号, 密码, 确认密码, 行业, 邀请码（选填）, 邮箱验证码, 我已阅读并同意
```

- [ ] **Step 2: Use required phone everywhere**

Remove all "选填" phone copy. Enforce format `/^1[3-9]\d{9}$/`.

- [ ] **Step 3: Change draft storage key**

Use `citeox_register_draft`, save every 3 seconds, restore on load, clear after registration success.

- [ ] **Step 4: Implement username debounce and suggestion states**

After three duplicate username responses, render three clickable suggestion chips.

- [ ] **Step 5: Implement email typo correction**

For domains within Levenshtein distance <= 2, show a yellow correction bar and one-click fix.

- [ ] **Step 6: Implement industry combobox**

Support arrow keys, Enter selection, Esc close, and backend validation warnings.

- [ ] **Step 7: Implement submit state**

On submit: validate in field order, scroll/focus first error, disable button with `注册中...`, timeout after 15 seconds, preserve data on failure.

## Task 5: Complete Login and Password Reset Behavior

**Files:**
- Modify: `frontend/GEOFlow-Integrated-Final-White.html`
- Modify: `backend/src/services/auth.ts` if Redis-backed login locking is required.

**Interfaces:**
- Consumes: `/api/v1/auth/login`, `/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password`, `/api/v1/auth/me`.
- Produces: DOC-01 login and reset flows.

- [ ] **Step 1: Login UI**

Account field supports username/email/phone, clear button appears only with content, password eye toggle works, Enter submits, remember-me is present.

- [ ] **Step 2: Login redirect**

If `user.hasBrand` is true, route to `/dashboard`; otherwise route to `/brand/create`.

- [ ] **Step 3: Password reset direct routes**

`/forgot-password` displays email-only reset request. `/reset-password?token=xxx` displays new password and confirm password fields.

- [ ] **Step 4: Error mapping**

Map invalid credentials, nonexistent account, lockout, disabled account, invalid/expired reset token to exact Chinese actionable messages.

## Task 6: Verification and Deployment Gate

**Files:**
- Modify only files touched by previous tasks.
- Update deployment notes if Render/static hosting settings change.

**Interfaces:**
- Produces: evidence that DOC-01 acceptance criteria pass or blocked items are explicit.

- [ ] **Step 1: Run backend checks**

Run:

```bash
cd backend
npm run prisma:validate
npm run build
npm run test:auth-security
npm run test:auth-public
```

- [ ] **Step 2: Run live API probes**

Run:

```bash
curl https://citeox-api.onrender.com/api/health
curl -X POST https://citeox-api.onrender.com/api/v1/auth/check-username -H "Content-Type: application/json" -d "{\"username\":\"doc01_probe_user\"}"
```

- [ ] **Step 3: Browser verification**

Open desktop and mobile widths for:

```text
https://citeox.com/register
https://citeox.com/login
https://citeox.com/forgot-password
https://citeox.com/reset-password?token=test
```

Capture that fields, loading states, route states, and mobile layout match DOC-01.

- [ ] **Step 4: DOC-01 acceptance checklist**

Mark each original acceptance item pass/fail:

```text
1. 注册流程完整走通
2. 所有校验规则正确触发
3. 邮箱验证码发送/接收/验证正常
4. 智能域名纠错触发正确
5. 密码强度条动画流畅
6. 登录成功根据 has_brand 正确跳转
7. 连续5次错误锁定15分钟
8. 忘记密码到重置密码流程完整
9. 所有错误提示中文、具体、可操作
10. 移动端三档响应式无破损
11. 按钮防重复提交生效
12. API Rate Limiting 生效
13. 手机号/邮箱加密存储
14. 密码 bcrypt 哈希
```

## Recommended Execution Order

1. Fix public auth route and backend tests first, because the current live 401 blocks username checks and registration UX.
2. Normalize route states and API paths next, because `/register` and `/login` must be directly verifiable.
3. Complete registration form behavior.
4. Complete login/reset behavior.
5. Run full verification and deploy only after the route/API evidence is clean.

## Pause Conditions

- Pause before changing production Render environment variables.
- Pause before sending real user emails if `RESEND_API_KEY` and `EMAIL_FROM` are production credentials.
- Pause if database migration changes would drop or rewrite existing user data.
- Pause if DNS/static hosting needs account access outside this workspace.
