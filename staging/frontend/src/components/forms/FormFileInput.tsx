import React, { forwardRef, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Upload, X, FileIcon } from 'lucide-react'

export interface FormFileInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  accept?: string
  multiple?: boolean
  value?: File | File[] | null
  onChange?: (files: File | File[] | null) => void
  maxSize?: number // in MB
  showPreview?: boolean
}

export const FormFileInput = forwardRef<HTMLInputElement, FormFileInputProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      className,
      containerClassName,
      id,
      accept,
      multiple = false,
      value,
      onChange,
      maxSize = 5,
      showPreview = true,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const [dragActive, setDragActive] = useState(false)

    const inputId = id || `file-${Math.random().toString(36).substr(2, 9)}`

    const files = value ? (Array.isArray(value) ? value : [value]) : []

    const handleClick = () => {
      inputRef.current?.click()
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selectedFiles = Array.from(e.target.files)
        
        // Check file size
        const oversizedFiles = selectedFiles.filter(
          (file) => file.size > maxSize * 1024 * 1024
        )
        if (oversizedFiles.length > 0) {
          console.warn(`Some files exceed the maximum size of ${maxSize}MB`)
          return
        }

        if (multiple) {
          onChange?.(selectedFiles)
        } else {
          onChange?.(selectedFiles[0] || null)
        }
      }
    }

    const handleDrag = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.type === 'dragenter' || e.type === 'dragover') {
        setDragActive(true)
      } else if (e.type === 'dragleave') {
        setDragActive(false)
      }
    }

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const droppedFiles = Array.from(e.dataTransfer.files)
        
        if (multiple) {
          onChange?.(droppedFiles)
        } else {
          onChange?.(droppedFiles[0] || null)
        }
      }
    }

    const handleRemove = (index: number) => {
      if (multiple && Array.isArray(value)) {
        const newFiles = value.filter((_, i) => i !== index)
        onChange?.(newFiles.length > 0 ? newFiles : null)
      } else {
        onChange?.(null)
      }
    }

    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes'
      const k = 1024
      const sizes = ['Bytes', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return (
      <div className={cn('space-y-1', containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        
        <div
          onClick={handleClick}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors',
            'hover:border-primary hover:bg-primary/5',
            dragActive && 'border-primary bg-primary/5',
            error
              ? 'border-red-500'
              : 'border-gray-300',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
        >
          <input
            ref={(el) => {
              // Handle both refs
              ;(inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
              if (typeof ref === 'function') ref(el)
              else if (ref) ref.current = el
            }}
            type="file"
            id={inputId}
            accept={accept}
            multiple={multiple}
            onChange={handleChange}
            disabled={disabled}
            className="hidden"
            {...props}
          />
          
          <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            <span className="font-medium text-primary">Click to upload</span>
            {' '}or drag and drop
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Max file size: {maxSize}MB
          </p>
        </div>

        {showPreview && files.length > 0 && (
          <div className="mt-2 space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-md border"
              >
                <div className="flex items-center gap-2">
                  <FileIcon className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    )
  }
)

FormFileInput.displayName = 'FormFileInput'

export default FormFileInput
