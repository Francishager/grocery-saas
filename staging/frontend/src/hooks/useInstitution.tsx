import { useInstitutionContext, Institution, InstitutionSettings } from '@/contexts/InstitutionContext'

export interface UseInstitutionReturn {
  institution: Institution | null
  loading: boolean
  error: string | null
  setInstitution: (institution: Institution | null) => void
  updateInstitution: (updates: Partial<Institution>) => void
  updateSettings: (settings: Partial<InstitutionSettings>) => void
  clearInstitution: () => void
  fetchInstitution: (id: string) => Promise<void>
  hasFeature: (feature: string) => boolean
  isSubscriptionActive: () => boolean
  getSetting: <K extends keyof InstitutionSettings>(key: K) => InstitutionSettings[K]
  institutionId: string | undefined
  institutionName: string | undefined
  currency: string
  timezone: string
  locale: string
}

/**
 * Hook for institution state and operations
 */
export const useInstitution = (): UseInstitutionReturn => {
  const context = useInstitutionContext()

  return {
    institution: context.institution,
    loading: context.loading,
    error: context.error,
    setInstitution: context.setInstitution,
    updateInstitution: context.updateInstitution,
    updateSettings: context.updateSettings,
    clearInstitution: context.clearInstitution,
    fetchInstitution: context.fetchInstitution,
    hasFeature: context.hasFeature,
    isSubscriptionActive: context.isSubscriptionActive,
    getSetting: context.getSetting,
    institutionId: context.institution?.id,
    institutionName: context.institution?.name,
    currency: context.institution?.currency || 'UGX',
    timezone: context.institution?.timezone || 'Africa/Kampala',
    locale: context.institution?.locale || 'en',
  }
}

export default useInstitution
