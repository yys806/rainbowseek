// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import App from '../src/App.jsx';

const conversations = [
  {
    id: 'old-chat',
    title: 'Reply in markdown ...',
    pinned: false,
    createdAt: '2026-06-12T04:20:00.000Z',
    updatedAt: '2026-06-12T04:21:00.000Z',
  },
];

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

function streamResponse(events, ok = true, status = ok ? 200 : 400) {
  const encoder = new TextEncoder();
  return {
    ok,
    status,
    body: new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      },
    }),
    json: async () => events[0] ?? {},
  };
}

describe('App shell', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, false, 401)),
    );
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the login screen when there is no session', async () => {
    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('rainbowseek');
      expect(document.body.textContent).toContain('DeepSeek');
    });
  });

  it('uses an in-app delete dialog instead of the browser confirm dialog', async () => {
    const confirm = vi.fn();
    vi.stubGlobal('confirm', confirm);
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (path === '/.netlify/functions/conversations') {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({ conversation: { ...conversations[0], messages: [] } });
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });

    document.querySelector('.conversation-actions .icon-button').click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('删除');
    });
    [...document.querySelectorAll('.action-menu button')]
      .find((button) => button.textContent.includes('删除'))
      .click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('删除这段聊天？');
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('recovers stale conversation ids without showing the raw not found error', async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (path === '/.netlify/functions/conversations') {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({ error: 'Conversation not found' }, false, 404);
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/conversation?id=old-chat',
        expect.any(Object),
      );
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).not.toContain('Conversation not found');
      expect(document.body.textContent).toContain('新的聊天');
    });
  });

  it('retries sending as a new chat when the selected conversation is stale', async () => {
    const chatCalls = [];
    const conversationLoads = [];
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (path === '/.netlify/functions/conversations') {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        conversationLoads.push(String(path));
        if (String(path).includes('new-chat')) {
          return jsonResponse({ error: 'Conversation not found' }, false, 404);
        }
        return jsonResponse({ conversation: { ...conversations[0], messages: [] } });
      }
      if (path === '/.netlify/functions/chat-stream') {
        const body = JSON.parse(options.body);
        chatCalls.push(body);
        if (body.conversationId) {
          return jsonResponse({ error: 'Conversation not found' }, false, 404);
        }
        return streamResponse([
          { type: 'meta', conversationId: 'new-chat', title: 'hello', model: body.model },
          { type: 'content', delta: 'o' },
          { type: 'content', delta: 'k' },
          {
            type: 'done',
            conversation: {
              id: 'new-chat',
              title: 'hello',
              pinned: false,
              createdAt: '2026-06-12T04:22:00.000Z',
              updatedAt: '2026-06-12T04:22:00.000Z',
              messages: [
                { id: 'u1', role: 'user', content: body.message, createdAt: '2026-06-12T04:22:00.000Z' },
                { id: 'a1', role: 'assistant', content: 'ok', createdAt: '2026-06-12T04:22:01.000Z' },
              ],
            },
            conversations: [{ ...conversations[0], id: 'new-chat', title: 'hello' }],
          },
        ]);
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });

    const textarea = document.querySelector('.composer textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'hello');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(document.querySelector('.send-button').disabled).toBe(false);
    });
    document.querySelector('.send-button').click();

    await vi.waitFor(() => {
      expect(chatCalls).toHaveLength(2);
      expect(chatCalls[0]).toEqual({ conversationId: 'old-chat', message: 'hello', model: 'deepseek-v4-flash' });
      expect(chatCalls[1]).toEqual({ message: 'hello', model: 'deepseek-v4-flash' });
      expect(document.body.textContent).toContain('ok');
      expect(conversationLoads.some((path) => path.includes('new-chat'))).toBe(false);
      expect(document.body.textContent).not.toContain('这段聊天已经不存在');
    });
  });

  it('sends with the selected model and can edit a user message back into the composer', async () => {
    const chatCalls = [];
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (path === '/.netlify/functions/conversations') {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            ...conversations[0],
            messages: [{ id: 'u1', role: 'user', content: 'old question', createdAt: '2026-06-12T04:20:00.000Z' }],
          },
        });
      }
      if (path === '/.netlify/functions/chat-stream') {
        const body = JSON.parse(options.body);
        chatCalls.push(body);
        return streamResponse([
          { type: 'meta', conversationId: 'old-chat', title: 'Reply in markdown ...', model: body.model },
          { type: 'content', delta: 'pro ' },
          { type: 'content', delta: 'answer' },
          {
            type: 'done',
            conversation: {
              ...conversations[0],
              messages: [
                { id: 'u2', role: 'user', content: body.message, createdAt: '2026-06-12T04:22:00.000Z' },
                { id: 'a2', role: 'assistant', content: 'pro answer', model: body.model, createdAt: '2026-06-12T04:22:01.000Z' },
              ],
            },
            conversations,
          },
        ]);
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('old question');
    });

    [...document.querySelectorAll('.message-action')]
      .find((button) => button.textContent.includes('编辑'))
      .click();
    await vi.waitFor(() => {
      expect(document.querySelector('.composer textarea').value).toBe('old question');
    });

    [...document.querySelectorAll('.model-chip')]
      .find((button) => button.textContent.includes('V4 Pro'))
      .click();
    const textarea = document.querySelector('.composer textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'ask with pro');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.send-button').click();

    await vi.waitFor(() => {
      expect(chatCalls[0]).toMatchObject({
        conversationId: 'old-chat',
        message: 'ask with pro',
        model: 'deepseek-v4-pro',
      });
      expect(document.body.textContent).toContain('pro answer');
    });
  });

  it('renders markdown code blocks with a dedicated copy button', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (path === '/.netlify/functions/conversations') {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            ...conversations[0],
            messages: [
              {
                id: 'a1',
                role: 'assistant',
                content: '```js\nconsole.log(\"rainbow\")\n```',
                createdAt: '2026-06-12T04:20:00.000Z',
              },
            ],
          },
        });
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.querySelector('.code-panel')).toBeTruthy();
    });

    document.querySelector('.code-copy').click();

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('console.log("rainbow")');
    });
  });
});
