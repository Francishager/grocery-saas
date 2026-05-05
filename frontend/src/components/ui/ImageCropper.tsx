import React, { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Move, Check, X, Upload } from 'lucide-react'

export interface ImageCropperProps {
  /** Initial image URL */
  initialImage?: string
  /** Callback when image is cropped */
  onCrop: (file: File | Blob) => void
  /** Callback when cropper is cancelled */
  onCancel?: () => void
  /** Aspect ratio for crop area */
  aspectRatio?: number
  /** Output width */
  outputWidth?: number
  /** Output height */
  outputHeight?: number
  /** Output format */
  format?: 'image/jpeg' | 'image/png' | 'image/webp'
  /** Output quality (0-1) */
  quality?: number
  /** Maximum file size in bytes */
  maxSize?: number
  /** Allowed file types */
  acceptedTypes?: string[]
  /** Additional className */
  className?: string
  /** Container className */
  containerClassName?: string
  /** Whether to show zoom controls */
  showZoomControls?: boolean
  /** Whether to show rotation controls */
  showRotationControls?: boolean
  /** Whether circular crop */
  circularCrop?: boolean
  /** Title */
  title?: string
  /** Upload button text */
  uploadButtonText?: string
  /** Cancel button text */
  cancelButtonText?: string
  /** Confirm button text */
  confirmButtonText?: string
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  initialImage,
  onCrop,
  onCancel,
  aspectRatio = 1,
  outputWidth = 300,
  outputHeight = 300,
  format = 'image/jpeg',
  quality = 0.9,
  maxSize,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  className,
  containerClassName,
  showZoomControls = true,
  showRotationControls = true,
  circularCrop = false,
  title = 'Crop Image',
  uploadButtonText = 'Upload Image',
  cancelButtonText = 'Cancel',
  confirmButtonText = 'Confirm',
}) => {
  const [image, setImage] = useState<string | null>(initialImage || null)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!acceptedTypes.includes(file.type)) {
      alert('Invalid file type')
      return
    }

    if (maxSize && file.size > maxSize) {
      alert(`File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`)
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      setImage(event.target?.result as string)
      setZoom(1)
      setRotation(0)
      setPosition({ x: 0, y: 0 })
    }
    reader.readAsDataURL(file)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    },
    [isDragging, dragStart]
  )

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleCrop = () => {
    if (!image || !canvasRef.current || !imageRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = outputWidth
    canvas.height = outputHeight

    const img = imageRef.current
    const scale = zoom
    const rot = (rotation * Math.PI) / 180

    ctx.save()
    ctx.translate(outputWidth / 2, outputHeight / 2)
    ctx.rotate(rot)
    ctx.scale(scale, scale)
    ctx.translate(
      -img.naturalWidth / 2 + position.x / scale,
      -img.naturalHeight / 2 + position.y / scale
    )
    ctx.drawImage(img, 0, 0)
    ctx.restore()

    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCrop(blob)
        }
      },
      format,
      quality
    )
  }

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.1, 3))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.1, 0.5))
  const handleRotateRight = () => setRotation((prev) => (prev + 90) % 360)
  const handleRotateLeft = () => setRotation((prev) => (prev - 90 + 360) % 360)

  return (
    <div className={cn('flex flex-col gap-4', containerClassName)}>
      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>

      {/* Image area */}
      <div
        className={cn(
          'relative bg-gray-100 border-2 border-dashed border-gray-300 overflow-hidden',
          circularCrop ? 'rounded-full' : 'rounded-lg',
          className
        )}
        style={{
          width: outputWidth,
          height: outputHeight,
          aspectRatio,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {image ? (
          <img
            ref={imageRef}
            src={image}
            alt="Crop preview"
            className="absolute max-w-none cursor-move"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-500">
            <Upload className="h-8 w-8" />
            <p className="text-sm">Click to upload</p>
          </div>
        )}

        {/* Click overlay to trigger file input */}
        {!image && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 w-full h-full cursor-pointer"
          />
        )}
      </div>

      {/* Controls */}
      {image && (
        <div className="flex items-center justify-center gap-2">
          {showZoomControls && (
            <>
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </>
          )}

          {showRotationControls && (
            <>
              <button
                type="button"
                onClick={handleRotateLeft}
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                title="Rotate left"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleRotateRight}
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                title="Rotate right"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
            title="Change image"
          >
            <Upload className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          {cancelButtonText}
        </button>
        {image && (
          <button
            type="button"
            onClick={handleCrop}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
          >
            {confirmButtonText}
          </button>
        )}
      </div>
    </div>
  )
}

export default ImageCropper
