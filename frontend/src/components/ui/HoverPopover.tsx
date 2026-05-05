import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

export interface HoverPopoverProps {
  /** Trigger element */
  trigger: React.ReactNode
  /** Popover content */
  content: React.ReactNode
  /** Popover position */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** Alignment */
  align?: 'start' | 'center' | 'end'
  /** Delay before showing (ms) */
  showDelay?: number
  /** Delay before hiding (ms) */
  hideDelay?: number
  /** Whether popover is disabled */
  disabled?: boolean
  /** Additional className for popover */
  popoverClassName?: string
  /** Additional className for container */
  className?: string
  /** Whether to show arrow */
  showArrow?: boolean
  /** Popover width */
  width?: string | number
  /** Whether to close on click inside */
  closeOnClick?: boolean
  /** Offset from trigger */
  offset?: number
}

export const HoverPopover: React.FC<HoverPopoverProps> = ({
  trigger,
  content,
  position = 'top',
  align = 'center',
  showDelay = 100,
  hideDelay = 100,
  disabled = false,
  popoverClassName,
  className,
  showArrow = true,
  width,
  closeOnClick = false,
  offset = 8,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearTimeouts = () => {
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
  }

  const handleMouseEnter = () => {
    if (disabled) return
    clearTimeouts()
    showTimeoutRef.current = setTimeout(() => setIsVisible(true), showDelay)
  }

  const handleMouseLeave = () => {
    clearTimeouts()
    hideTimeoutRef.current = setTimeout(() => setIsVisible(false), hideDelay)
  }

  const handleClick = () => {
    if (closeOnClick) {
      setIsVisible(false)
    }
  }

  useEffect(() => {
    return () => clearTimeouts()
  }, [])

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const alignClasses = {
    start: {
      top: 'left-0 -translate-x-0',
      bottom: 'left-0 -translate-x-0',
      left: 'top-0 -translate-y-0',
      right: 'top-0 -translate-y-0',
    },
    center: {
      top: 'left-1/2 -translate-x-1/2',
      bottom: 'left-1/2 -translate-x-1/2',
      left: 'top-1/2 -translate-y-1/2',
      right: 'top-1/2 -translate-y-1/2',
    },
    end: {
      top: 'right-0 translate-x-0',
      bottom: 'right-0 translate-x-0',
      left: 'bottom-0 translate-y-0',
      right: 'bottom-0 translate-y-0',
    },
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-800',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-800',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-800',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-800',
  }

  return (
    <div
      ref={triggerRef}
      className={cn('relative inline-block', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {trigger}

      {isVisible && content && (
        <div
          ref={popoverRef}
          className={cn(
            'absolute z-50',
            alignClasses[align][position],
            popoverClassName
          )}
          style={{
            width: width ? (typeof width === 'number' ? `${width}px` : width) : 'auto',
            [position === 'top' || position === 'bottom' ? 'marginBottom' : 'marginRight']: offset,
          }}
          onClick={handleClick}
        >
          <div className="relative bg-gray-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg">
            {content}

            {showArrow && (
              <div
                className={cn(
                  'absolute w-0 h-0 border-4',
                  arrowClasses[position]
                )}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default HoverPopover
