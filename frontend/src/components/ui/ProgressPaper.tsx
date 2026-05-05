import React from 'react'
import { cn } from '@/lib/utils'

export interface ProgressPaperProps {
  /** Children content */
  children: React.ReactNode
  /** Progress percentage (0-100) */
  progress?: number
  /** Progress color */
  progressColor?: string
  /** Background color */
  backgroundColor?: string
  /** Border radius */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /** Shadow */
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  /** Whether to show border */
  bordered?: boolean
  /** Border color */
  borderColor?: string
  /** Progress position */
  progressPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** Progress thickness */
  progressThickness?: number
  /** Whether to animate progress */
  animated?: boolean
  /** Additional className */
  className?: string
  /** Padding */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  /** Hover effect */
  hoverable?: boolean
  /** Click handler */
  onClick?: () => void
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

const shadowClasses = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
}

const paddingClasses = {
  none: 'p-0',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
}

export const ProgressPaper: React.FC<ProgressPaperProps> = ({
  children,
  progress = 0,
  progressColor = 'bg-primary',
  backgroundColor = 'bg-white',
  rounded = 'lg',
  shadow = 'md',
  bordered = false,
  borderColor = 'border-gray-200',
  progressPosition = 'top',
  progressThickness = 4,
  animated = true,
  className,
  padding = 'md',
  hoverable = false,
  onClick,
}) => {
  const isVertical = progressPosition === 'left' || progressPosition === 'right'

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        backgroundColor,
        roundedClasses[rounded],
        shadowClasses[shadow],
        bordered && 'border',
        borderColor,
        paddingClasses[padding],
        hoverable && 'transition-shadow hover:shadow-lg',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {/* Progress indicator */}
      {progress > 0 && (
        <div
          className={cn(
            'absolute',
            isVertical ? 'h-full' : 'w-full',
            progressColor,
            animated && 'transition-all duration-300'
          )}
          style={{
            [isVertical ? 'width' : 'height']: progressThickness,
            [progressPosition]: 0,
            [isVertical ? 'height' : 'width']: `${progress}%`,
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}

export default ProgressPaper
