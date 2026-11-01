import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currencyApi, type LiveCurrencyRates } from '@/lib/api'

const DISPLAY_CODES = ['UGX', 'USD', 'KES', 'TZS', 'RWF', 'EUR', 'GBP']

export function CurrencyRatesPanel({ baseCurrency }: { baseCurrency: string }) {
  const [data, setData] = useState<LiveCurrencyRates | null>(null)
  const [usdUgxRate, setUsdUgxRate] = useState<number | null>(null)
  const [usdUgxDate, setUsdUgxDate] = useState<string | null>(null)
  const [usdUgxUnavailable, setUsdUgxUnavailable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const normalizedBase = String(baseCurrency || 'UGX').toUpperCase()
      const [baseResult, ugxResult] = await Promise.allSettled([
        currencyApi.rates(normalizedBase),
        normalizedBase === 'UGX' ? Promise.resolve(null) : currencyApi.rates('UGX'),
      ])
      if (baseResult.status === 'rejected') throw baseResult.reason
      setData(baseResult.value)
      const ugxRates = normalizedBase === 'UGX'
        ? baseResult.value
        : ugxResult.status === 'fulfilled' ? ugxResult.value : null
      const usdPerUgx = Number(ugxRates?.rates?.USD || 0)
      setUsdUgxRate(usdPerUgx > 0 ? 1 / usdPerUgx : null)
      setUsdUgxDate(ugxRates?.rateDate || null)
      setUsdUgxUnavailable(!ugxRates || usdPerUgx <= 0)
    } catch (err: any) {
      setError(err?.message || 'Exchange rates are unavailable.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [baseCurrency])

  const rateDate = data?.rateDate ? new Date(data.rateDate) : null
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
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : data ? <>
        {data.warning && <p role="status" className="text-xs text-amber-700">{data.warning}</p>}
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
          <span className="text-sm font-medium">US dollar to Uganda shilling</span>
          <strong className="tabular-nums">{usdUgxRate ? `1 USD = ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(usdUgxRate)} UGX` : usdUgxUnavailable ? 'Rate unavailable' : 'Loading rate…'}</strong>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {DISPLAY_CODES.filter(code => data.rates[code] != null).map(code => (
            <div key={code} className="flex items-baseline justify-between gap-2 border-b py-2 text-sm">
              <span className="text-muted-foreground">1 {data.baseCurrency} =</span>
              <strong className="tabular-nums">{new Intl.NumberFormat(undefined, { maximumSignificantDigits: 7 }).format(data.rates[code])}</strong>
              <span className="text-muted-foreground">{code}</span>
            </div>
          ))}
        </div>
        {rateDate && <p className="text-xs text-muted-foreground">Rates updated {rateDate.toLocaleString()}.{usdUgxDate && usdUgxDate !== data.rateDate ? ` USD/UGX reference updated ${new Date(usdUgxDate).toLocaleString()}.` : ''} These are single reference conversion rates, not separate buy and sell prices.</p>}
      </> : <p className="text-sm text-muted-foreground">{loading ? 'Loading rates…' : 'No rates loaded.'}</p>}
    </section>
  )
}
