import React, { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

export interface DrawerBoxProps {
  /** Whether drawer is open */
  open: boolean
  /** Callback when drawer closes */
  onClose: () => void
  /** Drawer position */
  anchor?: 'left' | 'right' | 'top' | 'bottom'
  /** Drawer width (for left/right) or height (for top/bottom) */
  size?: string
  /** Drawer title */
  title?: string
  /** Whether to show close button */
  showCloseButton?: boolean
  /** Whether to show overlay */
  overlay?: boolean
  /** Whether clicking overlay closes drawer */
  closeOnOverlayClick?: boolean
  /** Whether pressing Escape closes drawer */
  closeOnEscape?: boolean
  /** Children content */
  children: React.ReactNode
  /** Additional className for drawer */
  className?: string
  /** Additional className for overlay */
  overlayClassName?: string
  /** Header content */
  header?: React.ReactNode
  /** Footer content */
  footer?: React.ReactNode
  /** Whether to show header divider */
  headerDivider?: boolean
  /** Whether to show footer divider */
  footerDivider?: boolean
}

export const DrawerBox: React.FC<DrawerBoxProps> = ({
  open,
  onClose,
  anchor = 'right',
  size,
  title,
  showCloseButton = true,
  overlay = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  children,
  className,
  overlayClassName,
  header,
  footer,
  headerDivider = true,
  footerDivider = true,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null)

  // Handle Escape key
  useEffect(() => {
    if (!closeOnEscape) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, closeOnEscape])

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Focus trap
  useEffect(() => {
    if (open && drawerRef.current) {
      drawerRef.current.focus()
    }
  }, [open])

  const anchorClasses = {
    left: 'left-0 top-0 h-full',
    right: 'right-0 top-0 h-full',
    top: 'top-0 left-0 w-full',
    bottom: 'bottom-0 left-0 w-full',
  }

  const transformClasses = {
    left: open ? 'translate-x-0' : '-translate-x-full',
    right: open ? 'translate-x-0' : 'translate-x-full',
    top: open ? 'translate-y-0' : '-translate-y-full',
    bottom: open ? 'translate-y-0' : 'translate-y-full',
  }

  const defaultSize = {
    left: 'w-80',
    right: 'w-80',
    top: 'h-auto max-h-[80vh]',
    bottom: 'h-auto max-h-[80vh]',
  }

  if (!open) return null

  const drawerContent = (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      {overlay && (
        <div
          className={cn(
            'fixed inset-0 bg-black/50 transition-opacity',
            open ? 'opacity-100' : 'opacity-0',
            overlayClassName
          )}
          onClick={closeOnOverlayClick ? onClose : undefined}
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={cn(
          'fixed bg-white shadow-xl transition-transform duration-300 ease-in-out flex flex-col',
          anchorClasses[anchor],
          transformClasses[anchor],
          size || defaultSize[anchor],
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'drawer-title' : undefined}
      >
        {/* Header */}
        {(title || header || showCloseButton) && (
          <div
            className={cn(
              'flex items-center justify-between px-4 py-3',
              headerDivider && 'border-b'
            )}
          >
            {header || (
              <>
                <h2
                  id="drawer-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  {title}
                </h2>
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                    aria-label="Close drawer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div
            className={cn(
              'px-4 py-3',
              footerDivider && 'border-t'
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(drawerContent, document.body)
}

export default DrawerBox
