import { createSessionCookie, validateCredentials } from '../lib/auth.js';
import { json, methodNotAllowed, parseBody } from '../lib/http.js';

export async function handler(event, context = {}) {
  if (event.httpMethod !== 'POST') {
    return methodNotAllowed();
  }

  try {
    const body = parseBody(event);
    const env = context.env ?? process.env;
    if (!validateCredentials(body.username, body.password, env)) {
      return json(401, { error: '用户名或密码不对' });
    }

    const secure = event.headers['x-forwarded-proto'] === 'https';
    const cookie = createSessionCookie(body.username, env, { secure });
    return json(200, { username: body.username }, { 'Set-Cookie': cookie });
  } catch (error) {
    return json(400, { error: error.message });
  }
}
