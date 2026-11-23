import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useOnlineStatus } from '@/db/hooks'
import type { CustomerHistoryTarget } from './CustomerTransactionHistoryDialog'

type WalletWithdrawalCustomer = CustomerHistoryTarget & {
  status?: string
  walletBalance?: number
  wallet?: { balance?: number; summary?: { balance?: number } }
}

type Account = {
  id: string
  name: string
  type: string
  balance?: number
  assignedStaffId?: string | null
}

const methods = [
  { value: 'cash', label: 'Cash', accountTypes: ['cash', 'safe'] },
  { value: 'mobile_money', label: 'Mobile Money', accountTypes: ['mobile_money'] },
  { value: 'bank_transfer', label: 'Bank Transfer', accountTypes: ['bank'] },
  { value: 'card', label: 'Card', accountTypes: ['card'] },
]

const amountOrZero = (value: unknown) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

export default function CustomerWalletWithdrawalDialog({
  customer,
  open,
  onOpenChange,
  onRecorded,
}: {
  customer: WalletWithdrawalCustomer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecorded: () => void
}) {
  const { user, hasPermission } = useJWTAuth()
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [mobileProvider, setMobileProvider] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const assignedCashId = String(user?.cashAccountId || user?.cashAccount?.id || '')
  const anyAccount = hasPermission('canUseAnyTransactionAccount')
  const canUseOtherCash = hasPermission('canUseOtherStaffCashAccount') || hasPermission('canUseOtherCashAccount') || anyAccount
  const allowedMethods = useMemo(() => methods.filter(({ value }) => {
    if (value === 'cash') return hasPermission('canUseCash')
    if (value === 'mobile_money') return hasPermission('canUseMobileMoney')
    if (value === 'bank_transfer') return hasPermission('canUseBank')
    return hasPermission('canUseCard')
  }), [hasPermission])

  const accountOptions = useMemo(() => {
    const accountTypes = methods.find((item) => item.value === method)?.accountTypes || []
    return accounts.filter((account) => {
      if (!accountTypes.includes(account.type)) return false
      if (account.type === 'cash') return account.id === assignedCashId
        ? hasPermission('canUseOwnCashAccount') || hasPermission('canUseCash') || anyAccount
        : canUseOtherCash
      if (account.type === 'safe') return hasPermission('canUseSafeAccount') || canUseOtherCash
      if (account.type === 'bank') return hasPermission('canUseBankAccount') || anyAccount
      if (account.type === 'mobile_money') return hasPermission('canUseMobileMoneyAccount') || anyAccount
      if (account.type === 'card') return hasPermission('canUseCardAccount') || anyAccount
      return false
    })
  }, [accounts, method, assignedCashId, hasPermission, anyAccount, canUseOtherCash])

  const walletBalanceSource = customer?.walletBalance ?? customer?.wallet?.balance ?? customer?.wallet?.summary?.balance
  const walletBalance = walletBalanceSource == null ? null : Number(walletBalanceSource)
  const hasWalletBalance = walletBalance !== null && Number.isFinite(walletBalance)
  const availableFunds = hasWalletBalance ? Math.max(0, walletBalance) : Number.POSITIVE_INFINITY
  const numericAmount = Number(amount)
  const selectedAccount = accountOptions.find((account) => account.id === accountId)
  const accountBalance = amountOrZero(selectedAccount?.balance)

  useEffect(() => {
    if (!open || !customer?.id) {
      setAccounts([])
      setAccountId('')
      return
    }

    let cancelled = false
    setAmount('')
    setMethod(allowedMethods.some((item) => item.value === 'cash') ? 'cash' : allowedMethods[0]?.value || 'cash')
    setMobileProvider('')
    setPhoneNumber('')
    setTransactionId('')
    setError('')
    setAccounts([])
    setAccountId('')
    void apiFetch('/api/expenses/cash-accounts')
      .then(async (response) => {
        const payload = await response.json().catch(() => [])
        if (!response.ok) throw new Error(payload?.error || 'Could not load permitted payout accounts.')
        if (!cancelled) setAccounts(Array.isArray(payload) ? payload : [])
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load permitted payout accounts.')
      })
    return () => { cancelled = true }
  }, [open, customer?.id, allowedMethods])

  useEffect(() => {
    if (!open) return
    setAccountId((current) => {
      if (accountOptions.some((account) => account.id === current)) return current
      const assigned = accountOptions.find((account) => account.id === assignedCashId)
      const userAssigned = accountOptions.find((account) => account.assignedStaffId && String(account.assignedStaffId) === String(user?.id))
      const cashAccount = accountOptions.find((account) => account.type.toLowerCase() === 'cash')
      const defaultAccount = assigned || userAssigned || cashAccount || (accountOptions.length === 1 ? accountOptions[0] : null)
      return defaultAccount?.id || ''
    })
  }, [open, accountOptions, assignedCashId, user?.id])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customer?.id || saving) return
    if (customer.status !== 'active') {
      setError('Withdrawals require an active customer.')
      return
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a withdrawal amount greater than zero.')
      return
    }
    if (numericAmount > availableFunds) {
      setError(`Withdrawal exceeds the available wallet balance of ${formatCurrency(availableFunds)}.`)
      return
    }
    if (!accountId || numericAmount > accountBalance) {
      setError('Select a payout account with enough available funds.')
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
    try {
      const response = await apiFetch('/api/receivables/wallet/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          branchId: customer.branchId || undefined,
          amount: numericAmount,
          paymentMethod: method,
          cashAccountId: accountId,
          mobileProvider: method === 'mobile_money' ? mobileProvider : undefined,
          phoneNumber: method === 'mobile_money' ? phoneNumber : undefined,
          transactionId: ['mobile_money', 'card'].includes(method) ? transactionId : undefined,
          notes: 'Customer wallet withdrawal recorded from customer profile',
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (Number.isFinite(Number(payload.availableFunds))) {
          setError(`${payload.error || 'Withdrawal could not be recorded.'} Available wallet balance: ${formatCurrency(Number(payload.availableFunds))}.`)
        } else {
          setError(payload.error || payload.message || 'Failed to record customer wallet withdrawal.')
        }
        return
      }

      toast({ title: 'Success', description: 'Wallet withdrawal recorded successfully.' })
      onOpenChange(false)
      onRecorded()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to record customer wallet withdrawal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen) }}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Withdraw from Customer Wallet</DialogTitle>
          <DialogDescription>
            {customer?.name || 'Customer'}
            {hasWalletBalance ? ` · Wallet balance ${formatCurrency(availableFunds)}` : ' · Available funds will be verified when submitted.'}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="profileWalletWithdrawalAmount">Withdrawal amount</Label>
            <Input
              id="profileWalletWithdrawalAmount"
              type="number"
              min="0.01"
              step="0.01"
              max={Number.isFinite(availableFunds) ? availableFunds : undefined}
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="profileWalletWithdrawalMethod">Payment method</Label>
            <Select value={method} onValueChange={(value) => {
              setMethod(value)
              setMobileProvider('')
              setPhoneNumber('')
              setTransactionId('')
            }}>
              <SelectTrigger id="profileWalletWithdrawalMethod"><SelectValue placeholder="Select payment method" /></SelectTrigger>
              <SelectContent>
                {allowedMethods.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {method === 'mobile_money' && <>
            <div>
              <Label htmlFor="profileWalletWithdrawalProvider">Network provider</Label>
              <select id="profileWalletWithdrawalProvider" value={mobileProvider} onChange={(event) => setMobileProvider(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Select provider</option><option value="MTN">MTN</option><option value="Airtel">Airtel</option><option value="Other">Other</option>
              </select>
            </div>
            <div><Label htmlFor="profileWalletWithdrawalPhone">Phone number</Label><Input id="profileWalletWithdrawalPhone" type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="Mobile money number" /></div>
            <div><Label htmlFor="profileWalletWithdrawalTxn">Transaction ID</Label><Input id="profileWalletWithdrawalTxn" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} placeholder="Transaction reference" /></div>
          </>}
          {method === 'card' && <div><Label htmlFor="profileWalletWithdrawalCardTxn">Transaction ID</Label><Input id="profileWalletWithdrawalCardTxn" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} placeholder="Transaction reference" /></div>}
          <div>
            <Label htmlFor="profileWalletWithdrawalAccount">Payout account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="profileWalletWithdrawalAccount"><SelectValue placeholder={accountOptions.length ? 'Select payout account' : 'No eligible accounts'} /></SelectTrigger>
              <SelectContent>
                {accountOptions.map((account) => <SelectItem key={account.id} value={account.id}>{account.name} · {formatCurrency(amountOrZero(account.balance))}</SelectItem>)}
              </SelectContent>
            </Select>
            {!accountOptions.length && <p role="alert" className="mt-1 text-sm text-destructive">No permitted payout account is available for this payment method.</p>}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              disabled={
                saving || !online || customer?.status !== 'active' || numericAmount <= 0 ||
                numericAmount > availableFunds || !accountId || numericAmount > accountBalance ||
                (method === 'mobile_money' && (!mobileProvider || !phoneNumber.trim() || !transactionId.trim())) ||
                (method === 'card' && !transactionId.trim())
              }
            >
              {saving ? 'Recording…' : 'Record Wallet Withdrawal'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
