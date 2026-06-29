# DOC-03 账户与套餐上线检查说明

这份说明给非程序员使用。不要把 `.env`、数据库密码、支付私钥、AI Key 发到聊天里。

## 你需要准备的真实配置

在 Render 后端服务的环境变量里配置：

- `PAYMENT_CALLBACK_BASE=https://citeox.com` 或你的后端正式域名
- 支付宝：`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`
- 微信支付：`WECHAT_APP_ID`、`WECHAT_MCH_ID`、`WECHAT_API_KEY`
- 回调密钥：`PAYMENT_CALLBACK_SECRET`，或分别配置 `ALIPAY_CALLBACK_SECRET`、`WECHAT_PAY_CALLBACK_SECRET`

## 成功标志

- 用户点击充值或升级套餐后，不会出现占位付款。
- 商户参数没配置时，页面提示“支付商户参数未配置”。
- 支付平台回调验签通过后，充值订单变为 `paid`，余额增加一条充值流水。
- 套餐订单回调验签通过后，用户套餐变为已支付套餐。
- 重复回调不会重复加余额，也不会重复开通套餐。

## 常见排查

- 提示支付商户参数未配置：检查 Render 环境变量是否填完整，保存后重新部署。
- 支付成功但余额没增加：检查支付平台回调地址是否指向 `/api/v1/payment/callback/recharge/alipay` 或 `/api/v1/payment/callback/recharge/wechat_pay`。
- 套餐没升级：检查回调地址是否指向 `/api/v1/payment/callback/subscription/alipay` 或 `/api/v1/payment/callback/subscription/wechat_pay`。
- 回调失败：检查签名密钥、订单号、金额是否一致。
- 页面没有刷新新余额：先刷新页面，再查看“账单记录”和“API 额度”。
