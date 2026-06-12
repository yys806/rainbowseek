import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeImages, normalizeImages } from '../netlify/lib/vision.js';
import { maybeSearchWeb } from '../netlify/lib/search.js';

describe('vision image description', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only valid image data URLs before sending to the vision model', () => {
    const images = normalizeImages([
      { dataUrl: 'data:image/png;base64,abc', name: 'screen.png' },
      { dataUrl: 'https://example.com/image.png', name: 'remote.png' },
      { dataUrl: 'data:text/plain;base64,abc', name: 'text.txt' },
    ]);

    expect(images).toEqual([{ dataUrl: 'data:image/png;base64,abc', name: 'screen.png' }]);
  });

  it('calls SiliconFlow Qwen VL with image_url content blocks', async () => {
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      requests.push({
        headers: options.headers,
        body: JSON.parse(options.body),
      });
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '图中是一张课程表。' } }],
        }),
      };
    }));

    const description = await describeImages(
      [{ dataUrl: 'data:image/jpeg;base64,abc', name: 'photo.jpg' }],
      '帮我看看这是什么',
      { SILICONFLOW_API_KEY: 'silicon-test-key' },
    );

    expect(description).toBe('图中是一张课程表。');
    expect(requests[0].headers.authorization).toBe('Bearer silicon-test-key');
    expect(requests[0].body.model).toBe('Qwen/Qwen3-VL-8B-Instruct');
    expect(requests[0].body.messages[0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({
          type: 'image_url',
          image_url: { url: 'data:image/jpeg;base64,abc' },
        }),
      ]),
    );
  });
});

describe('web search bridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when web search is disabled', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    expect(await maybeSearchWeb('今天新闻', false, {})).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets DeepSeek decide whether to call Tavily and returns search results', async () => {
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body), headers: options.headers });
      if (String(url).includes('deepseek')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"search":true,"query":"rainbowseek latest"}' } }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          answer: 'summary',
          results: [{ title: 'Result', url: 'https://example.com', content: 'content' }],
        }),
      };
    }));

    const result = await maybeSearchWeb('查一下最新消息', true, {
      DEEPSEEK_API_KEY: 'deepseek-test-key',
      TAVILY_API_KEY: 'tavily-test-key',
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].body.messages[0].content).toContain('Decide whether');
    expect(requests[1].url).toBe('https://api.tavily.com/search');
    expect(requests[1].headers.Authorization).toBe('Bearer tavily-test-key');
    expect(result.results[0].url).toBe('https://example.com');
  });
});
