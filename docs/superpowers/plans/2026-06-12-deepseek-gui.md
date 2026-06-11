# DeepSeek GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private Netlify-hosted DeepSeek chat UI with one-account login and synced conversation management.

**Architecture:** Vite React renders the app. Netlify Functions handle auth, DeepSeek calls, and Netlify Blobs persistence. Shared backend logic lives in `netlify/lib` and is covered by unit tests.

**Tech Stack:** React, Vite, Vitest, Netlify Functions, Netlify Blobs, DeepSeek OpenAI-compatible API.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `src/styles.css`
- Create: `netlify.toml`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] Add Vite/React scripts, Netlify config, and an empty app shell.
- [ ] Install dependencies with `npm install`.
- [ ] Run `npm test` and `npm run build`.

### Task 2: Auth Library

**Files:**
- Create: `netlify/lib/auth.js`
- Create: `tests/auth.test.js`

- [ ] Test that valid credentials create a verifiable signed session.
- [ ] Test that bad credentials fail.
- [ ] Test that expired or tampered sessions fail.
- [ ] Implement HMAC-signed cookie helpers.

### Task 3: Conversation Storage

**Files:**
- Create: `netlify/lib/storage.js`
- Create: `tests/storage.test.js`

- [ ] Test conversation creation, message persistence, rename, pin sorting, and delete.
- [ ] Implement a store-backed service around Netlify Blobs.

### Task 4: Netlify Functions

**Files:**
- Create: `netlify/lib/http.js`
- Create: `netlify/lib/deepseek.js`
- Create: `netlify/functions/login.js`
- Create: `netlify/functions/logout.js`
- Create: `netlify/functions/session.js`
- Create: `netlify/functions/conversations.js`
- Create: `netlify/functions/conversation.js`
- Create: `netlify/functions/chat.js`

- [ ] Add JSON helpers and auth guards.
- [ ] Add login/logout/session endpoints.
- [ ] Add conversation list/detail/mutate endpoints.
- [ ] Add chat endpoint that persists user and assistant messages.

### Task 5: Frontend

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

- [ ] Build login screen.
- [ ] Build DeepSeek-like chat layout with pink visual system.
- [ ] Add conversation rename, pin/unpin, delete, and logout controls.
- [ ] Add loading and error states.

### Task 6: Verification and Deployment

**Files:**
- Modify: `README.md`

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run local Netlify dev if possible and inspect the UI.
- [ ] Initialize git, commit, create/push GitHub repo if credentials are available.
- [ ] Link/create Netlify site, set environment variables, and deploy if credentials are available.
