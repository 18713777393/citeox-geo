# 部署说明

本文件用于第 5 阶段发布准备。它描述部署顺序、Cloudflare Pages 绑定、后端部署、数据库部署、回滚和 smoke test。不要把真实密钥写入仓库或 zip。

## 推荐生产架构

```text
用户浏览器
  -> Cloudflare Pages 官网: https://www.example.com
  -> Cloudflare Pages 系统页: https://app.example.com
  -> 后端 API: https://api.example.com
       -> PostgreSQL
       -> AI providers
       -> SMS provider
       -> WeChat Pay / Alipay callbacks
       -> Object storage
```

## 部署前检查

- 已确认 Phase 4 没有 QA 退回阻塞。
- 已准备生产域名：`www`、`app`、`api`。
- 已准备 PostgreSQL 生产库和备份策略。
- 已生成强随机 `JWT_SECRET`、`SESSION_SECRET`。
- 已配置 `CORS_ORIGIN=https://app.example.com`。
- 已确认前端 API base 不再指向 `http://127.0.0.1:8787`。
- 已准备管理员一次性初始账号。
- 已准备支付、短信、AI、对象存储账号，或明确这些能力继续关闭。

## Cloudflare Pages 部署

### 方案 A：官网和系统页同项目

1. 创建 Cloudflare Pages 项目。
2. 上传 `outputs/` 目录内容。
3. 将 `智引GEO-官网宣传页.html` 配置为默认首页，或复制为 `index.html`。
4. 保留 `GEOFlow-Integrated-Final-White.html` 在同目录。
5. 官网按钮会使用相对路径跳转到系统页。
6. 绑定 `www.example.com`。

适合低成本 MVP，但官网与系统页在同域名下。

### 方案 B：官网和系统页拆分

1. 官网项目部署 `智引GEO-官网宣传页.html`，绑定 `www.example.com`。
2. 系统项目部署 `GEOFlow-Integrated-Final-White.html`，绑定 `app.example.com`。
3. 发布前把官网文件中的 `APP_URL` 从 `GEOFlow-Integrated-Final-White.html` 改为系统页完整地址。
4. 系统页 API base 绑定到 `https://api.example.com`。

推荐生产采用此方案，便于权限、日志和缓存隔离。

## 后端部署

可部署到 Render、Railway、Fly.io、容器平台、云服务器或其他 Node.js 平台。

构建命令：

```bash
cd backend
npm ci
npm run prisma:validate
npm run prisma:generate
npm run build
```

启动命令：

```bash
npm run start
```

健康检查：

```bash
GET /api/health
```

平台环境变量必须从 `ENVIRONMENT.md` 配置，至少包含：

- `NODE_ENV=production`
- `PORT`
- `CORS_ORIGIN`
- `DATABASE_URL`
- `JWT_SECRET`
- `SESSION_SECRET`

## 数据库部署

开发可使用：

```bash
docker compose up -d postgres
```

生产建议使用托管 PostgreSQL，开启自动备份和 point-in-time recovery。

首次部署：

```bash
cd backend
npm ci
npm run prisma:generate
npm run prisma:validate
npm run prisma:seed
```

当前项目尚未提供正式迁移目录。如果上线平台要求 migration history，发布前应在受控环境执行：

```bash
npm run prisma:migrate
```

然后把生成的 migration 作为后续版本资产管理。生产库不要直接使用未经审阅的 destructive migration。

## 管理员入口

- URL：`https://app.example.com/GEOFlow-Integrated-Final-White.html?entry=admin&admin=1`
- 后端登录接口：`POST https://api.example.com/api/auth/login`
- 管理员数据接口：`https://api.example.com/api/admin/*`
- 管理员账号由 `ADMIN_EMAIL`、`ADMIN_NAME`、`ADMIN_INITIAL_PASSWORD` seed。

普通用户和企业用户不应看到管理员入口，也不能通过服务端访问管理员接口。

## 支付回调 URL

生产前为支付平台配置：

- 微信支付：`https://api.example.com/api/billing/callbacks/wechat`
- 支付宝：`https://api.example.com/api/billing/callbacks/alipay`

当前回调验签是占位实现，正式收款前必须替换为官方验签并完成沙箱验证。

## 发布 smoke test

上线后最小检查：

1. `GET https://api.example.com/api/health` 返回 200。
2. 官网 `https://www.example.com` 可打开，按钮能跳转系统页。
3. 系统页能请求生产 API，不再访问 `127.0.0.1`。
4. 普通用户注册、登录、`/api/auth/me` 正常。
5. 普通用户请求 `/api/admin/dashboard` 返回 403。
6. 管理员登录后请求 `/api/admin/dashboard` 返回 200。
7. 创建订单成功。
8. 支付回调重复发送只处理一次。
9. 金额不一致或签名失败的回调被拒绝并写审计。
10. 内容审核通过只进入 `APPROVED`，不自动发布。

详细命令见 `VERIFY_COMMANDS.md`。

## 回滚

前端回滚：

- Cloudflare Pages 回滚到上一部署版本。
- 如果只改了域名或跳转配置，优先回滚 Pages 版本，不改数据库。

后端回滚：

- 保留上一个镜像或部署版本。
- 回滚前确认数据库 schema 是否向后兼容。
- 如果本次发布执行过 migration，不要直接删除表或列；先停写、备份，再执行审阅过的修复 migration。

数据库回滚：

- 生产库先备份。
- 对数据变更使用补偿脚本，不直接手工改生产表。
- 支付、订阅、审计类数据禁止物理删除，使用状态修正和审计记录。

## 发布冻结项

以下任一项未完成，不建议公开收费上线：

- 支付官方验签未完成。
- 真实短信服务未完成。
- AI Key 未配置成本限额和调用日志。
- 生产数据库没有自动备份。
- 管理员 403/200 隔离未通过。
- 未配置 HTTPS、CORS、密钥轮换和日志脱敏。

