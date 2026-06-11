import { describe, expect, it } from 'vitest';
import {
  createSessionCookie,
  parseSession,
  validateCredentials,
} from '../netlify/lib/auth.js';

const env = {
  APP_USERNAME: 'rainbow',
  APP_PASSWORD: '050428',
  SESSION_SECRET: 'test-secret-with-enough-length',
};

describe('auth helpers', () => {
  it('accepts the configured single account', () => {
    expect(validateCredentials('rainbow', '050428', env)).toBe(true);
  });

  it('rejects wrong usernames or passwords', () => {
    expect(validateCredentials('rainbow', 'wrong', env)).toBe(false);
    expect(validateCredentials('someone', '050428', env)).toBe(false);
  });

  it('creates a signed session cookie that can be parsed', () => {
    const cookie = createSessionCookie('rainbow', env, {
      now: 1_700_000_000_000,
      maxAgeSeconds: 3600,
      secure: true,
    });

    const parsed = parseSession(cookie, env, { now: 1_700_000_000_000 });

    expect(parsed).toEqual({
      username: 'rainbow',
      expiresAt: 1_700_003_600_000,
    });
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
  });

  it('rejects tampered sessions', () => {
    const cookie = createSessionCookie('rainbow', env, {
      now: 1_700_000_000_000,
      maxAgeSeconds: 3600,
    }).replace('rainbow', 'attacker');

    expect(parseSession(cookie, env, { now: 1_700_000_000_000 })).toBeNull();
  });

  it('rejects expired sessions', () => {
    const cookie = createSessionCookie('rainbow', env, {
      now: 1_700_000_000_000,
      maxAgeSeconds: 1,
    });

    expect(parseSession(cookie, env, { now: 1_700_000_002_000 })).toBeNull();
  });
});
