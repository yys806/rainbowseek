# Rainbow DeepSeek

Private pink DeepSeek chat UI for one account, built with React, Netlify Functions, and Netlify Blobs.

## Features

- Single-account login through server-side environment variables.
- DeepSeek API key stays in Netlify Functions, never in browser code.
- Synced conversations through Netlify Blobs.
- Conversation rename, pin/unpin, and delete.
- DeepSeek-style chat layout with a soft pink visual system.

## Local Setup

```powershell
npm install
Copy-Item .env.example .env
```

Fill `.env` with real values:

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-v4-flash
APP_USERNAME=rainbow
APP_PASSWORD=your-password
SESSION_SECRET=use-a-long-random-secret
```

Run locally with Netlify Functions:

```powershell
netlify dev
```

Open `http://localhost:8888`.

## Verification

```powershell
npm test
npm run build
```

## Netlify Environment Variables

Set these in Netlify Site configuration before production deploy:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `APP_USERNAME`
- `APP_PASSWORD`
- `SESSION_SECRET`

## Deploy

Production deploy should use the GitHub to Netlify flow:

```powershell
git push origin main
```

Netlify build settings:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

The API key and password must be set in Netlify environment variables, not committed to git.
