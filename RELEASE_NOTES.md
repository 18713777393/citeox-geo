# CiteOX GEO MD商用体验修复版

本包用于 GitHub/Render 源码更新。已排除 node_modules、.env、缓存和真实密钥。

本轮重点：
- 管理员账号自动识别并开启全部功能。
- 登录入口仅显示账号和密码，注册入口显示完整注册字段。
- 注册确认密码增加强度/一致性提示。
- 自动采集和 AI 监控增加进度弹窗。
- 用户可见区域隐藏后端调试、本地模式、英文错误和问号乱码。
- 未接入 AI 平台不展示、不造监控数据。
- 曝光评分展示改为诊断评分和用户可理解结果，不暴露算法细节。
- 退出后回到官网首页。

上线注意：
- 更新 GitHub 后，Render 后端需要重新部署最新 commit。
- Cloudflare Pages 需要上传同名上传包目录里的文件。
- 线上管理员账号由 Render 环境变量 ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD / ADMIN_NAME 控制。
