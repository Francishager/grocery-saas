import { advisorError } from './businessAdvisor.js';

const MAX_IMAGE = 8 * 1024 * 1024;
export function imageMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
async function limitedBytes(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('Image too large'); }
  const chunks = []; let length = 0;
  for await (const chunk of response.body) { length += chunk.length; if (length > limit) throw new Error('Image too large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

export async function generateAdvisorArtwork(prompt, { signal, fetchImpl = fetch, apiKey = process.env.NVIDIA_API_KEY } = {}) {
  if (!apiKey) throw advisorError(503, 'Artwork generation is not configured.', 'ARTWORK_UNAVAILABLE');
  const response = await fetchImpl('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev', {
    method: 'POST', signal, redirect: 'error', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ prompt: `${prompt.slice(0, 1200)}. Advertising illustration only. No writing, letters, numbers, logos, watermarks, identifiable real people or financial documents.`, mode: 'base', width: 1024, height: 1024, samples: 1, seed: 0, steps: 28, cfg_scale: 5 }),
  });
  if (!response.ok) { await response.body?.cancel(); throw advisorError(503, 'Artwork generation is temporarily unavailable. The text design is still available.', 'ARTWORK_UNAVAILABLE'); }
  const data = JSON.parse((await limitedBytes(response, MAX_IMAGE * 2)).toString('utf8'));
  const encoded = data?.artifacts?.[0]?.base64;
  if (typeof encoded !== 'string' || encoded.length > MAX_IMAGE * 1.4 || !/^[A-Za-z0-9+/=\r\n]+$/.test(encoded)) throw advisorError(502, 'The artwork response was incomplete.', 'ARTWORK_UNAVAILABLE');
  const image = Buffer.from(encoded, 'base64');
  const mime = imageMime(image);
  if (!mime || image.length > MAX_IMAGE) throw advisorError(502, 'The artwork format could not be read.', 'ARTWORK_UNAVAILABLE');
  return { image, imageMime: mime, imageSource: 'generated' };
}

export async function loadAdvisorProductImage(value, { signal, fetchImpl = fetch } = {}) {
  // Only fetch trusted stored media. User-supplied URLs and redirects cannot reach internal networks.
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.port || url.username || url.password) throw new Error('Unsupported stored image host');
  const response = await fetchImpl(url, { signal, redirect: 'error' });
  if (!response.ok) throw new Error('Stored image unavailable');
  const image = await limitedBytes(response, MAX_IMAGE);
  const mime = imageMime(image);
  if (!mime) throw new Error('Unsupported stored image');
  return { image, imageMime: mime, imageSource: 'product' };
}
