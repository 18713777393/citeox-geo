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
