import test from 'node:test';
import assert from 'node:assert/strict';
import { canUploadRentalItemImage } from '../src/utils/rentalImageAccess.js';

test('creator with rental-create permission can attach the initial image to their image-less item', () => {
  assert.equal(canUploadRentalItemImage(
    { id: 'staff-1', permissions: ['canCreateRental'] },
    { createdByUserId: 'staff-1', image: null },
  ), true);
});

test('rental-create permission cannot replace an existing image or upload to another creator item', () => {
  const creator = { id: 'staff-1', permissions: ['canCreateRental'] };
  assert.equal(canUploadRentalItemImage(creator, { createdByUserId: 'staff-1', image: 'https://images.example/item.jpg' }), false);
  assert.equal(canUploadRentalItemImage(creator, { createdByUserId: 'staff-2', image: null }), false);
});

test('rental-edit permission can replace an image', () => {
  assert.equal(canUploadRentalItemImage(
    { id: 'staff-2', permissions: ['canEditRental'] },
    { createdByUserId: 'staff-1', image: 'https://images.example/item.jpg' },
  ), true);
});
