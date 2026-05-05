import React, { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { createPortal } from 'react-dom'

export interface PopoverProps {
  /** Trigger element */
  trigger: React.ReactNode
  /** Popover content */
  content: React.ReactNode
  /** Whether popover is open (controlled) */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Popover position */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** Alignment */
  align?: 'start' | 'center' | 'end'
  /** Trigger type */
  triggerType?: 'click' | 'hover' | 'focus'
  /** Whether to show arrow */
  showArrow?: boolean
  /** Offset from trigger */
  offset?: number
  /** Popover width */
  width?: string | number
  /** Whether to close on click outside */
  closeOnOutsideClick?: boolean
  /** Whether to close on Escape key */
  closeOnEscape?: boolean
  /** Additional className for popover */
  popoverClassName?: string
  /** Additional className for container */
  className?: string
  /** Whether popover is disabled */
  disabled?: boolean
}

export const Popover: React.FC<PopoverProps> = ({
  trigger,
  content,
  open: controlledOpen,
  onOpenChange,
  position = 'bottom',
  align = 'center',
  triggerType = 'click',
  showArrow = true,
  offset = 8,
  width,
  closeOnOutsideClick = true,
  closeOnEscape = true,
  popoverClassName,
  className,
  disabled = false,
}) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen

  const setOpen = useCallback(
    (value: boolean) => {
      if (disabled) return
      setInternalOpen(value)
      onOpenChange?.(value)
    },
    [disabled, onOpenChange]
  )

  const toggleOpen = useCallback(() => {
    setOpen(!isOpen)
  }, [isOpen, setOpen])

  const closePopover = useCallback(() => {
    setOpen(false)
  }, [setOpen])

  // Handle click outside
  useEffect(() => {
    if (!closeOnOutsideClick || !isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current?.contains(event.target as Node) ||
        popoverRef.current?.contains(event.target as Node)
      ) {
        return
      }
      closePopover()
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeOnOutsideClick, isOpen, closePopover])

  // Handle Escape key
  useEffect(() => {
    if (!closeOnEscape || !isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePopover()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeOnEscape, isOpen, closePopover])

  // Calculate popover position
  const getPopoverStyle = (): React.CSSProperties => {
    if (!triggerRef.current) return {}

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
    }

    if (width) {
      style.width = typeof width === 'number' ? `${width}px` : width
    }

    switch (position) {
      case 'top':
        style.bottom = window.innerHeight - triggerRect.top + offset
        break
      case 'bottom':
        style.top = triggerRect.bottom + offset
        break
      case 'left':
        style.right = window.innerWidth - triggerRect.left + offset
        break
      case 'right':
        style.left = triggerRect.right + offset
        break
    }

    switch (align) {
      case 'start':
        if (position === 'top' || position === 'bottom') {
          style.left = triggerRect.left
        } else {
          style.top = triggerRect.top
        }
        break
      case 'center':
        if (position === 'top' || position === 'bottom') {
          style.left = triggerRect.left + triggerRect.width / 2
          style.transform = 'translateX(-50%)'
        } else {
          style.top = triggerRect.top + triggerRect.height / 2
          style.transform = 'translateY(-50%)'
        }
        break
      case 'end':
        if (position === 'top' || position === 'bottom') {
          style.right = window.innerWidth - triggerRect.right
        } else {
          style.bottom = window.innerHeight - triggerRect.bottom
        }
        break
    }

    return style
  }

  const arrowClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-800',
    bottom: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-800',
    left: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-800',
    right: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-800',
  }

  const triggerHandlers = {
    click: {
      onClick: toggleOpen,
    },
    hover: {
      onMouseEnter: () => setOpen(true),
      onMouseLeave: () => setOpen(false),
    },
    focus: {
      onFocus: () => setOpen(true),
      onBlur: () => setOpen(false),
    },
  }

  const popoverContent = isOpen && (
    <div
      ref={popoverRef}
      style={getPopoverStyle()}
      className={cn(
        'bg-white rounded-lg shadow-xl border border-gray-200',
        popoverClassName
      )}
      role="tooltip"
    >
      <div className="relative p-3">
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
  )

  return (
    <div
      ref={triggerRef}
      className={cn('inline-block', className)}
      {...triggerHandlers[triggerType]}
    >
      {trigger}
      {popoverContent && createPortal(popoverContent, document.body)}
    </div>
  )
}

export default Popover
