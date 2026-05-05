import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { createPortal } from 'react-dom'

export interface PopoverLayoutProps {
  /** Trigger element */
  trigger: React.ReactNode
  /** Popover content */
  children: React.ReactNode
  /** Popover position */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** Alignment */
  align?: 'start' | 'center' | 'end'
  /** Whether popover is open (controlled) */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
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
  /** Popover title */
  title?: string
  /** Popover footer */
  footer?: React.ReactNode
  /** Whether to show header divider */
  headerDivider?: boolean
  /** Whether to show footer divider */
  footerDivider?: boolean
}

export const PopoverLayout: React.FC<PopoverLayoutProps> = ({
  trigger,
  children,
  position = 'bottom',
  align = 'center',
  open: controlledOpen,
  onOpenChange,
  triggerType = 'click',
  showArrow = true,
  offset = 8,
  width,
  closeOnOutsideClick = true,
  closeOnEscape = true,
  popoverClassName,
  className,
  disabled = false,
  title,
  footer,
  headerDivider = true,
  footerDivider = true,
}) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen

  const setOpen = (value: boolean) => {
    if (disabled) return
    setInternalOpen(value)
    onOpenChange?.(value)
  }

  const toggleOpen = () => setOpen(!isOpen)

  useEffect(() => {
    if (!closeOnOutsideClick || !isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current?.contains(event.target as Node) ||
        popoverRef.current?.contains(event.target as Node)
      ) {
        return
      }
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeOnOutsideClick, isOpen])

  useEffect(() => {
    if (!closeOnEscape || !isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeOnEscape, isOpen])

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

  const triggerHandlers = {
    click: { onClick: toggleOpen },
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
      {title && (
        <div
          className={cn(
            'px-4 py-3',
            headerDivider && 'border-b border-gray-200'
          )}
        >
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
      )}

      <div className="p-4">{children}</div>

      {footer && (
        <div
          className={cn(
            'px-4 py-3',
            footerDivider && 'border-t border-gray-200'
          )}
        >
          {footer}
        </div>
      )}
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

export default PopoverLayout
