import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currencyApi, type LiveCurrencyRates } from '@/lib/api'

const DISPLAY_CODES = ['UGX', 'USD', 'KES', 'TZS', 'RWF', 'EUR', 'GBP']

export function CurrencyRatesPanel({ baseCurrency }: { baseCurrency: string }) {
  const [data, setData] = useState<LiveCurrencyRates | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const normalizedBase = String(baseCurrency || 'UGX').toUpperCase()

  const refresh = useCallback(async () => {
    const currentRequestId = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const rates = await currencyApi.rates(normalizedBase)
      if (requestId.current === currentRequestId) setData(rates)
    } catch (err: any) {
      if (requestId.current === currentRequestId) setError(err?.message || 'Exchange rates are unavailable.')
    } finally {
      if (requestId.current === currentRequestId) setLoading(false)
    }
  }, [normalizedBase])

  useEffect(() => {
    setData(null)
    void refresh()
    return () => { requestId.current += 1 }
  }, [refresh])

  const rateDate = data?.rateDate ? new Date(data.rateDate) : null
  const isCurrentCurrency = data?.baseCurrency?.toUpperCase() === normalizedBase
  const rates = isCurrentCurrency ? data?.rates || {} : {}
  const baseToUgx = normalizedBase === 'UGX' ? 1 : Number(rates.UGX || 0)
  const usdToUgx = normalizedBase === 'USD'
    ? Number(rates.UGX || 0)
    : normalizedBase === 'UGX'
      ? (Number(rates.USD || 0) > 0 ? 1 / Number(rates.USD) : 0)
      : (Number(rates.USD || 0) > 0 ? Number(rates.UGX || 0) / Number(rates.USD) : 0)
  const formatRate = (value: number) => new Intl.NumberFormat(undefined, { maximumSignificantDigits: 7 }).format(value)

  return (
    <section className="space-y-3 rounded-md border p-4 sm:col-span-2" aria-label="Live exchange rates">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Reference exchange rates</h3>
          <p className="mt-1 text-xs text-muted-foreground">Daily reference conversions, not bank or bureau buy/sell quotes.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading} aria-label="Refresh exchange rates">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh rates
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : isCurrentCurrency ? <>
        {data.warning && <p role="status" className="text-xs text-amber-700">{data.warning}</p>}
        <div className="grid gap-2 min-[420px]:grid-cols-2">
          <div className="min-w-0 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
            <span className="block text-xs text-muted-foreground">Selected currency to Uganda shilling</span>
            <strong className="mt-1 block break-words text-sm tabular-nums">
              {baseToUgx > 0 ? `1 ${normalizedBase} = ${formatRate(baseToUgx)} UGX` : 'Rate unavailable'}
            </strong>
          </div>
          {normalizedBase !== 'USD' && (
            <div className="min-w-0 rounded-md border px-3 py-2.5">
              <span className="block text-xs text-muted-foreground">US dollar to Uganda shilling</span>
              <strong className="mt-1 block break-words text-sm tabular-nums">
                {usdToUgx > 0 ? `1 USD = ${formatRate(usdToUgx)} UGX` : 'Rate unavailable'}
              </strong>
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="w-[42%] px-3 py-2 font-medium">Currency pair</th><th className="px-3 py-2 text-right font-medium">Reference rate</th></tr>
            </thead>
            <tbody>
              {DISPLAY_CODES.filter(code => code !== normalizedBase && rates[code] != null).map(code => (
                <tr key={code} className="border-t">
                  <td className="break-words px-3 py-2">{normalizedBase} to {code}</td>
                  <td className="break-words px-3 py-2 text-right tabular-nums">1 {normalizedBase} = {formatRate(Number(rates[code]))} {code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rateDate && <p className="text-xs text-muted-foreground">Rates updated {rateDate.toLocaleString()}. These are single reference conversion rates, not separate buy and sell prices.</p>}
      </> : <p className="text-sm text-muted-foreground">{loading ? 'Loading rates…' : 'No rates loaded.'}</p>}
    </section>
  )
}
