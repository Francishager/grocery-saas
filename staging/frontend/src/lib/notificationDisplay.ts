const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+|(?:^|\s)(?:\/tenant|\/notifications|\/api)(?:\/[^\s<>]*)?/gi

/** Keep notification copy user-facing; routes and service URLs belong to actions, not message text. */
export function sanitizeNotificationText(value: unknown, fallback = ''): string {
  const text = String(value ?? fallback)
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(URL_PATTERN, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim()
  return text || fallback
}

export function notificationLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/tenant/') || /[\\\s]/.test(value)) return undefined
  return value
}

export function notificationActionLink(value: unknown, canAdjustStock: boolean): string | undefined {
  const link = notificationLink(value)
  if (!link) return undefined
  const [path, query = ''] = link.split('?', 2)
  const params = new URLSearchParams(query)
  if (path === '/tenant/inventory/products' && params.has('stockAction') && !canAdjustStock) return undefined
  return link
}

export function notificationKey(item: { id: string; type?: string; title?: string; metadata?: Record<string, any> }): string {
  const sale = item.type === 'sale' || /^(new sale recorded|sale completed!?|sale recorded offline)$/i.test(item.title || '')
  const reference = item.metadata?.saleId || item.metadata?.receiptNo
  return sale && reference ? 'sale:' + reference : item.id
}
