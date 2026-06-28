# 安全检查说明

本文件列出第 5 阶段上线前必须确认的安全项。当前包已包含基础鉴权、管理员隔离、请求校验、限流、审计和密钥占位，但外部服务仍需生产接入。

## 当前安全能力

- `helmet()` 默认安全响应头。
- `cors()` 使用 `CORS_ORIGIN` 限定前端来源。
- `express.json({ limit: "1mb" })` 限制 JSON body 大小。
- `express-rate-limit` 基础接口限流，登录、验证码、密码重置有单独限流。
- bcrypt 密码 hash。
- JWT session 存库，可退出并撤销 session。
- `/api/admin/*` 统一 `requireAdmin`，普通用户服务端 403。
- zod 校验关键请求体和 query。
- 支付、管理员、内容审核、登录等路径写审计日志。
- `.env.example` 只包含 placeholder，没有真实 Key。

## 上线前阻断项

任一项未完成时，不建议公开生产上线：

- `JWT_SECRET` 或 `SESSION_SECRET` 仍使用示例值。
- `CORS_ORIGIN` 仍允许本地地址或通配。
- 前端系统页仍请求 `http://127.0.0.1:8787`。
- 支付仍使用 `phase4-placeholder` 或占位 HMAC 验签处理真实资金。
- 短信验证码未接真实发送、频控和风控。
- AI Key 未设置成本限额、日志脱敏和异常降级。
- 文件上传未设置类型白名单、大小限制、私有存储和扫描。
- 生产数据库没有自动备份和最小权限账号。
- 管理员账号未启用强密码和最小人数管理。
- 用户协议、隐私政策、付费协议、内容合规文本不是正式版本。

## 权限检查

必须验证：

- 未登录访问业务接口返回 401。
- 普通用户访问 `/api/admin/dashboard` 返回 403。
- 企业用户访问 `/api/admin/users` 返回 403。
- 管理员访问 `/api/admin/dashboard` 返回 200。
- 用户只能访问自己组织的数据。
- 套餐权益不足时返回 `ENTITLEMENT_REQUIRED`。

## 支付安全

当前实现只适合 QA：

- 有 secret 时按占位 HMAC 验签。
- 无 secret 时 `phase4-placeholder` 可走占位路径。
- callback id 支持幂等。
- 金额不一致、订单不存在、签名失败会拒绝并审计。

生产必须补齐：

- 微信支付 API v3 官方验签。
- 支付宝 RSA2 官方验签。
- 回调证书、公钥、时间戳和 nonce 校验。
- 订单金额、币种、商户号、应用 ID、订单状态机校验。
- 退款、关闭订单、补单对账。
- 回调日志脱敏和告警。

## 输入与 Web 风险

重点测试：

- XSS：品牌名、项目描述、内容标题、审核备注、系统配置、发票抬头。
- CSRF：若后续改为 cookie session，所有写接口需要 CSRF 防护。
- SSRF：外部 URL 抓取、官网资料导入、素材解析必须限制内网地址。
- SQL 注入：继续通过 Prisma 参数化访问，不拼接 SQL。
- 文件上传：限制扩展名、MIME、大小、压缩包层级和脚本内容。
- 路径穿越：所有文件名服务端重命名，不信任用户路径。

## 密钥与日志

- 不打印 secret、token、密码、私钥、证书。
- 日志中的邮箱、手机号、订单号按需脱敏。
- 支付 callback 原文可以落库但必须限制访问权限并脱敏展示。
- 生产环境关闭 demo code 返回。
- 管理员初始密码只用于 seed，一次性使用后轮换。

## 依赖与供应链

上线前运行：

```powershell
cd backend
npm.cmd audit --omit=dev
npm.cmd run build
npm.cmd run prisma:validate
```

如有高危依赖：

- 优先升级到兼容版本。
- 无法升级时记录影响路径、缓解措施和计划日期。
- 不引入未知来源脚本到静态 HTML。

## 安全 smoke test

```powershell
$base="https://api.example.com"

# 未登录应为 401
Invoke-WebRequest "$base/api/auth/me"

# 普通用户 token 应为 403
Invoke-WebRequest "$base/api/admin/dashboard" -Headers @{ Authorization = "Bearer <user-token>" }

# 管理员 token 应为 200
Invoke-RestMethod "$base/api/admin/dashboard" -Headers @{ Authorization = "Bearer <admin-token>" }
```

支付回调安全测试见 `VERIFY_COMMANDS.md`。

## DOC-01 注册登录安全补充

生产环境必须配置 `REDIS_URL`。登录失败 5 次后的 15 分钟锁定需要写入 Redis，不能只依赖单台服务器内存，否则服务重启或多实例部署时锁定会失效。
