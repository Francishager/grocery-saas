import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currencyApi, type LiveCurrencyRates } from '@/lib/api'
import { currencies } from '@/components/Currency/Currencies'

type Props = {
  baseCurrency: string
  currency: string
  enabled: boolean
  amount?: number
  onCurrencyChange: (currency: string) => void
  onRateChange: (rateToBase: number | null, unitsPerBase: number | null) => void
}

export function TransactionCurrencyControl({ baseCurrency, currency, enabled, amount = 0, onCurrencyChange, onRateChange }: Props) {
  const [rates, setRates] = useState<LiveCurrencyRates | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const onRateChangeRef = useRef(onRateChange)
  const base = String(baseCurrency || 'UGX').toUpperCase()

  useEffect(() => { onRateChangeRef.current = onRateChange }, [onRateChange])

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await currencyApi.rates(base)
      setRates(result)
    } catch (err: any) {
      setError(err?.message || 'Live exchange rates are unavailable.')
      setRates(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    onCurrencyChange(base)
  }, [base])

  useEffect(() => {
    if (!enabled || currency === base) {
      onRateChangeRef.current(currency === base ? 1 : null, currency === base ? 1 : null)
      if (!enabled) return
    }
    let active = true
    setLoading(true)
    setError('')
    currencyApi.rates(base).then((result) => {
      if (!active) return
      setRates(result)
      const unitsPerBase = Number(result.rates[currency])
      const rate = unitsPerBase > 0 ? 1 / unitsPerBase : null
      onRateChangeRef.current(rate, unitsPerBase > 0 ? unitsPerBase : null)
      if (!rate) setError(`No live rate is available for ${currency}.`)
    }).catch((err: any) => {
      if (!active) return
      setRates(null)
      onRateChangeRef.current(null, null)
      setError(err?.message || 'Live exchange rates are unavailable.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [base, currency, enabled])

  const available = useMemo(() => currencies.filter((item) => item.code !== base && rates?.rates[item.code] != null), [base, rates])
  if (!enabled) return null
  const unitsPerBase = Number(rates?.rates[currency] || 0)
  const rateToBase = unitsPerBase > 0 ? 1 / unitsPerBase : 0
  const baseTotal = Number(amount || 0) * rateToBase

  return <div className="space-y-2 rounded-md border p-3">
    <label className="block text-sm font-medium">Transaction currency
      <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={currency} onChange={(event) => onCurrencyChange(event.target.value)}>
        <option value={base}>{base} · business base currency</option>
        {available.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
      </select>
    </label>
    {currency !== base && <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="min-w-0 text-muted-foreground">
        {unitsPerBase > 0 ? `1 ${base} = ${new Intl.NumberFormat(undefined, { maximumSignificantDigits: 7 }).format(unitsPerBase)} ${currency}; ${amount || 0} ${currency} = ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(baseTotal)} ${base}.` : 'Waiting for a current rate.'}
        {rates?.rateDate ? ` Rate published ${new Date(rates.rateDate).toLocaleString()}.` : ''}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
        <RefreshCw className={`mr-1 size-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
      </Button>
      <span className="w-full text-muted-foreground">Reference rates are indicative; your bank or payment provider may settle at a different rate.</span>
    </div>}
    {error && currency !== base && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}
