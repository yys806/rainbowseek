import { describe, expect, it, vi } from 'vitest';
import { json } from '../netlify/lib/http.js';
import { buildApiMessages } from '../netlify/lib/prompt.js';

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

describe('chat prompt builder', () => {
  it('tells the model to answer only the latest user message while preserving context', () => {
    const apiMessages = buildApiMessages([
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'current question' },
    ]);

    expect(apiMessages[0]).toMatchObject({ role: 'system' });
    expect(apiMessages[0].content).toContain('Answer only the latest user message');
    expect(apiMessages[0].content).toContain('previous conversation only to understand context');
    expect(apiMessages[0].content).toContain('Your name is rainbowseek');
    expect(apiMessages[0].content).not.toContain('Keep the final answer compact');
    expect(apiMessages[0].content).not.toContain('Do not insert blank lines');
    expect(apiMessages[1].content).toBe('old question');
    expect(apiMessages[3].content).toContain('Current user message to answer');
    expect(apiMessages[3].content).toContain('current question');
  });

  it('adds image descriptions and web search results only to the latest user message', () => {
    const apiMessages = buildApiMessages(
      [
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'current question' },
      ],
      {
        imageDescription: '图里有一张数学题截图。',
        webSearch: {
          query: 'current question',
          answer: 'search summary',
          results: [{ title: 'Source A', url: 'https://example.com/a', content: 'source content' }],
        },
      },
    );

    expect(apiMessages[1].content).toBe('old question');
    expect(apiMessages[3].content).toContain('current question');
    expect(apiMessages[3].content).toContain('图片识别结果');
    expect(apiMessages[3].content).toContain('图里有一张数学题截图。');
    expect(apiMessages[3].content).toContain('联网搜索结果');
    expect(apiMessages[3].content).toContain('https://example.com/a');
  });

  it('adds uploaded text files only to the latest user message', () => {
    const apiMessages = buildApiMessages(
      [
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'current question' },
      ],
      {
        files: [{ name: 'notes.txt', content: 'important file content' }],
      },
    );

    expect(apiMessages[1].content).toBe('old question');
    expect(apiMessages[3].content).toContain('current question');
    expect(apiMessages[3].content).toContain('notes.txt');
    expect(apiMessages[3].content).toContain('important file content');
  });
});
