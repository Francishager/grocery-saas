import React from 'react'
import { cn } from '@/lib/utils'
import { Plus, Trash2 } from 'lucide-react'

export interface TableColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'select' | 'date' | 'checkbox'
  options?: { value: string | number; label: string }[]
  placeholder?: string
  required?: boolean
  width?: string
  readonly?: boolean
}

export interface TableRowData {
  id: string
  [key: string]: any
}

export interface TableFormFieldProps {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  columns: TableColumn[]
  value?: TableRowData[]
  onChange?: (value: TableRowData[]) => void
  minRows?: number
  maxRows?: number
  disabled?: boolean
  className?: string
  addButtonText?: string
  showRowNumbers?: boolean
  stickyHeader?: boolean
}

export const TableFormField: React.FC<TableFormFieldProps> = ({
  label,
  error,
  helperText,
  required,
  containerClassName,
  columns,
  value = [],
  onChange,
  minRows = 0,
  maxRows,
  disabled,
  className,
  addButtonText = 'Add Row',
  showRowNumbers = true,
  stickyHeader = false,
}) => {
  const generateId = () => `row-${Math.random().toString(36).substr(2, 9)}`

  const handleAddRow = () => {
    if (maxRows && value.length >= maxRows) return
    
    const newRow: TableRowData = {
      id: generateId(),
      ...columns.reduce((acc, col) => {
        acc[col.key] = col.type === 'checkbox' ? false : ''
        return acc
      }, {} as Record<string, any>),
    }
    
    onChange?.([...value, newRow])
  }

  const handleRemoveRow = (id: string) => {
    if (minRows && value.length <= minRows) return
    onChange?.(value.filter((row) => row.id !== id))
  }

  const handleCellChange = (rowId: string, key: string, cellValue: any) => {
    onChange?.(
      value.map((row) =>
        row.id === rowId ? { ...row, [key]: cellValue } : row
      )
    )
  }

  const renderCell = (row: TableRowData, column: TableColumn) => {
    const cellValue = row[column.key]
    const isDisabled = disabled || column.readonly

    switch (column.type) {
      case 'number':
        return (
          <input
            type="number"
            value={cellValue ?? ''}
            onChange={(e) => handleCellChange(row.id, column.key, e.target.value)}
            disabled={isDisabled}
            placeholder={column.placeholder}
            className={cn(
              'w-full px-2 py-1 border rounded text-sm',
              'focus:outline-none focus:ring-1 focus:ring-primary',
              'disabled:bg-gray-100',
              error ? 'border-red-300' : 'border-gray-200'
            )}
          />
        )

      case 'select':
        return (
          <select
            value={cellValue ?? ''}
            onChange={(e) => handleCellChange(row.id, column.key, e.target.value)}
            disabled={isDisabled}
            className={cn(
              'w-full px-2 py-1 border rounded text-sm',
              'focus:outline-none focus:ring-1 focus:ring-primary',
              'disabled:bg-gray-100',
              error ? 'border-red-300' : 'border-gray-200'
            )}
          >
            <option value="">{column.placeholder || 'Select'}</option>
            {column.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )

      case 'date':
        return (
          <input
            type="date"
            value={cellValue ?? ''}
            onChange={(e) => handleCellChange(row.id, column.key, e.target.value)}
            disabled={isDisabled}
            className={cn(
              'w-full px-2 py-1 border rounded text-sm',
              'focus:outline-none focus:ring-1 focus:ring-primary',
              'disabled:bg-gray-100',
              error ? 'border-red-300' : 'border-gray-200'
            )}
          />
        )

      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={cellValue ?? false}
            onChange={(e) => handleCellChange(row.id, column.key, e.target.checked)}
            disabled={isDisabled}
            className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
          />
        )

      default:
        return (
          <input
            type="text"
            value={cellValue ?? ''}
            onChange={(e) => handleCellChange(row.id, column.key, e.target.value)}
            disabled={isDisabled}
            placeholder={column.placeholder}
            className={cn(
              'w-full px-2 py-1 border rounded text-sm',
              'focus:outline-none focus:ring-1 focus:ring-primary',
              'disabled:bg-gray-100',
              error ? 'border-red-300' : 'border-gray-200'
            )}
          />
        )
    }
  }

  return (
    <div className={cn('space-y-1', containerClassName)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div
        className={cn(
          'border rounded-md overflow-hidden',
          error ? 'border-red-500' : 'border-gray-300',
          className
        )}
      >
        <div className={cn('overflow-x-auto', stickyHeader && 'max-h-80')}>
          <table className="w-full">
            <thead className={cn('bg-gray-50', stickyHeader && 'sticky top-0')}>
              <tr>
                {showRowNumbers && (
                  <th className="w-10 px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                    #
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      'px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b',
                      column.required && 'text-gray-700'
                    )}
                    style={{ width: column.width }}
                  >
                    {column.label}
                    {column.required && <span className="text-red-500 ml-0.5">*</span>}
                  </th>
                ))}
                {!disabled && (
                  <th className="w-10 px-2 py-2 border-b" />
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {value.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (showRowNumbers ? 1 : 0) + (disabled ? 0 : 1)}
                    className="px-3 py-4 text-center text-sm text-gray-500"
                  >
                    No data. Click "{addButtonText}" to add a row.
                  </td>
                </tr>
              ) : (
                value.map((row, index) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {showRowNumbers && (
                      <td className="px-2 py-1 text-sm text-gray-500 text-center border-b">
                        {index + 1}
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className="px-2 py-1 border-b"
                        style={{ width: column.width }}
                      >
                        {renderCell(row, column)}
                      </td>
                    ))}
                    {!disabled && (
                      <td className="px-2 py-1 border-b">
                        {(!minRows || value.length > minRows) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(!maxRows || value.length < maxRows) && !disabled && (
        <button
          type="button"
          onClick={handleAddRow}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-sm border border-dashed rounded-md',
            'text-primary border-primary hover:bg-primary/5'
          )}
        >
          <Plus className="h-4 w-4" />
          {addButtonText}
        </button>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
    </div>
  )
}

export default TableFormField
