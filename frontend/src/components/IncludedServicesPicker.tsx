import { useEffect, useState } from 'react'
import { inventoryApi, type InventoryItem } from '@/lib/api'
import { Input } from '@/components/ui/input'

export default function IncludedServicesPicker({ itemType, branchId, value, onChange }: {
  itemType: string; branchId: string; value: string[]; onChange: (ids: string[]) => void
}) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const counterpart = itemType === 'service' ? 'product' : 'service'
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    inventoryApi.list('', branchId || undefined, counterpart).then(rows => { if (active) setItems(rows) })
      .catch(err => { if (active) setError(err.message || 'Unable to load items') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [branchId, counterpart])
  const filtered = items.filter(item => item.product_name.toLowerCase().includes(query.toLowerCase()))
  return <fieldset className="space-y-2 sm:col-span-2 min-w-0">
    <legend className="text-sm font-medium">{itemType === 'service' ? 'Products that include this service free' : 'Included services (free)'}</legend>
    <Input aria-label={`Search included ${counterpart}s`} placeholder={`Search ${counterpart}s...`} value={query} onChange={e => setQuery(e.target.value)} />
    <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">No matching {counterpart}s.</p> : filtered.map(item => <label key={item.id} className="flex items-start gap-2 py-2 text-sm cursor-pointer">
        <input type="checkbox" className="mt-1 shrink-0" checked={value.includes(String(item.id))} onChange={e => onChange(e.target.checked ? [...value, String(item.id)] : value.filter(id => id !== String(item.id)))} />
        <span className="min-w-0 break-words">{item.product_name}</span>
      </label>)}
    </div>
  </fieldset>
}
