import { createConversationService } from '../lib/storage.js';
import { handleError, json, methodNotAllowed, parseBody, requireAuth } from '../lib/http.js';
import { buildApiMessages } from '../lib/prompt.js';

function titleFromMessage(message) {
  const normalized = message.trim().replace(/\s+/g, ' ');
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || '新的聊天';
}

export async function handler(event, context = {}) {
  if (event.httpMethod !== 'POST') {
    return methodNotAllowed();
  }

  const env = context.env ?? process.env;
  const { response } = requireAuth(event, env);
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

    return json(200, {
      conversation: {
        id: latest.id,
        title: latest.title,
        pinned: latest.pinned,
        createdAt: latest.createdAt,
        updatedAt: latest.updatedAt,
        messages: latest.messages,
      },
      apiMessages: buildApiMessages(latest.messages, {
        imageDescription: body.imageDescription,
        webSearch: body.webSearch,
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}
