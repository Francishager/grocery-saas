import { useEffect } from 'react'
import { useTitleContext } from '@/contexts/TitleContext'

export interface UseTitleReturn {
  title: string
  setTitle: (title: string) => void
  fullTitle: string
  appName: string
  setAppName: (name: string) => void
  separator: string
  setSeparator: (separator: string) => void
}

/**
 * Hook for managing page title
 */
export const useTitle = (initialTitle?: string): UseTitleReturn => {
  const { title, setTitle, fullTitle, appName, setAppName, separator, setSeparator } = useTitleContext()

  // Set initial title if provided
  useEffect(() => {
    if (initialTitle !== undefined) {
      setTitle(initialTitle)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    title,
    setTitle,
    fullTitle,
    appName,
    setAppName,
    separator,
    setSeparator,
  }
}

/**
 * Hook to set page title with automatic cleanup
 */
export const usePageTitle = (pageTitle: string, deps: React.DependencyList = []): void => {
  const { setTitle } = useTitleContext()

  useEffect(() => {
    const previousTitle = document.title
    setTitle(pageTitle)

    return () => {
      // Reset to previous title on unmount
      if (previousTitle) {
        document.title = previousTitle
      }
    }
  }, [pageTitle, setTitle, ...deps])
}

export default useTitle
