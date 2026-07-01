# Citeox 商业上线真实接入清单

更新时间：2026-07-01

这份清单用于区分“本地开发可跑”和“正式商业上线可收费”。不要把真实密钥写进本文档，也不要提交 `.env` 文件。真实值只放到 Render Dashboard 的环境变量里。

## 已加入的系统提醒

后端已增加管理员接口：

`GET /api/v1/system/commercial-readiness`

这个接口只返回每项真实服务是否已配置，不返回任何密钥值。它会提醒管理员哪些服务还没接入。

本地验证命令：

```powershell
cd C:\Users\路\Desktop\GEO\citeox-geo-doc01-worktree\backend
npm.cmd run test:commercial
```

成功标志：

```text
Commercial readiness contract checks passed.
```

排查步骤：

1. 如果命令不存在，先确认当前目录是 `backend`。
2. 如果提示依赖缺失，运行 `npm.cmd install` 后重试。
3. 如果上线环境接口提示 missing，去 Render 环境变量里补对应 Key，不要把 Key 发到聊天窗口。

## 需要你真实接入的服务

### 1. 邮件验证码和找回密码

需要接入：

- Resend 账号
- 已验证发件域名
- `RESEND_API_KEY`
- `EMAIL_FROM`

为什么需要你：

注册验证码、找回密码邮件、欢迎邮件都必须走真实邮件服务。本地 demo code 只能用于开发，不能当正式商用邮件。

### 2. Render Redis

需要接入：

- Render Redis 7
- `REDIS_URL`

为什么需要你：

验证码频率限制、登录锁定、BullMQ 诊断任务队列、WebSocket 进度推送都需要真实 Redis。

### 3. 支付宝和微信支付

需要接入：

- 支付宝商户号和应用
- 微信支付商户号
- 正式支付回调域名
- `PAYMENT_CALLBACK_BASE`
- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY`
- `WECHAT_APP_ID`
- `WECHAT_MCH_ID`
- `WECHAT_API_KEY`

为什么需要你：

充值、套餐升级、支付回调验签、到账、订单流水都必须使用真实商户参数。

### 4. 真实 AI 平台 API

DOC-02 / DOC-03 已按 10 个平台对齐。建议先接入 1 到 4 个核心平台，跑通真实诊断后再扩展。

首批建议：

- DeepSeek：`DEEPSEEK_API_KEY`
- 豆包：`DOUBAO_API_KEY`
- 通义千问：`TONGYI_API_KEY`
- 腾讯元宝：`YUANBAO_API_KEY`

后续可接入：

- Kimi：`KIMI_API_KEY`
- 文心一言 / 千帆：`QIANFAN_API_KEY`
- 智谱清言：`ZHIPU_API_KEY`
- 秘塔 / 搜索型平台替代：`PERPLEXITY_API_KEY`
- 讯飞星火：`XUNFEI_API_KEY`
- 360 智脑：`AI360_API_KEY`

如果某个平台控制台给了专属 Base URL 或模型名，可额外设置：

- `<平台>_BASE_URL`
- `<平台>_MODEL`

例如：

- `AI360_BASE_URL`
- `AI360_MODEL`

为什么需要你：

没有真实 Key 时，系统会生成明确标记为 `safe_placeholder` 的占位诊断；只有接入真实 AI Key 后，品牌诊断、AI 回答监控、差距诊断和策略生成才算真实数据。

### 5. 生产安全密钥

必须配置：

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `ENCRYPTION_KEY`
- `DATABASE_URL`
- `CORS_ORIGIN`
- `APP_URL`

为什么需要你：

这些决定登录安全、手机号/邮箱加密、Cookie 域名、跨域访问和数据库连接。

## 当前判断

当前系统已经具备 DOC-01 / DOC-02 / DOC-03 的主要开发基础、测试门禁和真实接入提醒。正式商业上线前，仍必须完成真实邮件、真实支付、真实 AI、Render Redis 和生产安全密钥接入，并用商业就绪接口复核。
