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
});
