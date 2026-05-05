import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface ConsentBoxContextValue {
  /** Whether consent has been given */
  hasConsent: boolean
  /** Whether consent dialog is open */
  isOpen: boolean
  /** Consent timestamp */
  timestamp?: Date
  /** Consent version */
  version?: string
  /** Give consent */
  giveConsent: (version?: string) => void
  /** Revoke consent */
  revokeConsent: () => void
  /** Open consent dialog */
  openDialog: () => void
  /** Close consent dialog */
  closeDialog: () => void
  /** Check if consent is valid for current version */
  isConsentValid: (currentVersion: string) => boolean
}

const ConsentBoxContext = createContext<ConsentBoxContextValue | undefined>(undefined)

export interface ConsentBoxProviderProps {
  children: ReactNode
  /** Initial consent state */
  initialConsent?: boolean
  /** Initial consent version */
  initialVersion?: string
  /** Storage key for persisting consent */
  storageKey?: string
  /** Callback when consent changes */
  onConsentChange?: (hasConsent: boolean, version?: string) => void
}

export const ConsentBoxProvider: React.FC<ConsentBoxProviderProps> = ({
  children,
  initialConsent = false,
  initialVersion,
  storageKey = 'consent_accepted',
  onConsentChange,
}) => {
  const [hasConsent, setHasConsent] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey)
      return stored === 'true' || initialConsent
    }
    return initialConsent
  })

  const [isOpen, setIsOpen] = useState(!hasConsent)
  const [timestamp, setTimestamp] = useState<Date | undefined>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`${storageKey}_timestamp`)
      return stored ? new Date(stored) : undefined
    }
    return undefined
  })

  const [version, setVersion] = useState<string | undefined>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`${storageKey}_version`) || initialVersion
    }
    return initialVersion
  })

  const giveConsent = useCallback((consentVersion?: string) => {
    const now = new Date()
    setHasConsent(true)
    setTimestamp(now)
    setVersion(consentVersion || initialVersion)
    setIsOpen(false)

    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, 'true')
      localStorage.setItem(`${storageKey}_timestamp`, now.toISOString())
      if (consentVersion) {
        localStorage.setItem(`${storageKey}_version`, consentVersion)
      }
    }

    onConsentChange?.(true, consentVersion)
  }, [initialVersion, storageKey, onConsentChange])

  const revokeConsent = useCallback(() => {
    setHasConsent(false)
    setTimestamp(undefined)
    setVersion(undefined)

    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey)
      localStorage.removeItem(`${storageKey}_timestamp`)
      localStorage.removeItem(`${storageKey}_version`)
    }

    onConsentChange?.(false)
  }, [storageKey, onConsentChange])

  const openDialog = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setIsOpen(false)
  }, [])

  const isConsentValid = useCallback((currentVersion: string) => {
    return hasConsent && version === currentVersion
  }, [hasConsent, version])

  const value: ConsentBoxContextValue = {
    hasConsent,
    isOpen,
    timestamp,
    version,
    giveConsent,
    revokeConsent,
    openDialog,
    closeDialog,
    isConsentValid,
  }

  return (
    <ConsentBoxContext.Provider value={value}>
      {children}
    </ConsentBoxContext.Provider>
  )
}

export const useConsentBox = (): ConsentBoxContextValue => {
  const context = useContext(ConsentBoxContext)
  if (!context) {
    throw new Error('useConsentBox must be used within a ConsentBoxProvider')
  }
  return context
}

export default ConsentBoxContext
