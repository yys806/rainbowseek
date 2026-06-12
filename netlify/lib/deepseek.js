import { getEnvValue } from './auth.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

export function normalizeModel(model, env = process.env) {
  const candidate = typeof model === 'string' ? model : getEnvValue(env, 'DEEPSEEK_MODEL');
  return ALLOWED_MODELS.has(candidate) ? candidate : 'deepseek-v4-flash';
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
    content,
    model,
    reasoning: message.reasoning_content || message.reasoning || null,
    usage: payload.usage ?? null,
  };
}
