const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const COOKIE_NAME = 'deepseek_session';
const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

function getCookie(request, name) {
  const header = request.headers.get('cookie') ?? '';
  return header
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function normalizeModel(model) {
  return ALLOWED_MODELS.has(model) ? model : 'deepseek-v4-flash';
}

function streamEvent(type, payload = {}) {
  return `${JSON.stringify({ type, ...payload })}\n`;
}

function cleanAssistantText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function parseDeepSeekStreamChunk(text) {
  const events = [];
  for (const line of text.split('\n')) {
    const normalized = line.trim();
    if (!normalized.startsWith('data:')) continue;
    const value = normalized.slice(5).trim();
    if (!value || value === '[DONE]') continue;
    try {
      events.push(JSON.parse(value));
    } catch {
      // Ignore partial or malformed SSE lines.
    }
  }
  return events;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export default async function handler(request, context) {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!getCookie(request, COOKIE_NAME)) {
    return json(401, { error: 'Unauthorized' });
  }

  const apiKey = Netlify.env.get('DEEPSEEK_API_KEY');
  if (!apiKey) {
    return json(500, { error: 'DEEPSEEK_API_KEY is not configured' });
  }

  const body = await request.json().catch(() => ({}));
  if (!body.message || typeof body.message !== 'string') {
    return json(400, { error: 'Message is required' });
  }

  const model = normalizeModel(body.model);
  const prepareResponse = await fetch(new URL('/.netlify/functions/chat-prepare', request.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      conversationId: body.conversationId,
      message: body.message,
      model,
    }),
  });
  const prepared = await prepareResponse.json().catch(() => ({}));
  if (!prepareResponse.ok) {
    return json(prepareResponse.status, { error: prepared.error || 'Failed to prepare conversation' });
  }

  const deepseekResponse = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: prepared.apiMessages,
      stream: true,
      user: 'rainbow',
    }),
  });

  if (!deepseekResponse.ok) {
    const payload = await deepseekResponse.json().catch(() => ({}));
    return json(deepseekResponse.status, {
      error: payload?.error?.message || `DeepSeek API failed with ${deepseekResponse.status}`,
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let content = '';
  let reasoning = '';
  let sentContent = '';
  let sentReasoning = '';
  let buffer = '';

  const readable = new ReadableStream({
    async start(controller) {
      function send(type, payload) {
        controller.enqueue(encoder.encode(streamEvent(type, payload)));
      }

      async function persist() {
        await fetch(new URL('/.netlify/functions/chat-complete', request.url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: request.headers.get('cookie') ?? '',
          },
          body: JSON.stringify({
            conversationId: prepared.conversation.id,
            conversation: prepared.conversation,
            content: cleanAssistantText(content),
            reasoning: cleanAssistantText(reasoning),
            model,
          }),
        }).then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error || 'Failed to save streamed answer');
          }
          send('done', payload);
        });
      }

      try {
        send('meta', {
          conversationId: prepared.conversation.id,
          title: prepared.conversation.title,
          model,
        });

        const reader = deepseekResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const event of parts.flatMap(parseDeepSeekStreamChunk)) {
            const delta = event?.choices?.[0]?.delta ?? {};
            const reasoningDelta = delta.reasoning_content ?? delta.reasoning ?? '';
            const contentDelta = delta.content ?? '';
            if (reasoningDelta) {
              reasoning += reasoningDelta;
              const cleanedReasoning = cleanAssistantText(reasoning);
              const nextDelta = cleanedReasoning.slice(sentReasoning.length);
              sentReasoning = cleanedReasoning;
              if (nextDelta) send('reasoning', { delta: nextDelta });
            }
            if (contentDelta) {
              content += contentDelta;
              const cleanedContent = cleanAssistantText(content);
              const nextDelta = cleanedContent.slice(sentContent.length);
              sentContent = cleanedContent;
              if (nextDelta) send('content', { delta: nextDelta });
            }
          }
        }

        buffer += decoder.decode();
        for (const event of parseDeepSeekStreamChunk(buffer)) {
          const delta = event?.choices?.[0]?.delta ?? {};
          const reasoningDelta = delta.reasoning_content ?? delta.reasoning ?? '';
          const contentDelta = delta.content ?? '';
          if (reasoningDelta) {
            reasoning += reasoningDelta;
            const cleanedReasoning = cleanAssistantText(reasoning);
            const nextDelta = cleanedReasoning.slice(sentReasoning.length);
            sentReasoning = cleanedReasoning;
            if (nextDelta) send('reasoning', { delta: nextDelta });
          }
          if (contentDelta) {
            content += contentDelta;
            const cleanedContent = cleanAssistantText(content);
            const nextDelta = cleanedContent.slice(sentContent.length);
            sentContent = cleanedContent;
            if (nextDelta) send('content', { delta: nextDelta });
          }
        }

        if (!content) {
          throw new Error('DeepSeek returned an empty response');
        }
        await persist();
      } catch (error) {
        send('error', { error: error.message || 'Unexpected error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export const config = {
  path: '/.netlify/functions/chat-stream',
};
