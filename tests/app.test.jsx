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
    delete Element.prototype.scrollIntoView;
    vi.unstubAllGlobals();
  });

  it('renders the login screen when there is no session', async () => {
    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
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
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({ conversation: { ...conversations[0], messages: [] } });
      }
      return jsonResponse({});
    });

    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
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

  it('collapses the desktop sidebar grid column when the sidebar toggle is clicked', async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({ conversation: { ...conversations[0], messages: [] } });
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.querySelector('.chat-shell').classList.contains('sidebar-collapsed')).toBe(false);
    });

    document.querySelector('.chat-header .desktop-only').click();

    await vi.waitFor(() => {
      expect(document.querySelector('.chat-shell').classList.contains('sidebar-collapsed')).toBe(true);
      expect(document.querySelector('.sidebar').classList.contains('collapsed')).toBe(true);
    });
  });

  it('starts on a new chat instead of opening the most recent conversation', async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            ...conversations[0],
            messages: [{ id: 'a1', role: 'assistant', content: 'old answer', createdAt: '2026-06-12T04:20:00.000Z' }],
          },
        });
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('新的聊天');
      expect(document.body.textContent).not.toContain('old answer');
      expect(fetch).not.toHaveBeenCalledWith(
        expect.stringMatching(/^\/\.netlify\/functions\/conversation\?id=old-chat&_/),
        expect.any(Object),
      );
    });
  });

  it('recovers stale conversation ids without showing the raw not found error', async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({ error: 'Conversation not found' }, false, 404);
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\.netlify\/functions\/conversation\?id=old-chat&_/),
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
      if (String(path).startsWith('/.netlify/functions/conversations')) {
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
    document.querySelector('.conversation-main').click();
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\.netlify\/functions\/conversation\?id=old-chat&_/),
        expect.any(Object),
      );
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
      expect(chatCalls[0]).toEqual({
        conversationId: 'old-chat',
        message: 'hello',
        model: 'deepseek-v4-flash',
        webSearchEnabled: false,
      });
      expect(chatCalls[1]).toEqual({
        message: 'hello',
        model: 'deepseek-v4-flash',
        webSearchEnabled: false,
      });
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
      if (String(path).startsWith('/.netlify/functions/conversations')) {
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
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('old question');
    });

    const editButton = document.querySelector('.message-action[aria-label="编辑消息"]');
    expect(editButton).toBeTruthy();
    expect(editButton.textContent.trim()).toBe('');
    editButton.click();
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

  it('refreshes conversations with cache busting and avoids stale multi-device sync reads', async () => {
    const conversationFetches = [];
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        conversationFetches.push(String(path));
        return jsonResponse({ conversation: { ...conversations[0], messages: [] } });
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\.netlify\/functions\/conversations\?_=/),
        expect.any(Object),
      );
      expect(conversationFetches).toEqual([]);
    });
  });

  it('deletes the active conversation without jumping to another conversation', async () => {
    const conversationFetches = [];
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        conversationFetches.push(String(path));
        if (options.method === 'DELETE') {
          return jsonResponse({ ok: true });
        }
        return jsonResponse({
          conversation: {
            ...conversations[0],
            messages: [{ id: 'a1', role: 'assistant', content: 'old answer', createdAt: '2026-06-12T04:20:00.000Z' }],
          },
        });
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('old answer');
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
    document.querySelector('.dialog-danger').click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('新的聊天');
      expect(document.body.textContent).not.toContain('old answer');
    });
    expect(conversationFetches.filter((path) => path.includes('id=old-chat')).length).toBeLessThanOrEqual(2);
  });

  it('does not jump back when an older streaming request finishes after starting a new chat', async () => {
    let streamController;
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({ conversation: { ...conversations[0], messages: [] } });
      }
      if (path === '/.netlify/functions/chat-stream') {
        const body = JSON.parse(options.body);
        const encoder = new TextEncoder();
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              streamController = { controller, encoder, body };
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'meta', conversationId: 'stream-chat', title: 'streaming' })}\n`));
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'content', delta: 'partial' })}\n`));
            },
          }),
          json: async () => ({}),
        };
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('新的聊天');
    });

    const textarea = document.querySelector('.composer textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'hello');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.send-button').click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('partial');
    });

    document.querySelector('.ghost-button').click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('新的聊天');
      expect(document.body.textContent).not.toContain('partial');
    });

    streamController.controller.enqueue(streamController.encoder.encode(`${JSON.stringify({
      type: 'done',
      conversation: {
        id: 'stream-chat',
        title: 'streaming',
        pinned: false,
        createdAt: '2026-06-12T04:22:00.000Z',
        updatedAt: '2026-06-12T04:22:00.000Z',
        messages: [
          { id: 'u1', role: 'user', content: streamController.body.message, createdAt: '2026-06-12T04:22:00.000Z' },
          { id: 'a1', role: 'assistant', content: 'finished', createdAt: '2026-06-12T04:22:01.000Z' },
        ],
      },
      conversations,
    })}\n`));
    streamController.controller.close();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.body.textContent).toContain('新的聊天');
    expect(document.body.textContent).not.toContain('finished');
  });

  it('keeps the completed answer visible when sync briefly returns an older conversation snapshot', async () => {
    vi.useFakeTimers();
    let conversationReads = 0;
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations: [{ ...conversations[0], id: 'new-chat', title: 'hello' }] });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        conversationReads += 1;
        return jsonResponse({
          conversation: {
            ...conversations[0],
            id: 'new-chat',
            title: 'hello',
            messages:
              conversationReads <= 1
                ? [
                    { id: 'u1', role: 'user', content: 'hello', createdAt: '2026-06-12T04:22:00.000Z' },
                    { id: 'a1', role: 'assistant', content: 'stable answer', createdAt: '2026-06-12T04:22:01.000Z' },
                  ]
                : [{ id: 'u1', role: 'user', content: 'hello', createdAt: '2026-06-12T04:22:00.000Z' }],
          },
        });
      }
      if (path === '/.netlify/functions/chat-stream') {
        const body = JSON.parse(options.body);
        return streamResponse([
          { type: 'meta', conversationId: 'new-chat', title: 'hello', model: body.model },
          { type: 'content', delta: 'stable answer' },
          {
            type: 'done',
            conversation: {
              ...conversations[0],
              id: 'new-chat',
              title: 'hello',
              messages: [
                { id: 'u1', role: 'user', content: body.message, createdAt: '2026-06-12T04:22:00.000Z' },
                { id: 'a1', role: 'assistant', content: 'stable answer', createdAt: '2026-06-12T04:22:01.000Z' },
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
      expect(document.querySelector('.composer textarea')).toBeTruthy();
    });

    const textarea = document.querySelector('.composer textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'hello');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.send-button').click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('stable answer');
    });

    await vi.advanceTimersByTimeAsync(3600);
    await Promise.resolve();

    expect(document.body.textContent).toContain('stable answer');
    vi.useRealTimers();
  });

  it('streams reasoning open, then folds it after the final answer and removes display blank lines', async () => {
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({ conversation: { ...conversations[0], messages: [] } });
      }
      if (path === '/.netlify/functions/chat-stream') {
        const body = JSON.parse(options.body);
        return streamResponse([
          { type: 'meta', conversationId: 'old-chat', title: 'Reply in markdown ...', model: body.model },
          { type: 'reasoning', delta: 'thinking' },
          { type: 'content', delta: 'first\n\n\n\nsecond' },
          {
            type: 'done',
            conversation: {
              ...conversations[0],
              messages: [
                { id: 'u2', role: 'user', content: body.message, createdAt: '2026-06-12T04:22:00.000Z' },
                {
                  id: 'a2',
                  role: 'assistant',
                  content: 'first\n\nsecond',
                  reasoning: 'thinking',
                  model: body.model,
                  createdAt: '2026-06-12T04:22:01.000Z',
                },
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
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\.netlify\/functions\/conversation\?id=old-chat&_/),
        expect.any(Object),
      );
    });

    const textarea = document.querySelector('.composer textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'explain');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.send-button').click();

    await vi.waitFor(() => {
      expect(document.querySelector('.reasoning-block')?.open).toBe(false);
      expect(document.body.textContent).toContain('first');
      expect(document.body.textContent).toContain('second');
      expect(document.querySelectorAll('.message.assistant .message-bubble > p').length).toBeGreaterThanOrEqual(2);
      expect(document.querySelector('.message.assistant .message-bubble').innerHTML).not.toContain('<br><br><br>');
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
      if (String(path).startsWith('/.netlify/functions/conversations')) {
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
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();
    await vi.waitFor(() => {
      expect(document.querySelector('.code-panel')).toBeTruthy();
    });

    document.querySelector('.code-copy').click();

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('console.log("rainbow")');
    });
  });

  it('keeps markdown blocks while removing excessive display blank lines', async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
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
                content: '下面是代码：\n\n\n\n```python\nprint(\"rainbow\")\n```\n\n\n\n- 第一项\n- 第二项',
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
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();

    await vi.waitFor(() => {
      const bubble = document.querySelector('.message.assistant .message-bubble');
      expect(document.querySelector('.code-panel')).toBeTruthy();
      expect(document.querySelectorAll('.message.assistant li')).toHaveLength(2);
      expect(bubble.innerHTML).not.toContain('<br><br><br>');
    });
  });

  it('renders markdown tables as real tables', async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
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
                content: '| 维度 | 微观经济学 | 宏观经济学 |\n|---|---|---|\n| 研究对象 | 个体经济单位 | 经济总体 |\n| 目标 | 效率 | 稳定增长 |',
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
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();

    await vi.waitFor(() => {
      expect(document.querySelector('.message.assistant table')).toBeTruthy();
      expect(document.querySelectorAll('.message.assistant th')).toHaveLength(3);
      expect(document.querySelectorAll('.message.assistant td')).toHaveLength(6);
      expect(document.body.textContent).not.toContain('|---|');
    });
  });

  it('does not force scroll to the bottom when the user has scrolled upward', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            ...conversations[0],
            messages: Array.from({ length: 20 }, (_, index) => ({
              id: `a${index}`,
              role: 'assistant',
              content: `answer ${index}`,
              createdAt: '2026-06-12T04:20:00.000Z',
            })),
          },
        });
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('answer 19');
    });

    const messages = document.querySelector('.messages');
    Object.defineProperty(messages, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(messages, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(messages, 'scrollTop', { configurable: true, value: 200, writable: true });
    scrollIntoView.mockClear();

    messages.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls to the bottom when the composer receives focus', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            ...conversations[0],
            messages: Array.from({ length: 20 }, (_, index) => ({
              id: `a${index}`,
              role: 'assistant',
              content: `answer ${index}`,
              createdAt: '2026-06-12T04:20:00.000Z',
            })),
          },
        });
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('answer 19');
    });

    const messages = document.querySelector('.messages');
    Object.defineProperty(messages, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(messages, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(messages, 'scrollTop', { configurable: true, value: 200, writable: true });
    messages.dispatchEvent(new Event('scroll', { bubbles: true }));
    scrollIntoView.mockClear();

    document.querySelector('.composer textarea').click();

    await vi.waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
  });

  it('does not reuse an old composer focus scroll after the user scrolls upward', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = function scrollCurrentElementIntoView(options) {
      if (document.body.contains(this)) {
        scrollIntoView(options);
      }
    };
    let latestMessages = Array.from({ length: 20 }, (_, index) => ({
      id: `a${index}`,
      role: 'assistant',
      content: `answer ${index}`,
      createdAt: '2026-06-12T04:20:00.000Z',
    }));
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            ...conversations[0],
            updatedAt: `2026-06-12T04:${latestMessages.length}:00.000Z`,
            messages: latestMessages,
          },
        });
      }
      return jsonResponse({});
    });

    createRoot(document.getElementById('root')).render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('answer 19');
    });

    const messages = document.querySelector('.messages');
    Object.defineProperty(messages, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(messages, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(messages, 'scrollTop', { configurable: true, value: 200, writable: true });
    document.querySelector('.composer textarea').click();
    await vi.waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });

    scrollIntoView.mockClear();
    messages.dispatchEvent(new Event('scroll', { bubbles: true }));
    latestMessages = [
      ...latestMessages,
      { id: 'a20', role: 'assistant', content: 'answer 20', createdAt: '2026-06-12T04:21:00.000Z' },
    ];
    await new Promise((resolve) => setTimeout(resolve, 3700));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('answer 20');
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls again when the keyboard changes the visual viewport after composer focus', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = function scrollCurrentElementIntoView(options) {
      if (document.body.contains(this)) {
        scrollIntoView(options);
      }
    };
    const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const viewport = new EventTarget();
    viewport.height = 520;
    viewport.offsetTop = 0;
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            ...conversations[0],
            messages: [{ id: 'a1', role: 'assistant', content: 'answer', createdAt: '2026-06-12T04:20:00.000Z' }],
          },
        });
      }
      return jsonResponse({});
    });

    const root = createRoot(document.getElementById('root'));
    try {
      root.render(<App />);
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('Reply in markdown ...');
      });
      document.querySelector('.conversation-main').click();
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('answer');
      });
      scrollIntoView.mockClear();

      document.querySelector('.composer textarea').click();
      await vi.waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
      });
      scrollIntoView.mockClear();
      viewport.dispatchEvent(new Event('resize'));

      await vi.waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalled();
      });
    } finally {
      root.unmount();
      if (originalVisualViewport) {
        Object.defineProperty(window, 'visualViewport', originalVisualViewport);
      } else {
        delete window.visualViewport;
      }
    }
  });

  it('tracks the visual viewport height so the mobile composer stays above the keyboard', async () => {
    const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    const viewport = new EventTarget();
    viewport.height = 520;
    viewport.offsetTop = 0;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 780 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations: [] });
      }
      return jsonResponse({});
    });

    const root = createRoot(document.getElementById('root'));
    try {
      root.render(<App />);
      await vi.waitFor(() => {
        expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('520px');
        expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('260px');
      });

      viewport.height = 430;
      viewport.dispatchEvent(new Event('resize'));

      await vi.waitFor(() => {
        expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('430px');
        expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('350px');
      });
    } finally {
      root.unmount();
      if (originalVisualViewport) {
        Object.defineProperty(window, 'visualViewport', originalVisualViewport);
      } else {
        delete window.visualViewport;
      }
      if (originalInnerHeight) {
        Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      }
      document.documentElement.style.removeProperty('--app-viewport-height');
      document.documentElement.style.removeProperty('--keyboard-inset');
    }
  });

  it('keeps enough bottom space for the measured fixed mobile composer when the keyboard overlays the viewport', async () => {
    const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const viewport = new EventTarget();
    viewport.height = 520;
    viewport.offsetTop = 0;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 780 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList?.contains('composer-wrap')) {
        return { width: 390, height: 148, top: 0, right: 390, bottom: 148, left: 0, x: 0, y: 0, toJSON: () => {} };
      }
      return originalGetBoundingClientRect.call(this);
    };
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations: [] });
      }
      return jsonResponse({});
    });

    const root = createRoot(document.getElementById('root'));
    try {
      root.render(<App />);
      await vi.waitFor(() => {
        expect(document.documentElement.style.getPropertyValue('--composer-keyboard-offset')).toBe('260px');
        expect(document.documentElement.style.getPropertyValue('--composer-height')).toBe('148px');
        expect(document.documentElement.style.getPropertyValue('--composer-safe-space')).toBe('408px');
      });
    } finally {
      root.unmount();
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      if (originalVisualViewport) {
        Object.defineProperty(window, 'visualViewport', originalVisualViewport);
      } else {
        delete window.visualViewport;
      }
      if (originalInnerHeight) {
        Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      }
      document.documentElement.style.removeProperty('--composer-height');
      document.documentElement.style.removeProperty('--composer-keyboard-offset');
      document.documentElement.style.removeProperty('--composer-safe-space');
    }
  });

  it('sends selected images and the web search setting with chat requests', async () => {
    const chatBodies = [];
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations: [] });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            id: 'image-chat',
            title: 'image chat',
            pinned: false,
            createdAt: '2026-06-12T04:22:00.000Z',
            updatedAt: '2026-06-12T04:22:00.000Z',
            messages: [],
          },
        });
      }
      if (path === '/.netlify/functions/chat-stream') {
        chatBodies.push(JSON.parse(options.body));
        return streamResponse([
          { type: 'meta', conversationId: 'image-chat', title: 'image chat', model: 'deepseek-v4-flash' },
          { type: 'content', delta: 'ok' },
          {
            type: 'done',
            conversation: {
              id: 'image-chat',
              title: 'image chat',
              pinned: false,
              createdAt: '2026-06-12T04:22:00.000Z',
              updatedAt: '2026-06-12T04:22:00.000Z',
              messages: [
                { id: 'u1', role: 'user', content: '看看图片', createdAt: '2026-06-12T04:22:00.000Z' },
                { id: 'a1', role: 'assistant', content: 'ok', createdAt: '2026-06-12T04:22:01.000Z' },
              ],
            },
            conversations: [],
          },
        ]);
      }
      return jsonResponse({});
    });

    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('rainbowseek');
    });

    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    const readerResult = 'data:image/png;base64,aW1hZ2U=';
    const originalFileReader = globalThis.FileReader;
    const originalImage = globalThis.Image;
    class MockFileReader {
      readAsDataURL() {
        this.result = readerResult;
        this.onload?.();
      }
    }
    class MockImage {
      set src(_value) {
        this.onerror?.();
      }
    }
    globalThis.FileReader = MockFileReader;
    globalThis.Image = MockImage;

    document.querySelector('button[aria-label="联网搜索"]').click();
    const fileInput = document.querySelector('input[type="file"]');
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(document.querySelector('.image-preview img')).toBeTruthy();
    });

    const textarea = document.querySelector('.composer textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, '看看图片');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(document.querySelector('.send-button').disabled).toBe(false);
    });
    document.querySelector('.send-button').click();

    await vi.waitFor(() => {
      expect(chatBodies).toHaveLength(1);
      expect(chatBodies[0]).toMatchObject({
        message: '看看图片',
        webSearchEnabled: true,
      });
      expect(chatBodies[0].images).toEqual([{ dataUrl: readerResult, name: 'photo.png' }]);
    });
    globalThis.FileReader = originalFileReader;
    globalThis.Image = originalImage;
    root.unmount();
  });

  it('shows an image recognition status while waiting for a pictured chat response', async () => {
    let streamController;
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations: [] });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            id: 'image-chat',
            title: 'image chat',
            pinned: false,
            createdAt: '2026-06-12T04:22:00.000Z',
            updatedAt: '2026-06-12T04:22:00.000Z',
            messages: [],
          },
        });
      }
      if (path === '/.netlify/functions/chat-stream') {
        const encoder = new TextEncoder();
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              streamController = { controller, encoder };
            },
          }),
        };
      }
      return jsonResponse({});
    });

    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('rainbowseek');
    });

    const originalFileReader = globalThis.FileReader;
    const originalImage = globalThis.Image;
    class MockFileReader {
      readAsDataURL() {
        this.result = 'data:image/png;base64,aW1hZ2U=';
        this.onload?.();
      }
    }
    class MockImage {
      set src(_value) {
        this.onerror?.();
      }
    }
    globalThis.FileReader = MockFileReader;
    globalThis.Image = MockImage;

    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]');
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(document.querySelector('.image-preview img')).toBeTruthy();
    });
    document.querySelector('.send-button').click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('图片识别中');
      expect(streamController).toBeTruthy();
    });

    streamController.controller.enqueue(streamController.encoder.encode(`${JSON.stringify({
      type: 'meta',
      conversationId: 'image-chat',
      title: 'image chat',
      model: 'deepseek-v4-flash',
    })}\n`));
    streamController.controller.enqueue(streamController.encoder.encode(`${JSON.stringify({ type: 'content', delta: 'ok' })}\n`));
    streamController.controller.enqueue(streamController.encoder.encode(`${JSON.stringify({
      type: 'done',
      conversation: {
        id: 'image-chat',
        title: 'image chat',
        pinned: false,
        createdAt: '2026-06-12T04:22:00.000Z',
        updatedAt: '2026-06-12T04:22:00.000Z',
        messages: [
          { id: 'u1', role: 'user', content: '请识别并回答图片内容。', createdAt: '2026-06-12T04:22:00.000Z' },
          { id: 'a1', role: 'assistant', content: 'ok', createdAt: '2026-06-12T04:22:01.000Z' },
        ],
      },
      conversations: [],
    })}\n`));
    streamController.controller.close();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('ok');
      expect(document.body.textContent).not.toContain('图片识别中');
    });

    globalThis.FileReader = originalFileReader;
    globalThis.Image = originalImage;
    root.unmount();
  });

  it('renders LaTeX formulas inside markdown messages', async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
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
                content: '\\[\\log_{10}(48^{48}) = 48\\log_{10}(48)\\]',
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
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();

    await vi.waitFor(() => {
      expect(document.querySelector('.katex')).toBeTruthy();
      expect(document.body.textContent).toContain('log');
    });
  });

  it('renders image recognition details and web search sources on assistant messages', async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
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
                content: 'answer',
                imageDescription: 'image detail text',
                webSearch: {
                  results: [{ title: 'Source A', url: 'https://example.com/a' }],
                },
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
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();

    await vi.waitFor(() => {
      expect(document.querySelector('.context-block')).toBeTruthy();
      expect(document.body.textContent).toContain('image detail text');
      expect(document.querySelector('.source-list a').href).toBe('https://example.com/a');
    });
  });

  it('sends uploaded text files with the chat request', async () => {
    const chatBodies = [];
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations: [] });
      }
      if (path === '/.netlify/functions/chat-stream') {
        chatBodies.push(JSON.parse(options.body));
        return streamResponse([
          { type: 'meta', conversationId: 'file-chat', title: 'file chat', model: 'deepseek-v4-flash' },
          { type: 'content', delta: 'ok' },
          {
            type: 'done',
            conversation: {
              id: 'file-chat',
              title: 'file chat',
              pinned: false,
              createdAt: '2026-06-12T04:22:00.000Z',
              updatedAt: '2026-06-12T04:22:00.000Z',
              messages: [
                { id: 'u1', role: 'user', content: 'read this', createdAt: '2026-06-12T04:22:00.000Z' },
                { id: 'a1', role: 'assistant', content: 'ok', createdAt: '2026-06-12T04:22:01.000Z' },
              ],
            },
            conversations: [],
          },
        ]);
      }
      return jsonResponse({});
    });

    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('rainbowseek');
    });

    const file = new File(['file body'], 'notes.txt', { type: 'text/plain' });
    const fileInput = document.querySelector('input[aria-label="上传文件"]');
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('notes.txt');
      expect(document.querySelector('.send-button').disabled).toBe(false);
    });
    document.querySelector('.send-button').click();

    await vi.waitFor(() => {
      expect(chatBodies).toHaveLength(1);
      expect(chatBodies[0].files).toEqual([{ name: 'notes.txt', content: 'file body' }]);
    });
    root.unmount();
  });

  it('aborts an in-flight chat request when stop generation is clicked', async () => {
    let chatSignal;
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations: [] });
      }
      if (path === '/.netlify/functions/chat-stream') {
        chatSignal = options.signal;
        return {
          ok: true,
          body: new ReadableStream({ start() {} }),
        };
      }
      return jsonResponse({});
    });

    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('rainbowseek');
    });

    const textarea = document.querySelector('.composer textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'stop me');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.send-button').click();

    await vi.waitFor(() => {
      expect(chatSignal).toBeTruthy();
      expect(document.querySelector('button[aria-label="停止生成"]')).toBeTruthy();
    });
    document.querySelector('button[aria-label="停止生成"]').click();

    await vi.waitFor(() => {
      expect(chatSignal.aborted).toBe(true);
    });
    root.unmount();
  });

  it('regenerates from the latest user message', async () => {
    const chatBodies = [];
    vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
      if (path === '/.netlify/functions/session') {
        return jsonResponse({ username: 'rainbow' });
      }
      if (String(path).startsWith('/.netlify/functions/conversations')) {
        return jsonResponse({ conversations });
      }
      if (String(path).startsWith('/.netlify/functions/conversation')) {
        return jsonResponse({
          conversation: {
            ...conversations[0],
            messages: [
              { id: 'u1', role: 'user', content: 'latest question', createdAt: '2026-06-12T04:20:00.000Z' },
              { id: 'a1', role: 'assistant', content: 'old answer', createdAt: '2026-06-12T04:20:01.000Z' },
            ],
          },
        });
      }
      if (path === '/.netlify/functions/chat-stream') {
        chatBodies.push(JSON.parse(options.body));
        return streamResponse([
          { type: 'meta', conversationId: 'old-chat', title: 'Reply in markdown ...', model: 'deepseek-v4-flash' },
          { type: 'content', delta: 'new answer' },
          {
            type: 'done',
            conversation: {
              id: 'old-chat',
              title: 'Reply in markdown ...',
              pinned: false,
              createdAt: '2026-06-12T04:20:00.000Z',
              updatedAt: '2026-06-12T04:22:00.000Z',
              messages: [
                { id: 'u1', role: 'user', content: 'latest question', createdAt: '2026-06-12T04:20:00.000Z' },
                { id: 'a1', role: 'assistant', content: 'new answer', createdAt: '2026-06-12T04:20:01.000Z' },
              ],
            },
            conversations: [],
          },
        ]);
      }
      return jsonResponse({});
    });

    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Reply in markdown ...');
    });
    document.querySelector('.conversation-main').click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('old answer');
    });
    document.querySelector('button[aria-label="重新生成"]').click();

    await vi.waitFor(() => {
      expect(chatBodies[0].message).toBe('latest question');
    });
    root.unmount();
  });
});
