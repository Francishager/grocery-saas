import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const DEFAULT_SYSTEM_DATE_FORMAT = 'DD/MM/YY'

const getDateFormatter = () => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})

export function normalizeDateFormat(value?: string | null): string {
  return DEFAULT_SYSTEM_DATE_FORMAT
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

export function formatCurrency(amount: number, currency = 'UGX') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}