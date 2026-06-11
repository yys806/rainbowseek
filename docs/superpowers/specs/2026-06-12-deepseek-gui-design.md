# DeepSeek GUI Design

## Goal

Build a private, pink DeepSeek-style chat web app for one account, deployable on Netlify, with server-side DeepSeek API access and synced conversation history.

## Architecture

The app is a Vite React single-page application served by Netlify. Browser code never sees the DeepSeek API key. All protected operations go through Netlify Functions that validate a signed HTTP-only session cookie.

Conversation data is stored in Netlify Blobs. A single index blob stores conversation metadata and each conversation has its own message blob. Reads use strong consistency so multiple devices see updates quickly.

## Authentication

Only one username/password pair is supported. `APP_USERNAME`, `APP_PASSWORD`, and `SESSION_SECRET` come from environment variables. Login creates a signed cookie with an expiry. Logout clears it.

## Chat

The frontend posts user messages to `/.netlify/functions/chat`. The function loads or creates the conversation, appends the user message, calls DeepSeek's OpenAI-compatible chat completions API, appends the assistant reply, and returns the updated conversation.

The default model is `deepseek-v4-flash`, configurable with `DEEPSEEK_MODEL`.

## Conversation Management

The user can create conversations implicitly by sending the first message, view synced conversations, rename, pin/unpin, and delete conversations. Pinned conversations sort before normal conversations; otherwise newest updated conversations appear first.

## UI Direction

The interface follows DeepSeek's familiar layout: a left conversation sidebar, a central message pane, and a bottom composer. The visual language is soft pink, pearlescent, and personal, while keeping the tool efficient and readable.

## Deployment

The repo includes `netlify.toml` with `npm run build` and `dist`. Secrets are excluded from git; `.env.example` documents required variables. Production deployment requires setting the same environment variables in Netlify.
