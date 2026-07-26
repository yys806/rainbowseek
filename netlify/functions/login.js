import { createSessionCookie, validateCredentials } from '../lib/auth.js';
import { json, methodNotAllowed, parseBody } from '../lib/http.js';

// 登录失败时的固定延迟,拖慢暴力破解尝试。
const FAILED_LOGIN_DELAY_MS = 500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(event, context = {}) {
  if (event.httpMethod !== 'POST') {
    return methodNotAllowed();
  }

  try {
    const body = parseBody(event);
    const env = context.env ?? process.env;
    if (!validateCredentials(body.username, body.password, env)) {
      await delay(FAILED_LOGIN_DELAY_MS);
      return json(401, { error: '用户名或密码不对' });
    }

    const secure = event.headers['x-forwarded-proto'] === 'https';
    const cookie = createSessionCookie(body.username, env, { secure });
    return json(200, { username: body.username }, { 'Set-Cookie': cookie });
  } catch (error) {
    return json(400, { error: error.message });
  }
}
