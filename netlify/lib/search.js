import { getEnvValue } from './auth.js';

const TAVILY_URL = 'https://api.tavily.com/search';

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
  return searchWeb(message, env);
}
