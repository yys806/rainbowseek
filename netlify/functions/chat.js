import { callDeepSeek } from '../lib/deepseek.js';
import { createConversationService } from '../lib/storage.js';
import { handleError, json, methodNotAllowed, parseBody, requireAuth } from '../lib/http.js';

function titleFromMessage(message) {
  const normalized = message.trim().replace(/\s+/g, ' ');
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || '新的聊天';
}

export async function handler(event, context = {}) {
  if (event.httpMethod !== 'POST') {
    return methodNotAllowed();
  }

  const env = context.env ?? process.env;
  const { response, session } = requireAuth(event, env);
  if (response) {
    return response;
  }

  try {
    const body = parseBody(event);
    if (!body.message || typeof body.message !== 'string') {
      return json(400, { error: 'Message is required' });
    }

    const service = createConversationService(event);
    const conversation = body.conversationId
      ? await service.getConversation(body.conversationId)
      : await service.createConversation({ title: titleFromMessage(body.message) });

    await service.appendMessages(conversation.id, [{ role: 'user', content: body.message }]);
    const latest = await service.getConversation(conversation.id);
    const apiMessages = [
      { role: 'system', content: 'You are a warm, clear, and helpful assistant. Answer in the user language.' },
      ...latest.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ];

    const assistant = await callDeepSeek(apiMessages, env, { userId: session.username });
    const updated = await service.appendMessages(conversation.id, [assistant]);

    return json(200, {
      conversation: updated,
      conversations: await service.listConversations(),
      usage: assistant.usage,
    });
  } catch (error) {
    return handleError(error);
  }
}
