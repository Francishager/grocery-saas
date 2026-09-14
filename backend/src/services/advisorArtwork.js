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
  const timedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
  const response = await fetchImpl(url, { signal: timedSignal, redirect: 'error' });
  if (!response.ok) throw new Error('Stored image unavailable');
  const image = await limitedBytes(response, MAX_IMAGE);
  const mime = imageMime(image);
  if (!mime) throw new Error('Unsupported stored image');
  return { image, imageMime: mime, imageSource: 'product' };
}

// Only public catalogue topics leave the system, never business names, contacts or the raw brief.
export const advisorPhotoTopics = {
  rice: ['rice grains', /\brice\b/i], maize: ['maize corn', /\b(maize|corn)\b/i], beans: ['beans dry', /\bbeans?\b/i],
  fruit: ['fresh fruit', /\b(fruit|apple|banana|mango|orange|pineapple)s?\b/i], vegetables: ['fresh vegetables', /\b(vegetable|tomato|onion|cabbage|carrot)s?\b/i],
  coffee: ['coffee beans', /\bcoffee\b/i], tea: ['tea leaves', /\btea\b/i], bakery: ['bread bakery', /\b(bread|bakery|cake|pastry)\b/i],
  dairy: ['milk cheese', /\b(milk|dairy|cheese|yogurt)\b/i], eggs: ['chicken eggs', /\beggs?\b/i], meat: ['butcher meat', /\b(meat|beef|pork|butcher)\b/i],
  fish: ['fresh fish', /\b(fish|seafood)\b/i], flour: ['flour baking', /\bflour\b/i], sugar: ['sugar crystals', /\bsugar\b/i],
  oil: ['cooking oil', /\b(cooking oil|sunflower oil|olive oil)\b/i], cosmetics: ['cosmetics skincare', /\b(cosmetic|skincare|beauty|makeup|perfume)s?\b/i],
  soap: ['soap bars', /\b(soap|detergent|cleaning)s?\b/i], clothing: ['clothing fashion', /\b(clothing|clothes|fashion|shirt|dress|boutique)s?\b/i],
  shoes: ['shoes footwear', /\b(shoe|footwear|sneaker)s?\b/i], electronics: ['electronic devices', /\b(electronic|computer|laptop|phone|television)s?\b/i],
  furniture: ['furniture interior', /\b(furniture|sofa|chair|table)s?\b/i], hardware: ['hand tools', /\b(hardware|tools|plumbing)\b/i],
  stationery: ['stationery notebooks', /\b(stationery|notebook|pencil)s?\b/i], agriculture: ['agriculture farm', /\b(agriculture|farming|farm|seed|fertilizer)s?\b/i],
  restaurant: ['restaurant food', /\b(restaurant|catering|meal|cafe)s?\b/i], salon: ['hair salon', /\b(salon|hair|barber)\b/i],
  fitness: ['fitness gym', /\b(fitness|gym|sport|exercise)s?\b/i], transport: ['delivery truck', /\b(transport|delivery|logistics|truck)s?\b/i],
  construction: ['construction building', /\b(construction|building|cement|brick)s?\b/i], office: ['office workspace', /\b(office|consulting|accounting|business services)\b/i],
  grocery: ['grocery produce', /\b(grocery|groceries|supermarket|food store)\b/i],
};

export function advisorPhotoTopic({ product, brief, businessType, photoTopic } = {}) {
  const match = value => Object.keys(advisorPhotoTopics).find(key => advisorPhotoTopics[key][1].test(String(value || '')));
  return match(product?.name) || (typeof photoTopic === 'string' && Object.hasOwn(advisorPhotoTopics, photoTopic) ? photoTopic : null) || match(brief) || match(businessType) || null;
}

const publicImageUrl = value => {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname) && url.pathname.startsWith('/wikipedia/commons/') && !url.port && !url.username && !url.password) return url;
  } catch { /* Ignore unsupported image locations. */ }
  return null;
};

export async function loadAdvisorExternalImage(topic, { signal, fetchImpl = fetch } = {}) {
  if (typeof topic !== 'string' || !Object.hasOwn(advisorPhotoTopics, topic)) return null;
  const timedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  const options = { signal: timedSignal, redirect: 'error', headers: { 'User-Agent': 'JibuSalesAdvisor/1.0 (marketing image search)', Accept: 'application/json' } };
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '16',
    gsrsearch: `${advisorPhotoTopics[topic][0]} filetype:bitmap incategory:"CC-Zero" -drawing -illustration -logo -diagram`,
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1280', iiextmetadatalanguage: 'en',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Restrictions|Artist|ImageDescription|Categories',
  }).toString();
  const response = await fetchImpl(url, options);
  if (!response.ok) { await response.body?.cancel(); throw new Error('External photos unavailable'); }
  const data = JSON.parse((await limitedBytes(response, 1024 * 1024)).toString('utf8'));
  const candidates = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  let attempts = 0;
  for (const page of candidates) {
    const info = page.imageinfo?.[0], metadata = info?.extmetadata;
    const license = String(metadata?.LicenseShortName?.value || '');
    const location = publicImageUrl(info?.thumburl || info?.url);
    if (!location || !/^CC0(?: 1\.0)?$/i.test(license) || metadata?.Restrictions?.value ||
        !['image/jpeg', 'image/webp'].includes(info.mime) || !(Number(info.width) >= 800 && Number(info.height) >= 500) ||
        /illustration|drawing|diagram|logo|AI.generated|generated.with.AI|painting|screenshot/i.test(`${page.title} ${metadata?.Categories?.value || ''} ${metadata?.ImageDescription?.value || ''}`)) continue;
    if (++attempts > 3) break;
    try {
      const download = await fetchImpl(location, { ...options, headers: { ...options.headers, Accept: 'image/jpeg,image/webp' } });
      if (!download.ok) { await download.body?.cancel(); continue; }
      const image = await limitedBytes(download, MAX_IMAGE), mime = imageMime(image);
      if (!['image/jpeg', 'image/webp'].includes(mime)) continue;
      const title = String(page.title || '').replace(/^File:/, '').slice(0, 220);
      return { image, imageMime: mime, imageSource: 'external', externalPhoto: {
        title, sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title))}`,
        creator: String(metadata?.Artist?.value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
        license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', retrievedAt: new Date().toISOString(),
      } };
    } catch (error) { if (timedSignal.aborted) throw error; }
  }
  return null;
}
