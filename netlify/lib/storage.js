import { randomUUID } from 'node:crypto';
import { connectLambda, getStore } from '@netlify/blobs';

const INDEX_KEY = 'conversation-index';

function nowIso() {
  return new Date().toISOString();
}

function conversationKey(id) {
  return `conversation-${id}`;
}

function sortConversations(conversations) {
  return [...conversations].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

async function readJSON(store, key, fallback) {
  const value = await store.get(key, { type: 'json' });
  return value ?? fallback;
}

export function createConversationService(storeOrEvent = getStore('deepseek-gui')) {
  const store = typeof storeOrEvent?.httpMethod === 'string'
    ? (() => {
        connectLambda(storeOrEvent);
        return getStore('deepseek-gui');
      })()
    : storeOrEvent;
  let cachedIndex = null;
  const cachedConversations = new Map();

  async function readIndex() {
    if (cachedIndex) {
      return {
        conversations: cachedIndex.conversations.map((item) => ({ ...item })),
      };
    }

    const index = await readJSON(store, INDEX_KEY, { conversations: [] });
    cachedIndex = {
      conversations: Array.isArray(index.conversations) ? index.conversations : [],
    };
    return {
      conversations: cachedIndex.conversations.map((item) => ({ ...item })),
    };
  }

  async function writeIndex(index) {
    cachedIndex = {
      conversations: sortConversations(index.conversations),
    };
    await store.setJSON(INDEX_KEY, cachedIndex);
  }

  async function readConversationBody(id) {
    if (cachedConversations.has(id)) {
      return {
        messages: cachedConversations.get(id).messages.map((item) => ({ ...item })),
      };
    }

    const body = await readJSON(store, conversationKey(id), { messages: [] });
    const normalized = {
      messages: Array.isArray(body.messages) ? body.messages : [],
    };
    cachedConversations.set(id, normalized);
    return {
      messages: normalized.messages.map((item) => ({ ...item })),
    };
  }

  async function writeConversationBody(id, body) {
    const normalized = {
      messages: Array.isArray(body.messages) ? body.messages : [],
    };
    cachedConversations.set(id, normalized);
    await store.setJSON(conversationKey(id), normalized);
  }

  async function getMetadata(id) {
    const index = await readIndex();
    return index.conversations.find((item) => item.id === id) ?? null;
  }

  return {
    async listConversations() {
      const index = await readIndex();
      return sortConversations(index.conversations);
    },

    async createConversation({ title = '新的聊天' } = {}) {
      const timestamp = nowIso();
      const metadata = {
        id: randomUUID(),
        title: title.trim() || '新的聊天',
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const index = await readIndex();
      index.conversations.push(metadata);
      await writeConversationBody(metadata.id, { messages: [] });
      await writeIndex(index);
      return metadata;
    },

    async getConversation(id) {
      const metadata = await getMetadata(id);
      if (!metadata) {
        throw new Error('Conversation not found');
      }
      const body = await readConversationBody(id);
      return {
        ...metadata,
        messages: body.messages,
      };
    },

    async appendMessages(id, messages) {
      const index = await readIndex();
      const metadata = index.conversations.find((item) => item.id === id);
      if (!metadata) {
        throw new Error('Conversation not found');
      }

      const conversation = await readConversationBody(id);
      const timestamp = nowIso();
      const normalizedMessages = messages.map((message) => ({
        id: message.id ?? randomUUID(),
        role: message.role,
        content: message.content,
        createdAt: message.createdAt ?? timestamp,
      }));

      await writeConversationBody(id, {
        messages: [...(conversation.messages ?? []), ...normalizedMessages],
      });
      metadata.updatedAt = timestamp;
      await writeIndex(index);
      return this.getConversation(id);
    },

    async renameConversation(id, title) {
      const index = await readIndex();
      const metadata = index.conversations.find((item) => item.id === id);
      if (!metadata) {
        throw new Error('Conversation not found');
      }
      metadata.title = title.trim() || metadata.title;
      metadata.updatedAt = nowIso();
      await writeIndex(index);
      return metadata;
    },

    async setPinned(id, pinned) {
      const index = await readIndex();
      const metadata = index.conversations.find((item) => item.id === id);
      if (!metadata) {
        throw new Error('Conversation not found');
      }
      metadata.pinned = Boolean(pinned);
      metadata.updatedAt = nowIso();
      await writeIndex(index);
      return metadata;
    },

    async deleteConversation(id) {
      const index = await readIndex();
      const next = index.conversations.filter((item) => item.id !== id);
      if (next.length === index.conversations.length) {
        throw new Error('Conversation not found');
      }
      await store.delete(conversationKey(id));
      await writeIndex({ conversations: next });
    },
  };
}
