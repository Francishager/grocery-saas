import React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Search, Plus, Edit, Trash2, MoreVertical, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface HRColumn {
  key: string
  label: string
  sortable?: boolean
  render?: (value: any, row: any) => React.ReactNode
  searchValue?: (row: any) => string
  width?: string
}

export interface HRRowAction {
  label: string
  onClick: (row: any) => void
  visible?: (row: any) => boolean
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost'
}

interface HRTableProps {
  columns: HRColumn[]
  data: any[]
  loading?: boolean
  onAdd?: () => void
  onEdit?: (id: string, row: any) => void
  onDelete?: (id: string, row: any) => void
  onView?: (id: string, row: any) => void
  searchPlaceholder?: string
  title?: string
  actions?: boolean | HRRowAction[]
  pageSize?: number
  enableColumnFilter?: boolean
}

export const HRTable: React.FC<HRTableProps> = ({
  columns,
  data,
  loading = false,
  onAdd,
  onEdit,
  onDelete,
  onView,
  searchPlaceholder = 'Search...',
  title,
  actions = true,
  pageSize,
  enableColumnFilter = false,
}) => {
  const [search, setSearch] = React.useState('')
  const [sortKey, setSortKey] = React.useState<string | null>(null)
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc')
  const [page, setPage] = React.useState(1)
  const [visibleColumnKeys, setVisibleColumnKeys] = React.useState<string[]>(() => columns.map((column) => column.key))
  const rowActions = Array.isArray(actions) ? actions : []
  const showActions = actions !== false && Boolean(onView || onEdit || onDelete || rowActions.length)
  const columnKeysSignature = columns.map((column) => column.key).join('|')
  const visibleColumns = enableColumnFilter
    ? columns.filter((column) => visibleColumnKeys.includes(column.key))
    : columns

  const filtered = data.filter((row) =>
    columns.some((col) => {
      const value = col.searchValue ? col.searchValue(row) : row[col.key]
      return value && String(value).toLowerCase().includes(search.toLowerCase())
    })
  )

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
    : filtered

  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  const currentPage = Math.min(page, totalPages)
  const pagedRows = pageSize
    ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sorted
  const startRow = sorted.length && pageSize ? (currentPage - 1) * pageSize + 1 : sorted.length ? 1 : 0
  const endRow = pageSize ? Math.min(currentPage * pageSize, sorted.length) : sorted.length

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const toggleColumn = (key: string) => {
    setVisibleColumnKeys((current) => {
      if (current.includes(key)) {
        return current.length > 1 ? current.filter((item) => item !== key) : current
      }
      return [...current, key]
    })
  }

  React.useEffect(() => {
    setVisibleColumnKeys((current) => {
      const validKeys = columns.map((column) => column.key)
      const kept = current.filter((key) => validKeys.includes(key))
      const added = validKeys.filter((key) => !kept.includes(key))
      const next = [...kept, ...added]
      return next.length === current.length && next.every((key, index) => key === current[index]) ? current : next
    })
  }, [columnKeysSignature])

  React.useEffect(() => {
    setPage(1)
  }, [search, pageSize, data.length])

  return (
    <div className="space-y-4">
      {(title || onAdd || searchPlaceholder) && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {enableColumnFilter && (
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Choose table columns" title="Choose columns">
                  <SlidersHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {columns.map((column) => (
                      <DropdownMenuItem key={column.key} onClick={() => toggleColumn(column.key)}>
                        <span className="mr-2 inline-block w-4">{visibleColumnKeys.includes(column.key) ? '✓' : ''}</span>
                        {column.label}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onAdd && (
              <Button onClick={onAdd} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              {visibleColumns.map((col) => (
                <TableHead key={col.key} style={{ width: col.width }} className="font-semibold">
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-2 hover:text-gray-900"
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            sortDir === 'desc' ? 'rotate-180' : ''
                          }`}
                        />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
              {showActions && <TableHead className="w-12 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + (showActions ? 1 : 0)} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + (showActions ? 1 : 0)} className="text-center py-8 text-gray-500">
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((row) => (
                <TableRow key={row.id} className="hover:bg-gray-50">
                  {visibleColumns.map((col) => (
                    <TableCell key={col.key} style={{ width: col.width }} className="whitespace-nowrap align-top">
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </TableCell>
                  ))}
                  {showActions && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {rowActions
                            .filter((action) => !action.visible || action.visible(row))
                            .map((action) => (
                              <DropdownMenuItem
                                key={action.label}
                                onClick={() => action.onClick(row)}
                                className={action.variant === 'destructive' ? 'text-red-600' : undefined}
                              >
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                          {onView && (
                            <DropdownMenuItem onClick={() => onView(row.id, row)}>
                              View
                            </DropdownMenuItem>
                          )}
                          {onEdit && (
                            <DropdownMenuItem onClick={() => onEdit(row.id, row)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {onDelete && (
                            <DropdownMenuItem
                              onClick={() => onDelete(row.id, row)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pageSize && sorted.length > 0 && (
        <div className="flex flex-col gap-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {startRow}-{endRow} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {currentPage} of {totalPages}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default HRTable
