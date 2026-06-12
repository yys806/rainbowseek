import { afterEach, describe, expect, it, vi } from 'vitest';
import { callDeepSeek, normalizeModel, streamDeepSeek } from '../netlify/lib/deepseek.js';

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

  it('caps empty lines from non-streamed assistant content after the API returns', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'first paragraph\n\n\nsecond paragraph',
            },
          },
        ],
      }),
    })));

    const assistant = await callDeepSeek(
      [{ role: 'user', content: 'hello' }],
      { DEEPSEEK_API_KEY: 'test-key' },
      { model: 'deepseek-v4-flash' },
    );

    expect(assistant.content).toBe('first paragraph\n\nsecond paragraph');
    expect(assistant.content).not.toContain('\n\n\n');
  });

  it('streams content and reasoning deltas from DeepSeek SSE responses', async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      expect(JSON.parse(options.body).stream).toBe(true);
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"think "}}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
      };
    }));

    const contentDeltas = [];
    const reasoningDeltas = [];
    const assistant = await streamDeepSeek(
      [{ role: 'user', content: 'hello' }],
      { DEEPSEEK_API_KEY: 'test-key' },
      {
        model: 'deepseek-v4-flash',
        onContent: (delta) => contentDeltas.push(delta),
        onReasoning: (delta) => reasoningDeltas.push(delta),
      },
    );

    expect(contentDeltas).toEqual(['hello', ' world']);
    expect(reasoningDeltas).toEqual(['think ']);
    expect(assistant).toMatchObject({
      role: 'assistant',
      content: 'hello world',
      reasoning: 'think',
      model: 'deepseek-v4-flash',
    });
  });

  it('caps empty lines from streamed assistant content after the API returns', async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"first\\n\\n"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"second"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    })));

    const assistant = await streamDeepSeek(
      [{ role: 'user', content: 'hello' }],
      { DEEPSEEK_API_KEY: 'test-key' },
      { model: 'deepseek-v4-flash' },
    );

    expect(assistant.content).toBe('first\n\nsecond');
    expect(assistant.content).not.toContain('\n\n\n');
  });
});
