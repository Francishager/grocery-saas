import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Edit, History, MoreHorizontal, Trash2, Wrench } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import type { InventoryItem } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

interface ServiceListProps {
  items: InventoryItem[]
  categoryNames: Map<string, string>
  branchNames: Map<string, string>
  onEdit?: (item: InventoryItem) => void
  onDelete?: (item: InventoryItem) => void
  onPriceHistory?: (item: InventoryItem) => void
}

export default function ServiceList({ items, categoryNames, branchNames, onEdit, onDelete, onPriceHistory }: ServiceListProps) {
  const category = (item: InventoryItem) => item.categoryName || categoryNames.get(String(item.categoryId || '')) || 'Uncategorized'
  const branch = (item: InventoryItem) => item.branch?.name || branchNames.get(String(item.branchId || '')) || '-'
  const duration = (item: InventoryItem) => [item.duration, item.estimatedHours != null ? `${item.estimatedHours} hours` : ''].filter(Boolean).join(' / ') || '-'
  const actions = (item: InventoryItem) => (onEdit || onDelete || onPriceHistory) && (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={buttonVariants({ variant: 'ghost', size: 'icon' })} title="Service actions" aria-label={`Actions for ${item.product_name}`}>
          <MoreHorizontal className="h-4 w-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {onEdit && <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none focus:bg-accent" onSelect={() => onEdit(item)}><Edit className="h-4 w-4" />Edit Service</DropdownMenu.Item>}
          {onPriceHistory && <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none focus:bg-accent" onSelect={() => onPriceHistory(item)}><History className="h-4 w-4" />Price History</DropdownMenu.Item>}
          {onDelete && <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive outline-none focus:bg-accent" onSelect={() => onDelete(item)}><Trash2 className="h-4 w-4" />Delete Service</DropdownMenu.Item>}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )

  return <>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="border-b text-left">
          {['Service', 'Category', 'Branch', 'Duration', 'Price', 'Actions'].map(label => <th key={label} className={`px-3 py-3 font-medium ${label === 'Price' || label === 'Actions' ? 'text-right' : ''}`}>{label}</th>)}
        </tr></thead>
        <tbody>{items.map(item => <tr key={item.id} className="border-b last:border-0 hover:bg-muted/40">
          <td className="min-w-48 max-w-sm px-3 py-3 [overflow-wrap:anywhere]">
            <div className="flex items-start gap-2"><Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="font-medium">{item.product_name}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">{item.product_id}</p>
            {item.description && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.description}</p>}
          </td>
          <td className="max-w-48 break-words px-3 py-3">{category(item)}</td>
          <td className="max-w-48 break-words px-3 py-3">{branch(item)}</td>
          <td className="max-w-48 break-words px-3 py-3">{duration(item)}</td>
          <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">{formatCurrency(item.unit_price)}</td>
          <td className="px-3 py-3 text-right">{actions(item)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="space-y-3 md:hidden">{items.map(item => <article key={item.id} className="min-w-0 space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="break-words font-medium [overflow-wrap:anywhere]">{item.product_name}</h3><p className="break-words text-xs text-muted-foreground">{item.product_id}</p></div>
        {actions(item)}
      </div>
      {item.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.description}</p>}
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm [&>dd]:break-words">
        <dt className="text-muted-foreground">Category</dt><dd>{category(item)}</dd>
        <dt className="text-muted-foreground">Branch</dt><dd>{branch(item)}</dd>
        <dt className="text-muted-foreground">Duration</dt><dd>{duration(item)}</dd>
        <dt className="text-muted-foreground">Price</dt><dd className="font-semibold tabular-nums">{formatCurrency(item.unit_price)}</dd>
      </dl>
    </article>)}</div>
  </>
}
