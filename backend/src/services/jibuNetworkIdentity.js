import { randomInt } from 'node:crypto';

export const JIBU_NETWORK_DIAL_CODES = Object.freeze(['+1', '+27', '+44', '+91', '+234', '+233', '+250', '+254', '+255', '+256']);

export function normalizeJibuId(value) {
  return String(value || '').replace(/[\s()-]/g, '').trim();
}

export function isValidJibuId(value) {
  const id = normalizeJibuId(value);
  return JIBU_NETWORK_DIAL_CODES.some((code) => id.startsWith(code)
    && id.length === code.length + 10
    && /^\d{10}$/.test(id.slice(code.length)));
}

export function createJibuId(countryCode) {
  if (!JIBU_NETWORK_DIAL_CODES.includes(countryCode)) throw new Error('Unsupported country calling code.');
  return `${countryCode}${Array.from({ length: 10 }, () => String(randomInt(0, 10))).join('')}`;
}
