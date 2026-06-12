import { getEnvValue } from './auth.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

export function normalizeModel(model, env = process.env) {
  const candidate = typeof model === 'string' ? model : getEnvValue(env, 'DEEPSEEK_MODEL');
  return ALLOWED_MODELS.has(candidate) ? candidate : 'deepseek-v4-flash';
}

export function cleanAssistantText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function callDeepSeek(messages, env = process.env, options = {}) {
  const apiKey = getEnvValue(env, 'DEEPSEEK_API_KEY');
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const model = normalizeModel(options.model, env);
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      user: options.userId || 'rainbow',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `DeepSeek API failed with ${response.status}`;
    throw new Error(detail);
  }

  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (!content) {
    throw new Error('DeepSeek returned an empty response');
  }

  return {
    role: 'assistant',
    content: cleanAssistantText(content),
    model,
    reasoning: message.reasoning_content || message.reasoning
      ? cleanAssistantText(message.reasoning_content || message.reasoning)
      : null,
    usage: payload.usage ?? null,
  };
}

function parseDeepSeekStreamChunk(text) {
  const events = [];
  for (const line of text.split('\n')) {
    const normalized = line.trim();
    if (!normalized.startsWith('data:')) {
      continue;
    }

    const value = normalized.slice(5).trim();
    if (!value || value === '[DONE]') {
      continue;
    }

    try {
      events.push(JSON.parse(value));
    } catch {
      // Ignore partial or non-JSON server-sent event lines.
    }
  }
  return events;
}

export async function streamDeepSeek(messages, env = process.env, options = {}) {
  const apiKey = getEnvValue(env, 'DEEPSEEK_API_KEY');
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const model = normalizeModel(options.model, env);
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      user: options.userId || 'rainbow',
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.error?.message || `DeepSeek API failed with ${response.status}`;
    throw new Error(detail);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const event of parts.flatMap(parseDeepSeekStreamChunk)) {
      const delta = event?.choices?.[0]?.delta ?? {};
      const contentDelta = delta.content ?? '';
      const reasoningDelta = delta.reasoning_content ?? delta.reasoning ?? '';

      if (reasoningDelta) {
        reasoning += reasoningDelta;
        await options.onReasoning?.(reasoningDelta);
      }
      if (contentDelta) {
        content += contentDelta;
        await options.onContent?.(contentDelta);
      }
    }
  }

  buffer += decoder.decode();
  for (const event of parseDeepSeekStreamChunk(buffer)) {
    const delta = event?.choices?.[0]?.delta ?? {};
    const contentDelta = delta.content ?? '';
    const reasoningDelta = delta.reasoning_content ?? delta.reasoning ?? '';

    if (reasoningDelta) {
      reasoning += reasoningDelta;
      await options.onReasoning?.(reasoningDelta);
    }
    if (contentDelta) {
      content += contentDelta;
      await options.onContent?.(contentDelta);
    }
  }

  if (!content) {
    throw new Error('DeepSeek returned an empty response');
  }

  return {
    role: 'assistant',
    content: cleanAssistantText(content),
    model,
    reasoning: reasoning ? cleanAssistantText(reasoning) : null,
    usage: null,
  };
}
