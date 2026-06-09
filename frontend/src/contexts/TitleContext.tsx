import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface TitleContextValue {
  /** Current page title */
  title: string
  /** Set page title */
  setTitle: (title: string) => void
  /** Full title (with app name) */
  fullTitle: string
  /** App name suffix */
  appName: string
  /** Set app name */
  setAppName: (name: string) => void
  /** Title separator */
  separator: string
  /** Set separator */
  setSeparator: (separator: string) => void
}

const TitleContext = createContext<TitleContextValue | undefined>(undefined)

export interface TitleProviderProps {
  children: ReactNode
  /** Initial title */
  initialTitle?: string
  /** App name to append to title */
  appName?: string
  /** Separator between title and app name */
  separator?: string
  /** Whether to update document title */
  updateDocumentTitle?: boolean
  /** Callback when title changes */
  onTitleChange?: (title: string) => void
}

export const TitleProvider: React.FC<TitleProviderProps> = ({
  children,
  initialTitle = '',
  appName = 'jibuSales',
  separator = ' | ',
  updateDocumentTitle = true,
  onTitleChange,
}) => {
  const [title, setTitleState] = useState(initialTitle)
  const [appNameState, setAppNameState] = useState(appName)
  const [separatorState, setSeparatorState] = useState(separator)

  const fullTitle = title ? `${title}${separatorState}${appNameState}` : appNameState

  const setTitle = (newTitle: string) => {
    setTitleState(newTitle)
    onTitleChange?.(newTitle)
  }

  const setAppName = (name: string) => {
    setAppNameState(name)
  }

  const setSeparator = (sep: string) => {
    setSeparatorState(sep)
  }

  // Update document title
  useEffect(() => {
    if (updateDocumentTitle && typeof document !== 'undefined') {
      document.title = fullTitle
    }
  }, [fullTitle, updateDocumentTitle])

  const value: TitleContextValue = {
    title,
    setTitle,
    fullTitle,
    appName: appNameState,
    setAppName,
    separator: separatorState,
    setSeparator,
  }

  return (
    <TitleContext.Provider value={value}>
      {children}
    </TitleContext.Provider>
  )
}

export const useTitleContext = (): TitleContextValue => {
  const context = useContext(TitleContext)
  if (!context) {
    throw new Error('useTitleContext must be used within a TitleProvider')
  }
  return context
}

/**
 * Hook to set page title
 * @param title - Page title to set
 * @param deps - Dependencies array to trigger title update
 */
export const usePageTitle = (title: string, deps: React.DependencyList = []): void => {
  const { setTitle } = useTitleContext()

  useEffect(() => {
    setTitle(title)
  }, [title, setTitle, ...deps])
}

export default TitleContext
