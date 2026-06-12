import { createConversationService } from '../lib/storage.js';
import { handleError, json, methodNotAllowed, parseBody, requireAuth } from '../lib/http.js';

export async function handler(event, context = {}) {
  const { response } = requireAuth(event, context.env ?? process.env);
  if (response) {
    return response;
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return json(400, { error: 'Conversation id is required' });
  }

  const service = createConversationService(event);

  try {
    if (event.httpMethod === 'GET') {
      return json(200, { conversation: await service.getConversation(id) });
    }

    if (event.httpMethod === 'PATCH') {
      const body = parseBody(event);
      if (typeof body.title === 'string') {
        await service.renameConversation(id, body.title);
      }
      if (typeof body.pinned === 'boolean') {
        await service.setPinned(id, body.pinned);
      }
      return json(200, { conversation: await service.getConversation(id) });
    }

    if (event.httpMethod === 'DELETE') {
      await service.deleteConversation(id);
      return json(200, { ok: true });
    }

    return methodNotAllowed();
  } catch (error) {
    return handleError(error);
  }
}
