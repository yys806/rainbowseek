import { json, methodNotAllowed, requireAuth, unauthorized } from '../lib/http.js';

export async function handler(event, context = {}) {
  if (event.httpMethod !== 'GET') {
    return methodNotAllowed();
  }

  const { response, session } = requireAuth(event, context.env ?? process.env);
  if (response) {
    return unauthorized();
  }

  return json(200, { username: session.username });
}
