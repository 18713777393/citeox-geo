# 智引GEO 最终上线前检查报告

检查日期：2026-06-17

## 一、当前结论

已从 Multica 同步并合并最新 QA 通过的采集源中心安全修复包：`sourcehub-mvs1-security-fix-delivery.zip`。

附件 ID：`019ed2a0-7bc0-7a2d-93f2-b67d9ec017ab`

附件 SHA256：`80C5A13F998FB520E6504B21FF8593B64D65FB63838370CAF72085B21B0C801E`

当前工作区已经具备：官网宣传页、系统前端、后端 API、登录注册、套餐权益、AI 网关、内容生成待审核、支付回调占位、管理员后台、安全文档、部署文档，以及 Source Hub MVS-1 后端能力。

重要说明：Source Hub 当前合并的是 MVS-1，可用重点是手动导入、采集源配置、DB 队列、采集结果、accept/reject、批量转 Question、QuestionSource 来源追踪、安全配置脱敏和审计日志。sitemap/rss/website/search/social 真实抓取仍保持占位或后续 MVS-2，不建议现在对外宣传“全平台自动采集已完成”。

## 二、已验证通过

1. `npm install`：通过，0 个 npm 漏洞。
2. `npm run prisma:validate`：通过。
3. `npm run prisma:generate`：通过。
4. `npm run build`：通过。
5. `npm run test:source-hub`：通过，Source Hub config policy regression tests passed。
6. 官网宣传页保持不变，仍是不展示管理员、付费、套餐、价格的获客页。

## 三、已合并的 Source Hub 能力

### 数据库

已新增：

- `CollectionSource`
- `CollectionJob`
- `CollectionItem`
- `CollectionSourceHealth`
- `QuestionSource`

同时包含：

- Source Hub 枚举
- 组织隔离字段 `organizationId`
- 项目追踪字段 `projectId`
- 内容 hash 去重
- 同一个 source 同时只允许一个 RUNNING job 的迁移约束
- QuestionSource 来源追踪

### 后端接口

已注册：

```text
/api/source-hub
```

已包含：

```text
GET/POST/PATCH/DELETE /api/source-hub/sources
POST /api/source-hub/sources/:id/pause
POST /api/source-hub/sources/:id/resume
GET/POST /api/source-hub/jobs
GET /api/source-hub/jobs/:id
POST /api/source-hub/jobs/:id/retry
POST /api/source-hub/jobs/:id/cancel
GET /api/source-hub/items
POST /api/source-hub/items/:id/accept
POST /api/source-hub/items/:id/reject
POST /api/source-hub/items/bulk-convert-to-questions
POST /api/source-hub/manual-import
GET /api/source-hub/health
```

### 已真实可用

- `manual_import`
- source CRUD
- DB-backed job queue
- CollectionItem 入库
- accept/reject
- bulk convert to Question + QuestionSource
- Source config 安全策略
- secretRef 不回包
- 审计日志
- 权益校验基础

### 仍是占位或后续项

- sitemap 真实采集
- RSS 真实采集
- website_public 真实网页采集
- Bing / Brave / Tavily / SerpAPI 真实搜索 API 调用
- 知乎 / 小红书 / 抖音 / B站 / 微信公众号等社交平台真实采集
- live API smoke，因为当前本机没有可达 PostgreSQL、真实迁移环境和登录 token

## 四、系统已具备的模块

### 前台与官网

- 官网宣传页
- 注册体验入口
- 登录入口
- 系统工作台入口
- 移动端响应式基础

### 用户与权限

- 注册
- 登录
- 找回密码占位
- 手机验证码占位
- JWT + session 后端结构
- 管理员和普通用户服务端隔离
- 用户与组织数据隔离基础

### 套餐与权益

- 免费试用版
- 入门版
- 专业版
- 企业套餐
- 服务端权益判断基础
- AI 调用额度、Token 额度、功能解锁额度设计
- Source connector 权益维度

### GEO 核心闭环

- 品牌项目
- AI 问题库基础
- AI 回答监控基础
- 曝光评分
- 差距诊断
- 内容策略
- 素材库导入
- 内容工厂
- 审核队列
- 分发中心
- 技术文件 sitemap / llms.txt / Schema / urls.txt
- 效果复盘
- 自动优化任务
- 报告中心

### 后台管理

- 后台首页
- 用户与企业管理
- 订单财务中心
- 内容审核中心
- 权限角色矩阵
- 系统配置中心
- 审计日志
- 安全体检

## 五、上线前仍需要你接入或提供

1. 真实 PostgreSQL 数据库，并执行 Prisma migrate / seed。
2. 后端部署平台或服务器。
3. 真实域名和后端 API 域名。
4. 真实短信验证码服务。
5. 微信支付、支付宝支付商户配置和回调地址。
6. AI 平台 API Key，只放后端环境变量。
7. 搜索 API Key，如果后续启用 Bing / Brave / Tavily / SerpAPI。
8. 对象存储，用于素材上传。
9. 正式用户协议、隐私政策、付费协议、内容合规规则。
10. Source Hub live smoke 所需的数据库和测试账号。

## 六、上线建议

可以先上线：

- 官网宣传页
- 注册体验入口
- 系统前端演示
- 后端基础服务
- Source Hub 手动导入闭环

暂不建议宣传：

- 全平台自动采集
- 全网爬虫
- 自动抓取知乎/小红书/抖音/公众号
- sitemap/rss/website/search 已完全自动化

这些需要 MVS-2 继续补真实 fetch、安全策略和合规适配。

## 七、重点风险

1. 正式收费前，支付回调必须用真实服务端验签。
2. 套餐权益必须只由服务端判断。
3. AI Key、搜索 Key、短信 Key 不能放前端。
4. Source Hub 真实网页采集前必须补 DNS 解析、跳转链复检、MIME、大小、超时、robots、频率限制。
5. 必须做真实数据库环境下的 live smoke。
6. 必须备份数据库和配置日志监控。

## 八、DOC-01 注册登录复核

- Prisma schema 校验：通过。
- TypeScript 构建：通过。
- DOC-01 认证路由测试：通过。
- DOC-01 HTTP 合同测试：通过。
- DOC-01 前端合同测试：通过。
- 前端脚本语法检查：通过，已检查 7 段脚本。
- 注册入口：已对齐 `/register`。
- 登录入口：已对齐 `/login`。
- 忘记密码入口：已对齐 `/forgot-password`。
- 重置密码入口：已支持 `/reset-password?token=...`。
- 注册成功路径：浏览器地址进入 `/brand/create`，内部打开品牌项目页。
- 登录成功路径：`hasBrand=true` 进入 `/dashboard`，否则进入 `/brand/create`。
- 生产环境 Redis：`REDIS_URL` 已列为必填，用于登录失败锁定。
- 生产环境敏感变量：必须在 Render 控制台配置，不写入代码、不放进上传包。

