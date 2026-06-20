# CiteOX GEO 模型接入配置说明

本文档用于 Render 后端服务 `citeox-api` 的环境变量配置。所有 API Key 只允许放在 Render Environment，不要写进 GitHub，不要发给他人。

## 套餐模型权限

| 套餐 | AI 监控可用模型 | 内容生成可用模型 | 说明 |
| --- | --- | --- | --- |
| 免费试用 | DeepSeek 1 个 | DeepSeek 1 个 | 用于低成本体验品牌曝光和基础内容草稿 |
| 入门版 | DeepSeek、豆包，最多 2 个 | 1 个 | 适合个人和小团队起步 |
| 专业版 | DeepSeek、豆包、Kimi、通义、智谱、Perplexity，最多 6 个 | 最多 3 个 | 适合多平台回答对比和内容复核 |
| 企业版 | 全部模型 | 全部模型 | 可配置全模型监控、内容生成和复盘 |

## 必填基础变量

```env
AI_GATEWAY_TIMEOUT_MS=45000
```

## 推荐先接入

### DeepSeek

```env
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_MODEL=deepseek-v4-flash
```

### 豆包 / 火山方舟

```env
DOUBAO_API_KEY=你的火山方舟 API Key
DOUBAO_MODEL=你的火山方舟模型 ID 或推理接入点 ID
DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

豆包最容易错的是 `DOUBAO_MODEL`。它不是随便写“doubao”，要填你在火山方舟实际开通的模型 ID 或推理接入点 ID。

## 其他模型

### OpenAI

```env
OPENAI_API_KEY=你的 OpenAI Key
OPENAI_MODEL=gpt-4o-mini
```

### Kimi / Moonshot

```env
KIMI_API_KEY=你的 Moonshot Key
KIMI_MODEL=kimi-k2.5
KIMI_BASE_URL=https://api.moonshot.cn/v1
```

### Gemini

```env
GEMINI_API_KEY=你的 Gemini Key
GEMINI_MODEL=gemini-2.5-flash
```

### Claude

```env
CLAUDE_API_KEY=你的 Anthropic Key
CLAUDE_MODEL=claude-sonnet-4-6
CLAUDE_API_VERSION=2023-06-01
```

### 通义千问 / DashScope

```env
TONGYI_API_KEY=你的 DashScope Key
TONGYI_MODEL=qwen-plus
TONGYI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

### 讯飞星火

```env
XUNFEI_API_KEY=你的讯飞开放平台 Key
XUNFEI_MODEL=generalv3.5
XUNFEI_BASE_URL=https://spark-api-open.xf-yun.com/v1
```

如果讯飞账号使用的不是 OpenAI 兼容接口，请按讯飞控制台给出的兼容接口地址修改 `XUNFEI_BASE_URL`。

### 百度千帆

```env
QIANFAN_API_KEY=你的百度千帆 Key
QIANFAN_MODEL=ernie-4.0-turbo-8k
QIANFAN_BASE_URL=https://qianfan.baidubce.com/v2
```

如果你的千帆控制台给出专属 endpoint，请按控制台地址修改 `QIANFAN_BASE_URL`。

### 智谱

```env
ZHIPU_API_KEY=你的智谱 Key
ZHIPU_MODEL=glm-4-flash
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

### Perplexity

```env
PERPLEXITY_API_KEY=你的 Perplexity Key
PERPLEXITY_MODEL=sonar
PERPLEXITY_BASE_URL=https://api.perplexity.ai
```

## 默认调度策略

- 内容生成：优先豆包、Kimi、Claude、OpenAI、DeepSeek。
- 品牌监控 / 引用分析：优先 Perplexity、Gemini、DeepSeek、OpenAI、豆包。
- 通用分析：优先 DeepSeek、豆包、Kimi、通义、智谱。

服务端会先判断套餐权限，再判断模型是否配置。前端即使显示某模型，后端也会按套餐和额度拦截。

## 部署步骤

1. 在 Render `citeox-api` 服务里打开 `Environment`。
2. 添加需要的 Key 和 Model 环境变量。
3. 保存后执行 `Manual Deploy -> Deploy latest commit`。
4. 登录系统后调用 `/api/ai/providers` 或在系统模型配置页查看模型状态。
5. 用内容工厂生成一篇草稿，确认状态进入“待审核”，且不会自动发布。

