// Form field configurations for Currency Converter Modal

export interface CurrencyConverterField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'hidden'
  placeholder?: string
  required?: boolean
  options?: Array<{ value: string; label: string }>
  defaultValue?: string | number
  validation?: {
    min?: number
    max?: number
    pattern?: string
    message?: string
  }
}

export const currencyConverterFields: CurrencyConverterField[] = [
  {
    name: 'fromCurrency',
    label: 'From Currency',
    type: 'select',
    required: true,
    options: [
      { value: 'USD', label: '🇺🇸 USD - US Dollar' },
      { value: 'EUR', label: '🇪🇺 EUR - Euro' },
      { value: 'GBP', label: '🇬🇧 GBP - British Pound' },
      { value: 'UGX', label: '🇺🇬 UGX - Ugandan Shilling' },
      { value: 'KES', label: '🇰🇪 KES - Kenyan Shilling' },
      { value: 'TZS', label: '🇹🇿 TZS - Tanzanian Shilling' },
    ],
    defaultValue: 'USD',
  },
  {
    name: 'amount',
    label: 'Amount',
    type: 'number',
    placeholder: 'Enter amount',
    required: true,
    validation: {
      min: 0.01,
      message: 'Amount must be greater than 0',
    },
    defaultValue: 100,
  },
  {
    name: 'toCurrency',
    label: 'To Currency',
    type: 'select',
    required: true,
    options: [
      { value: 'UGX', label: '🇺🇬 UGX - Ugandan Shilling' },
      { value: 'KES', label: '🇰🇪 KES - Kenyan Shilling' },
      { value: 'TZS', label: '🇹🇿 TZS - Tanzanian Shilling' },
      { value: 'USD', label: '🇺🇸 USD - US Dollar' },
      { value: 'EUR', label: '🇪🇺 EUR - Euro' },
      { value: 'GBP', label: '🇬🇧 GBP - British Pound' },
    ],
    defaultValue: 'UGX',
  },
]

export default currencyConverterFields
