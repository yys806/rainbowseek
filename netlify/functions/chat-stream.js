import { stream } from '@netlify/functions';
import { streamDeepSeek } from '../lib/deepseek.js';
import { createConversationService } from '../lib/storage.js';
import { json, methodNotAllowed, parseBody, requireAuth } from '../lib/http.js';

function titleFromMessage(message) {
  const normalized = message.trim().replace(/\s+/g, ' ');
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || '新的聊天';
}

function streamEvent(type, payload = {}) {
  return `${JSON.stringify({ type, ...payload })}\n`;
}

async function prepareConversation(event, session, env) {
  const body = parseBody(event);
  if (!body.message || typeof body.message !== 'string') {
    return { response: json(400, { error: 'Message is required' }) };
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

  return {
    body,
    conversation,
    env,
    service,
    session,
    apiMessages,
  };
}

export const handler = stream(async (event, context = {}) => {
  if (event.httpMethod !== 'POST') {
    return methodNotAllowed();
  }

  const env = context.env ?? process.env;
  const { response, session } = requireAuth(event, env);
  if (response) {
    return response;
  }

  let prepared;
  try {
    prepared = await prepareConversation(event, session, env);
  } catch (error) {
    const status = String(error?.message ?? '').includes('not found') ? 404 : 500;
    return json(status, { error: error.message || 'Unexpected error' });
  }

  if (prepared.response) {
    return prepared.response;
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      function send(type, payload) {
        controller.enqueue(encoder.encode(streamEvent(type, payload)));
      }

      try {
        send('meta', {
          conversationId: prepared.conversation.id,
          title: prepared.conversation.title,
          model: prepared.body.model,
        });

        const assistant = await streamDeepSeek(prepared.apiMessages, prepared.env, {
          userId: prepared.session.username,
          model: prepared.body.model,
          onContent: (delta) => send('content', { delta }),
          onReasoning: (delta) => send('reasoning', { delta }),
        });
        const updated = await prepared.service.appendMessages(prepared.conversation.id, [assistant]);

        send('done', {
          conversation: updated,
          conversations: await prepared.service.listConversations(),
        });
      } catch (error) {
        send('error', { error: error.message || 'Unexpected error' });
      } finally {
        controller.close();
      }
    },
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
    body: readable,
  };
});
