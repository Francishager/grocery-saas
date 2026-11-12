import React from 'react'
import { cn } from '@/lib/utils'

export interface TypographyProps {
  /** Text content */
  children: React.ReactNode
  /** Typography variant */
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'subtitle1' | 'subtitle2' | 'body1' | 'body2' | 'caption' | 'overline' | 'inherit'
  /** Text alignment */
  align?: 'left' | 'center' | 'right' | 'justify'
  /** Text color */
  color?: 'default' | 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'info' | 'inherit'
  /** Whether text is bold */
  bold?: boolean
  /** Whether text is italic */
  italic?: boolean
  /** Whether to truncate text with ellipsis */
  noWrap?: boolean
  /** Whether to show as paragraph */
  paragraph?: boolean
  /** Whether text is gutter bottom */
  gutterBottom?: boolean
  /** Additional className */
  className?: string
  /** HTML element */
  component?: keyof JSX.IntrinsicElements
  /** Click handler */
  onClick?: () => void
}

const variantClasses = {
  h1: 'text-4xl font-bold',
  h2: 'text-3xl font-bold',
  h3: 'text-2xl font-semibold',
  h4: 'text-xl font-semibold',
  h5: 'text-lg font-medium',
  h6: 'text-base font-medium',
  subtitle1: 'text-base font-medium',
  subtitle2: 'text-sm font-medium',
  body1: 'text-base',
  body2: 'text-sm',
  caption: 'text-xs',
  overline: 'text-xs uppercase tracking-wider',
  inherit: '',
}

const colorClasses = {
  default: 'text-gray-900',
  primary: 'text-primary',
  secondary: 'text-gray-600',
  error: 'text-red-600',
  warning: 'text-yellow-600',
  success: 'text-green-600',
  info: 'text-blue-600',
  inherit: '',
}

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
}

const defaultComponents = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  subtitle1: 'h6',
  subtitle2: 'h6',
  body1: 'p',
  body2: 'p',
  caption: 'span',
  overline: 'span',
  inherit: 'span',
}

export const Typography: React.FC<TypographyProps> = ({
  children,
  variant = 'body1',
  align = 'left',
  color = 'default',
  bold = false,
  italic = false,
  noWrap = false,
  paragraph = false,
  gutterBottom = false,
  className,
  component,
  onClick,
}) => {
  const Component = component || (paragraph ? 'p' : defaultComponents[variant]) as keyof JSX.IntrinsicElements

  return (
    <Component
      className={cn(
        variantClasses[variant],
        colorClasses[color],
        alignClasses[align],
        bold && 'font-bold',
        italic && 'italic',
        noWrap && 'truncate',
        gutterBottom && 'mb-2',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </Component>
  )
}

export default Typography
