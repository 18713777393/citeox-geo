# 运维说明

本文件面向上线后的日常运维、监控、备份、告警和故障处理。

## 运行组件

- Cloudflare Pages 官网。
- Cloudflare Pages 系统页。
- Node.js 后端 API。
- PostgreSQL。
- 支付平台回调。
- 短信服务。
- AI 模型服务。
- 对象存储。

## 健康检查

后端：

```http
GET /api/health
```

建议平台健康检查：

- 间隔：30 秒。
- 超时：5 秒。
- 连续失败 3 次告警。

前端：

- 官网首页 200。
- 系统页 200。
- 系统页能访问 API 域名。

## 监控指标

后端：

- 5xx 数量和比例。
- P95/P99 响应时间。
- 登录失败次数。
- 验证码发送失败和限流次数。
- 支付回调成功、失败、重复、金额不一致数量。
- AI 调用次数、token、成本、失败率。
- 管理员操作审计量。

数据库：

- 连接数。
- 慢查询。
- 存储使用量。
- 备份成功率。
- replication/PITR 状态。

业务：

- 注册数、活跃用户、企业用户数。
- 试用转化、付费订单、退款。
- 内容生成任务、审核队列长度。
- GEO 项目数、问题数、监控结果数。

## 日志

建议保留：

- API access log。
- error log。
- payment callback log。
- audit log。
- background job log。

禁止输出：

- 密码、验证码明文、JWT、支付密钥、AI Key、对象存储 Key、私钥。

## 备份

PostgreSQL：

- 每日自动全量备份。
- 开启 point-in-time recovery。
- 至少保留 7-30 天，按用户合规要求调整。
- 每月至少演练一次恢复。

对象存储：

- 开启版本或生命周期策略。
- 重要素材建议跨区域备份。

配置：

- 环境变量由平台 secret manager 管理。
- 密钥轮换后记录时间和影响范围，不记录密钥值。

## 常见故障处理

### 官网正常，系统页无法登录

1. 检查系统页 API base 是否仍指向 `127.0.0.1`。
2. 检查后端 `/api/health`。
3. 检查 `CORS_ORIGIN` 是否等于系统页域名。
4. 检查浏览器 Network 中登录接口状态。

### 普通用户看到管理员模块

1. 立即确认前端入口是否误带 `entry=admin&admin=1`。
2. 验证普通用户请求 `/api/admin/dashboard` 是否 403。
3. 如服务端返回 200，立即回滚后端并排查 RBAC。
4. 检查审计日志中的管理员接口访问。

### 支付回调失败

1. 检查支付平台回调 URL。
2. 检查回调签名、证书、公钥、商户号、订单号、金额。
3. 检查 `payment_callbacks` 中状态和错误。
4. 重放同一个 callback id，确认幂等不会重复开通。
5. 对账后用补偿脚本修正订单和订阅，保留审计记录。

### AI 调用成本异常

1. 暂停相关 provider。
2. 检查 `ai_usage_logs`。
3. 检查套餐权益和额度扣减。
4. 降低 provider 限额或切换备用模型。
5. 排查是否有恶意请求或循环任务。

### 数据库连接异常

1. 检查数据库健康、连接数、网络和凭据。
2. 检查后端平台是否加载最新 `DATABASE_URL`。
3. 检查迁移是否完成。
4. 必要时扩容连接池或启用 pooling。

## 发布流程

1. 备份生产数据库。
2. 部署后端 staging。
3. 执行 `VERIFY_COMMANDS.md` staging smoke test。
4. 部署前端 Pages preview。
5. 验证官网跳转、登录、管理员 403/200、订单、回调、审核。
6. 发布生产。
7. 观察 30-60 分钟错误率和业务指标。

## 回滚值班清单

- 上一个 Cloudflare Pages 部署版本。
- 上一个后端镜像或 release。
- 最近数据库备份时间。
- 支付平台回调配置截图或导出。
- 当前生产环境变量 key 列表。
- 管理员账号和紧急禁用流程。

## 扩展建议

- 增加运行时 `config.js`，避免每次换 API 域名都改 HTML。
- 增加 CI：lint、typecheck、Prisma validate、secret scan、package zip check。
- 增加正式 migration 目录和 migration review 流程。
- 增加后台任务队列处理 AI 调用、内容生成、文件解析和分发。
- 增加对象存储直传、扫描和素材解析 worker。
- 增加支付对账任务、退款流程和发票 model。
- 增加 OpenTelemetry、集中日志和错误追踪。
- 增加管理员 MFA 和更细粒度 RBAC。

