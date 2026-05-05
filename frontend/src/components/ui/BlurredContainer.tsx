import React from 'react'
import { cn } from '@/lib/utils'

export interface BlurredContainerProps {
  /** Children content */
  children: React.ReactNode
  /** Blur intensity (0-20) */
  blur?: number
  /** Background opacity (0-1) */
  opacity?: number
  /** Background color */
  backgroundColor?: string
  /** Border radius */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /** Whether to show border */
  bordered?: boolean
  /** Border color */
  borderColor?: string
  /** Whether to show shadow */
  shadow?: boolean
  /** Shadow size */
  shadowSize?: 'sm' | 'md' | 'lg' | 'xl'
  /** Padding */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  /** Additional className */
  className?: string
  /** Container element */
  as?: 'div' | 'section' | 'article' | 'aside'
}

const roundedClasses = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
}

const paddingClasses = {
  none: 'p-0',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
}

const shadowClasses = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
}

export const BlurredContainer: React.FC<BlurredContainerProps> = ({
  children,
  blur = 10,
  opacity = 0.8,
  backgroundColor = 'rgba(255, 255, 255, 0.1)',
  rounded = 'lg',
  bordered = true,
  borderColor = 'rgba(255, 255, 255, 0.2)',
  shadow = true,
  shadowSize = 'lg',
  padding = 'md',
  className,
  as: Component = 'div',
}) => {
  return (
    <Component
      className={cn(
        'relative overflow-hidden',
        roundedClasses[rounded],
        paddingClasses[padding],
        shadow && shadowClasses[shadowSize],
        bordered && 'border',
        className
      )}
      style={{
        backgroundColor,
        borderColor,
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
      }}
    >
      {/* Glass overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, rgba(255,255,255,${opacity * 0.3}) 0%, rgba(255,255,255,${opacity * 0.1}) 100%)`,
        }}
      />
      
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </Component>
  )
}

export default BlurredContainer
