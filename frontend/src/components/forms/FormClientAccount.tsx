import React, { useState, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { User, Building, CreditCard, Search } from 'lucide-react'

export interface ClientAccount {
  id: string
  name: string
  accountNumber: string
  type: 'individual' | 'business'
  email?: string
  phone?: string
  address?: string
  balance?: number
}

export interface FormClientAccountProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  value?: ClientAccount | null
  onChange?: (value: ClientAccount | null) => void
  onSearch?: (query: string) => Promise<ClientAccount[]>
  accounts?: ClientAccount[]
  showBalance?: boolean
  showTypeIcon?: boolean
}

export const FormClientAccount = forwardRef<HTMLInputElement, FormClientAccountProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      containerClassName,
      className,
      id,
      value,
      onChange,
      onSearch,
      accounts = [],
      showBalance = true,
      showTypeIcon = true,
      disabled,
      placeholder = 'Search client account...',
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [filteredAccounts, setFilteredAccounts] = useState<ClientAccount[]>([])

    const inputId = id || `client-account-${Math.random().toString(36).substr(2, 9)}`

    const handleSearch = async (query: string) => {
      setSearchQuery(query)
      
      if (query.length < 2) {
        setFilteredAccounts([])
        return
      }

      if (onSearch) {
        setLoading(true)
        try {
          const results = await onSearch(query)
          setFilteredAccounts(results)
        } catch (err) {
          console.error('Search failed:', err)
          setFilteredAccounts([])
        } finally {
          setLoading(false)
        }
      } else {
        const filtered = accounts.filter(
          (account) =>
            account.name.toLowerCase().includes(query.toLowerCase()) ||
            account.accountNumber.toLowerCase().includes(query.toLowerCase())
        )
        setFilteredAccounts(filtered)
      }
      
      setIsOpen(true)
    }

    const handleSelect = (account: ClientAccount) => {
      onChange?.(account)
      setSearchQuery('')
      setIsOpen(false)
    }

    const handleClear = () => {
      onChange?.(null)
      setSearchQuery('')
    }

    const formatBalance = (balance?: number) => {
      if (balance === undefined) return null
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'UGX',
        minimumFractionDigits: 0,
      }).format(balance)
    }

    return (
      <div className={cn('space-y-1', containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        {/* Selected Account Display */}
        {value ? (
          <div
            className={cn(
              'flex items-center justify-between p-3 border rounded-md',
              error ? 'border-red-500' : 'border-gray-300',
              className
            )}
          >
            <div className="flex items-center gap-3">
              {showTypeIcon && (
                <div
                  className={cn(
                    'p-2 rounded-full',
                    value.type === 'business'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-green-100 text-green-600'
                  )}
                >
                  {value.type === 'business' ? (
                    <Building className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">{value.name}</p>
                <p className="text-xs text-gray-500">{value.accountNumber}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {showBalance && value.balance !== undefined && (
                <span
                  className={cn(
                    'text-sm font-medium',
                    value.balance >= 0 ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {formatBalance(value.balance)}
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={ref}
              id={inputId}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setIsOpen(true)}
              disabled={disabled}
              placeholder={placeholder}
              className={cn(
                'w-full pl-10 pr-3 py-2 border rounded-md shadow-sm',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
                'disabled:bg-gray-100 disabled:cursor-not-allowed',
                error
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300',
                className
              )}
              {...props}
            />

            {isOpen && filteredAccounts.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                {filteredAccounts.map((account) => (
                  <div
                    key={account.id}
                    onClick={() => handleSelect(account)}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                  >
                    {showTypeIcon && (
                      <div
                        className={cn(
                          'p-1.5 rounded-full',
                          account.type === 'business'
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-green-100 text-green-600'
                        )}
                      >
                        {account.type === 'business' ? (
                          <Building className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{account.name}</p>
                      <p className="text-xs text-gray-500">{account.accountNumber}</p>
                    </div>
                    {showBalance && account.balance !== undefined && (
                      <span
                        className={cn(
                          'text-sm font-medium',
                          account.balance >= 0 ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        {formatBalance(account.balance)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
      </div>
    )
  }
)

FormClientAccount.displayName = 'FormClientAccount'

export default FormClientAccount
