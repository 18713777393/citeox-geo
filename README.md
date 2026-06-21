# CiteOX / 智引GEO

智引GEO 是一个面向个人和企业的 GEO（Generative Engine Optimization）系统，目标是帮助品牌提升在 AI 搜索、智能问答和推荐答案中的可见度。

## 项目结构

```text
backend/                 Node.js + Express + Prisma 后端
frontend/                官网宣传页与当前系统静态页
docs/                    上线前检查和交付说明
docker-compose.yml       本地 PostgreSQL 测试环境
```

## 后端本地启动

```bash
cd backend
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

## 部署提醒

正式上线需要配置真实：

- PostgreSQL 数据库
- JWT_SECRET / SESSION_SECRET
- 管理员账号
- 短信验证码服务
- AI 模型 API Key
- 微信/支付宝支付
- 文件存储
- 采集源 API
- 域名、HTTPS、备份和监控

不要把 `.env` 或真实密钥提交到 GitHub。

## Render 后端部署设置：请使用 Node，不要使用 Docker

推荐方式：在 Render 的 Web Service 设置里这样填：

```text
Environment: Node
Root Directory: backend
Runtime: Node
Build Command: npm install --include=dev && npm run prisma:generate && npm run build && npx prisma migrate deploy && npm run prisma:seed
Start Command: npm run start:prod
```

如果你的 Render 服务之前已经选成 Docker，最稳方式是新建一个 Web Service：

```text
New + → Web Service → 连接 GitHub 仓库 → Environment 选择 Node
```

然后填写上面的 Root Directory / Build Command / Start Command。

如果你没有设置 Root Directory，也可以使用仓库根目录的 `package.json`，但不推荐：

```text
Build Command: npm install --include=dev && npm run build
Start Command: npm run start
```

注意：不要在根目录部署方式里额外再写 `npx prisma migrate deploy`，因为根目录没有 `prisma/schema.prisma`；迁移已经包含在根目录的 `npm run build` 里面。

必须在 Render Environment Variables 里配置：

```text
NODE_ENV=production
DATABASE_URL=你的 Render PostgreSQL Internal Database URL
REDIS_URL=你的 Render Redis Internal URL
JWT_SECRET=64位以上随机字符串
JWT_REFRESH_SECRET=另一组64位以上随机字符串
ENCRYPTION_KEY=32字节base64字符串
RESEND_API_KEY=你的 Resend API Key
EMAIL_FROM=Citeox <verify@citeox.com>
CORS_ORIGIN=https://citeox.com,https://www.citeox.com
APP_URL=https://citeox.com
ADMIN_EMAIL=你的管理员邮箱
ADMIN_INITIAL_PASSWORD=你的管理员初始密码
ADMIN_NAME=平台管理员
```

生成随机密钥可在本地运行：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
