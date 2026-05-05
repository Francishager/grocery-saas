// Currency data and utilities

export interface Currency {
  code: string
  name: string
  symbol: string
  decimalDigits: number
  symbolPosition: 'before' | 'after'
  thousandsSeparator: string
  decimalSeparator: string
  flag?: string
}

export const currencies: Currency[] = [
  // African Currencies
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', decimalDigits: 0, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇺🇬' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇰🇪' },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇹🇿' },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', decimalDigits: 0, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇷🇼' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇬🇭' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇳🇬' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ' ', decimalSeparator: '.', flag: '🇿🇦' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇪🇬' },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.', decimalDigits: 2, symbolPosition: 'after', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇲🇦' },
  
  // Major World Currencies
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: '.', decimalSeparator: ',', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇬🇧' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalDigits: 0, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇯🇵' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇨🇳' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇮🇳' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇦🇺' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇨🇦' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: "'", decimalSeparator: '.', flag: '🇨🇭' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimalDigits: 2, symbolPosition: 'after', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇦🇪' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', flag: '🇸🇦' },
]

// Currency code type
export type CurrencyCode = typeof currencies[number]['code']

// Get currency by code
export const getCurrency = (code: string): Currency | undefined => {
  return currencies.find((c) => c.code === code)
}

// Format amount with currency
export const formatCurrency = (
  amount: number,
  currencyCode: string = 'UGX',
  locale: string = 'en-US'
): string => {
  const currency = getCurrency(currencyCode)
  
  if (!currency) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(amount)
  }

  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: currency.decimalDigits,
    maximumFractionDigits: currency.decimalDigits,
  })

  const formattedNumber = formatter.format(amount)

  return currency.symbolPosition === 'before'
    ? `${currency.symbol}${formattedNumber}`
    : `${formattedNumber}${currency.symbol}`
}

// Parse currency string to number
export const parseCurrency = (value: string, currencyCode: string = 'UGX'): number => {
  const currency = getCurrency(currencyCode)
  
  if (!currency) {
    return parseFloat(value.replace(/[^0-9.-]/g, ''))
  }

  // Remove currency symbol and whitespace
  const cleanValue = value
    .replace(currency.symbol, '')
    .replace(/\s/g, '')
    .replace(new RegExp(`\\${currency.thousandsSeparator}`, 'g'), '')
    .replace(currency.decimalSeparator, '.')

  return parseFloat(cleanValue)
}

// Convert between currencies (requires exchange rates)
export const convertCurrency = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: Record<string, number>
): number => {
  if (fromCurrency === toCurrency) return amount

  const fromRate = exchangeRates[fromCurrency] || 1
  const toRate = exchangeRates[toCurrency] || 1

  // Convert to base currency (usually USD) then to target
  const baseAmount = amount / fromRate
  return baseAmount * toRate
}

// Default currency for the application
export const DEFAULT_CURRENCY = 'UGX'

// Currency select options
export const currencyOptions = currencies.map((c) => ({
  value: c.code,
  label: `${c.flag} ${c.code} - ${c.name}`,
}))

// African currencies only
export const africanCurrencies = currencies.filter((c) =>
  ['UGX', 'KES', 'TZS', 'RWF', 'GHS', 'NGN', 'ZAR', 'EGP', 'MAD'].includes(c.code)
)

// Major currencies only
export const majorCurrencies = currencies.filter((c) =>
  ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'AUD', 'CAD', 'CHF'].includes(c.code)
)

export default currencies
