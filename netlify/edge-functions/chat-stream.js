const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const SILICONFLOW_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const TAVILY_URL = 'https://api.tavily.com/search';
const COOKIE_NAME = 'deepseek_session';
const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
const VISION_MODEL = 'Qwen/Qwen3-VL-8B-Instruct';
const MAX_IMAGES = 4;
const MAX_DATA_URL_LENGTH = 8 * 1024 * 1024;
const MAX_FILES = 4;
const MAX_FILE_CONTENT_LENGTH = 12000;

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

function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image) => {
      if (!image || typeof image.dataUrl !== 'string') return false;
      if (!image.dataUrl.startsWith('data:image/')) return false;
      return image.dataUrl.length <= MAX_DATA_URL_LENGTH;
    })
    .slice(0, MAX_IMAGES)
    .map((image) => ({
      dataUrl: image.dataUrl,
      name: typeof image.name === 'string' ? image.name.slice(0, 120) : 'image',
    }));
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .filter((file) => file && typeof file.name === 'string' && typeof file.content === 'string')
    .slice(0, MAX_FILES)
    .map((file) => ({
      name: file.name.slice(0, 120),
      content: file.content.slice(0, MAX_FILE_CONTENT_LENGTH),
    }));
}

function streamEvent(type, payload = {}) {
  return `${JSON.stringify({ type, ...payload })}\n`;
}

function cleanAssistantText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
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

async function describeImages(images, question) {
  const normalizedImages = normalizeImages(images);
  if (normalizedImages.length === 0) return null;

  const apiKey = Netlify.env.get('SILICONFLOW_API_KEY');
  if (!apiKey) {
    throw new Error('SILICONFLOW_API_KEY is not configured');
  }

  const response = await fetch(SILICONFLOW_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                '请仔细识别这些图片，输出客观、完整的图片内容描述。',
                '如果图片里有文字、公式、表格、代码、截图界面，请尽量逐项转写。',
                `用户接下来要问的问题是：${question || '请描述图片'}`,
              ].join('\n'),
            },
            ...normalizedImages.map((image) => ({
              type: 'image_url',
              image_url: { url: image.dataUrl },
            })),
          ],
        },
      ],
      max_tokens: 1200,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `SiliconFlow vision API failed with ${response.status}`);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('SiliconFlow vision API returned an empty description');
  }
  return cleanAssistantText(content);
}

async function searchWeb(query) {
  const apiKey = Netlify.env.get('TAVILY_API_KEY');
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured');
  }

  const response = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      search_depth: 'advanced',
      max_results: 5,
      include_answer: true,
      include_raw_content: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Tavily search failed with ${response.status}`);
  }

  return {
    query,
    answer: payload.answer || '',
    results: (Array.isArray(payload.results) ? payload.results : []).slice(0, 5).map((result) => ({
      title: result.title || '',
      url: result.url || '',
      content: result.content || '',
    })),
  };
}

async function maybeSearchWeb(message, enabled) {
  if (!enabled) return null;
  return searchWeb(message);
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
  const files = normalizeFiles(body.files);
  let imageDescription = null;
  let webSearch = null;
  try {
    imageDescription = await describeImages(body.images, body.message);
    webSearch = await maybeSearchWeb(body.message, Boolean(body.webSearchEnabled));
  } catch (error) {
    return json(502, { error: error.message || 'Failed to prepare visual/search context' });
  }

  const prepareResponse = await fetch(new URL('/.netlify/functions/chat-prepare', request.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      conversationId: body.conversationId,
      files,
      message: body.message,
      model,
      imageDescription,
      webSearch,
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
            imageDescription,
            webSearch,
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
