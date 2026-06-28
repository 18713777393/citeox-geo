# DOC-01 Source Map

## Repository

- GitHub: `https://github.com/18713777393/citeox-geo`
- Default branch: `main`
- Latest inspected commit: `05edf97e9e57e270848f9eb58738cb2cb498dc0e`
- Repository status: public
- Primary language: HTML with TypeScript backend

## Actual Structure

- Root package: `package.json`
- Render config: `render.yaml`
- Backend root: `backend`
- Backend package: `backend/package.json`
- Backend app entry: `backend/src/app.ts`
- Backend server entry: `backend/src/server.ts`
- Prisma schema: `backend/prisma/schema.prisma`
- Prisma migrations: `backend/prisma/migrations`
- Auth routes: `backend/src/routes/auth.ts`
- Auth service: `backend/src/services/auth.ts`
- Auth security helpers: `backend/src/services/authSecurity.ts`
- Auth middleware: `backend/src/middleware/auth.ts`
- Rate limits: `backend/src/middleware/rateLimit.ts`
- Audit service: `backend/src/services/audit.ts`
- Entitlements service: `backend/src/services/entitlements.ts`
- Frontend static app: `frontend/GEOFlow-Integrated-Final-White.html`
- Landing page: `frontend/智引GEO-官网宣传页.html`
- Frontend headers: `frontend/_headers`
- Frontend redirects: `frontend/_redirects`

## Existing DOC-01 Tests

- `backend/tests/doc01AuthPublicRoutes.test.ts`
- `backend/tests/doc01AuthHttpContract.test.ts`
- `backend/tests/doc01FrontendContract.test.ts`
- Backend test script: `cd backend && npm run test:doc01`

## Existing DOC-01 Implementation Already Present

- Public auth routes exist for username check, invite validation, industry validation, send code, register, login, refresh, forgot password, reset password, and email suggestion.
- Protected auth routes exist for logout and current user.
- Backend mounts both `/api/auth` and `/api/v1/auth`.
- User, invite code, auth session, verification code, password reset token, legal consent, subscription, and audit log models exist in Prisma.
- Email and phone hash fields exist.
- Sensitive encryption helpers exist in `backend/src/services/authSecurity.ts`.
- Weak password, disposable email, sensitive word, and industry seed lists exist inside `authSecurity.ts`.
- Existing Render deployment uses Node runtime with `rootDir: backend`.

## Important Implementation Rule

Do not create a parallel `src/server` or `src/client` application. All DOC-01 work must incrementally improve the existing paths above.

## Local Intake Rule

Clone the repository into a safe subdirectory such as:

`C:\Users\路\Desktop\GEO\citeox-geo-src`

Do not clone directly over `C:\Users\路\Desktop\GEO`, because that directory currently contains the requirement documents and an incomplete `.git` folder.
