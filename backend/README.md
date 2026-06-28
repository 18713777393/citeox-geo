# 智引 GEO 后端说明

`backend/` 是智引 GEO 的生产化后端骨架，基于 Express、Prisma 和 PostgreSQL。当前代码来自第 1-4 阶段实现，第 5 阶段只补齐部署和运维文档，没有改动业务逻辑。

## 技术栈

- Node.js 20+ 建议版本。
- Express 4 API 服务。
- Prisma 5 ORM。
- PostgreSQL 16。
- JWT session 鉴权。
- bcryptjs 密码 hash。
- helmet、cors、express-rate-limit 基础安全中间件。
- zod 请求校验。

## 可用脚本

```bash
npm run dev              # 本地开发，tsx watch src/server.ts
npm run build            # TypeScript 编译到 dist/
npm run start            # 运行 dist/server.js
npm run prisma:validate  # 校验 prisma/schema.prisma
npm run prisma:generate  # 生成 Prisma Client
npm run prisma:migrate   # 本地开发迁移
npm run prisma:seed      # 初始化套餐和可选管理员账号
```

## 本地启动

```powershell
docker compose up -d postgres
cd backend
npm.cmd install --no-audit --fund=false
Copy-Item .env.example .env
$env:DATABASE_URL="postgresql://geo:geo@127.0.0.1:5432/geo?schema=public"
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
npm.cmd run dev
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

## 生产启动

生产环境建议使用平台提供的 secret manager 配置环境变量，不要提交 `.env`。

```bash
npm ci --omit=dev
npm run prisma:generate
npm run build
npm run start
```

部署时必须在 release 阶段先执行：

```bash
npm ci
npm run prisma:validate
npm run prisma:generate
npm run build
npm run prisma:seed
```

数据库迁移策略见 `../DEPLOYMENT.md`。

## 数据库范围

Prisma schema 覆盖：

- 账号与组织：`users`、`organizations`、`auth_sessions`、`verification_codes`、`password_reset_tokens`、`invite_records`。
- GEO 闭环：`projects`、`questions`、`monitor_results`、`geo_scores`、`gaps`、`strategies`。
- 素材内容：`assets`、`contents`、`distributions`、`technical_files`。
- 套餐支付：`plans`、`subscriptions`、`orders`、`payment_callbacks`。
- AI 与治理：`model_providers`、`ai_usage_logs`、`audit_logs`、`legal_consents`。

## 接口范围

- `GET /api/health`：服务健康检查。
- `/api/auth/*`：验证码占位、注册、登录、退出、当前用户、密码重置。
- `/api/billing/*`：套餐、权益、订阅、订单、支付回调、发票占位。
- `/api/projects/*`、`/api/questions/*`、`/api/monitor/*`、`/api/scores/*`、`/api/gaps/*`、`/api/strategies/*`、`/api/contents/*`、`/api/reports/*`、`/api/assets/*`：GEO 闭环 API 骨架和部分占位实现。
- `/api/ai/*`：AI provider 和调度占位。
- `/api/admin/*`：管理员后台接口，全部由 `requireAdmin` 保护。

## 管理员初始化

生产前设置：

```env
ADMIN_EMAIL=admin@example.com
ADMIN_NAME=平台管理员
ADMIN_INITIAL_PASSWORD=replace-with-strong-one-time-password
```

执行：

```bash
npm run prisma:seed
```

seed 会创建或更新 `SUPER_ADMIN`，并初始化套餐数据。首次登录后应立即更换密码，并清空平台 secret manager 中的一次性初始密码。

管理员登录：

```http
POST /api/auth/login
Content-Type: application/json

{"account":"admin@example.com","password":"<initial-password>"}
```

拿到 token 后调用：

```http
Authorization: Bearer <token>
GET /api/admin/dashboard
```

普通用户访问 `/api/admin/*` 预期返回 403。

## 支付与外部服务状态

- 微信/支付宝回调当前是 Phase 4 占位验签：有 secret 时使用 HMAC-SHA256 canonical payload；无 secret 时 QA 可用 `phase4-placeholder`。
- 生产前必须替换为微信支付和支付宝官方验签流程。
- 短信发送、AI 调度、对象存储均为环境变量占位，真实账号和 Key 只放部署平台环境变量。
- 模型 provider 配置不应保存真实 Key 到数据库。

## 最小验证

```powershell
cd backend
npm.cmd install --no-audit --fund=false
$env:DATABASE_URL="postgresql://geo:geo@127.0.0.1:5432/geo?schema=public"
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run build
```

带数据库 smoke test 见 `../VERIFY_COMMANDS.md`。

## 上线前阻断项

- 未配置强随机 `JWT_SECRET`。
- `CORS_ORIGIN` 仍是本地地址。
- 前端 API base 仍是 `http://127.0.0.1:8787`。
- 支付、短信、AI、对象存储仍未接真实账号。
- 未执行数据库迁移、seed、备份恢复演练。
- 未完成管理员 403/200、支付回调幂等、金额不一致拒绝、内容审核不发布等 smoke test。

