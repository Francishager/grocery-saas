import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { currencies, formatCurrency, Currency } from '@/components/Currency/Currencies'

export interface CurrencyConverterFormProps {
  /** Default from currency */
  defaultFrom?: string
  /** Default to currency */
  defaultTo?: string
  /** Default amount */
  defaultAmount?: number
  /** Exchange rates */
  exchangeRates?: Record<string, number>
  /** Callback when form is submitted */
  onSubmit?: (data: {
    from: string
    to: string
    amount: number
    result: number
    rate: number
  }) => void
  /** Callback when form values change */
  onChange?: (data: { from: string; to: string; amount: number }) => void
  /** Whether to show result inline */
  showResultInline?: boolean
  /** Additional className */
  className?: string
  /** Whether form is disabled */
  disabled?: boolean
  /** Whether form is loading */
  loading?: boolean
  /** Submit button text */
  submitButtonText?: string
  /** Layout direction */
  layout?: 'horizontal' | 'vertical'
}

export const CurrencyConverterForm: React.FC<CurrencyConverterFormProps> = ({
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
  onSubmit,
  onChange,
  showResultInline = true,
  className,
  disabled = false,
  loading = false,
  submitButtonText = 'Convert',
  layout = 'vertical',
}) => {
  const [fromCurrency, setFromCurrency] = useState(defaultFrom)
  const [toCurrency, setToCurrency] = useState(defaultTo)
  const [amount, setAmount] = useState(defaultAmount.toString())
  const [result, setResult] = useState<number | null>(null)
  const [rate, setRate] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = 'Please enter a valid amount'
    }

    if (!fromCurrency) {
      newErrors.from = 'Please select a currency'
    }

    if (!toCurrency) {
      newErrors.to = 'Please select a currency'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const convert = () => {
    if (!validate()) return null

    const amountNum = parseFloat(amount)
    const fromRate = exchangeRates[fromCurrency] || 1
    const toRate = exchangeRates[toCurrency] || 1

    const usdAmount = amountNum / fromRate
    const convertedAmount = usdAmount * toRate
    const conversionRate = toRate / fromRate

    setResult(convertedAmount)
    setRate(conversionRate)

    return {
      from: fromCurrency,
      to: toCurrency,
      amount: amountNum,
      result: convertedAmount,
      rate: conversionRate,
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = convert()
    if (data) {
      onSubmit?.(data)
    }
  }

  const handleChange = () => {
    const amountNum = parseFloat(amount)
    if (!isNaN(amountNum)) {
      onChange?.({ from: fromCurrency, to: toCurrency, amount: amountNum })
    }
  }

  const currencyOptions = currencies.map((c) => ({
    value: c.code,
    label: `${c.flag} ${c.code}`,
  }))

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        layout === 'vertical' ? 'space-y-4' : 'flex flex-wrap gap-4 items-end',
        className
      )}
    >
      {/* From Currency */}
      <div className={cn(layout === 'horizontal' && 'flex-1 min-w-[150px]')}>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          From Currency
        </label>
        <select
          value={fromCurrency}
          onChange={(e) => {
            setFromCurrency(e.target.value)
            setResult(null)
            handleChange()
          }}
          disabled={disabled}
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100',
            errors.from ? 'border-red-500' : 'border-gray-300'
          )}
        >
          {currencyOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.from && (
          <p className="mt-1 text-xs text-red-500">{errors.from}</p>
        )}
      </div>

      {/* Amount */}
      <div className={cn(layout === 'horizontal' && 'w-32')}>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Amount
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            setResult(null)
            handleChange()
          }}
          disabled={disabled}
          placeholder="0.00"
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100',
            errors.amount ? 'border-red-500' : 'border-gray-300'
          )}
        />
        {errors.amount && (
          <p className="mt-1 text-xs text-red-500">{errors.amount}</p>
        )}
      </div>

      {/* To Currency */}
      <div className={cn(layout === 'horizontal' && 'flex-1 min-w-[150px]')}>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          To Currency
        </label>
        <select
          value={toCurrency}
          onChange={(e) => {
            setToCurrency(e.target.value)
            setResult(null)
            handleChange()
          }}
          disabled={disabled}
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100',
            errors.to ? 'border-red-500' : 'border-gray-300'
          )}
        >
          {currencyOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.to && (
          <p className="mt-1 text-xs text-red-500">{errors.to}</p>
        )}
      </div>

      {/* Result */}
      {showResultInline && result !== null && (
        <div className={cn(layout === 'horizontal' ? 'w-40' : 'w-full')}>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Result
          </label>
          <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm font-medium text-gray-900">
            {formatCurrency(result, toCurrency)}
          </div>
          {rate !== null && (
            <p className="mt-1 text-xs text-gray-500">
              Rate: 1 {fromCurrency} = {rate.toFixed(4)} {toCurrency}
            </p>
          )}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={disabled || loading}
        className={cn(
          'px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
          layout === 'vertical' && 'w-full'
        )}
      >
        {loading ? 'Converting...' : submitButtonText}
      </button>
    </form>
  )
}

export default CurrencyConverterForm
