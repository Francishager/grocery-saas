import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { User, Camera, X } from 'lucide-react'

export interface UkoAvatarProps {
  /** Avatar image source */
  src?: string
  /** Alt text for image */
  alt?: string
  /** Avatar size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  /** User name initials fallback */
  name?: string
  /** Whether avatar is editable */
  editable?: boolean
  /** Callback when avatar is clicked */
  onClick?: () => void
  /** Callback when avatar is changed */
  onChange?: (file: File) => void
  /** Whether avatar is online */
  online?: boolean
  /** Whether avatar is offline */
  offline?: boolean
  /** Additional className */
  className?: string
  /** Custom initials */
  initials?: string
  /** Badge content */
  badge?: React.ReactNode
  /** Badge position */
  badgePosition?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'
  /** Avatar shape */
  shape?: 'circle' | 'rounded' | 'square'
  /** Border color */
  borderColor?: string
  /** Whether to show status indicator */
  showStatus?: boolean
}

const sizeClasses = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-16 w-16 text-xl',
  '2xl': 'h-20 w-20 text-2xl',
}

const statusSizeClasses = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-4 w-4',
  '2xl': 'h-5 w-5',
}

const shapeClasses = {
  circle: 'rounded-full',
  rounded: 'rounded-lg',
  square: 'rounded-none',
}

const badgePositionClasses = {
  'top-right': 'top-0 right-0',
  'bottom-right': 'bottom-0 right-0',
  'top-left': 'top-0 left-0',
  'bottom-left': 'bottom-0 left-0',
}

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const getColorFromName = (name: string): string => {
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-green-500',
    'bg-teal-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-purple-500',
    'bg-pink-500',
  ]
  
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  return colors[Math.abs(hash) % colors.length]
}

export const UkoAvatar: React.FC<UkoAvatarProps> = ({
  src,
  alt,
  size = 'md',
  name,
  editable = false,
  onClick,
  onChange,
  online,
  offline,
  className,
  initials,
  badge,
  badgePosition = 'bottom-right',
  shape = 'circle',
  borderColor,
  showStatus = true,
}) => {
  const [imageError, setImageError] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const displayInitials = initials || (name ? getInitials(name) : '')
  const backgroundColor = !src || imageError ? getColorFromName(name || 'User') : ''

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onChange) {
      onChange(file)
    }
  }

  const handleEditClick = () => {
    fileInputRef.current?.click()
  }

  const statusColor = online ? 'bg-green-500' : offline ? 'bg-gray-400' : null

  return (
    <div
      className={cn('relative inline-block', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hidden file input for editable mode */}
      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      )}

      {/* Avatar container */}
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden',
          sizeClasses[size],
          shapeClasses[shape],
          borderColor && 'border-2',
          onClick && 'cursor-pointer'
        )}
        style={borderColor ? { borderColor } : undefined}
        onClick={editable ? handleEditClick : onClick}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt={alt || name || 'Avatar'}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className={cn(
              'w-full h-full flex items-center justify-center text-white font-medium',
              backgroundColor
            )}
          >
            {displayInitials || <User className="h-1/2 w-1/2" />}
          </div>
        )}

        {/* Edit overlay */}
        {editable && isHovered && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Camera className="h-1/3 w-1/3 text-white" />
          </div>
        )}
      </div>

      {/* Status indicator */}
      {showStatus && statusColor && (
        <div
          className={cn(
            'absolute rounded-full border-2 border-white',
            statusSizeClasses[size],
            statusColor,
            badgePositionClasses['bottom-right']
          )}
        />
      )}

      {/* Badge */}
      {badge && (
        <div
          className={cn('absolute', badgePositionClasses[badgePosition])}
        >
          {badge}
        </div>
      )}
    </div>
  )
}

export default UkoAvatar
