import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { apiFetch } from '@/lib/api'

type BillingReminder = {
  currency?: string
  planName?: string
  amountDue?: number
  paidToDate?: number
  subscriptionAmount?: number
  daysRemaining?: number | null
  dueDate?: string | null
  trialEndsAt?: string | null
  isTrialActive?: boolean
  isPartiallyPaid?: boolean
  isDueSoon?: boolean
  isGracePeriodActive?: boolean
  isOverdue?: boolean
  paymentStatus?: string
}

function formatAmount(value: unknown, currency: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  try {
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('en-UG')}`
  }
}

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-GB').format(date)
}

export function SubscriptionBillingReminder() {
  const { user, tokens, hasPermission } = useJWTAuth()
  const navigate = useNavigate()
  const [reminder, setReminder] = useState<BillingReminder | null>(null)
  const [open, setOpen] = useState(false)

  const canPay = user?.role === 'owner' || hasPermission('canPaySubscriptionInvoice')
  const tenantId = user?.tenantId
  const authenticated = Boolean(tokens?.accessToken)

  useEffect(() => {
    if (!tenantId || !authenticated || !canPay) {
      setReminder(null)
      setOpen(false)
      return
    }

    let active = true
    let previousNeedsAttention: boolean | null = null
    const refresh = async () => {
      try {
        const response = await apiFetch('/api/tenants/me/billing-reminder')
        if (!response.ok) return
        const data = await response.json() as BillingReminder
        if (!active) return
        const needsAttention = Boolean(
          data.isTrialActive || (data.paymentStatus !== 'paid' && (
            data.isPartiallyPaid || data.isDueSoon || data.isGracePeriodActive || data.isOverdue
          ))
        )
        setReminder(needsAttention ? data : null)
        const shouldAutoOpen = previousNeedsAttention === null || (!previousNeedsAttention && needsAttention)
        setOpen(current => shouldAutoOpen ? needsAttention : current && needsAttention)
        previousNeedsAttention = needsAttention
      } catch { /* retain the last confirmed billing state while offline */ }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('subscription-payment-updated', refresh)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('subscription-payment-updated', refresh)
    }
  }, [tenantId, authenticated, canPay])

  if (!reminder) return null

  const title = reminder.isTrialActive
    ? 'Your business trial is active'
    : reminder.isPartiallyPaid
      ? 'Subscription payment is incomplete'
      : reminder.isOverdue
        ? 'Subscription payment is overdue'
        : 'Subscription renewal is approaching'
  const date = formatDate(reminder.isTrialActive ? reminder.trialEndsAt : reminder.dueDate)
  const amountDue = formatAmount(reminder.amountDue, reminder.currency || 'UGX')
  const paidAmount = formatAmount(reminder.paidToDate, reminder.currency || 'UGX')
  const totalAmount = formatAmount(reminder.subscriptionAmount, reminder.currency || 'UGX')
  const description = reminder.isTrialActive
    ? `Your ${reminder.planName || 'business'} trial${date ? ` ends on ${date}` : ''}. Review the invoice and payment options before the trial ends.`
    : reminder.isPartiallyPaid
      ? `${paidAmount || 'A partial amount'} has been received${totalAmount ? ` against ${totalAmount}` : ''}. ${amountDue || 'The remaining balance'} is still due${date ? ` by ${date}` : ''}.`
      : reminder.isOverdue
        ? `${amountDue || 'Your subscription invoice'} is overdue. Review the invoice and payment status.`
        : `Your ${reminder.planName || 'subscription'} is due${date ? ` on ${date}` : ''}${amountDue ? ` for ${amountDue}` : ''}.`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <Receipt className="h-5 w-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {amountDue && (
          <div className="rounded-md border bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Amount due</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{amountDue}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Later</Button>
          <Button onClick={() => { setOpen(false); navigate('/tenant/settings') }}>
            <CreditCard className="mr-2 h-4 w-4" />
            {reminder.isTrialActive ? 'Review invoice' : 'Review and pay'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
