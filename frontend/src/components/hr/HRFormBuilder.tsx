import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export interface HRFormField {
  name: string
  label: string
  type: 'text' | 'email' | 'number' | 'date' | 'select' | 'textarea'
  required?: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  validation?: (value: any) => string | null
}

interface HRFormBuilderProps {
  fields: HRFormField[]
  values: Record<string, any>
  onChange: (values: Record<string, any>) => void
  onSubmit: () => void
  loading?: boolean
  submitLabel?: string
  error?: string
}

export const HRFormBuilder: React.FC<HRFormBuilderProps> = ({
  fields,
  values,
  onChange,
  onSubmit,
  loading = false,
  submitLabel = 'Save',
  error,
}) => {
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const handleChange = (name: string, value: any) => {
    onChange({ ...values, [name]: value })
    // Clear error for this field
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' })
    }
  }

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {}

    fields.forEach((field) => {
      const value = values[field.name]

      if (field.required && !value) {
        newErrors[field.name] = `${field.label} is required`
      } else if (field.validation) {
        const validationError = field.validation(value)
        if (validationError) {
          newErrors[field.name] = validationError
        }
      }
    })

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onSubmit()
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {fields.map((field) => {
        const value = values[field.name] || ''
        const fieldError = errors[field.name]

        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name} className="flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-red-600">*</span>}
            </Label>

            {field.type === 'select' ? (
              <Select value={String(value)} onValueChange={(v) => handleChange(field.name, v)}>
                <SelectTrigger id={field.name}>
                  <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === 'textarea' ? (
              <Textarea
                id={field.name}
                value={value}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className={fieldError ? 'border-red-500' : ''}
                rows={3}
              />
            ) : (
              <Input
                id={field.name}
                type={field.type}
                value={value}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className={fieldError ? 'border-red-500' : ''}
              />
            )}

            {fieldError && <p className="text-sm text-red-600">{fieldError}</p>}
          </div>
        )
      })}

      <Button onClick={handleSubmit} disabled={loading} className="w-full">
        {loading ? 'Saving...' : submitLabel}
      </Button>
    </div>
  )
}

export default HRFormBuilder
