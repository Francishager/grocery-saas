const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+|(?:^|\s)(?:\/tenant|\/notifications|\/api)\/[A-Za-z0-9_?&=./%-]+/gi

/** Keep notification copy user-facing; routes and service URLs belong to actions, not message text. */
export function sanitizeNotificationText(value: unknown, fallback = ''): string {
  const text = String(value ?? fallback)
    .replace(URL_PATTERN, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim()
  return text || fallback
}
