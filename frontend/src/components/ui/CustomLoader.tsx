import React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export interface CustomLoaderProps {
  /** Loader size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Loader color */
  color?: 'primary' | 'secondary' | 'white' | 'current'
  /** Loader variant */
  variant?: 'spinner' | 'dots' | 'pulse' | 'bars' | 'ring'
  /** Loading text */
  text?: string
  /** Text position */
  textPosition?: 'top' | 'bottom' | 'right' | 'left'
  /** Whether to center the loader */
  center?: boolean
  /** Full screen loader */
  fullScreen?: boolean
  /** Overlay background */
  overlay?: boolean
  /** Additional className */
  className?: string
  /** Custom color value */
  customColor?: string
}

const sizeClasses = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
}

const colorClasses = {
  primary: 'text-primary',
  secondary: 'text-gray-500',
  white: 'text-white',
  current: 'text-current',
}

export const CustomLoader: React.FC<CustomLoaderProps> = ({
  size = 'md',
  color = 'primary',
  variant = 'spinner',
  text,
  textPosition = 'bottom',
  center = false,
  fullScreen = false,
  overlay = false,
  className,
  customColor,
}) => {
  const SpinnerLoader = () => (
    <Loader2
      className={cn(
        'animate-spin',
        sizeClasses[size],
        !customColor && colorClasses[color]
      )}
      style={customColor ? { color: customColor } : undefined}
    />
  )

  const DotsLoader = () => (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            'rounded-full animate-pulse',
            size === 'xs' && 'h-1 w-1',
            size === 'sm' && 'h-1.5 w-1.5',
            size === 'md' && 'h-2 w-2',
            size === 'lg' && 'h-3 w-3',
            size === 'xl' && 'h-4 w-4',
            !customColor && colorClasses[color]
          )}
          style={{
            animationDelay: `${i * 150}ms`,
            ...(customColor ? { backgroundColor: customColor } : {}),
          }}
        />
      ))}
    </div>
  )

  const PulseLoader = () => (
    <div
      className={cn(
        'rounded-full animate-ping',
        sizeClasses[size],
        !customColor && colorClasses[color]
      )}
      style={customColor ? { backgroundColor: customColor } : undefined}
    />
  )

  const BarsLoader = () => (
    <div className="flex items-end gap-1 h-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            'w-1 bg-current animate-pulse',
            !customColor && colorClasses[color]
          )}
          style={{
            height: `${(i % 2 === 0 ? 60 : 100)}%`,
            animationDelay: `${i * 100}ms`,
            color: customColor,
          }}
        />
      ))}
    </div>
  )

  const RingLoader = () => (
    <div
      className={cn(
        'rounded-full border-2 border-t-transparent animate-spin',
        sizeClasses[size],
        !customColor && colorClasses[color]
      )}
      style={customColor ? { borderColor: customColor, borderTopColor: 'transparent' } : undefined}
    />
  )

  const loaders = {
    spinner: SpinnerLoader,
    dots: DotsLoader,
    pulse: PulseLoader,
    bars: BarsLoader,
    ring: RingLoader,
  }

  const LoaderComponent = loaders[variant]

  const content = (
    <div
      className={cn(
        'flex items-center gap-3',
        textPosition === 'top' && 'flex-col-reverse',
        textPosition === 'bottom' && 'flex-col',
        textPosition === 'right' && 'flex-row',
        textPosition === 'left' && 'flex-row-reverse',
        center && 'justify-center',
        className
      )}
    >
      <LoaderComponent />
      {text && (
        <span
          className={cn(
            'text-sm font-medium',
            !customColor && colorClasses[color]
          )}
          style={customColor ? { color: customColor } : undefined}
        >
          {text}
        </span>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center',
          overlay && 'bg-black/50'
        )}
      >
        {content}
      </div>
    )
  }

  return content
}

export default CustomLoader
