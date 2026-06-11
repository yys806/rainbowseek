const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

export async function callDeepSeek(messages, env = process.env, options = {}) {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const model = env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
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

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('DeepSeek returned an empty response');
  }

  return {
    role: 'assistant',
    content,
    model,
    usage: payload.usage ?? null,
  };
}
