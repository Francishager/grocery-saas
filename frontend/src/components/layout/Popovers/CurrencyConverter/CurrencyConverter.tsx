import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { ArrowRightLeft, RefreshCw } from 'lucide-react'
import { currencies, formatCurrency, getCurrency, Currency } from '@/components/Currency/Currencies'

export interface CurrencyConverterProps {
  /** Default from currency */
  defaultFrom?: string
  /** Default to currency */
  defaultTo?: string
  /** Default amount */
  defaultAmount?: number
  /** Exchange rates (rate from currency to USD) */
  exchangeRates?: Record<string, number>
  /** Callback when conversion is done */
  onConvert?: (result: {
    from: string
    to: string
    amount: number
    result: number
    rate: number
  }) => void
  /** Whether to show swap button */
  showSwapButton?: boolean
  /** Whether to show refresh button */
  showRefreshButton?: boolean
  /** Callback when refresh is clicked */
  onRefresh?: () => void
  /** Additional className */
  className?: string
  /** Whether component is disabled */
  disabled?: boolean
  /** Whether component is loading */
  loading?: boolean
}

export const CurrencyConverter: React.FC<CurrencyConverterProps> = ({
  defaultFrom = 'USD',
  defaultTo = 'UGX',
  defaultAmount = 100,
  exchangeRates = {
    USD: 1,
    UGX: 3800,
    KES: 153,
    TZS: 2500,
    EUR: 0.92,
    GBP: 0.79,
  },
  onConvert,
  showSwapButton = true,
  showRefreshButton = true,
  onRefresh,
  className,
  disabled = false,
  loading = false,
}) => {
  const [fromCurrency, setFromCurrency] = useState(defaultFrom)
  const [toCurrency, setToCurrency] = useState(defaultTo)
  const [amount, setAmount] = useState(defaultAmount.toString())
  const [result, setResult] = useState<number | null>(null)
  const [rate, setRate] = useState<number | null>(null)

  const convert = () => {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) return

    const fromRate = exchangeRates[fromCurrency] || 1
    const toRate = exchangeRates[toCurrency] || 1

    // Convert to USD first, then to target currency
    const usdAmount = amountNum / fromRate
    const convertedAmount = usdAmount * toRate
    const conversionRate = toRate / fromRate

    setResult(convertedAmount)
    setRate(conversionRate)

    onConvert?.({
      from: fromCurrency,
      to: toCurrency,
      amount: amountNum,
      result: convertedAmount,
      rate: conversionRate,
    })
  }

  const handleSwap = () => {
    setFromCurrency(toCurrency)
    setToCurrency(fromCurrency)
    setResult(null)
    setRate(null)
  }

  const handleRefresh = () => {
    onRefresh?.()
  }

  const currencyOptions = currencies.map((c) => ({
    value: c.code,
    label: `${c.flag} ${c.code} - ${c.name}`,
  }))

  return (
    <div className={cn('bg-white rounded-lg border border-gray-200 p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Currency Converter</h3>
        {showRefreshButton && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={disabled || loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
            title="Refresh rates"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* From Currency */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <div className="flex gap-2">
            <select
              value={fromCurrency}
              onChange={(e) => {
                setFromCurrency(e.target.value)
                setResult(null)
              }}
              disabled={disabled}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100"
            >
              {currencyOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setResult(null)
              }}
              disabled={disabled}
              placeholder="Amount"
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100"
            />
          </div>
        </div>

        {/* Swap Button */}
        {showSwapButton && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSwap}
              disabled={disabled}
              className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-full disabled:opacity-50"
              title="Swap currencies"
            >
              <ArrowRightLeft className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* To Currency */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <div className="flex gap-2">
            <select
              value={toCurrency}
              onChange={(e) => {
                setToCurrency(e.target.value)
                setResult(null)
              }}
              disabled={disabled}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100"
            >
              {currencyOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value}
                </option>
              ))}
            </select>
            <div className="w-32 px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-700">
              {result !== null ? formatCurrency(result, toCurrency) : '—'}
            </div>
          </div>
        </div>

        {/* Convert Button */}
        <button
          type="button"
          onClick={convert}
          disabled={disabled || loading || !amount}
          className="w-full py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Convert
        </button>

        {/* Exchange Rate */}
        {rate !== null && (
          <div className="text-center text-xs text-gray-500">
            1 {fromCurrency} = {rate.toFixed(4)} {toCurrency}
          </div>
        )}
      </div>
    </div>
  )
}

export default CurrencyConverter
