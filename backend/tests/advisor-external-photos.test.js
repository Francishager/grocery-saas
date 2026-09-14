import test from 'node:test';
import assert from 'node:assert/strict';
import { advisorPhotoTopic, loadAdvisorExternalImage } from '../src/services/advisorArtwork.js';
import { buildArtifactData, validateArtifactInput } from '../src/services/advisorArtifacts.js';

const bytes = Buffer.from([255, 216, 255, 0, 1, 2]);
const publicPhoto = (changes = {}) => ({ title: 'File:Rice grains.jpg', index: 1, imageinfo: [{
  width: 1600, height: 1200, mime: 'image/jpeg', thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Rice.jpg/1280px-Rice.jpg',
  extmetadata: { LicenseShortName: { value: 'CC0' }, Restrictions: { value: '' }, Artist: { value: '<a>Photographer</a>' } }, ...changes,
}] });
const response = photo => new Response(JSON.stringify({ query: { pages: { 1: photo } } }));

test('external image search uses public keywords and saves raster bytes and source details', async () => {
  const topic = advisorPhotoTopic({ product: { name: 'Pink rice' }, brief: 'Customer Jane phone 0750000000 owes 9000', photoTopic: 'https://private.example' });
  assert.equal(topic, 'rice');
  const result = await loadAdvisorExternalImage(topic, { fetchImpl: async (value, options) => {
    const url = new URL(value); assert.equal(options.redirect, 'error');
    if (url.hostname === 'commons.wikimedia.org') {
      assert.equal(url.searchParams.get('gsrsearch'), 'rice grains filetype:bitmap incategory:"CC-Zero" -drawing -illustration -logo -diagram');
      return response(publicPhoto());
    }
    assert.equal(url.hostname, 'thumb.wikimedia.org'); return new Response(bytes);
  } });
  assert.deepEqual(result.image, bytes); assert.equal(result.imageMime, 'image/jpeg'); assert.equal(result.imageSource, 'external');
  assert.equal(result.externalPhoto.license, 'CC0 1.0'); assert.equal(result.externalPhoto.creator, 'Photographer');
  assert.equal(result.externalPhoto.sourceUrl, 'https://commons.wikimedia.org/wiki/File%3ARice%20grains.jpg');
});

test('unsafe URLs, unknown licenses and unsuitable formats or dimensions are never downloaded', async () => {
  for (const changes of [
    { thumburl: 'https://127.0.0.1/private' }, { thumburl: 'http://thumb.wikimedia.org/wikipedia/commons/photo.jpg' },
    { thumburl: 'https://thumb.wikimedia.org.attacker.example/wikipedia/commons/photo.jpg' },
    { thumburl: 'https://secret@upload.wikimedia.org/wikipedia/commons/photo.jpg' },
    { extmetadata: { LicenseShortName: { value: 'CC BY-NC' } } }, { extmetadata: {} }, { width: 200 }, { width: undefined }, { mime: 'image/svg+xml' },
    { extmetadata: { LicenseShortName: { value: 'CC0' }, Restrictions: { value: 'trademarked' } } },
  ]) {
    let calls = 0;
    assert.equal(await loadAdvisorExternalImage('rice', { fetchImpl: async () => { calls++; return response(publicPhoto(changes)); } }), null);
    assert.equal(calls, 1);
  }
  for (const topic of ['unlisted topic', null, {}]) assert.equal(await loadAdvisorExternalImage(topic, { fetchImpl: () => { throw new Error('Must not fetch'); } }), null);
});

test('redirects, invalid bytes and oversized downloads fail safely', async () => {
  for (const kind of ['redirect', 'html', 'oversize']) {
    let calls = 0;
    assert.equal(await loadAdvisorExternalImage('rice', { fetchImpl: async (_, options) => {
      calls++; assert.equal(options.redirect, 'error');
      if (calls === 1) return response(publicPhoto());
      if (kind === 'redirect') return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/' } });
      return new Response('<svg>bad</svg>', { headers: kind === 'oversize' ? { 'content-length': String(9 * 1024 * 1024) } : {} });
    } }), null);
    assert.equal(calls, 2);
  }
});

test('automatic mode falls back from absent/broken business photos, while explicit photo preferences are respected', async () => {
  const req = { user: { id: 'owner', tenantId: 'test', role: 'owner', permissions: ['*'] }, tenantFeatures: new Set(['dashboard', 'inventory']), query: {} };
  const copy = { headline: 'Rice for family meals', body: 'Find your next favourite in store.', cta: 'Visit today', caption: 'Shop rice for your next family meal.', photoTopic: 'rice' };
  for (const [mode, stored, broken, shouldSearch] of [['auto', null, false, true], ['auto', 'photo', true, true], ['auto', 'photo', false, false], ['external', 'photo', false, true], ['product', null, false, false], ['none', 'photo', false, false]]) {
    const db = { tenant: { findUnique: async () => ({ name: 'Test Shop', currency: 'UGX', logo: 'https://res.cloudinary.com/demo/logo.png' }) },
      product: { findFirst: async () => ({ name: 'Pink rice', price: 4500, baseUnit: 'kg', image: stored, itemType: 'product' }) } };
    let searches = 0;
    const output = await buildArtifactData(db, req, validateArtifactInput({ requestId: 'test', kind: 'flyer', brief: 'Promote rice', productId: 'rice', artwork: mode }), undefined, {
      advise: async () => ({ reply: JSON.stringify(copy) }),
      loadImage: async () => { if (broken) throw new Error('Unavailable'); return { image: bytes, imageMime: 'image/jpeg', imageSource: 'product' }; },
      loadExternalImage: async topic => { searches++; assert.equal(topic, 'rice'); return { image: bytes, imageMime: 'image/jpeg', imageSource: 'external', externalPhoto: { title: 'Rice', license: 'CC0 1.0' } }; },
    });
    assert.equal(searches, shouldSearch ? 1 : 0); assert.equal(output.data.artwork, mode);
    assert.equal(output.data.brand.logo, 'https://res.cloudinary.com/demo/logo.png');
    if (shouldSearch) { assert.equal(output.data.externalPhoto.title, 'Rice'); assert.equal(output.data.imageSource, 'external'); assert.deepEqual(output.image, bytes); }
  }
});

test('no usable external result leaves an explicit text-only fallback', async () => {
  const req = { user: { id: 'owner', tenantId: 'test', role: 'owner', permissions: ['*'] }, tenantFeatures: new Set(['dashboard']), query: {} };
  const result = await buildArtifactData({ tenant: { findUnique: async () => ({ name: 'Test', currency: 'UGX' }) } }, req,
    validateArtifactInput({ requestId: 'test', kind: 'flyer', brief: 'Promote a new service', artwork: 'external' }), undefined, {
      advise: async () => ({ reply: JSON.stringify({ headline: 'Services for your business', body: 'Find the support you need.', cta: 'Visit today', caption: 'Visit us for professional services.' }) }),
      loadExternalImage: async () => null,
    });
  assert.equal(result.image, undefined); assert.match(result.data.warnings[0], /No suitable photo/);
});
