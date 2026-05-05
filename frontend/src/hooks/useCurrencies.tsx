import { useCurrenciesContext, Currency, ExchangeRates } from '@/contexts/CurrenciesContext'

export interface UseCurrenciesReturn {
  currencies: Currency[]
  baseCurrency: string
  exchangeRates: ExchangeRates
  loading: boolean
  error: string | null
  setBaseCurrency: (code: string) => void
  format: (amount: number, currencyCode?: string) => string
  parse: (value: string, currencyCode?: string) => number
  convert: (amount: number, from: string, to: string) => number
  getCurrency: (code: string) => Currency | undefined
  refreshRates: () => Promise<void>
  getRate: (from: string, to: string) => number
}

/**
 * Hook for currency operations
 */
export const useCurrencies = (): UseCurrenciesReturn => {
  const context = useCurrenciesContext()

  return {
    currencies: context.currencies,
    baseCurrency: context.baseCurrency,
    exchangeRates: context.exchangeRates,
    loading: context.loading,
    error: context.error,
    setBaseCurrency: context.setBaseCurrency,
    format: context.format,
    parse: context.parse,
    convert: context.convert,
    getCurrency: context.getCurrency,
    refreshRates: context.refreshRates,
    getRate: context.getRate,
  }
}

export default useCurrencies
