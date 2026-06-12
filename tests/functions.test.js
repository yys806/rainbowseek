import { describe, expect, it, vi } from 'vitest';

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
});
