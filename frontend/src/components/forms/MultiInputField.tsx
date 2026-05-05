import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Trash2, GripVertical } from 'lucide-react'

export interface MultiInputFieldValue {
  id: string
  value: string
}

export interface MultiInputFieldProps {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  value?: MultiInputFieldValue[]
  onChange?: (value: MultiInputFieldValue[]) => void
  placeholder?: string
  minInputs?: number
  maxInputs?: number
  disabled?: boolean
  className?: string
  inputType?: React.HTMLInputTypeAttribute
  sortable?: boolean
  addButtonText?: string
}

export const MultiInputField: React.FC<MultiInputFieldProps> = ({
  label,
  error,
  helperText,
  required,
  containerClassName,
  value = [],
  onChange,
  placeholder = 'Enter value',
  minInputs = 1,
  maxInputs,
  disabled,
  className,
  inputType = 'text',
  sortable = false,
  addButtonText = 'Add Another',
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const generateId = () => `input-${Math.random().toString(36).substr(2, 9)}`

  const handleAdd = () => {
    if (maxInputs && value.length >= maxInputs) return
    onChange?.([...value, { id: generateId(), value: '' }])
  }

  const handleRemove = (id: string) => {
    if (minInputs && value.length <= minInputs) return
    onChange?.(value.filter((item) => item.id !== id))
  }

  const handleChange = (id: string, newValue: string) => {
    onChange?.(
      value.map((item) =>
        item.id === id ? { ...item, value: newValue } : item
      )
    )
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const newValue = [...value]
    const draggedItem = newValue[draggedIndex]
    newValue.splice(draggedIndex, 1)
    newValue.splice(index, 0, draggedItem)
    onChange?.(newValue)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  // Initialize with minInputs if empty
  React.useEffect(() => {
    if (value.length === 0 && minInputs > 0) {
      const initialInputs = Array.from({ length: minInputs }, () => ({
        id: generateId(),
        value: '',
      }))
      onChange?.(initialInputs)
    }
  }, [])

  return (
    <div className={cn('space-y-1', containerClassName)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className={cn('space-y-2', className)}>
        {value.map((item, index) => (
          <div
            key={item.id}
            draggable={sortable && !disabled}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={cn(
              'flex items-center gap-2',
              draggedIndex === index && 'opacity-50'
            )}
          >
            {sortable && !disabled && (
              <GripVertical className="h-4 w-4 text-gray-400 cursor-grab flex-shrink-0" />
            )}

            <input
              type={inputType}
              value={item.value}
              onChange={(e) => handleChange(item.id, e.target.value)}
              disabled={disabled}
              placeholder={placeholder}
              className={cn(
                'flex-1 px-3 py-2 border rounded-md shadow-sm',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
                'disabled:bg-gray-100 disabled:cursor-not-allowed',
                error
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300'
              )}
            />

            {(!minInputs || value.length > minInputs) && !disabled && (
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-md"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {(!maxInputs || value.length < maxInputs) && !disabled && (
        <button
          type="button"
          onClick={handleAdd}
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

export default MultiInputField
