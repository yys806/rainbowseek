import { getEnvValue } from './auth.js';

const SILICONFLOW_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const VISION_MODEL = 'Qwen/Qwen3-VL-8B-Instruct';
const MAX_IMAGES = 4;
const MAX_DATA_URL_LENGTH = 8 * 1024 * 1024;

export function normalizeImages(images) {
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

export async function describeImages(images, question, env = process.env) {
  const normalizedImages = normalizeImages(images);
  if (normalizedImages.length === 0) return null;

  const apiKey = getEnvValue(env, 'SILICONFLOW_API_KEY');
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
              image_url: {
                url: image.dataUrl,
              },
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

  return String(content).trim();
}
