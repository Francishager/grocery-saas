import React from 'react'
import { cn } from '@/lib/utils'

export interface StyledCustomTopBarBoxProps {
  /** Children content */
  children: React.ReactNode
  /** Background color */
  backgroundColor?: string
  /** Text color */
  textColor?: string
  /** Height */
  height?: string | number
  /** Whether to show shadow */
  shadow?: boolean
  /** Shadow size */
  shadowSize?: 'sm' | 'md' | 'lg'
  /** Whether to show border */
  bordered?: boolean
  /** Border position */
  borderPosition?: 'top' | 'bottom'
  /** Border color */
  borderColor?: string
  /** Whether to make it sticky */
  sticky?: boolean
  /** Sticky position */
  stickyPosition?: 'top' | 'bottom'
  /** Z-index */
  zIndex?: number
  /** Padding */
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Additional className */
  className?: string
  /** Whether to blur background */
  blur?: boolean
  /** Blur intensity */
  blurIntensity?: number
}

const shadowClasses = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
}

const paddingClasses = {
  none: 'p-0',
  sm: 'px-4 py-2',
  md: 'px-6 py-3',
  lg: 'px-8 py-4',
}

export const StyledCustomTopBarBox: React.FC<StyledCustomTopBarBoxProps> = ({
  children,
  backgroundColor = 'bg-white',
  textColor = 'text-gray-900',
  height = 'auto',
  shadow = true,
  shadowSize = 'sm',
  bordered = false,
  borderPosition = 'bottom',
  borderColor = 'border-gray-200',
  sticky = false,
  stickyPosition = 'top',
  zIndex = 40,
  padding = 'md',
  className,
  blur = false,
  blurIntensity = 10,
}) => {
  return (
    <div
      className={cn(
        'w-full',
        backgroundColor,
        textColor,
        shadow && shadowClasses[shadowSize],
        bordered && 'border-b',
        borderPosition === 'top' && 'border-t',
        borderPosition === 'bottom' && 'border-b',
        borderColor,
        sticky && 'sticky',
        paddingClasses[padding],
        className
      )}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        top: sticky && stickyPosition === 'top' ? 0 : undefined,
        bottom: sticky && stickyPosition === 'bottom' ? 0 : undefined,
        zIndex,
        backdropFilter: blur ? `blur(${blurIntensity}px)` : undefined,
        WebkitBackdropFilter: blur ? `blur(${blurIntensity}px)` : undefined,
      }}
    >
      {children}
    </div>
  )
}

export default StyledCustomTopBarBox
