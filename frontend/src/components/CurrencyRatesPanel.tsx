import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currencyApi, type LiveCurrencyRates } from '@/lib/api'

const DISPLAY_CODES = ['USD', 'KES', 'TZS', 'RWF', 'EUR', 'GBP']

export function CurrencyRatesPanel({ baseCurrency }: { baseCurrency: string }) {
  const [data, setData] = useState<LiveCurrencyRates | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      setData(await currencyApi.rates(baseCurrency))
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
          <p className="mt-1 text-xs text-muted-foreground">Daily reference rates against {baseCurrency}. They are not a bank or payment-provider quote.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading} aria-label="Refresh exchange rates">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh rates
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : data ? <>
        {data.warning && <p role="status" className="text-xs text-amber-700">{data.warning}</p>}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {DISPLAY_CODES.filter(code => data.rates[code] != null).map(code => (
            <div key={code} className="flex items-baseline justify-between gap-2 border-b py-2 text-sm">
              <span className="text-muted-foreground">{code}</span>
              <strong className="tabular-nums">{new Intl.NumberFormat(undefined, { maximumSignificantDigits: 7 }).format(data.rates[code])}</strong>
            </div>
          ))}
        </div>
        {rateDate && <p className="text-xs text-muted-foreground">Rates updated {rateDate.toLocaleString()}.</p>}
      </> : <p className="text-sm text-muted-foreground">{loading ? 'Loading rates…' : 'No rates loaded.'}</p>}
    </section>
  )
}
