import { useState, useCallback, useEffect } from 'react'

export interface UseLocalStorageOptions {
  /** Whether to sync state with localStorage */
  sync?: boolean
  /** Serialization function */
  serialize?: (value: any) => string
  /** Deserialization function */
  deserialize?: (value: string) => any
}

export interface UseLocalStorageReturn<T> {
  value: T
  setValue: (value: T | ((prev: T) => T)) => void
  removeValue: () => void
  clearAll: () => void
  loading: boolean
  error: string | null
}

/**
 * Hook for managing localStorage with React state sync
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions = {}
): UseLocalStorageReturn<T> {
  const { sync = true, serialize = JSON.stringify, deserialize = JSON.parse } = options

  const [value, setValueState] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue
    }

    try {
      const item = window.localStorage.getItem(key)
      return item ? deserialize(item) : initialValue
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error)
      return initialValue
    }
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      try {
        setError(null)
        const valueToStore = newValue instanceof Function ? newValue(value) : newValue
        setValueState(valueToStore)

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, serialize(valueToStore))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save to localStorage')
      }
    },
    [key, serialize, value]
  )

  const removeValue = useCallback(() => {
    try {
      setError(null)
      setValueState(initialValue)

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove from localStorage')
    }
  }, [key, initialValue])

  const clearAll = useCallback(() => {
    try {
      setError(null)
      if (typeof window !== 'undefined') {
        window.localStorage.clear()
      }
      setValueState(initialValue)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear localStorage')
    }
  }, [initialValue])

  // Sync with storage events from other tabs/windows
  useEffect(() => {
    if (!sync || typeof window === 'undefined') return

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key && event.newValue !== null) {
        try {
          setValueState(deserialize(event.newValue))
        } catch (err) {
          console.warn(`Error parsing localStorage change for key "${key}":`, err)
        }
      } else if (event.key === key && event.newValue === null) {
        setValueState(initialValue)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [key, initialValue, sync, deserialize])

  return {
    value,
    setValue,
    removeValue,
    clearAll,
    loading,
    error,
  }
}

export default useLocalStorage
