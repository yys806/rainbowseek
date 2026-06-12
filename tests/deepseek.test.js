import { afterEach, describe, expect, it, vi } from 'vitest';
import { callDeepSeek, normalizeModel } from '../netlify/lib/deepseek.js';

describe('DeepSeek client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes model choices to supported DeepSeek variants', () => {
    expect(normalizeModel('deepseek-v4-pro')).toBe('deepseek-v4-pro');
    expect(normalizeModel('deepseek-v4-flash')).toBe('deepseek-v4-flash');
    expect(normalizeModel('unknown')).toBe('deepseek-v4-flash');
  });

  it('passes the selected model and keeps reasoning content when returned', async () => {
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'answer',
                reasoning_content: 'short reasoning',
              },
            },
          ],
          usage: { total_tokens: 8 },
        }),
      };
    }));

    const assistant = await callDeepSeek(
      [{ role: 'user', content: 'hello' }],
      { DEEPSEEK_API_KEY: 'test-key' },
      { model: 'deepseek-v4-pro', userId: 'rainbow' },
    );

    expect(requests[0].model).toBe('deepseek-v4-pro');
    expect(assistant).toMatchObject({
      role: 'assistant',
      content: 'answer',
      model: 'deepseek-v4-pro',
      reasoning: 'short reasoning',
      usage: { total_tokens: 8 },
    });
  });
});
