# rainbowseek

专门为彩虹开发的 DeepSeek 网页聊天应用。前端是粉色少女风界面，后端通过 Netlify Functions 调用 DeepSeek，聊天记录用 Netlify Blobs 多端同步。

## 功能

- 单账号登录
- DeepSeek API key 只保存在 Netlify 环境变量
- 多端同步聊天记录
- 会话删除、置顶、重命名
- Markdown / GFM 渲染，支持列表、代码块、表格
- GitHub 推送后由 Netlify 自动部署

## 本地开发

```powershell
npm install
Copy-Item .env.example .env
netlify dev
```

`.env` 需要包含：

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-v4-flash
APP_USERNAME=rainbow
APP_PASSWORD=your-password
SESSION_SECRET=use-a-long-random-secret
```

## 验证

```powershell
npm test
npm run build
```

## Netlify

Build command: `npm run build`

Publish directory: `dist`

Functions directory: `netlify/functions`

生产环境变量：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `APP_USERNAME`
- `APP_PASSWORD`
- `SESSION_SECRET`
