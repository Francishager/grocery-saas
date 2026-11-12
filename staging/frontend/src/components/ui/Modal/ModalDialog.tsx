import React, { useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

export interface ModalDialogProps {
  /** Whether modal is open */
  open: boolean
  /** Callback when modal closes */
  onClose: () => void
  /** Modal title */
  title?: string
  /** Modal description */
  description?: string
  /** Modal size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** Whether to show close button */
  showCloseButton?: boolean
  /** Whether clicking overlay closes modal */
  closeOnOverlayClick?: boolean
  /** Whether pressing Escape closes modal */
  closeOnEscape?: boolean
  /** Children content */
  children: React.ReactNode
  /** Footer content */
  footer?: React.ReactNode
  /** Additional className for modal */
  className?: string
  /** Additional className for overlay */
  overlayClassName?: string
  /** Additional className for content */
  contentClassName?: string
  /** Whether to show header divider */
  headerDivider?: boolean
  /** Whether to show footer divider */
  footerDivider?: boolean
  /** Whether modal is centered */
  centered?: boolean
  /** Whether to animate */
  animate?: boolean
  /** Aria-labelledby id */
  ariaLabelledBy?: string
  /** Aria-describedby id */
  ariaDescribedBy?: string
}

const sizeClasses = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-full mx-4',
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  onClose,
  title,
  description,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  children,
  footer,
  className,
  overlayClassName,
  contentClassName,
  headerDivider = true,
  footerDivider = true,
  centered = true,
  animate = true,
  ariaLabelledBy,
  ariaDescribedBy,
}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

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

  // Lock body scroll and manage focus
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement
      document.body.style.overflow = 'hidden'
      
      // Focus the modal
      setTimeout(() => {
        modalRef.current?.focus()
      }, 0)
    } else {
      document.body.style.overflow = ''
      
      // Restore focus
      previousActiveElement.current?.focus()
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )

      if (!focusableElements || focusableElements.length === 0) return

      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    },
    []
  )

  if (!open) return null

  const modalContent = (
    <div
      className={cn(
        'fixed inset-0 z-50 overflow-y-auto',
        className
      )}
    >
      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 transition-opacity',
          animate && 'duration-300',
          open ? 'opacity-100' : 'opacity-0',
          overlayClassName
        )}
        onClick={closeOnOverlayClick ? onClose : undefined}
      />

      {/* Modal Container */}
      <div
        className={cn(
          'flex min-h-full items-center justify-center p-4',
          centered ? 'items-center' : 'items-start pt-16'
        )}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy || (title ? 'modal-title' : undefined)}
          aria-describedby={ariaDescribedBy || (description ? 'modal-description' : undefined)}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={cn(
            'relative w-full bg-white rounded-xl shadow-2xl',
            'transform transition-all',
            animate && 'duration-300',
            open ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
            sizeClasses[size],
            contentClassName
          )}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div
              className={cn(
                'flex items-start justify-between px-6 py-4',
                headerDivider && 'border-b'
              )}
            >
              <div>
                {title && (
                  <h2
                    id={ariaLabelledBy || 'modal-title'}
                    className="text-lg font-semibold text-gray-900"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id={ariaDescribedBy || 'modal-description'}
                    className="mt-1 text-sm text-gray-500"
                  >
                    {description}
                  </p>
                )}
              </div>

              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="px-6 py-4">{children}</div>

          {/* Footer */}
          {footer && (
            <div
              className={cn(
                'px-6 py-4',
                footerDivider && 'border-t'
              )}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default ModalDialog
