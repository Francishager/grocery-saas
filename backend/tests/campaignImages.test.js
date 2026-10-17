import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignImageDeliveryUrl, campaignImageUrls } from '../src/utils/campaignImages.js';

test('Cloudinary image URLs use delivery-time format selection and sizing', () => {
  assert.equal(
    campaignImageDeliveryUrl('https://res.cloudinary.com/demo/image/upload/v123/marketplace/photo.jpg'),
    'https://res.cloudinary.com/demo/image/upload/f_auto/q_auto,c_limit,w_1600,h_1200/v123/marketplace/photo.jpg',
  );
});

test('Cloudinary delivery transformations are not duplicated', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/f_auto/q_auto,c_limit,w_1600,h_1200/v123/photo.jpg';
  assert.equal(campaignImageDeliveryUrl(url), url);
});

test('campaign reads support both URL-only and metadata image records', () => {
  assert.deepEqual(campaignImageUrls([
    'https://res.cloudinary.com/demo/image/upload/v1/old.jpg',
    { url: 'https://res.cloudinary.com/demo/image/upload/v2/new.jpg', publicId: 'new' },
    { publicId: 'missing-url' },
    'http://insecure.example/image.jpg',
  ]), [
    'https://res.cloudinary.com/demo/image/upload/f_auto/q_auto,c_limit,w_1600,h_1200/v1/old.jpg',
    'https://res.cloudinary.com/demo/image/upload/f_auto/q_auto,c_limit,w_1600,h_1200/v2/new.jpg',
  ]);
});
