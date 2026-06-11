import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversationService } from '../netlify/lib/storage.js';

class MemoryStore {
  constructor() {
    this.data = new Map();
  }

  async get(key) {
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
