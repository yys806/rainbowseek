// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import App from '../src/App.jsx';

describe('App shell', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'Unauthorized' }),
      })),
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
      expect(document.body.textContent).toContain('专门为彩虹开发的 DeepSeek');
    });
  });
});
