const DEFAULT_API_BASE = 'https://grocery-saas-production-e339.up.railway.app'

function isLocalhostUrl(value: string): boolean {
  if (!value) return false

  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.localhost')
  } catch {
    return false
  }
}

export function getApiBaseUrl(explicitUrl?: string): string {
  const configured = explicitUrl || import.meta.env.VITE_API_URL || ''

  if (!configured) return DEFAULT_API_BASE
  if (import.meta.env.PROD && isLocalhostUrl(configured)) {
    return DEFAULT_API_BASE
  }

  return configured.replace(/\/$/, '')
}

export function getApiAuthEndpoint(explicitUrl?: string): string {
  return `${getApiBaseUrl(explicitUrl)}/api/auth`
}

export function buildApiUrl(path: string, explicitUrl?: string): string {
  const base = getApiBaseUrl(explicitUrl)
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}
