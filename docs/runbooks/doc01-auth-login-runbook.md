# DOC-01 注册登录上线检查手册

## Render 必填环境变量

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `ENCRYPTION_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CORS_ORIGIN`
- `APP_URL`

## 不要放进代码或压缩包的内容

- 数据库地址和密码
- Redis 地址和密码
- JWT 密钥
- 加密密钥
- 邮件 API Key
- 管理员初始密码

## 成功标志

1. `https://citeox.com/api/health` 返回正常。
2. `https://citeox.com/register` 可以打开注册入口。
3. 邮箱验证码可以收到。
4. 注册成功后浏览器地址进入 `/brand/create`。
5. `https://citeox.com/login` 可以登录。
6. 已有品牌的账号登录后进入 `/dashboard`。
7. 未创建品牌的账号登录后进入 `/brand/create`。
8. 忘记密码邮件可以收到。
9. 打开邮件里的 `/reset-password?token=...` 后，只需要输入新密码和确认密码。
10. 连续输错密码 5 次会锁定 15 分钟。
11. 数据库里看不到明文密码，邮箱和手机号使用加密值加哈希字段保存。

## 排查步骤

- 页面打不开：检查 Cloudflare Pages 是否部署成功，`_redirects` 是否包含 `/login`、`/register`、`/brand/create`、`/dashboard`。
- API 不通：检查 Render 服务是否运行，`APP_URL`、`CORS_ORIGIN` 是否包含 `https://citeox.com` 和 `https://www.citeox.com`。
- 验证码收不到：检查 `RESEND_API_KEY`、`EMAIL_FROM`、发件域名验证和垃圾邮件箱。
- 注册失败：检查 `DATABASE_URL`、数据库迁移、验证码是否过期、手机号是否填写。
- 登录频繁失败：检查账号是否被 Redis 锁定，等待 15 分钟或在后台清理对应 Redis 锁。
- 重置密码失败：检查邮件链接是否过期，确认链接里带有 `token`，并重新发起忘记密码。
- 上线后仍跳旧页面：清理浏览器缓存，重新上传 Cloudflare 包，确认 `_redirects` 已更新。

## 本地验证命令

```powershell
cd C:\Users\路\Desktop\GEO\citeox-geo-doc01-worktree\backend
$env:DATABASE_URL='postgresql://geo:geo@127.0.0.1:5432/geo'
npm.cmd run prisma:validate
npm.cmd run build
npm.cmd run test:doc01
```
