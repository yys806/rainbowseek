export const SYSTEM_PROMPT = [
  'You are rainbowseek, a warm, clear, and helpful assistant.',
  'Use the previous conversation only to understand context and references.',
  'Answer only the latest user message. Do not answer earlier user questions again unless the latest user message explicitly asks you to revisit them.',
  'Answer in the user language.',
  'Keep the final answer compact. Do not insert blank lines between paragraphs or list items.',
].join(' ');

export function buildApiMessages(messages) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const latestUserIndex = normalizedMessages.findLastIndex((message) => message.role === 'user');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...normalizedMessages.map((message, index) => ({
      role: message.role,
      content: index === latestUserIndex
        ? `Current user message to answer, and the only question you should answer now:\n${message.content}`
        : message.content,
    })),
  ];
}
