import React, { createContext, useContext, useReducer, ReactNode, useCallback } from 'react'

export interface GlobalState {
  sidebarCollapsed: boolean
  sidebarWidth: number
  headerHeight: number
  theme: 'light' | 'dark'
  density: 'compact' | 'comfortable' | 'spacious'
  locale: string
  currency: string
  dateFormat: string
  timeFormat: '12h' | '24h'
  notifications: {
    enabled: boolean
    sound: boolean
    desktop: boolean
  }
  loading: boolean
  error: string | null
}

export type GlobalAction =
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_COLLAPSED'; payload: boolean }
  | { type: 'SET_SIDEBAR_WIDTH'; payload: number }
  | { type: 'SET_HEADER_HEIGHT'; payload: number }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'SET_DENSITY'; payload: GlobalState['density'] }
  | { type: 'SET_LOCALE'; payload: string }
  | { type: 'SET_CURRENCY'; payload: string }
  | { type: 'SET_DATE_FORMAT'; payload: string }
  | { type: 'SET_TIME_FORMAT'; payload: '12h' | '24h' }
  | { type: 'SET_NOTIFICATIONS'; payload: Partial<GlobalState['notifications']> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' }

const initialState: GlobalState = {
  sidebarCollapsed: false,
  sidebarWidth: 260,
  headerHeight: 64,
  theme: 'light',
  density: 'comfortable',
  locale: 'en',
  currency: 'UGX',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  notifications: {
    enabled: true,
    sound: true,
    desktop: false,
  },
  loading: false,
  error: null,
}

const globalReducer = (state: GlobalState, action: GlobalAction): GlobalState => {
  switch (action.type) {
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    case 'SET_SIDEBAR_COLLAPSED':
      return { ...state, sidebarCollapsed: action.payload }
    case 'SET_SIDEBAR_WIDTH':
      return { ...state, sidebarWidth: action.payload }
    case 'SET_HEADER_HEIGHT':
      return { ...state, headerHeight: action.payload }
    case 'SET_THEME':
      return { ...state, theme: action.payload }
    case 'SET_DENSITY':
      return { ...state, density: action.payload }
    case 'SET_LOCALE':
      return { ...state, locale: action.payload }
    case 'SET_CURRENCY':
      return { ...state, currency: action.payload }
    case 'SET_DATE_FORMAT':
      return { ...state, dateFormat: action.payload }
    case 'SET_TIME_FORMAT':
      return { ...state, timeFormat: action.payload }
    case 'SET_NOTIFICATIONS':
      return { ...state, notifications: { ...state.notifications, ...action.payload } }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'RESET_STATE':
      return initialState
    default:
      return state
  }
}

export interface GlobalStoreContextValue {
  state: GlobalState
  dispatch: React.Dispatch<GlobalAction>
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void
  setLocale: (locale: string) => void
  setCurrency: (currency: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  resetState: () => void
}

const GlobalStoreContext = createContext<GlobalStoreContextValue | undefined>(undefined)

export interface GlobalStoreProviderProps {
  children: ReactNode
  /** Initial state overrides */
  initialState?: Partial<GlobalState>
  /** Storage key for persisting state */
  storageKey?: string
  /** Whether to persist state to localStorage */
  persist?: boolean
}

export const GlobalStoreProvider: React.FC<GlobalStoreProviderProps> = ({
  children,
  initialState: initialStateOverride,
  storageKey = 'global_store',
  persist = true,
}) => {
  const getInitialState = (): GlobalState => {
    if (persist && typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try {
          return { ...initialState, ...JSON.parse(stored), ...initialStateOverride }
        } catch {
          // Ignore parse errors
        }
      }
    }
    return { ...initialState, ...initialStateOverride }
  }

  const [state, dispatch] = useReducer(globalReducer, undefined, getInitialState)

  // Persist state changes
  React.useEffect(() => {
    if (persist && typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(state))
    }
  }, [state, storageKey, persist])

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' })
  }, [])

  const setTheme = useCallback((theme: 'light' | 'dark') => {
    dispatch({ type: 'SET_THEME', payload: theme })
  }, [])

  const setLocale = useCallback((locale: string) => {
    dispatch({ type: 'SET_LOCALE', payload: locale })
  }, [])

  const setCurrency = useCallback((currency: string) => {
    dispatch({ type: 'SET_CURRENCY', payload: currency })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }, [])

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error })
  }, [])

  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' })
  }, [])

  const value: GlobalStoreContextValue = {
    state,
    dispatch,
    toggleSidebar,
    setTheme,
    setLocale,
    setCurrency,
    setLoading,
    setError,
    resetState,
  }

  return (
    <GlobalStoreContext.Provider value={value}>
      {children}
    </GlobalStoreContext.Provider>
  )
}

export const useGlobalStore = (): GlobalStoreContextValue => {
  const context = useContext(GlobalStoreContext)
  if (!context) {
    throw new Error('useGlobalStore must be used within a GlobalStoreProvider')
  }
  return context
}

export default GlobalStoreContext
