import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { FormTextInput } from './FormTextInput'
import { FormSelectInput } from './FormSelectInput'

export interface BranchField {
  id: string
  [key: string]: any
}

export interface BranchFieldConfig {
  name: string
  label: string
  type: 'text' | 'select' | 'number' | 'email' | 'tel'
  options?: { value: string | number; label: string }[]
  required?: boolean
  placeholder?: string
}

export interface FormBranchFieldProps {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  value?: BranchField[]
  onChange?: (value: BranchField[]) => void
  fields: BranchFieldConfig[]
  minBranches?: number
  maxBranches?: number
  addButtonText?: string
  disabled?: boolean
  className?: string
}

export const FormBranchField: React.FC<FormBranchFieldProps> = ({
  label,
  error,
  helperText,
  required,
  containerClassName,
  value = [],
  onChange,
  fields,
  minBranches = 0,
  maxBranches,
  addButtonText = 'Add Item',
  disabled,
  className,
}) => {
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set())

  const generateId = () => `branch-${Math.random().toString(36).substr(2, 9)}`

  const handleAdd = () => {
    if (maxBranches && value.length >= maxBranches) return
    
    const newBranch: BranchField = {
      id: generateId(),
      ...fields.reduce((acc, field) => {
        acc[field.name] = ''
        return acc
      }, {} as Record<string, any>),
    }
    
    onChange?.([...value, newBranch])
    setExpandedBranches((prev) => new Set([...prev, newBranch.id]))
  }

  const handleRemove = (id: string) => {
    if (minBranches && value.length <= minBranches) return
    onChange?.(value.filter((branch) => branch.id !== id))
    setExpandedBranches((prev) => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
  }

  const handleFieldChange = (branchId: string, fieldName: string, fieldValue: any) => {
    onChange?.(
      value.map((branch) =>
        branch.id === branchId
          ? { ...branch, [fieldName]: fieldValue }
          : branch
      )
    )
  }

  const toggleExpand = (id: string) => {
    setExpandedBranches((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const getBranchTitle = (branch: BranchField) => {
    const firstTextField = fields.find((f) => f.type === 'text')
    return firstTextField ? branch[firstTextField.name] || 'New Item' : `Item ${value.indexOf(branch) + 1}`
  }

  return (
    <div className={cn('space-y-2', containerClassName)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className={cn('space-y-2', className)}>
        {value.map((branch, index) => {
          const isExpanded = expandedBranches.has(branch.id)
          
          return (
            <div
              key={branch.id}
              className="border border-gray-200 rounded-md overflow-hidden"
            >
              <div
                className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
                onClick={() => toggleExpand(branch.id)}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  )}
                  <span className="text-sm font-medium text-gray-700">
                    {getBranchTitle(branch)}
                  </span>
                </div>
                
                {(!minBranches || value.length > minBranches) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemove(branch.id)
                    }}
                    disabled={disabled}
                    className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              {isExpanded && (
                <div className="p-3 space-y-3 border-t border-gray-200">
                  {fields.map((field) => {
                    if (field.type === 'select' && field.options) {
                      return (
                        <FormSelectInput
                          key={field.name}
                          label={field.label}
                          required={field.required}
                          options={field.options}
                          value={branch[field.name]}
                          onChange={(e) => handleFieldChange(branch.id, field.name, e.target.value)}
                          disabled={disabled}
                          placeholder={field.placeholder}
                        />
                      )
                    }
                    
                    return (
                      <FormTextInput
                        key={field.name}
                        label={field.label}
                        type={field.type}
                        required={field.required}
                        value={branch[field.name]}
                        onChange={(e) => handleFieldChange(branch.id, field.name, e.target.value)}
                        disabled={disabled}
                        placeholder={field.placeholder}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {(!maxBranches || value.length < maxBranches) && (
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled}
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-sm border border-dashed rounded-md',
            'text-primary border-primary hover:bg-primary/5',
            'disabled:opacity-50 disabled:cursor-not-allowed'
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

export default FormBranchField
