// Currency code constants

export interface CurrencyCode {
  code: string
  name: string
  symbol: string
  flag: string
  decimalDigits: number
}

// African currencies
export const africanCurrencies: CurrencyCode[] = [
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', flag: '🇺🇬', decimalDigits: 0 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪', decimalDigits: 2 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', flag: '🇹🇿', decimalDigits: 2 },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', flag: '🇷🇼', decimalDigits: 0 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', flag: '🇬🇭', decimalDigits: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬', decimalDigits: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦', decimalDigits: 2 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', flag: '🇪🇬', decimalDigits: 2 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.', flag: '🇲🇦', decimalDigits: 2 },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', flag: '🇪🇹', decimalDigits: 2 },
]

// Major world currencies
export const majorCurrencies: CurrencyCode[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸', decimalDigits: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺', decimalDigits: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧', decimalDigits: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵', decimalDigits: 0 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳', decimalDigits: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳', decimalDigits: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺', decimalDigits: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦', decimalDigits: 2 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', flag: '🇨🇭', decimalDigits: 2 },
]

// All currencies combined
export const allCurrencies: CurrencyCode[] = [...africanCurrencies, ...majorCurrencies]

// Currency code list
export const currencyCodes = allCurrencies.map((c) => c.code)

// Currency options for select
export const currencyOptions = allCurrencies.map((c) => ({
  value: c.code,
  label: `${c.flag} ${c.code} - ${c.name}`,
}))

// African currency options
export const africanCurrencyOptions = africanCurrencies.map((c) => ({
  value: c.code,
  label: `${c.flag} ${c.code} - ${c.name}`,
}))

// Major currency options
export const majorCurrencyOptions = majorCurrencies.map((c) => ({
  value: c.code,
  label: `${c.flag} ${c.code} - ${c.name}`,
}))

// Default currency
export const DEFAULT_CURRENCY = 'UGX'

// Get currency by code
export const getCurrencyByCode = (code: string): CurrencyCode | undefined => {
  return allCurrencies.find((c) => c.code === code)
}

// Get currency symbol
export const getCurrencySymbol = (code: string): string => {
  const currency = getCurrencyByCode(code)
  return currency?.symbol || code
}

// Get currency flag
export const getCurrencyFlag = (code: string): string => {
  const currency = getCurrencyByCode(code)
  return currency?.flag || '🏳️'
}

// Check if currency is African
export const isAfricanCurrency = (code: string): boolean => {
  return africanCurrencies.some((c) => c.code === code)
}

export default allCurrencies
