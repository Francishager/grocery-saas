import test from 'node:test';
import assert from 'node:assert/strict';
import { advisorTipTopics, deliverDueAdvisorTips } from '../src/services/advisorDailyTips.js';

function databaseFor(tenant, notificationStore = new Map(), contentStore = new Map()) {
  const contentKey = where => {
    const key = where.tenantId_tipDate_slot;
    return `${key.tenantId}:${key.tipDate}:${key.slot}`;
  };
  const tx = {
    $queryRaw: async () => [],
    advisorDailyTipContent: {
      findUnique: async ({ where }) => contentStore.get(contentKey(where)) || null,
      create: async ({ data }) => {
        const row = { id: `content-${contentStore.size + 1}`, ...data };
        contentStore.set(`${data.tenantId}:${data.tipDate}:${data.slot}`, row);
        return row;
      },
    },
  };
  return {
    tenant: { findUnique: async ({ select }) => {
      assert.deepEqual(select, { timezone: true, businessType: true, createdAt: true });
      return tenant;
    } },
    notification: {
      findUnique: async ({ where }) => notificationStore.get(where.id) || null,
      createMany: async ({ data }) => { for (const row of data) notificationStore.set(row.id, row); },
    },
    $transaction: async callback => callback(tx),
  };
}

test('daily tip topics are tailored to the tenant business type', () => {
  const salon = advisorTipTopics(100, 'salon_spa');
  const property = advisorTipTopics(100, 'property_management');
  const pharmacy = advisorTipTopics(100, 'pharmacy');
  assert.notDeepEqual(salon, property);
  assert.notDeepEqual(pharmacy, property);
  assert(salon.some(([title]) => title === 'Rebooking' || title === 'Chair planning'));
  assert(property.some(([title]) => title === 'Rent schedule' || title === 'Arrears follow-up'));
  assert(pharmacy.some(([title]) => title === 'Prescription handoff' || title === 'Expiry control'));
});

test('a newly created business receives a welcome tip in its local first-week schedule', async () => {
  const notifications = new Map();
  const db = databaseFor({ timezone: 'Africa/Kampala', businessType: 'salon_spa', createdAt: new Date('2026-11-14T00:00:00.000Z') }, notifications);
  const result = await deliverDueAdvisorTips(db, { user: { id: 'owner-1', tenantId: 'tenant-1' } }, new Date('2026-11-14T07:00:00.000Z'), {
    generateTip: async ({ fallback }) => ({ title: fallback[0], message: fallback[1] }),
  });
  assert.equal(result.created.length, 1);
  assert.match(result.created[0].title, /Welcome/);
  assert.equal(result.created[0].metadata.welcome, true);
  assert.equal(result.created[0].metadata.businessType, 'salon_spa');
});

test('businesses outside the first week do not receive onboarding tips', async () => {
  const created = [];
  const db = databaseFor({ timezone: 'Africa/Kampala', businessType: 'bar', createdAt: new Date('2026-10-01T00:00:00.000Z') });
  db.notification.createMany = async ({ data }) => { created.push(...data); };
  await deliverDueAdvisorTips(db, { user: { id: 'owner-1', tenantId: 'tenant-1' } }, new Date('2026-11-14T13:00:00.000Z'), { generateTip: async () => null });
  assert.equal(created.length, 2);
  assert(created.every(item => item.metadata.welcome === false));
  assert(created.some(item => item.metadata.topic === 'Menu performance' || item.metadata.topic === 'Waste control'));
});

test('AI-generated daily content is cached once per tenant and slot but delivered per user', async () => {
  const notifications = new Map();
  const content = new Map();
  const db = databaseFor({ timezone: 'Africa/Kampala', businessType: 'retail', createdAt: new Date('2026-01-01T00:00:00.000Z') }, notifications, content);
  let generations = 0;
  const generateTip = async () => {
    generations += 1;
    return { title: 'Cash conversion review', message: 'Compare collection timing with supplier terms and choose one practical action to reduce avoidable pressure on working capital this week.' };
  };
  const now = new Date('2026-11-14T07:00:00.000Z');
  const first = await deliverDueAdvisorTips(db, { user: { id: 'owner-1', tenantId: 'tenant-1' } }, now, { generateTip });
  const second = await deliverDueAdvisorTips(db, { user: { id: 'staff-1', tenantId: 'tenant-1' } }, now, { generateTip });
  assert.equal(generations, 1);
  assert.equal(content.size, 1);
  assert.equal(first.created[0].message, second.created[0].message);
  assert.notEqual(first.created[0].id, second.created[0].id);
});
