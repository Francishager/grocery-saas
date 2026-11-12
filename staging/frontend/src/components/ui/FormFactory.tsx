import React from 'react'
import { cn } from '@/lib/utils'

// Import form components
import { FormTextInput, FormTextInputProps } from '../forms/FormTextInput'
import { FormTextArea, FormTextAreaProps } from '../forms/FormTextArea'
import { FormCheckBox, FormCheckBoxProps } from '../forms/FormCheckBox'
import { FormRadioBtn, FormRadioBtnProps } from '../forms/FormRadioBtn'
import { FormSelectInput, FormSelectInputProps } from '../forms/FormSelectInput'
import { FormSelectSearch, FormSelectSearchProps } from '../forms/FormSelectSearch'
import { FormDateInput, FormDateInputProps } from '../forms/FormDateInput'
import { FormDateTimeInput, FormDateTimeInputProps } from '../forms/FormDateTimeInput'
import { FormFileInput, FormFileInputProps } from '../forms/FormFileInput'
import { FormPhoneInput, FormPhoneInputProps } from '../forms/FormPhoneInput'
import { FormMultiSelect, FormMultiSelectProps } from '../forms/FormMultiSelect'

export type FieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'tel'
  | 'url'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'select-search'
  | 'date'
  | 'datetime'
  | 'file'
  | 'phone'
  | 'multiselect'
  | 'hidden'

export interface FormFieldConfig {
  /** Field name */
  name: string
  /** Field type */
  type: FieldType
  /** Field label */
  label?: string
  /** Placeholder text */
  placeholder?: string
  /** Whether field is required */
  required?: boolean
  /** Whether field is disabled */
  disabled?: boolean
  /** Helper text */
  helperText?: string
  /** Error message */
  error?: string
  /** Additional className for the field */
  className?: string
  /** Additional className for the container */
  containerClassName?: string
  /** Options for select/radio/checkbox fields */
  options?: Array<{ value: string | number; label: string }>
  /** Default value */
  defaultValue?: any
  /** Validation rules */
  validation?: Record<string, any>
  /** Whether to hide the field */
  hidden?: boolean
  /** Custom props to pass to the field component */
  customProps?: Record<string, any>
}

export interface FormFactoryProps {
  /** Form field configurations */
  fields: FormFieldConfig[]
  /** Current form values */
  values?: Record<string, any>
  /** Field errors */
  errors?: Record<string, string>
  /** Callback when field value changes */
  onChange?: (name: string, value: any) => void
  /** Callback when field loses focus */
  onBlur?: (name: string) => void
  /** Whether the entire form is disabled */
  disabled?: boolean
  /** Layout direction */
  direction?: 'vertical' | 'horizontal'
  /** Number of columns for horizontal layout */
  columns?: 1 | 2 | 3 | 4
  /** Gap between fields */
  gap?: 'sm' | 'md' | 'lg'
  /** Additional className for the form */
  className?: string
  /** Field size */
  size?: 'sm' | 'md' | 'lg'
}

const gapClasses = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
}

export const FormFactory: React.FC<FormFactoryProps> = ({
  fields,
  values = {},
  errors = {},
  onChange,
  onBlur,
  disabled = false,
  direction = 'vertical',
  columns = 1,
  gap = 'md',
  className,
  size = 'md',
}) => {
  const handleChange = (name: string, value: any) => {
    onChange?.(name, value)
  }

  const renderField = (field: FormFieldConfig) => {
    const {
      name,
      type,
      label,
      placeholder,
      required,
      disabled: fieldDisabled,
      helperText,
      options,
      customProps,
      className: fieldClassName,
      containerClassName,
    } = field

    const value = values[name]
    const error = errors[name]
    const isDisabled = disabled || fieldDisabled

    const commonProps = {
      label,
      placeholder,
      required,
      disabled: isDisabled,
      helperText,
      error,
      className: fieldClassName,
      containerClassName,
      size,
    }

    switch (type) {
      case 'text':
      case 'email':
      case 'password':
      case 'number':
      case 'tel':
      case 'url':
        return (
          <FormTextInput
            {...commonProps}
            {...customProps}
            type={type}
            value={value || ''}
            onChange={(e) => handleChange(name, e.target.value)}
            onBlur={() => onBlur?.(name)}
          />
        )

      case 'textarea':
        return (
          <FormTextArea
            {...commonProps}
            {...customProps}
            value={value || ''}
            onChange={(e) => handleChange(name, e.target.value)}
            onBlur={() => onBlur?.(name)}
          />
        )

      case 'checkbox':
        return (
          <FormCheckBox
            {...commonProps}
            {...customProps}
            checked={value || false}
            onChange={(e) => handleChange(name, e.target.checked)}
            onBlur={() => onBlur?.(name)}
          />
        )

      case 'radio':
        return (
          <FormRadioBtn
            {...commonProps}
            {...customProps}
            options={options || []}
            value={value}
            onChange={(e) => handleChange(name, e.target.value)}
            onBlur={() => onBlur?.(name)}
          />
        )

      case 'select':
        return (
          <FormSelectInput
            {...commonProps}
            {...customProps}
            options={options || []}
            value={value || ''}
            onChange={(e) => handleChange(name, e.target.value)}
            onBlur={() => onBlur?.(name)}
          />
        )

      case 'select-search':
        return (
          <FormSelectSearch
            {...commonProps}
            {...customProps}
            options={options || []}
            value={value}
            onChange={(val) => handleChange(name, val)}
          />
        )

      case 'date':
        return (
          <FormDateInput
            {...commonProps}
            {...customProps}
            value={value || ''}
            onChange={(e) => handleChange(name, e.target.value)}
            onBlur={() => onBlur?.(name)}
          />
        )

      case 'datetime':
        return (
          <FormDateTimeInput
            {...commonProps}
            {...customProps}
            value={value || ''}
            onChange={(e) => handleChange(name, e.target.value)}
            onBlur={() => onBlur?.(name)}
          />
        )

      case 'file':
        return (
          <FormFileInput
            {...commonProps}
            {...customProps}
            value={value}
            onChange={(files) => handleChange(name, files)}
          />
        )

      case 'phone':
        return (
          <FormPhoneInput
            {...commonProps}
            {...customProps}
            value={value}
            onChange={(val) => handleChange(name, val)}
          />
        )

      case 'multiselect':
        return (
          <FormMultiSelect
            {...commonProps}
            {...customProps}
            options={options || []}
            value={value || []}
            onChange={(val) => handleChange(name, val)}
          />
        )

      case 'hidden':
        return (
          <input
            type="hidden"
            name={name}
            value={value || ''}
          />
        )

      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        direction === 'vertical' ? 'flex flex-col' : 'flex flex-wrap',
        gapClasses[gap],
        direction === 'horizontal' && `grid grid-cols-${columns}`,
        className
      )}
    >
      {fields.map((field) => (
        <div
          key={field.name}
          className={cn(field.hidden && 'hidden')}
        >
          {renderField(field)}
        </div>
      ))}
    </div>
  )
}

export default FormFactory
