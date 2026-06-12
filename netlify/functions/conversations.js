import { createConversationService } from '../lib/storage.js';
import { handleError, json, methodNotAllowed, parseBody, requireAuth } from '../lib/http.js';

export async function handler(event, context = {}) {
  const { response } = requireAuth(event, context.env ?? process.env);
  if (response) {
    return response;
  }

  const service = createConversationService(event);

  try {
    if (event.httpMethod === 'GET') {
      return json(200, { conversations: await service.listConversations() });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const conversation = await service.createConversation({ title: body.title });
      return json(201, { conversation });
    }

    return methodNotAllowed();
  } catch (error) {
    return handleError(error);
  }
}
