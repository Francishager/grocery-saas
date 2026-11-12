import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi } from '@/lib/api'
import { useJWTAuth } from './JWTAuthContext'
import { languageLocale, supportedLanguageOptions, translate, type LanguageCode } from '@/lib/i18n'

type LanguageContextValue = { language: LanguageCode; languages: typeof supportedLanguageOptions; setLanguage: (language: LanguageCode) => Promise<void>; t: (key: string, fallback?: string) => string }
const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useJWTAuth()
  const [language, setLanguageState] = useState<LanguageCode>(() => (localStorage.getItem('preferred_language') || 'en') as LanguageCode)
  useEffect(() => { if (user?.preferredLanguage) setLanguageState(user.preferredLanguage as LanguageCode) }, [user?.preferredLanguage])
  useEffect(() => { localStorage.setItem('preferred_language', language); document.documentElement.lang = languageLocale(language) }, [language])
  const setLanguage = useCallback(async (next: LanguageCode) => {
    const previous = language
    setLanguageState(next)
    try {
      const result = await authApi.updateProfile({ preferredLanguage: next })
      updateUser({ preferredLanguage: result.user?.preferredLanguage || next })
    } catch (error) {
      setLanguageState(previous)
      throw error
    }
  }, [language, updateUser])
  const value = useMemo(() => ({ language, languages: supportedLanguageOptions, setLanguage, t: (key: string, fallback?: string) => translate(language, key, fallback) }), [language, setLanguage])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
export const useLanguage = () => { const context = useContext(LanguageContext); if (!context) throw new Error('useLanguage must be used within a LanguageProvider'); return context }
