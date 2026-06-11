import { json, methodNotAllowed, requireAuth, unauthorized } from '../lib/http.js';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return methodNotAllowed();
  }

  const { response, session } = requireAuth(event);
  if (response) {
    return unauthorized();
  }

  return json(200, { username: session.username });
}
