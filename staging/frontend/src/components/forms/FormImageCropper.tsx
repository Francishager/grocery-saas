import React, { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Upload, Crop, RotateCw, ZoomIn, ZoomOut, Check, X } from 'lucide-react'

export interface FormImageCropperProps {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  value?: string | null
  onChange?: (value: string | null) => void
  aspectRatio?: number
  maxWidth?: number
  maxHeight?: number
  disabled?: boolean
  className?: string
}

export const FormImageCropper: React.FC<FormImageCropperProps> = ({
  label,
  error,
  helperText,
  required,
  containerClassName,
  value,
  onChange,
  aspectRatio = 1,
  maxWidth = 800,
  maxHeight = 800,
  disabled,
  className,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 100, height: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const src = event.target?.result as string
        setImageSrc(src)
        setIsEditing(true)
        setZoom(1)
        setRotation(0)
        setCropArea({ x: 10, y: 10, width: 80, height: 80 })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return

      const deltaX = e.clientX - dragStart.x
      const deltaY = e.clientY - dragStart.y

      setCropArea((prev) => ({
        ...prev,
        x: Math.max(0, Math.min(100 - prev.width, prev.x + (deltaX / 3))),
        y: Math.max(0, Math.min(100 - prev.height, prev.y + (deltaY / 3))),
      }))

      setDragStart({ x: e.clientX, y: e.clientY })
    },
    [isDragging, dragStart]
  )

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleCrop = () => {
    if (!imageSrc || !canvasRef.current || !imageRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = imageRef.current
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight

    // Calculate crop dimensions
    const cropX = (cropArea.x / 100) * imgWidth
    const cropY = (cropArea.y / 100) * imgHeight
    const cropWidth = (cropArea.width / 100) * imgWidth
    const cropHeight = (cropArea.height / 100) * imgHeight

    // Set canvas size
    const outputWidth = Math.min(maxWidth, cropWidth)
    const outputHeight = Math.min(maxHeight, cropHeight)
    canvas.width = outputWidth
    canvas.height = outputHeight

    // Apply transformations
    ctx.translate(outputWidth / 2, outputHeight / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(zoom, zoom)
    ctx.translate(-outputWidth / 2, -outputHeight / 2)

    // Draw cropped image
    ctx.drawImage(
      img,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      outputWidth,
      outputHeight
    )

    // Get result
    const result = canvas.toDataURL('image/jpeg', 0.9)
    onChange?.(result)
    setIsEditing(false)
    setImageSrc(null)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setImageSrc(null)
    setZoom(1)
    setRotation(0)
  }

  const handleRemove = () => {
    onChange?.(null)
  }

  return (
    <div className={cn('space-y-1', containerClassName)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {!isEditing ? (
        <div className={cn('space-y-2', className)}>
          {value ? (
            <div className="relative inline-block">
              <img
                src={value}
                alt="Preview"
                className="w-32 h-32 object-cover rounded-md border"
              />
              <button
                type="button"
                onClick={handleRemove}
                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className={cn(
                'w-32 h-32 border-2 border-dashed rounded-md flex flex-col items-center justify-center',
                'hover:border-primary hover:bg-primary/5 transition-colors',
                disabled && 'opacity-50 cursor-not-allowed',
                error ? 'border-red-500' : 'border-gray-300'
              )}
            >
              <Upload className="h-6 w-6 text-gray-400 mb-1" />
              <span className="text-xs text-gray-500">Upload</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="border rounded-md p-4 bg-gray-50">
          <div
            className="relative w-full h-64 bg-gray-200 rounded overflow-hidden"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {imageSrc && (
              <>
                <img
                  ref={(el) => {
                    imageRef.current = el
                  }}
                  src={imageSrc}
                  alt="Crop preview"
                  className="w-full h-full object-contain"
                  style={{
                    transform: `rotate(${rotation}deg) scale(${zoom})`,
                  }}
                />
                <div
                  className="absolute border-2 border-primary bg-primary/10 cursor-move"
                  style={{
                    left: `${cropArea.x}%`,
                    top: `${cropArea.y}%`,
                    width: `${cropArea.width}%`,
                    height: `${cropArea.height}%`,
                  }}
                  onMouseDown={handleMouseDown}
                />
              </>
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                className="p-2 hover:bg-gray-200 rounded"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-sm">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
                className="p-2 hover:bg-gray-200 rounded"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-2 hover:bg-gray-200 rounded"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
              >
                <X className="h-4 w-4 inline mr-1" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCrop}
                className="px-3 py-1 text-sm bg-primary text-white rounded hover:bg-primary/90"
              >
                <Check className="h-4 w-4 inline mr-1" />
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {error && <p className="text-sm text-red-500">{error}</p>}
      {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
    </div>
  )
}

export default FormImageCropper
