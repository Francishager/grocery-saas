import { languageOptions } from '@/components/Constants/user-types'

export type LanguageCode = 'en' | 'sw' | 'lg' | 'nyn' | 'rw' | 'nyo' | 'ach'

export const supportedLanguageOptions = languageOptions

export const translate = (_language: string | undefined, key: string, fallback = key) => fallback


export const languageLocale = (_language: string) => 'en-UG'

export function translateDocument(_language: string) {
  return () => undefined
}
