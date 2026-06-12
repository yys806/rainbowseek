import { createConversationService } from '../lib/storage.js';
import { handleError, json, methodNotAllowed, parseBody, requireAuth } from '../lib/http.js';

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
    if (!body.conversationId || typeof body.conversationId !== 'string') {
      return json(400, { error: 'Conversation id is required' });
    }
    if (!body.content || typeof body.content !== 'string') {
      return json(400, { error: 'Assistant content is required' });
    }

    const service = createConversationService(event);
    const assistant = {
      role: 'assistant',
      content: body.content,
      reasoning: body.reasoning || null,
      model: body.model,
      usage: null,
    };
    const updated = body.conversation
      ? await service.appendMessagesWithMetadata(body.conversation, [assistant])
      : await service.appendMessages(body.conversationId, [assistant]);

    return json(200, {
      conversation: updated,
      conversations: await service.listConversations(),
    });
  } catch (error) {
    return handleError(error);
  }
}
