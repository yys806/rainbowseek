import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'deepseek_session';
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export function getEnvValue(env, key) {
  if (env && typeof env.get === 'function') {
    return env.get(key) ?? process.env[key];
  }
  return env?.[key] ?? process.env[key];
}

function getSecret(env) {
  const secret = getEnvValue(env, 'SESSION_SECRET');
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET must be at least 16 characters');
  }
  return secret;
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function extractCookie(cookieHeader) {
  const cookies = String(cookieHeader ?? '').split(';');
  const pair = cookies.find((item) => item.trim().startsWith(`${COOKIE_NAME}=`));
  return pair?.trim().slice(COOKIE_NAME.length + 1) ?? null;
}

export function validateCredentials(username, password, env = process.env) {
  return username === getEnvValue(env, 'APP_USERNAME') && password === getEnvValue(env, 'APP_PASSWORD');
}

export function createSessionCookie(username, env = process.env, options = {}) {
  const now = options.now ?? Date.now();
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const expiresAt = now + maxAgeSeconds * 1000;
  const payload = encodeURIComponent(JSON.stringify({ username, expiresAt }));
  const signature = sign(payload, getSecret(env));
  const secure = options.secure ? '; Secure' : '';

  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseSession(cookieHeader, env = process.env, options = {}) {
  const token = extractCookie(cookieHeader);
  if (!token || !token.includes('.')) {
    return null;
  }

  const [payload, signature] = token.split('.');
  const expected = sign(payload, getSecret(env));
  if (!safeEqual(signature, expected)) {
    return null;
  }

  try {
    const session = JSON.parse(decodeURIComponent(payload));
    const now = options.now ?? Date.now();
    if (!session.username || !session.expiresAt || session.expiresAt <= now) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function requireSession(event, env = process.env) {
  const session = parseSession(event.headers.cookie ?? event.headers.Cookie, env);
  if (!session) {
    return null;
  }
  return session;
}
