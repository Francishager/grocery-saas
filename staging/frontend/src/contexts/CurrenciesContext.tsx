import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import { currencies, Currency, formatCurrency, parseCurrency, convertCurrency } from '@/components/Currency/Currencies'

export interface ExchangeRates {
  [currencyCode: string]: number
}

export interface CurrenciesContextValue {
  /** Available currencies */
  currencies: Currency[]
  /** Selected base currency */
  baseCurrency: string
  /** Exchange rates (rate to USD) */
  exchangeRates: ExchangeRates
  /** Loading state */
  loading: boolean
  /** Error state */
  error: string | null
  /** Set base currency */
  setBaseCurrency: (code: string) => void
  /** Format amount with currency */
  format: (amount: number, currencyCode?: string) => string
  /** Parse currency string to number */
  parse: (value: string, currencyCode?: string) => number
  /** Convert amount between currencies */
  convert: (amount: number, from: string, to: string) => number
  /** Get currency by code */
  getCurrency: (code: string) => Currency | undefined
  /** Refresh exchange rates */
  refreshRates: () => Promise<void>
  /** Get exchange rate */
  getRate: (from: string, to: string) => number
}

const CurrenciesContext = createContext<CurrenciesContextValue | undefined>(undefined)

export interface CurrenciesProviderProps {
  children: ReactNode
  /** Default base currency */
  defaultCurrency?: string
  /** Initial exchange rates */
  initialRates?: ExchangeRates
  /** API endpoint for fetching rates */
  ratesEndpoint?: string
  /** Auto refresh interval in milliseconds */
  refreshInterval?: number
  /** Callback when currency changes */
  onCurrencyChange?: (currency: string) => void
}

export const CurrenciesProvider: React.FC<CurrenciesProviderProps> = ({
  children,
  defaultCurrency = 'UGX',
  initialRates = {
    USD: 1,
    UGX: 3800,
    KES: 153,
    TZS: 2500,
    EUR: 0.92,
    GBP: 0.79,
  },
  ratesEndpoint,
  refreshInterval,
  onCurrencyChange,
}) => {
  const [baseCurrency, setBaseCurrencyState] = useState(defaultCurrency)
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>(initialRates)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setBaseCurrency = useCallback((code: string) => {
    setBaseCurrencyState(code)
    onCurrencyChange?.(code)
  }, [onCurrencyChange])

  const format = useCallback((amount: number, currencyCode?: string): string => {
    return formatCurrency(amount, currencyCode || baseCurrency)
  }, [baseCurrency])

  const parse = useCallback((value: string, currencyCode?: string): number => {
    return parseCurrency(value, currencyCode || baseCurrency)
  }, [baseCurrency])

  const convert = useCallback((amount: number, from: string, to: string): number => {
    const fromRate = exchangeRates[from] || 1
    const toRate = exchangeRates[to] || 1
    return convertCurrency(amount, fromRate, toRate)
  }, [exchangeRates])

  const getCurrency = useCallback((code: string): Currency | undefined => {
    return currencies.find((c) => c.code === code)
  }, [])

  const getRate = useCallback((from: string, to: string): number => {
    const fromRate = exchangeRates[from] || 1
    const toRate = exchangeRates[to] || 1
    return toRate / fromRate
  }, [exchangeRates])

  const refreshRates = useCallback(async () => {
    if (!ratesEndpoint) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(ratesEndpoint)
      if (!response.ok) throw new Error('Failed to fetch rates')
      const data = await response.json()
      setExchangeRates(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh rates')
    } finally {
      setLoading(false)
    }
  }, [ratesEndpoint])

  useEffect(() => {
    if (refreshInterval && ratesEndpoint) {
      const interval = setInterval(refreshRates, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [refreshInterval, ratesEndpoint, refreshRates])

  const value: CurrenciesContextValue = {
    currencies,
    baseCurrency,
    exchangeRates,
    loading,
    error,
    setBaseCurrency,
    format,
    parse,
    convert,
    getCurrency,
    refreshRates,
    getRate,
  }

  return (
    <CurrenciesContext.Provider value={value}>
      {children}
    </CurrenciesContext.Provider>
  )
}

export const useCurrenciesContext = (): CurrenciesContextValue => {
  const context = useContext(CurrenciesContext)
  if (!context) {
    throw new Error('useCurrenciesContext must be used within a CurrenciesProvider')
  }
  return context
}

export default CurrenciesContext
