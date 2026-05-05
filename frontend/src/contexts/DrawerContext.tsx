import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface DrawerContextValue {
  /** Whether drawer is open */
  isOpen: boolean
  /** Drawer position */
  position: 'left' | 'right' | 'top' | 'bottom'
  /** Drawer size */
  size: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** Open drawer */
  open: () => void
  /** Close drawer */
  close: () => void
  /** Toggle drawer */
  toggle: () => void
  /** Set drawer position */
  setPosition: (position: DrawerContextValue['position']) => void
  /** Set drawer size */
  setSize: (size: DrawerContextValue['size']) => void
  /** Drawer content */
  content: React.ReactNode
  /** Set drawer content */
  setContent: (content: React.ReactNode) => void
  /** Drawer title */
  title?: string
  /** Set drawer title */
  setTitle: (title: string | undefined) => void
  /** Whether to show close button */
  showCloseButton: boolean
  /** Set show close button */
  setShowCloseButton: (show: boolean) => void
  /** Whether to close on overlay click */
  closeOnOverlayClick: boolean
  /** Set close on overlay click */
  setCloseOnOverlayClick: (close: boolean) => void
  /** Whether to close on Escape key */
  closeOnEscape: boolean
  /** Set close on Escape */
  setCloseOnEscape: (close: boolean) => void
}

const DrawerContext = createContext<DrawerContextValue | undefined>(undefined)

export interface DrawerProviderProps {
  children: ReactNode
  /** Default position */
  defaultPosition?: DrawerContextValue['position']
  /** Default size */
  defaultSize?: DrawerContextValue['size']
  /** Default show close button */
  defaultShowCloseButton?: boolean
  /** Default close on overlay click */
  defaultCloseOnOverlayClick?: boolean
  /** Default close on escape */
  defaultCloseOnEscape?: boolean
  /** Callback when drawer opens */
  onOpen?: () => void
  /** Callback when drawer closes */
  onClose?: () => void
}

export const DrawerProvider: React.FC<DrawerProviderProps> = ({
  children,
  defaultPosition = 'right',
  defaultSize = 'md',
  defaultShowCloseButton = true,
  defaultCloseOnOverlayClick = true,
  defaultCloseOnEscape = true,
  onOpen,
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState(defaultPosition)
  const [size, setSize] = useState(defaultSize)
  const [content, setContent] = useState<React.ReactNode>(null)
  const [title, setTitle] = useState<string | undefined>(undefined)
  const [showCloseButton, setShowCloseButton] = useState(defaultShowCloseButton)
  const [closeOnOverlayClick, setCloseOnOverlayClick] = useState(defaultCloseOnOverlayClick)
  const [closeOnEscape, setCloseOnEscape] = useState(defaultCloseOnEscape)

  const open = useCallback(() => {
    setIsOpen(true)
    onOpen?.()
  }, [onOpen])

  const close = useCallback(() => {
    setIsOpen(false)
    onClose?.()
  }, [onClose])

  const toggle = useCallback(() => {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }, [isOpen, open, close])

  const value: DrawerContextValue = {
    isOpen,
    position,
    size,
    open,
    close,
    toggle,
    setPosition,
    setSize,
    content,
    setContent,
    title,
    setTitle,
    showCloseButton,
    setShowCloseButton,
    closeOnOverlayClick,
    setCloseOnOverlayClick,
    closeOnEscape,
    setCloseOnEscape,
  }

  return (
    <DrawerContext.Provider value={value}>
      {children}
    </DrawerContext.Provider>
  )
}

export const useDrawer = (): DrawerContextValue => {
  const context = useContext(DrawerContext)
  if (!context) {
    throw new Error('useDrawer must be used within a DrawerProvider')
  }
  return context
}

export default DrawerContext
