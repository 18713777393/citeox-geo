# 智引 GEO Phase 5 发布交付说明

本包基于 `AI-6-phase4-handoff.zip` 做第 5 阶段收口，只补充部署、环境、测试、安全和运维文档，不重写系统，不改变现有 GEO 闭环逻辑，不新增业务阶段。

## 当前系统能力

- 官网静态页：`outputs/智引GEO-官网宣传页.html`，用于获客、注册、登录和免费试用入口。
- 集成系统页：`outputs/GEOFlow-Integrated-Final-White.html`，保留原 GEO 闭环体验，并已小范围接入后端 API。
- 后端服务：`backend/`，Express + Prisma + PostgreSQL，覆盖登录注册、JWT session、套餐权益、AI/GEO 占位网关、订单订阅、支付回调占位验签、管理员接口、内容审核和审计日志。
- 数据库：`backend/prisma/schema.prisma` 覆盖用户、组织、项目、GEO 闭环、套餐、订单、支付回调、AI 调用、审计、协议同意等生产化基础表。
- 本地数据库：`docker-compose.yml` 提供 PostgreSQL 16 开发实例。

## 生产化范围

已经具备生产化骨架和可复验流程：

- 真实账号注册、登录、密码 hash、验证码占位、JWT session 和退出。
- 用户角色与管理员服务端隔离，`/api/admin/*` 统一由 `requireAdmin` 保护。
- 套餐、订阅、订单、支付回调、发票申请占位和审计记录。
- AI/GEO 业务接口骨架、权益校验、额度与用量记录。
- 管理员后台数据接口、内容审核、系统配置占位、审计查询。
- Cloudflare Pages 前端部署、后端部署、PostgreSQL 部署、安全检查和运维说明文档。

仍属于上线前占位或待接入：

- 微信支付、支付宝、短信、AI 模型、对象存储仍使用环境变量占位，未写入真实 Key。
- 支付验签为 Phase 4/5 占位 HMAC 路径，生产前必须按微信/支付宝官方协议替换。
- 内容生成、平台分发、官网技术文件发布仍需接入真实外部服务和审核策略。
- 前端 API base 默认仍是 `http://127.0.0.1:8787`，正式发布前需要绑定生产 API 域名。

## 目录

```text
outputs/
  GEOFlow-Integrated-Final-White.html
  智引GEO-官网宣传页.html
backend/
  .env.example
  package.json
  package-lock.json
  prisma/
  src/
  README.md
docker-compose.yml
DEPLOYMENT.md
ENVIRONMENT.md
OPERATIONS.md
SECURITY.md
VERIFY_COMMANDS.md
HANDOFF_MANIFEST.md
HTML_HASHES.md
```

## 快速本地验证

```powershell
cd backend
npm.cmd install --no-audit --fund=false
$env:DATABASE_URL="postgresql://geo:geo@127.0.0.1:5432/geo?schema=public"
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run build
```

如果本机有 Docker：

```powershell
docker compose up -d postgres
cd backend
Copy-Item .env.example .env
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
npm.cmd run dev
```

健康检查：`GET http://127.0.0.1:8787/api/health`。

## 管理员入口

- 官网面向普通用户和企业用户，不展示管理员入口。
- 集成系统管理员入口通过查询参数进入：`GEOFlow-Integrated-Final-White.html?entry=admin&admin=1`。
- 生产管理员账号通过 `ADMIN_EMAIL`、`ADMIN_NAME`、`ADMIN_INITIAL_PASSWORD` 设置后执行 `npm run prisma:seed` 创建。
- 管理员登录后访问后台模块，服务端接口必须以 Bearer token 调用 `/api/admin/*`。
- 普通用户即使直接请求 `/api/admin/*` 也应返回 403。

## 官网绑定建议

- Cloudflare Pages 项目一：官网，默认首页使用 `outputs/智引GEO-官网宣传页.html`。
- Cloudflare Pages 项目二或同项目路由：系统页，部署 `outputs/GEOFlow-Integrated-Final-White.html`。
- 建议域名：
  - 官网：`https://www.example.com`
  - 系统：`https://app.example.com`
  - 后端 API：`https://api.example.com`
  - 管理员入口：`https://app.example.com/GEOFlow-Integrated-Final-White.html?entry=admin&admin=1`
- 官网按钮当前跳转相对路径 `GEOFlow-Integrated-Final-White.html`；如果官网和系统拆成不同域名，需要在发布前把 `APP_URL` 改为系统页完整 URL。
- 集成系统页当前 API base 为 `http://127.0.0.1:8787`；生产前需要改为 API 域名或注入运行时配置。

## 用户仍需提供

- 域名与 DNS 管理权限：官网域名、系统域名、API 域名。
- Cloudflare Pages 账号或等价静态托管平台账号。
- 后端部署账号：Render、Fly.io、Railway、Vercel Functions、云服务器或容器平台。
- PostgreSQL 数据库：生产连接串、备份策略、只读账号。
- AI 模型 Key：OpenAI、DeepSeek、Kimi、豆包、Gemini、Claude、通义、讯飞、千帆、智谱或实际选型。
- 短信服务商账号、签名、模板、Access Key。
- 微信支付商户号、App ID、API v3 Key、证书、回调域名。
- 支付宝应用 ID、应用私钥、支付宝公钥、回调域名。
- 对象存储 Bucket、Access Key、Secret Key、访问域名。
- 企业主体、备案、用户协议、隐私政策、付费协议、内容合规文本、发票资料。

## 发布顺序

1. 准备生产环境变量，确认无真实密钥进入代码仓库。
2. 部署 PostgreSQL，执行迁移和 seed。
3. 部署后端 API，验证 `/api/health`、登录、管理员 403/200、订单和回调占位路径。
4. 绑定 Cloudflare Pages 官网和系统页。
5. 配置 CORS、支付回调 URL、短信回调或发送配置、对象存储跨域。
6. 跑 `VERIFY_COMMANDS.md` 中的 smoke checks。
7. 通过后再对外开放注册和试用入口。

## 关键文档

- `DEPLOYMENT.md`：部署步骤和回滚。
- `ENVIRONMENT.md`：环境变量清单。
- `SECURITY.md`：安全检查和上线前阻断项。
- `OPERATIONS.md`：运维、备份、监控和故障处理。
- `backend/README.md`：后端启动、迁移、接口和测试说明。
- `VERIFY_COMMANDS.md`：本地与生产 smoke test 命令。

