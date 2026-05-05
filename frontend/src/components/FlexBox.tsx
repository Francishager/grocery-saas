import React from 'react'
import { cn } from '@/lib/utils'

export interface FlexBoxProps {
  /** Children content */
  children: React.ReactNode
  /** Flex direction */
  direction?: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  /** Justify content */
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly'
  /** Align items */
  align?: 'start' | 'end' | 'center' | 'baseline' | 'stretch'
  /** Flex wrap */
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  /** Gap between items */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  /** Whether to grow */
  grow?: boolean
  /** Whether to shrink */
  shrink?: boolean
  /** Flex basis */
  basis?: string | number
  /** Padding */
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Margin */
  margin?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Width */
  width?: string | number | 'full' | 'screen' | 'auto'
  /** Height */
  height?: string | number | 'full' | 'screen' | 'auto'
  /** Whether to center content */
  center?: boolean
  /** Whether to center horizontally only */
  centerX?: boolean
  /** Whether to center vertically only */
  centerY?: boolean
  /** Additional className */
  className?: string
  /** HTML element */
  as?: 'div' | 'section' | 'article' | 'aside' | 'nav' | 'header' | 'footer' | 'main'
  /** onClick handler */
  onClick?: () => void
  /** Inline flex */
  inline?: boolean
}

const directionClasses = {
  row: 'flex-row',
  'row-reverse': 'flex-row-reverse',
  column: 'flex-col',
  'column-reverse': 'flex-col-reverse',
}

const justifyClasses = {
  start: 'justify-start',
  end: 'justify-end',
  center: 'justify-center',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
}

const alignClasses = {
  start: 'items-start',
  end: 'items-end',
  center: 'items-center',
  baseline: 'items-baseline',
  stretch: 'items-stretch',
}

const wrapClasses = {
  nowrap: 'flex-nowrap',
  wrap: 'flex-wrap',
  'wrap-reverse': 'flex-wrap-reverse',
}

const gapClasses = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
  '2xl': 'gap-10',
}

const paddingClasses = {
  none: 'p-0',
  xs: 'p-1',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
}

const marginClasses = {
  none: 'm-0',
  xs: 'm-1',
  sm: 'm-2',
  md: 'm-4',
  lg: 'm-6',
  xl: 'm-8',
}

const widthClasses = {
  full: 'w-full',
  screen: 'w-screen',
  auto: 'w-auto',
}

const heightClasses = {
  full: 'h-full',
  screen: 'h-screen',
  auto: 'h-auto',
}

export const FlexBox: React.FC<FlexBoxProps> = ({
  children,
  direction = 'row',
  justify = 'start',
  align = 'start',
  wrap = 'nowrap',
  gap = 'md',
  grow = false,
  shrink = false,
  basis,
  padding = 'none',
  margin = 'none',
  width,
  height,
  center = false,
  centerX = false,
  centerY = false,
  className,
  as: Component = 'div',
  onClick,
  inline = false,
}) => {
  const widthClass = typeof width === 'string' ? widthClasses[width] : undefined
  const heightClass = typeof height === 'string' ? heightClasses[height] : undefined

  return (
    <Component
      className={cn(
        inline ? 'inline-flex' : 'flex',
        directionClasses[direction],
        justifyClasses[justify],
        alignClasses[align],
        wrapClasses[wrap],
        gapClasses[gap],
        paddingClasses[padding],
        marginClasses[margin],
        grow && 'grow',
        shrink && 'shrink',
        widthClass,
        heightClass,
        (center || centerX) && 'justify-center',
        (center || centerY) && 'items-center',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        flexBasis: typeof basis === 'number' ? `${basis}px` : basis,
        width: typeof width === 'number' ? `${width}px` : undefined,
        height: typeof height === 'number' ? `${height}px` : undefined,
      }}
      onClick={onClick}
    >
      {children}
    </Component>
  )
}

export default FlexBox
