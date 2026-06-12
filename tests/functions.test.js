import { describe, expect, it, vi } from 'vitest';
import { json } from '../netlify/lib/http.js';

describe('http helpers', () => {
  it('marks JSON responses as no-store so chat state is not cached', () => {
    const response = json(200, { ok: true });

    expect(response.headers['Cache-Control']).toBe('no-store, max-age=0');
  });
});

describe('login function', () => {
  it('uses Netlify-provided context.env values when process.env is missing', async () => {
    vi.stubEnv('APP_USERNAME', '');
    vi.stubEnv('APP_PASSWORD', '');
    vi.stubEnv('SESSION_SECRET', '');
    const { handler } = await import('../netlify/functions/login.js');

    const response = await handler(
      {
        httpMethod: 'POST',
        headers: { 'x-forwarded-proto': 'https' },
        body: JSON.stringify({ username: 'rainbow', password: '050428' }),
      },
      {
        env: {
          APP_USERNAME: 'rainbow',
          APP_PASSWORD: '050428',
          SESSION_SECRET: 'test-secret-with-enough-length',
        },
      },
    );

    expect(response.statusCode).toBe(200);
  });

  it('supports Netlify context.env.get style values', async () => {
    vi.stubEnv('APP_USERNAME', '');
    vi.stubEnv('APP_PASSWORD', '');
    vi.stubEnv('SESSION_SECRET', '');
    const { handler } = await import('../netlify/functions/login.js');
    const values = new Map([
      ['APP_USERNAME', 'rainbow'],
      ['APP_PASSWORD', '050428'],
      ['SESSION_SECRET', 'test-secret-with-enough-length'],
    ]);

    const response = await handler(
      {
        httpMethod: 'POST',
        headers: { 'x-forwarded-proto': 'https' },
        body: JSON.stringify({ username: 'rainbow', password: '050428' }),
      },
      {
        env: {
          get: (key) => values.get(key),
        },
      },
    );

    expect(response.statusCode).toBe(200);
  });
});
