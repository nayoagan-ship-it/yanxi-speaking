# 使用、运行与部署

需要 Node.js 22.13 或更新版本和 npm。完整解压源码后运行：

```sh
npm ci
npm start
```

打开 <http://127.0.0.1:4317/>。停止服务按 Ctrl+C。页面、录音回听、历史、收藏和本地分析可以直接使用。

## 配置自己的 DeepSeek

把 `.env.example` 复制为 `.env`，在 `.env` 中填写自己的 DEEPSEEK_API_KEY，保留 DEEPSEEK_MODEL=deepseek-flash，再重启服务。真实密钥不要提交到 Git。作者的在线站点使用托管秘密变量，未随仓库分享。

复盘页点击“获取 AI 点评”后，录音（若可用）、选段、转写和录音统计会发给 DeepSeek。浏览器把录音转换为单声道 16 kHz WAV，按最长 120 秒分段，支持最多 5 分钟；手工修正过的转写采用文字点评。AI 提供文字、条理和练习建议，不提供专业音素、声调或口音准确度分数。无语音、请求失败或模型不可用时，保留原有本地复盘。

## 构建、测试与部署

```sh
npm test
npm run build
```

`public/` 是前端源码，`server/` 是评价接口与本地服务，`worker/` 是生产入口。构建把页面资源与接口合并到 `dist/server/index.js`，可部署到支持 Cloudflare Worker ES module 的环境。

部署需要提供 D1 绑定 DB，并应用 `drizzle/` 中的迁移；DEEPSEEK_API_KEY 与 DEEPSEEK_MODEL 通过托管平台配置。Sites 部署时使用自己新建站点的项目 ID；仓库配置不包含作者的站点 ID。仅复制静态页面不能提供 AI 接口。

默认服务端限额为每来源每天 8 次、每分钟 2 次、全站每天 200 次，可通过 AI_CLIENT_DAILY_LIMIT 和 AI_GLOBAL_DAILY_LIMIT 调整每日上限。本地 SQLite 在忽略的 `.local/` 中保存用量，线上 D1 只保存短期用量与每日变化的来源摘要，不存录音、课文和转写。

历史、收藏、用户文章与录音仍保存在当前浏览器。清理浏览器会丢失这些记录；手机录音需要自己的 HTTPS 部署或浏览器认可的安全环境。
