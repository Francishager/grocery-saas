import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useJWTAuth } from './JWTAuthContext'
import { authApi } from '@/lib/api'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
const STORAGE_KEY = 'app-theme'
const validTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'
const userThemeKey = (userId: string) => `${STORAGE_KEY}:${userId}`
const isPublicAppearanceRoute = (pathname: string) => /^\/(login|saas\/login|register|forgot-password|accept-invitation|service-feedback)(\/|$)/.test(pathname)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useJWTAuth()
  const { pathname } = useLocation()
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    if (!user?.id) {
      setThemeState('light')
      localStorage.removeItem(STORAGE_KEY)
      return
    }

    const savedForUser = localStorage.getItem(userThemeKey(user.id))
    const legacyTheme = localStorage.getItem(STORAGE_KEY)
    const nextTheme = validTheme(user.theme) ? user.theme : validTheme(savedForUser) ? savedForUser : validTheme(legacyTheme) ? legacyTheme : 'light'
    setThemeState(nextTheme)
    localStorage.setItem(userThemeKey(user.id), nextTheme)
    localStorage.removeItem(STORAGE_KEY)

    if (!validTheme(user.theme)) {
      void authApi.updateProfile({ theme: nextTheme }).then(result => {
        if (result.user?.theme === 'light' || result.user?.theme === 'dark') updateUser({ theme: result.user.theme })
      }).catch(error => console.warn('Could not save the initial theme preference:', error))
    }
  }, [user?.id, user?.theme, updateUser])

  useEffect(() => {
    const publicPage = isPublicAppearanceRoute(pathname)
    const appliedTheme = user && !publicPage ? theme : 'light'
    const root = document.documentElement
    root.classList.toggle('dark', appliedTheme === 'dark')
    root.style.colorScheme = appliedTheme
  }, [pathname, theme, user])

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme)
    if (!user?.id) return
    localStorage.setItem(userThemeKey(user.id), nextTheme)
    updateUser({ theme: nextTheme })
    void authApi.updateProfile({ theme: nextTheme }).then(result => {
      if (result.user?.theme === 'light' || result.user?.theme === 'dark') updateUser({ theme: result.user.theme })
    }).catch(error => console.warn('Could not sync the theme preference across devices:', error))
  }, [updateUser, user?.id])

  const toggleTheme = useCallback(() => setTheme(theme === 'light' ? 'dark' : 'light'), [setTheme, theme])

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
