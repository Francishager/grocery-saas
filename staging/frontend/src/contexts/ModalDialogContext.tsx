import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface ModalDialogConfig {
  id: string
  title?: string
  content: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  closable?: boolean
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  showCloseButton?: boolean
  footer?: React.ReactNode
  onOpen?: () => void
  onClose?: () => void
}

export interface ModalDialogContextValue {
  /** Currently open modals */
  modals: ModalDialogConfig[]
  /** Whether any modal is open */
  isOpen: boolean
  /** Open a modal */
  open: (config: Omit<ModalDialogConfig, 'id'> & { id?: string }) => string
  /** Close a modal by ID */
  close: (id: string) => void
  /** Close all modals */
  closeAll: () => void
  /** Get topmost modal */
  getTopModal: () => ModalDialogConfig | undefined
  /** Update modal config */
  updateModal: (id: string, updates: Partial<ModalDialogConfig>) => void
  /** Check if modal is open */
  isModalOpen: (id: string) => boolean
}

const ModalDialogContext = createContext<ModalDialogContextValue | undefined>(undefined)

let modalIdCounter = 0

const generateModalId = (): string => {
  modalIdCounter += 1
  return `modal-${Date.now()}-${modalIdCounter}`
}

export interface ModalDialogProviderProps {
  children: ReactNode
  /** Maximum number of modals that can be open at once */
  maxModals?: number
  /** Default modal size */
  defaultSize?: ModalDialogConfig['size']
  /** Default closable */
  defaultClosable?: boolean
  /** Default close on overlay click */
  defaultCloseOnOverlayClick?: boolean
  /** Default close on escape */
  defaultCloseOnEscape?: boolean
  /** Default show close button */
  defaultShowCloseButton?: boolean
}

export const ModalDialogProvider: React.FC<ModalDialogProviderProps> = ({
  children,
  maxModals = 5,
  defaultSize = 'md',
  defaultClosable = true,
  defaultCloseOnOverlayClick = true,
  defaultCloseOnEscape = true,
  defaultShowCloseButton = true,
}) => {
  const [modals, setModals] = useState<ModalDialogConfig[]>([])

  const isOpen = modals.length > 0

  const open = useCallback((config: Omit<ModalDialogConfig, 'id'> & { id?: string }): string => {
    const id = config.id || generateModalId()
    const modal: ModalDialogConfig = {
      id,
      title: config.title,
      content: config.content,
      size: config.size || defaultSize,
      closable: config.closable !== undefined ? config.closable : defaultClosable,
      closeOnOverlayClick: config.closeOnOverlayClick !== undefined ? config.closeOnOverlayClick : defaultCloseOnOverlayClick,
      closeOnEscape: config.closeOnEscape !== undefined ? config.closeOnEscape : defaultCloseOnEscape,
      showCloseButton: config.showCloseButton !== undefined ? config.showCloseButton : defaultShowCloseButton,
      footer: config.footer,
      onOpen: config.onOpen,
      onClose: config.onClose,
    }

    setModals((prev) => {
      // Check if modal with same ID already exists
      const existingIndex = prev.findIndex((m) => m.id === id)
      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = modal
        return updated
      }

      // Check max modals limit
      if (prev.length >= maxModals) {
        // Remove oldest modal
        const [, ...rest] = prev
        return [...rest, modal]
      }

      return [...prev, modal]
    })

    modal.onOpen?.()
    return id
  }, [defaultSize, defaultClosable, defaultCloseOnOverlayClick, defaultCloseOnEscape, defaultShowCloseButton, maxModals])

  const close = useCallback((id: string) => {
    setModals((prev) => {
      const modal = prev.find((m) => m.id === id)
      if (modal) {
        modal.onClose?.()
      }
      return prev.filter((m) => m.id !== id)
    })
  }, [])

  const closeAll = useCallback(() => {
    setModals((prev) => {
      prev.forEach((modal) => modal.onClose?.())
      return []
    })
  }, [])

  const getTopModal = useCallback((): ModalDialogConfig | undefined => {
    return modals[modals.length - 1]
  }, [modals])

  const updateModal = useCallback((id: string, updates: Partial<ModalDialogConfig>) => {
    setModals((prev) =>
      prev.map((modal) =>
        modal.id === id ? { ...modal, ...updates } : modal
      )
    )
  }, [])

  const isModalOpen = useCallback((id: string): boolean => {
    return modals.some((m) => m.id === id)
  }, [modals])

  const value: ModalDialogContextValue = {
    modals,
    isOpen,
    open,
    close,
    closeAll,
    getTopModal,
    updateModal,
    isModalOpen,
  }

  return (
    <ModalDialogContext.Provider value={value}>
      {children}
    </ModalDialogContext.Provider>
  )
}

export const useModalDialog = (): ModalDialogContextValue => {
  const context = useContext(ModalDialogContext)
  if (!context) {
    throw new Error('useModalDialog must be used within a ModalDialogProvider')
  }
  return context
}

export default ModalDialogContext
