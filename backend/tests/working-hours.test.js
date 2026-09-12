import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkingHours, validateTimezone, withinWorkingHours, workingHoursAccessPayload } from '../src/utils/workingHours.js';

const schedule = (days = [1, 2, 3, 4, 5], start = '08:00', end = '18:00') => ({
  enabled: true, days: Array.from({ length: 7 }, (_, day) => ({ day, enabled: days.includes(day), allDay: false, start, end })),
});
const staff = { role: 'attendant', tenantId: 'tenant' };
const tenant = { timezone: 'Africa/Kampala', workingHours: schedule() };
const allowed = (hours, date, timezone = 'Africa/Kampala') => withinWorkingHours(hours, timezone, new Date(date));

test('opening is inclusive and closing is exclusive in the business timezone', () => {
  assert.equal(allowed(schedule(), '2026-09-14T04:59:59Z'), false);
  assert.equal(allowed(schedule(), '2026-09-14T05:00:00Z'), true);
  assert.equal(allowed(schedule(), '2026-09-14T14:59:59Z'), true);
  assert.equal(allowed(schedule(), '2026-09-14T15:00:00Z'), false);
  assert.equal(allowed(schedule(), '2026-09-13T09:00:00Z'), false);
});
test('overnight hours carry into the next day, including Saturday to Sunday', () => {
  const night = schedule([1, 6], '22:00', '02:00');
  assert.equal(allowed(night, '2026-09-14T19:00:00Z'), true);
  assert.equal(allowed(night, '2026-09-14T22:59:59Z'), true);
  assert.equal(allowed(night, '2026-09-14T23:00:00Z'), false);
  assert.equal(allowed(night, '2026-09-12T22:00:00Z'), true);
  assert.equal(allowed(night, '2026-09-12T23:00:00Z'), false);
});
test('24-hour days and daylight-saving timezone boundaries', () => {
  const hours = schedule([0], '01:00', '02:00');
  assert.equal(allowed(hours, '2026-11-01T05:30:00Z', 'America/New_York'), true);
  assert.equal(allowed(hours, '2026-11-01T06:30:00Z', 'America/New_York'), true);
  assert.equal(allowed(hours, '2026-11-01T07:00:00Z', 'America/New_York'), false);
  hours.days[0].allDay = true;
  assert.equal(allowed(hours, '2026-09-12T21:00:00Z'), true);
  assert.equal(allowed(hours, '2026-09-13T20:59:59Z'), true);
  assert.equal(allowed(hours, '2026-09-13T21:00:00Z'), false);
});
test('unset or disabled business schedules preserve existing unrestricted access', () => {
  const now = new Date('2026-09-14T01:00:00Z');
  assert.equal(workingHoursAccessPayload(staff, { ...tenant, workingHours: null }, now), null);
  assert.equal(workingHoursAccessPayload(staff, { ...tenant, workingHours: { ...schedule(), enabled: false } }, now), null);
});
test('custom staff hours replace business hours, and null restores inheritance', () => {
  const now = new Date('2026-09-14T18:00:00Z');
  assert.equal(workingHoursAccessPayload(staff, tenant, now).code, 'OUTSIDE_WORKING_HOURS');
  assert.equal(workingHoursAccessPayload({ ...staff, workingHours: schedule([1], '20:00', '23:00') }, tenant, now), null);
  assert.equal(workingHoursAccessPayload({ ...staff, workingHours: null }, tenant, now).code, 'OUTSIDE_WORKING_HOURS');
  const morning = new Date('2026-09-14T06:00:00Z');
  assert.equal(workingHoursAccessPayload({ ...staff, workingHours: schedule([1], '20:00', '23:00') }, tenant, morning).code, 'OUTSIDE_WORKING_HOURS');
});
test('owners and platform administrators cannot be locked out by staff schedules', () => {
  for (const role of ['owner', 'saas_admin', 'platform_admin', 'super_admin']) {
    assert.equal(workingHoursAccessPayload({ ...staff, role }, tenant, new Date('2026-09-14T01:00:00Z')), null);
  }
  for (const role of ['attendant', 'accountant', 'manager']) {
    assert.equal(workingHoursAccessPayload({ ...staff, role }, tenant, new Date('2026-09-14T01:00:00Z')).code, 'OUTSIDE_WORKING_HOURS');
  }
});
test('reject invalid times, duplicate/missing days, empty schedules and unsupported timezones', () => {
  assert.equal(validateWorkingHours(null), null);
  assert.deepEqual(validateWorkingHours(schedule()), schedule());
  const cases = [true, 'hours', {}, { ...schedule(), enabled: 'yes' }, { ...schedule(), days: [] }, schedule([], '08:00', '18:00')];
  for (const changes of [{ start: '25:00' }, { start: '8:00' }, { end: '08:00' }, { enabled: 'yes' }, { allDay: 1 }]) {
    const value = schedule(); Object.assign(value.days[1], changes); cases.push(value);
  }
  const duplicate = schedule(); duplicate.days[2].day = 1; cases.push(duplicate);
  for (const value of cases) assert.throws(() => validateWorkingHours(value), RangeError);
  assert.throws(() => validateWorkingHours({ ...schedule(), enabled: false }, { custom: true }), RangeError);
  assert.throws(() => validateTimezone('not/a/timezone'), RangeError);
  assert.equal(validateTimezone('Africa/Kampala'), 'Africa/Kampala');
});
test('invalid saved schedules fail closed with an actionable message', () => {
  const result = workingHoursAccessPayload(staff, { ...tenant, workingHours: { enabled: true, days: [] } });
  assert.equal(result.code, 'OUTSIDE_WORKING_HOURS');
  assert.match(result.message, /business owner/);
});
