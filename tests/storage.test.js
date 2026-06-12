import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversationService } from '../netlify/lib/storage.js';

class MemoryStore {
  constructor() {
    this.data = new Map();
    this.getCalls = [];
  }

  async get(key, options) {
    this.getCalls.push({ key, options });
    return this.data.get(key) ?? null;
  }

  async getWithMetadata(key) {
    return { data: this.data.get(key) ?? null, metadata: null };
  }

  async setJSON(key, value) {
    this.data.set(key, value);
  }

  async delete(key) {
    this.data.delete(key);
  }
}

class StaleIndexStore extends MemoryStore {
  async get(key, options) {
    this.getCalls.push({ key, options });
    if (key === 'conversation-index') {
      return { conversations: [] };
    }
    return this.data.get(key) ?? null;
  }
}

class StaleConversationStore extends MemoryStore {
  async get(key, options) {
    this.getCalls.push({ key, options });
    if (key.startsWith('conversation-')) {
      return { messages: [] };
    }
    return this.data.get(key) ?? null;
  }
}

describe('conversation storage', () => {
  let service;

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-12T09:00:00.000Z'));
    service = createConversationService(new MemoryStore());
  });

  it('creates a conversation and stores messages', async () => {
    const conversation = await service.createConversation({ title: '初次聊天' });
    await service.appendMessages(conversation.id, [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好呀' },
    ]);

    const stored = await service.getConversation(conversation.id);

    expect(stored.title).toBe('初次聊天');
    expect(stored.messages).toHaveLength(2);
    expect(stored.messages[0].content).toBe('你好');
  });

  it('uses default blob reads so manual Netlify deploys do not require uncachedEdgeURL', async () => {
    const store = new MemoryStore();
    const localService = createConversationService(store);

    await localService.listConversations();

    expect(store.getCalls[0]).toEqual({
      key: 'conversation-index',
      options: { type: 'json' },
    });
  });

  it('can append messages after creating a conversation even when blob index reads are stale', async () => {
    const localService = createConversationService(new StaleIndexStore());

    const conversation = await localService.createConversation({ title: 'New chat' });
    const updated = await localService.appendMessages(conversation.id, [
      { role: 'user', content: 'hello' },
    ]);

    expect(updated.messages).toHaveLength(1);
    expect(await localService.listConversations()).toHaveLength(1);
  });

  it('preserves earlier messages when blob conversation reads are stale within the same request', async () => {
    const localService = createConversationService(new StaleConversationStore());

    const conversation = await localService.createConversation({ title: 'New chat' });
    await localService.appendMessages(conversation.id, [
      { role: 'user', content: 'hello' },
    ]);
    const updated = await localService.appendMessages(conversation.id, [
      { role: 'assistant', content: 'hi' },
    ]);

    expect(updated.messages.map((message) => message.content)).toEqual(['hello', 'hi']);
  });

  it('can append with metadata when another function cannot immediately read the index', async () => {
    const localService = createConversationService(new MemoryStore());
    const updated = await localService.appendMessagesWithMetadata(
      {
        id: 'edge-chat',
        title: 'Edge chat',
        pinned: false,
        createdAt: '2026-06-12T08:59:00.000Z',
        updatedAt: '2026-06-12T08:59:00.000Z',
      },
      [{ role: 'assistant', content: 'streamed' }],
    );

    expect(updated.title).toBe('Edge chat');
    expect(updated.messages[0].content).toBe('streamed');
    expect((await localService.listConversations())[0].id).toBe('edge-chat');
  });

  it('sorts pinned conversations before recently updated conversations', async () => {
    const first = await service.createConversation({ title: 'A' });
    vi.setSystemTime(new Date('2026-06-12T09:01:00.000Z'));
    const second = await service.createConversation({ title: 'B' });
    await service.setPinned(first.id, true);

    const list = await service.listConversations();

    expect(list.map((item) => item.id)).toEqual([first.id, second.id]);
  });

  it('renames and deletes conversations', async () => {
    const conversation = await service.createConversation({ title: '旧标题' });

    await service.renameConversation(conversation.id, '新标题');
    expect((await service.getConversation(conversation.id)).title).toBe('新标题');

    await service.deleteConversation(conversation.id);
    await expect(service.getConversation(conversation.id)).rejects.toThrow('Conversation not found');
    expect(await service.listConversations()).toEqual([]);
  });
});
