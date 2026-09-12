const PRIVILEGED_ROLES = new Set(['owner', 'saas_admin', 'platform_admin', 'super_admin']);
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function workingHoursAdmin(user) {
  return PRIVILEGED_ROLES.has(user?.role);
}

export function validateTimezone(value) {
  if (typeof value !== 'string' || !value.trim()) throw new RangeError('Select a valid business timezone.');
  try { new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(); }
  catch { throw new RangeError('Select a valid business timezone.'); }
  return value;
}

export function validateWorkingHours(value, { custom = false } = {}) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.enabled !== 'boolean') {
    throw new RangeError('Working hours must include an enabled setting and a weekly schedule.');
  }
  if (custom && !value.enabled) throw new RangeError('Use business hours to remove custom staff hours.');
  if (!Array.isArray(value.days) || value.days.length !== 7) throw new RangeError('Set working hours for all seven days.');
  const seen = new Set();
  const days = value.days.map((item) => {
    if (!item || !Number.isInteger(item.day) || item.day < 0 || item.day > 6 || seen.has(item.day)) throw new RangeError('Each weekday must appear exactly once.');
    seen.add(item.day);
    if (typeof item.enabled !== 'boolean' || typeof item.allDay !== 'boolean') throw new RangeError('Invalid day settings.');
    if (typeof item.start !== 'string' || typeof item.end !== 'string' || !TIME.test(item.start) || !TIME.test(item.end)) throw new RangeError('Enter valid opening and closing times (HH:mm).');
    if (item.enabled && !item.allDay && item.start === item.end) throw new RangeError(`${DAY_NAMES[item.day]} needs different opening and closing times, or select 24 hours.`);
    return { day: item.day, enabled: item.enabled, allDay: item.allDay, start: item.start, end: item.end };
  }).sort((a, b) => a.day - b.day);
  if (value.enabled && !days.some((day) => day.enabled)) throw new RangeError('Enable at least one working day.');
  return { enabled: value.enabled, days };
}

const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export function withinWorkingHours(schedule, timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const day = DAY_NAMES.indexOf(part('weekday'));
  const current = day * 1440 + Number(part('hour')) * 60 + Number(part('minute'));
  return schedule.days.some((window) => {
    if (!window.enabled) return false;
    const start = window.day * 1440 + (window.allDay ? 0 : minutes(window.start));
    let end = window.day * 1440 + (window.allDay ? 1440 : minutes(window.end));
    if (end <= start) end += 1440;
    // Include the previous Saturday's overnight shift when the current day is Sunday.
    return [current, current + 7 * 1440].some((point) => point >= start && point < end);
  });
}

export function staffWorkingHoursAccess(user, tenant, now = new Date()) {
  if (!tenant || workingHoursAdmin(user)) return { restricted: false };
  const configured = user?.workingHours ?? tenant.workingHours;
  if (!configured || configured.enabled === false) return { restricted: false };
  try {
    const schedule = validateWorkingHours(configured, { custom: Boolean(user?.workingHours) });
    const timezone = validateTimezone(tenant.timezone || 'Africa/Kampala');
    const allowed = withinWorkingHours(schedule, timezone, now);
    return { restricted: true, allowed, timezone, schedule, checkedAt: now.toISOString() };
  } catch {
    return { restricted: true, allowed: false, invalid: true };
  }
}

export function workingHoursAccessPayload(user, tenant, now = new Date()) {
  const access = staffWorkingHoursAccess(user, tenant, now);
  if (!access.restricted || access.allowed) return null;
  const message = access.invalid
    ? 'Your working-hours settings need attention. Contact your business owner.'
    : `You cannot sign in or use this account outside your assigned working hours (${access.timezone}). Contact your business owner if your hours need changing.`;
  return { code: 'OUTSIDE_WORKING_HOURS', error: message, message, workingHours: access.schedule, timezone: access.timezone };
}
