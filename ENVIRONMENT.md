# 环境变量说明

本项目只提交变量名和 placeholder，不提交真实值。生产值必须放在部署平台的 secret manager、环境变量面板或服务器密钥系统中。

## 基础变量

| 变量 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `NODE_ENV` | 是 | `production` | 生产必须为 `production`。 |
| `PORT` | 是 | `8787` | 后端监听端口，平台可能自动注入。 |
| `CORS_ORIGIN` | 是 | `https://app.example.com` | 允许前端系统页跨域请求 API。 |
| `DATABASE_URL` | 是 | `postgresql://...` | PostgreSQL 连接串。 |

## 鉴权变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 生产必填 | 强随机值，至少 32 字节，不得使用示例值。 |
| `JWT_EXPIRES_IN` | 否 | 默认 `7d`。 |
| `SESSION_SECRET` | 生产建议必填 | 预留 session/cookie 签名。 |
| `BCRYPT_COST` | 否 | 默认 `12`，生产建议 12-14。 |
| `AUTH_CODE_TTL_MINUTES` | 否 | 验证码有效期。 |
| `AUTH_CODE_RESEND_SECONDS` | 否 | 验证码重发间隔。 |
| `PASSWORD_RESET_TTL_MINUTES` | 否 | 找回密码有效期。 |

## 管理员 seed

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_EMAIL` | 首次 seed 必填 | 初始管理员邮箱。 |
| `ADMIN_NAME` | 否 | 管理员显示名。 |
| `ADMIN_INITIAL_PASSWORD` | 首次 seed 必填 | 一次性强密码。seed 后应清空或轮换。 |

`ADMIN_EMAIL` 和 `ADMIN_INITIAL_PASSWORD` 必须同时设置，否则 seed 会失败。

## AI 模型变量

| 变量 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI Key。 |
| `DEEPSEEK_API_KEY` | DeepSeek Key。 |
| `KIMI_API_KEY` | Kimi Key。 |
| `DOUBAO_API_KEY` | 豆包 Key。 |
| `GEMINI_API_KEY` | Gemini Key。 |
| `CLAUDE_API_KEY` | Claude Key。 |
| `TONGYI_API_KEY` | 通义 Key。 |
| `XUNFEI_API_KEY` | 讯飞 Key。 |
| `QIANFAN_API_KEY` | 千帆 Key。 |
| `ZHIPU_API_KEY` | 智谱 Key。 |
| `PERPLEXITY_API_KEY` | Perplexity Key。 |

上线前要求：

- 每个 provider 配置单独限额。
- 服务端记录 `ai_usage_logs`。
- 不在前端、数据库或日志中输出 Key。

## 短信变量

| 变量 | 说明 |
| --- | --- |
| `SMS_PROVIDER` | 服务商名称。 |
| `SMS_ACCESS_KEY` | 服务商 Access Key。 |
| `SMS_SECRET_KEY` | 服务商 Secret。 |
| `SMS_SIGN_NAME` | 短信签名。 |
| `SMS_TEMPLATE_CODE` | 验证码模板。 |

当前验证码发送为占位；生产前必须接入真实发送和失败告警。

## 支付变量

微信支付：

| 变量 | 说明 |
| --- | --- |
| `WECHAT_PAY_APP_ID` | 微信支付 App ID。 |
| `WECHAT_PAY_MCH_ID` | 商户号。 |
| `WECHAT_PAY_API_KEY` | API Key 或 v3 Key。 |
| `WECHAT_PAY_CALLBACK_SECRET` | 当前占位回调用 HMAC secret。 |
| `WECHAT_PAY_CERT_PATH` | 证书路径。 |

支付宝：

| 变量 | 说明 |
| --- | --- |
| `ALIPAY_APP_ID` | 支付宝应用 ID。 |
| `ALIPAY_PRIVATE_KEY` | 应用私钥。 |
| `ALIPAY_PUBLIC_KEY` | 支付宝公钥。 |
| `ALIPAY_CALLBACK_SECRET` | 当前占位回调用 HMAC secret。 |

手工或测试支付：

| 变量 | 说明 |
| --- | --- |
| `MANUAL_PAY_CALLBACK_SECRET` | 手工回调 HMAC secret。 |

生产前必须把占位验签替换为官方验签，不得用 `phase4-placeholder` 收真实款。

## 对象存储变量

| 变量 | 说明 |
| --- | --- |
| `STORAGE_PROVIDER` | S3、R2、OSS、COS 等。 |
| `STORAGE_BUCKET` | Bucket 名称。 |
| `STORAGE_ACCESS_KEY` | Access Key。 |
| `STORAGE_SECRET_KEY` | Secret Key。 |

上线前应配置上传大小、类型白名单、私有读写权限、病毒/脚本扫描和 CDN 域名。

## 前端配置

当前静态 HTML 内置：

- 官网 `APP_URL = "GEOFlow-Integrated-Final-White.html"`。
- 系统页 API base：`http://127.0.0.1:8787`。

生产前需要按部署方案更新：

- 同域部署：官网保持相对路径即可。
- 分域部署：官网 `APP_URL` 改为 `https://app.example.com/GEOFlow-Integrated-Final-White.html`。
- 系统页 API base 改为 `https://api.example.com`。

如果后续要避免改 HTML，建议增加 `config.js` 或 `<meta name="api-base">` 运行时配置。

## 禁止项

- 禁止把 `.env`、真实 Key、证书、私钥、商户密钥打入 zip。
- 禁止在 issue 评论、日志、README 中粘贴真实 secret。
- 禁止在前端暴露 AI、支付、短信、对象存储 Key。

