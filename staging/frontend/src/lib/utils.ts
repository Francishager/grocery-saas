import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const DEFAULT_SYSTEM_DATE_FORMAT = 'DD/MM/YY'
export const DEFAULT_SYSTEM_CURRENCY = 'UGX'
export const TENANT_SETTINGS_CACHE_KEY = 'tenant_business_settings'

type TenantFormattingSettings = {
  currency?: string | null
  dateFormat?: string | null
  timezone?: string | null
  tenant?: TenantFormattingSettings | null
}

const readStorageJson = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? JSON.parse(stored) as T : null
  } catch {
    return null
  }
}

const writeStorageJson = (key: string, value: unknown): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage write failures; formatting can still use defaults.
  }
}

export function normalizeCurrency(value?: string | null, fallback = DEFAULT_SYSTEM_CURRENCY): string {
  const normalized = String(value || fallback).trim().toUpperCase()
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback
}

const getDateFormatter = () => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})

export function normalizeDateFormat(value?: string | null): string {
  return DEFAULT_SYSTEM_DATE_FORMAT
}

export function getTenantFormattingSettings(): Required<Pick<TenantFormattingSettings, 'currency' | 'dateFormat'>> & Pick<TenantFormattingSettings, 'timezone'> {
  const cached = readStorageJson<TenantFormattingSettings>(TENANT_SETTINGS_CACHE_KEY)
  const appSettings = readStorageJson<any>('app_settings')
  const globalStore = readStorageJson<any>('global_store')
  const authUser = readStorageJson<any>('auth_user') || readStorageJson<any>('user')

  const currency =
    cached?.currency ||
    appSettings?.general?.currency ||
    appSettings?.currency ||
    globalStore?.currency ||
    authUser?.tenant?.currency ||
    authUser?.currency

  return {
    currency: normalizeCurrency(currency),
    dateFormat: DEFAULT_SYSTEM_DATE_FORMAT,
    timezone: cached?.timezone || appSettings?.general?.timezone || globalStore?.timezone || authUser?.tenant?.timezone,
  }
}

export function getTenantCurrency(fallback = DEFAULT_SYSTEM_CURRENCY): string {
  return normalizeCurrency(getTenantFormattingSettings().currency, fallback)
}

export function cacheTenantFormattingSettings(settings?: TenantFormattingSettings | Record<string, any> | null): void {
  if (!settings || typeof window === 'undefined') return

  const source = (settings as TenantFormattingSettings).tenant || settings
  const current = readStorageJson<Record<string, any>>(TENANT_SETTINGS_CACHE_KEY) || {}
  const currency = normalizeCurrency((source as TenantFormattingSettings).currency || current.currency)
  const timezone = (source as TenantFormattingSettings).timezone || current.timezone || undefined
  const cached = {
    ...current,
    ...source,
    currency,
    timezone,
    dateFormat: DEFAULT_SYSTEM_DATE_FORMAT,
  }

  writeStorageJson(TENANT_SETTINGS_CACHE_KEY, cached)

  const appSettings = readStorageJson<Record<string, any>>('app_settings')
  if (appSettings) {
    writeStorageJson('app_settings', {
      ...appSettings,
      general: {
        ...(appSettings.general || {}),
        currency,
        dateFormat: DEFAULT_SYSTEM_DATE_FORMAT,
        ...(timezone ? { timezone } : {}),
      },
    })
  }

  const globalStore = readStorageJson<Record<string, any>>('global_store')
  if (globalStore) {
    writeStorageJson('global_store', {
      ...globalStore,
      currency,
      dateFormat: DEFAULT_SYSTEM_DATE_FORMAT,
      ...(timezone ? { timezone } : {}),
    })
  }
}

export function formatDisplayDate(value: Date | string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—'

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const safeOptions: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    ...options,
  }

  return new Intl.DateTimeFormat('en-GB', safeOptions).format(date)
}

export function formatDateForTable(value: Date | string | null | undefined): string {
  return formatDisplayDate(value)
}

export function formatDateRangeForDisplay(from: Date | string | null | undefined, to: Date | string | null | undefined): string {
  const fromText = formatDisplayDate(from)
  const toText = formatDisplayDate(to)
  if (fromText === '—' || toText === '—') return fromText === '—' ? toText : fromText
  return `${fromText} - ${toText}`
}

export function enforceSystemDateFormat(): void {
  if ((Date.prototype as any).__grocerySystemDateFormatEnforced) return

  const systemDateFormatter = getDateFormatter()

  Date.prototype.toLocaleDateString = function () {
    const date = this
    if (Number.isNaN(date.getTime())) return '—'
    return systemDateFormatter.format(date)
  }

  Date.prototype.toLocaleString = function () {
    const date = this
    if (Number.isNaN(date.getTime())) return '—'
    return systemDateFormatter.format(date)
  }

  ;(Date.prototype as any).__grocerySystemDateFormatEnforced = true
}

enforceSystemDateFormat()

export function formatDisplayDateRange(from: Date | string | null | undefined, to: Date | string | null | undefined): string {
  const fromText = formatDisplayDate(from)
  const toText = formatDisplayDate(to)
  if (fromText === '—' || toText === '—') return fromText === '—' ? toText : fromText
  return `${fromText} - ${toText}`
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency?: string | null) {
  const resolvedCurrency = normalizeCurrency(currency || getTenantCurrency())
  const numericAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: resolvedCurrency,
    }).format(numericAmount)
  } catch {
    return `${resolvedCurrency} ${numericAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
}
