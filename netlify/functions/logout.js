import { clearSessionCookie } from '../lib/auth.js';
import { json, methodNotAllowed } from '../lib/http.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return methodNotAllowed();
  }

  return json(200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
}
