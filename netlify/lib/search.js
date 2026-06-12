import { getEnvValue } from './auth.js';

const TAVILY_URL = 'https://api.tavily.com/search';

export async function planSearch(message, env = process.env) {
  const apiKey = getEnvValue(env, 'DEEPSEEK_API_KEY');
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'system',
          content: 'Decide whether answering the user needs fresh web search. Return only JSON: {"search":true|false,"query":"..."}',
        },
        { role: 'user', content: message },
      ],
      stream: false,
      max_tokens: 120,
      user: 'rainbow',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `DeepSeek search planner failed with ${response.status}`);
  }

  const content = payload?.choices?.[0]?.message?.content ?? '';
  const parsed = JSON.parse(String(content).replace(/```json|```/g, '').trim());
  return {
    search: Boolean(parsed.search),
    query: typeof parsed.query === 'string' ? parsed.query.trim() : '',
  };
}

export async function searchWeb(query, env = process.env) {
  const apiKey = getEnvValue(env, 'TAVILY_API_KEY');
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured');
  }
  if (!query || typeof query !== 'string') return null;

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

  const results = Array.isArray(payload.results) ? payload.results.slice(0, 5) : [];
  return {
    query,
    answer: payload.answer || '',
    results: results.map((result) => ({
      title: result.title || '',
      url: result.url || '',
      content: result.content || '',
    })),
  };
}

export async function maybeSearchWeb(message, enabled, env = process.env) {
  if (!enabled) return null;
  const plan = await planSearch(message, env);
  if (!plan.search || !plan.query) return null;
  return searchWeb(plan.query, env);
}
