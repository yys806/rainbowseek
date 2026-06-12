export const SYSTEM_PROMPT = [
  'Your name is rainbowseek.',
  'Use the previous conversation only to understand context and references.',
  'Answer only the latest user message. Do not answer earlier user questions again unless the latest user message explicitly asks you to revisit them.',
  'Answer in the user language.',
].join(' ');

function formatWebSearch(webSearch) {
  if (!webSearch) return '';
  const lines = [
    '联网搜索结果：',
    webSearch.query ? `搜索词：${webSearch.query}` : '',
    webSearch.answer ? `摘要：${webSearch.answer}` : '',
    ...(Array.isArray(webSearch.results) ? webSearch.results : []).map((result, index) => [
      `${index + 1}. ${result.title || 'Untitled'}`,
      result.url ? `URL: ${result.url}` : '',
      result.content ? `内容：${result.content}` : '',
    ].filter(Boolean).join('\n')),
  ].filter(Boolean);
  return lines.join('\n');
}

function buildLatestUserContent(content, options = {}) {
  const sections = [
    'Current user message to answer, and the only question you should answer now:',
    content,
  ];

  if (options.imageDescription) {
    sections.push(`图片识别结果：\n${options.imageDescription}`);
  }

  const webSearch = formatWebSearch(options.webSearch);
  if (webSearch) {
    sections.push(webSearch);
  }

  return sections.join('\n\n');
}

export function buildApiMessages(messages, options = {}) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const latestUserIndex = normalizedMessages.findLastIndex((message) => message.role === 'user');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...normalizedMessages.map((message, index) => ({
      role: message.role,
      content: index === latestUserIndex
        ? buildLatestUserContent(message.content, options)
        : message.content,
    })),
  ];
}
