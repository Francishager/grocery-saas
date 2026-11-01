import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TransactionCurrencyControl } from '@/components/TransactionCurrencyControl'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { apiFetch } from '@/lib/api'
import { formatCurrency, getTenantCurrency } from '@/lib/utils'

type CustomerPaymentTarget = {
  id: string
  branchId?: string | null
  name?: string | null
  balance?: number | null
}

type Account = { id: string; name: string; type: string; balance?: number }

const methods = [
  { value: 'cash', label: 'Cash', accountTypes: ['cash', 'safe'] },
  { value: 'mobile_money', label: 'Mobile Money', accountTypes: ['mobile_money'] },
  { value: 'bank_transfer', label: 'Bank Transfer', accountTypes: ['bank'] },
  { value: 'card', label: 'Card', accountTypes: ['card'] },
]

function randomKey() {
  return globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function CustomerPaymentDialog({
  customer,
  open,
  onOpenChange,
  onRecorded,
}: {
  customer: CustomerPaymentTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecorded: () => void
}) {
  const { user, hasPermission } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const baseCurrency = getTenantCurrency()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(baseCurrency)
  const [rateToBase, setRateToBase] = useState<number | null>(1)
  const [unitsPerBase, setUnitsPerBase] = useState<number | null>(1)
  const [method, setMethod] = useState('cash')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [mobileProvider, setMobileProvider] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const assignedCashId = user?.cashAccountId || user?.cashAccount?.id || ''
  const anyAccount = hasPermission('canUseAnyTransactionAccount')
  const otherCash = hasPermission('canUseOtherCashAccount') || anyAccount
  const accountPermission = (account: Account) => {
    if (account.type === 'cash') return account.id === assignedCashId
      ? hasPermission('canUseOwnCashAccount') || hasPermission('canUseCash') || anyAccount
      : hasPermission('canUseOtherStaffCashAccount') || otherCash
    if (account.type === 'safe') return hasPermission('canUseSafeAccount') || otherCash
    if (account.type === 'bank') return hasPermission('canUseBankAccount') || anyAccount
    if (account.type === 'mobile_money') return hasPermission('canUseMobileMoneyAccount') || anyAccount
    if (account.type === 'card') return hasPermission('canUseCardAccount') || anyAccount
    return false
  }
  const allowedMethods = methods.filter(({ value }) => {
    if (value === 'cash') return hasPermission('canUseCash')
    if (value === 'mobile_money') return hasPermission('canUseMobileMoney')
    if (value === 'bank_transfer') return hasPermission('canUseBank')
    if (value === 'card') return hasPermission('canUseCard')
    return false
  })
  const accountOptions = useMemo(() => {
    const types = methods.find((item) => item.value === method)?.accountTypes || []
    return accounts.filter((account) => types.includes(account.type) && accountPermission(account))
  }, [accounts, method, assignedCashId, hasPermission])

  useEffect(() => {
    if (!open || !customer) return
    let cancelled = false
    const initialMethod = allowedMethods.some((item) => item.value === 'cash') ? 'cash' : allowedMethods[0]?.value || 'cash'
    setMethod(initialMethod)
    setAmount('')
    setCurrency(baseCurrency)
    setRateToBase(1)
    setUnitsPerBase(1)
    setMobileProvider('')
    setPhoneNumber('')
    setTransactionId('')
    setError('')
    setAccounts([])
    setAccountId('')
    void apiFetch('/api/expenses/cash-accounts')
      .then(async (response) => {
        const payload = await response.json().catch(() => [])
        if (!response.ok) throw new Error(payload?.error || 'Could not load permitted transaction accounts.')
        if (!cancelled) setAccounts(Array.isArray(payload) ? payload : [])
      })
      .catch((reason) => { if (!cancelled) setError(reason?.message || 'Could not load transaction accounts.') })
    return () => { cancelled = true }
  }, [open, customer?.id, baseCurrency])

  useEffect(() => {
    if (!open) return
    setAccountId((current) => {
      if (accountOptions.some((account) => account.id === current)) return current
      const assigned = accountOptions.find((account) => account.id === assignedCashId)
      return assigned?.id || (accountOptions.length === 1 ? accountOptions[0].id : '')
    })
  }, [open, accountOptions, assignedCashId])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customer?.id || saving) return
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a payment amount greater than zero.')
      return
    }
    if (currency !== baseCurrency && (!rateToBase || !unitsPerBase)) {
      setError('A fresh exchange rate is required before posting.')
      return
    }
    if (!accountId) {
      setError('Select a permitted transaction account.')
      return
    }
    if (method === 'mobile_money' && (!mobileProvider || !phoneNumber.trim() || !transactionId.trim())) {
      setError('Enter the mobile money provider, phone number, and transaction ID.')
      return
    }
    if (method === 'card' && !transactionId.trim()) {
      setError('Enter the card transaction ID.')
      return
    }

    setSaving(true)
    setError('')
    const idempotencyKey = `customer-payment-${customer.id}-${randomKey()}`
    try {
      const response = await apiFetch('/api/receivables/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          customerId: customer.id,
          branchId: customer.branchId || undefined,
          amount: numericAmount,
          currency,
          unitsPerBase,
          paymentMethod: method,
          cashAccountId: accountId,
          idempotencyKey,
          mobileProvider: method === 'mobile_money' ? mobileProvider : undefined,
          phoneNumber: method === 'mobile_money' ? phoneNumber : undefined,
          transactionId: ['mobile_money', 'card'].includes(method) ? transactionId : undefined,
          notes: 'Payment recorded from customer profile',
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || result?.message || 'Failed to record payment.')
      onRecorded()
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen) }}>
      <DialogContent className="z-[70] max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Record customer payment</DialogTitle>
          <DialogDescription>{customer?.name || 'Customer'} · Balance {formatCurrency(Number(customer?.balance || 0))}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <fieldset disabled={saving} className="space-y-4">
            <div>
              <Label htmlFor="profilePaymentAmount">Payment amount</Label>
              <Input id="profilePaymentAmount" type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} />
              {currency !== baseCurrency && rateToBase && <p className="mt-1 text-xs text-muted-foreground">Ledger posting: {(Number(amount || 0) * rateToBase).toLocaleString(undefined, { maximumFractionDigits: 2 })} {baseCurrency}</p>}
            </div>
            <TransactionCurrencyControl baseCurrency={baseCurrency} currency={currency} enabled={hasFeature('settings.currencies')} amount={Number(amount || 0)} onCurrencyChange={setCurrency} onRateChange={(rate, units) => { setRateToBase(rate); setUnitsPerBase(units) }} />
            <div>
              <Label htmlFor="profilePaymentMethod">Payment method</Label>
              <Select value={method} onValueChange={(value) => { setMethod(value); setAccountId(''); setMobileProvider(''); setPhoneNumber(''); setTransactionId('') }}>
                <SelectTrigger id="profilePaymentMethod"><SelectValue placeholder="Select payment method" /></SelectTrigger>
                <SelectContent>{allowedMethods.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {method === 'mobile_money' && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <div><Label htmlFor="profileMobileProvider">Provider</Label><Select value={mobileProvider} onValueChange={setMobileProvider}><SelectTrigger id="profileMobileProvider"><SelectValue placeholder="Select provider" /></SelectTrigger><SelectContent>{['MTN', 'Airtel', 'Zamtel', 'Vodafone', 'M-Pesa', 'Other'].map((provider) => <SelectItem key={provider} value={provider}>{provider}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="profilePaymentPhone">Phone number</Label><Input id="profilePaymentPhone" type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} /></div>
              <div className="sm:col-span-2"><Label htmlFor="profilePaymentTransaction">Transaction ID</Label><Input id="profilePaymentTransaction" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} /></div>
            </div>}
            {method === 'card' && <div><Label htmlFor="profilePaymentTransaction">Transaction ID</Label><Input id="profilePaymentTransaction" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} /></div>}
            <div>
              <Label htmlFor="profilePaymentAccount">Transaction account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="profilePaymentAccount"><SelectValue placeholder={accountOptions.length ? 'Select account' : 'No permitted accounts available'} /></SelectTrigger>
                <SelectContent>{accountOptions.map((account) => <SelectItem key={account.id} value={account.id}>{account.name} · {formatCurrency(Number(account.balance || 0))}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !accountId || !amount || !allowedMethods.length}>{saving ? 'Recording…' : 'Record payment'}</Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}
