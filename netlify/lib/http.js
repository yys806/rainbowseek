import { requireSession } from './auth.js';

export function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export function noContent(headers = {}) {
  return {
    statusCode: 204,
    headers,
    body: '',
  };
}

export function methodNotAllowed() {
  return json(405, { error: 'Method not allowed' });
}

export function unauthorized() {
  return json(401, { error: 'Unauthorized' });
}

export function parseBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export function requireAuth(event, env = process.env) {
  const session = requireSession(event, env);
  if (!session) {
    return { response: unauthorized(), session: null };
  }
  return { response: null, session };
}

export function handleError(error) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  if (message.includes('not found') || message.includes('Not found')) {
    return json(404, { error: message });
  }
  if (message.includes('Invalid JSON')) {
    return json(400, { error: message });
  }
  return json(500, { error: message });
}
