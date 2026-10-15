import { useEffect, useState } from 'react'
import { Upload, Building2, MapPin, Receipt, Printer, CreditCard } from 'lucide-react'
import { settingsApi, subscriptionBillingApi } from '@/lib/api'
import { cacheTenantFormattingSettings, DEFAULT_SYSTEM_DATE_FORMAT, getTenantCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalSettings } from '@/db/hybrid'
import { db } from '@/db/index'
import WorkingHoursEditor, { defaultWorkingHours } from '@/components/WorkingHoursEditor'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

export default function BusinessSettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [capturingLocation, setCapturingLocation] = useState(false)
  const [locationPending, setLocationPending] = useState(false)
  const [billing, setBilling] = useState<any>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingPeriods, setBillingPeriods] = useState<number | ''>('')
  const [billingMethod, setBillingMethod] = useState<'mobile_money' | 'card'>('mobile_money')
  const [billingPhone, setBillingPhone] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const { toast } = useToast()
  const online = useOnlineStatus()
  const { user, hasPermission } = useJWTAuth()
  const canViewBusinessSettings = user?.role === 'owner' || hasPermission('canViewSettings')
  const canPaySubscriptionInvoice = user?.role === 'owner' || hasPermission('canPaySubscriptionInvoice')
  const canManageHours = user?.role === 'owner' || user?.role === 'saas_admin' || hasPermission('canEditStaff')

  useEffect(() => { loadSettings() }, [online, canViewBusinessSettings])
  useEffect(() => { if (online) void loadBilling() }, [online])
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('billingRef')
    if (!reference || !online) return
    let cancelled = false
    const check = async (attempt = 0) => {
      try {
        const result = await subscriptionBillingApi.getPaymentStatus(reference)
        if (cancelled) return
        if (result.status === 'COMPLETED') {
          toast({ title: 'Payment confirmed', description: 'Your receipt is now available below.' })
          await loadBilling()
          window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
          return
        }
        if (attempt < 5 && ['PENDING', 'NOT_STARTED'].includes(result.status)) window.setTimeout(() => void check(attempt + 1), 3000)
      } catch { /* the payment remains visible as pending until its provider confirms it */ }
    }
    void check()
    return () => { cancelled = true }
  }, [online])

  const loadBilling = async () => {
    setBillingLoading(true)
    try { setBilling(await subscriptionBillingApi.get()) }
    catch (error: any) { toast({ variant: 'destructive', title: 'Billing details unavailable', description: error?.message }) }
    finally { setBillingLoading(false) }
  }

  const billingMoney = (value: number, currency = billing?.currency || settings?.currency || 'UGX') =>
    `${currency} ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(Number(value || 0))}`

  const partialBalanceDue = Boolean(billing?.isPartiallyPaid && Number(billing?.amountDue) > 0)
  const invoicePeriods = partialBalanceDue ? 1 : billingPeriods || 1
  const invoicePeriodTotal = Number(billing?.periodTotal || 0)
  const invoiceCurrentRemainder = partialBalanceDue
    ? Number(billing.amountDue)
    : billing?.currentPeriodRemainder == null
    ? invoicePeriodTotal
    : Number(billing.currentPeriodRemainder)
  const invoiceTotal = partialBalanceDue
    ? Number(billing.amountDue)
    : invoiceCurrentRemainder + Math.max(0, invoicePeriods - 1) * invoicePeriodTotal
  const invoiceLineItems = (periodCount: number) => [
    ...(Number(billing?.planPrice) > 0 ? [{ label: `${billing.planName} plan × ${periodCount}`, amount: Number(billing.planPrice) * periodCount }] : []),
    ...(Number(billing?.serviceFee) > 0 ? [{ label: `Service fee × ${periodCount}`, amount: Number(billing.serviceFee) * periodCount }] : []),
    ...(Number(billing?.staticIpFee) > 0 ? [{ label: `Static IP service × ${periodCount}`, amount: Number(billing.staticIpFee) * periodCount }] : []),
    ...(invoiceCurrentRemainder < invoicePeriodTotal ? [{ label: 'Previous payments applied', amount: -(invoicePeriodTotal - invoiceCurrentRemainder) }] : []),
  ]

  const printBillingDocument = (title: string, reference: string, date: string, lineItems: Array<{ label: string; amount: number }>, total: number, status: string) => {
    const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
    const popup = window.open('', '_blank', 'width=760,height=800')
    if (!popup) { toast({ variant: 'destructive', title: 'Allow pop-ups to print this document' }); return }
    popup.document.write(`<!doctype html><html><head><title>${safe(title)}</title><style>body{font:15px Arial,sans-serif;color:#17202a;margin:40px auto;max-width:720px;padding:0 24px}header{border-bottom:2px solid #163b36;padding-bottom:18px;margin-bottom:24px}.brand-logo{display:block;width:auto;height:auto;max-width:210px;max-height:72px;object-fit:contain;margin:0 auto 16px}.meta{color:#52615e;line-height:1.6}.row{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-bottom:1px solid #dce3e0}.total{font-size:18px;font-weight:bold;border-top:2px solid #163b36;margin-top:12px;padding-top:16px}.status{display:inline-block;background:#e9f5ee;color:#14623b;padding:6px 10px;font-weight:bold;margin-top:14px}@media print{body{margin:16mm auto}}</style></head><body><header><img class="brand-logo" src="${safe(`${window.location.origin}/img/jibusales_logo.png`)}" alt="JibuSales"><div class="meta">Subscription billing document<br>Billed to: ${safe(settings?.name || billing?.name || 'Business')}<br>${safe(settings?.address || '')}<br>${safe(settings?.phone || '')} ${safe(settings?.email || '')}</div></header><h2>${safe(title)}</h2><div class="meta">${safe(reference)} · ${safe(date)}</div>${lineItems.map(item => `<div class="row"><span>${safe(item.label)}</span><strong>${safe(billingMoney(item.amount))}</strong></div>`).join('')}<div class="row total"><span>Total</span><span>${safe(billingMoney(total))}</span></div><div class="status">${safe(status)}</div><script>window.onload=()=>window.print()</script></body></html>`)
    popup.document.close()
  }

  const startSubscriptionPayment = async () => {
    setBillingBusy(true)
    try {
      const result = await subscriptionBillingApi.startPayment({
        periodCount: partialBalanceDue ? 1 : Number(billingPeriods),
        paymentMethod: billingMethod,
        phoneNumber: billingPhone,
        email: billingEmail,
      })
      if (result.payment?.checkoutUrl) window.location.assign(result.payment.checkoutUrl)
      else toast({ title: 'Payment request created', description: 'Check your payment device to approve the request.' })
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not start payment', description: error?.message })
    } finally { setBillingBusy(false) }
  }

  const loadSettings = async () => {
    try {
      if (online) {
        const data = canViewBusinessSettings ? await settingsApi.get() : await settingsApi.getBusinessProfile()
        const normalized = { ...data, dateFormat: DEFAULT_SYSTEM_DATE_FORMAT }
        cacheTenantFormattingSettings(normalized)
        setSettings(normalized)
      } else {
        const local = await getLocalSettings()
        const normalized = { ...local, dateFormat: DEFAULT_SYSTEM_DATE_FORMAT }
        cacheTenantFormattingSettings(normalized)
        setSettings(normalized)
      }
    } catch (err: any) {
      try {
        const local = await getLocalSettings()
        const normalized = { ...local, dateFormat: DEFAULT_SYSTEM_DATE_FORMAT }
        cacheTenantFormattingSettings(normalized)
        setSettings(normalized)
      } catch {
        toast({ variant: 'destructive', title: 'Failed to load settings', description: err?.message })
      }
    } finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!settings?.name?.trim()) {
      toast({ variant: 'destructive', title: 'Business name is required' })
      return
    }
    setSaving(true)
    try {
      const payload = { ...settings, dateFormat: DEFAULT_SYSTEM_DATE_FORMAT }
      if (!canManageHours) delete payload.workingHours
      const result = await settingsApi.update(payload)
      const updatedSettings = result?.tenant || { ...settings, dateFormat: DEFAULT_SYSTEM_DATE_FORMAT }
      cacheTenantFormattingSettings(updatedSettings)
      setSettings(updatedSettings)
      setLocationPending(false)
      toast({ title: 'Settings saved' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err?.message })
    } finally { setSaving(false) }
  }

  const captureAttendanceLocation = () => {
    if (!settings?.address?.trim()) {
      toast({ variant: 'destructive', title: 'Set the business address first' })
      return
    }
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Location services are not available on this device' })
      return
    }
    setCapturingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSettings((current: any) => ({ ...current, attendanceLatitude: position.coords.latitude, attendanceLongitude: position.coords.longitude }))
        setCapturingLocation(false)
        setLocationPending(true)
        toast({ title: 'Business location captured', description: 'Save changes to activate attendance location checks.' })
      },
      async (error) => {
        setCapturingLocation(false)
        const permission = navigator.permissions ? await navigator.permissions.query({ name: 'geolocation' as PermissionName }).catch(() => null) : null
        const description = error.code === error.PERMISSION_DENIED || permission?.state === 'denied'
          ? 'Location is blocked for this site. Open the browser site controls next to the address bar, set Location to Allow, then try again.'
          : 'Allow location access while at the business address and try again.'
        toast({ variant: 'destructive', title: 'Unable to capture location', description })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await settingsApi.uploadLogo(file)
      if (result.logo) {
        setSettings((s: any) => ({ ...s, logo: result.logo }))
        toast({ title: 'Logo uploaded' })
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err?.message })
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Business Profile</h1>
        <p className="text-muted-foreground">Manage your core business details and logo</p>
      </div>

      {settings && canViewBusinessSettings && (
        <Card>
          <CardHeader><CardTitle>Business Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              {settings.logo ? (
                <img src={settings.logo} alt="Logo" className="h-20 w-20 rounded-lg object-cover border" />
              ) : (
                <div className="h-20 w-20 rounded-lg border flex items-center justify-center bg-muted"><Building2 className="h-10 w-10 text-muted-foreground" /></div>
              )}
              <label className="cursor-pointer">
                <Button type="button" variant="outline" onClick={() => document.getElementById('logo-input')?.click()}>
                  <Upload className="h-4 w-4 mr-2" />Upload Logo
                </Button>
                <input id="logo-input" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Business Name</Label>
                <Input value={settings.name || ''} onChange={e => setSettings((s: any) => ({ ...s, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={settings.email || ''} onChange={e => setSettings((s: any) => ({ ...s, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={settings.phone || ''} onChange={e => setSettings((s: any) => ({ ...s, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={settings.address || ''} onChange={e => setSettings((s: any) => ({ ...s, address: e.target.value }))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Attendance Location</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button type="button" variant="outline" onClick={captureAttendanceLocation} disabled={saving || capturingLocation || !online}>
                    <MapPin className="mr-2 h-4 w-4" /> Capture Business Location
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {capturingLocation ? 'Capturing business location...' : locationPending ? 'Location captured but not saved. Select Save Changes to activate it.' : settings.attendanceLatitude != null && settings.attendanceLongitude != null ? 'Business GPS location saved.' : 'Capture this while physically at the saved business address.'}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Attendance Radius (metres)</Label>
                <Input type="number" min="25" max="2000" value={settings.attendanceRadiusMeters ?? 200} onChange={e => setSettings((s: any) => ({ ...s, attendanceRadiusMeters: Number(e.target.value) || 200 }))} />
              </div>
              <div className="space-y-2">
                <Label>Location Status</Label>
                <div className="min-h-10 break-words text-sm text-muted-foreground">{locationPending ? 'Not saved yet' : settings.attendanceLatitude != null && settings.attendanceLongitude != null ? 'Configured' : 'Not configured'}{settings.attendanceLatitude != null && settings.attendanceLongitude != null && <div>{Number(settings.attendanceLatitude).toFixed(6)}, {Number(settings.attendanceLongitude).toFixed(6)}</div>}</div>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <select value={settings.currency || getTenantCurrency()} onChange={e => setSettings((s: any) => ({ ...s, currency: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="UGX">UGX - Ugandan Shilling</option>
                  <option value="KES">KES - Kenyan Shilling</option>
                  <option value="TZS">TZS - Tanzanian Shilling</option>
                  <option value="RWF">RWF - Rwandan Franc</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <select disabled={!canManageHours} value={settings.timezone || 'Africa/Kampala'} onChange={e => setSettings((s: any) => ({ ...s, timezone: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="Africa/Kampala">Africa/Kampala</option>
                  <option value="Africa/Nairobi">Africa/Nairobi</option>
                  <option value="Africa/Dar_es_Salaam">Africa/Dar_es_Salaam</option>
                  <option value="Africa/Kigali">Africa/Kigali</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </div>
            </div>
            <WorkingHoursEditor value={settings.workingHours || defaultWorkingHours()} timezone={settings.timezone || 'Africa/Kampala'} onChange={(workingHours) => setSettings((previous: any) => ({ ...previous, workingHours }))} disabled={!canManageHours || saving || !online} />
            <p className="text-xs text-muted-foreground">Business owner access remains unrestricted.</p>
            <Button onClick={handleSave} disabled={saving || !online}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </CardContent>
        </Card>
      )}

      {settings && !canViewBusinessSettings && canPaySubscriptionInvoice && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Business Profile</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            {settings.logo && <img src={settings.logo} alt="Business logo" className="h-14 w-14 rounded-md border object-contain" />}
            <div><p className="font-semibold">{settings.name}</p><p className="text-sm text-muted-foreground">{[settings.address, settings.phone, settings.email].filter(Boolean).join(' · ')}</p></div>
          </CardContent>
        </Card>
      )}

      {settings && online && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Subscription invoices & receipts</CardTitle>
            <p className="text-sm text-muted-foreground">Review your subscription charges, pay upcoming periods, and print payment documents.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {billingLoading && !billing ? <p className="text-sm text-muted-foreground">Loading billing history...</p> : billing ? <>
              <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Business</p><p className="font-semibold">{billing.name}</p></div>
                <div><p className="text-xs text-muted-foreground">Plan & cycle</p><p className="font-semibold">{billing.planName} · {billing.billingCycle}</p></div>
                <div><p className="text-xs text-muted-foreground">Current status</p><p className="font-semibold capitalize">{billing.paymentStatus || 'Due'}</p></div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                <section className={`space-y-3 rounded-lg border p-4 ${Number(billing.amountDue) > 0 ? 'border-red-500 bg-red-50/50 dark:bg-red-950/10' : ''}`} aria-label="Subscription invoice preview">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-semibold">Subscription Invoice</h3><p className="text-sm text-muted-foreground">{partialBalanceDue ? 'Outstanding balance' : `${billing.planName}, ${invoicePeriods} ${billing.billingCycle === 'yearly' ? 'year(s)' : 'month(s)'}`}</p></div>
                    <div className="flex flex-wrap items-center gap-2">
                    {Number(billing.amountDue) > 0 && <span className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none" />{partialBalanceDue ? 'PARTIALLY PAID · BALANCE DUE' : 'PAYMENT DUE'}</span>}
                    <Button variant="outline" size="sm" onClick={() => printBillingDocument('Subscription Invoice', `INV-${billing.tenantId}-${Date.now()}`, new Date().toLocaleDateString('en-GB'), invoiceLineItems(invoicePeriods), invoiceTotal, 'PAYABLE')}>
                      <Printer className="mr-2 h-4 w-4" />Print invoice
                    </Button>
                    </div>
                  </div>
                  <div className="divide-y text-sm">
                    {invoiceLineItems(invoicePeriods).map((item, index) => <div key={`${item.label}-${index}`} className="flex justify-between gap-4 py-2"><span>{item.label}</span><span>{billingMoney(item.amount)}</span></div>)}
                    <div className="flex justify-between gap-4 py-3 text-base font-bold"><span>Invoice total</span><span>{billingMoney(invoiceTotal)}</span></div>
                  </div>
                  {partialBalanceDue ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
                    {billingMoney(Number(billing.amountDue), billing.currency)} remains unpaid. Pay this balance before selecting additional subscription periods.
                  </div> : <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
                    <div className="space-y-1"><Label>Periods to pay</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={billingPeriods} onChange={event => setBillingPeriods(event.target.value ? Number(event.target.value) : '')}>
                      <option value="">Choose periods</option>
                      {Array.from({ length: billing.billingCycle === 'yearly' ? 5 : 12 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count} {billing.billingCycle === 'yearly' ? (count === 1 ? 'year' : 'years') : (count === 1 ? 'month' : 'months')}</option>)}
                    </select></div>
                  </div>}
                  {canPaySubscriptionInvoice && (partialBalanceDue || billingPeriods !== '') && <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
                    <div className="space-y-1"><Label>Payment method</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={billingMethod} onChange={event => setBillingMethod(event.target.value as 'mobile_money' | 'card')}><option value="mobile_money">Mobile money</option><option value="card">Card</option></select></div>
                    {billingMethod === 'mobile_money' && <div className="space-y-1"><Label>Mobile number</Label><Input value={billingPhone} onChange={event => setBillingPhone(event.target.value)} placeholder="Payment phone number" /></div>}
                    <div className="space-y-1"><Label>Email for payment receipt</Label><Input type="email" value={billingEmail} onChange={event => setBillingEmail(event.target.value)} placeholder="name@example.com" /></div>
                    <div className="sm:col-span-2"><Button className={`w-full sm:w-auto ${partialBalanceDue ? 'animate-pulse bg-red-600 text-white hover:bg-red-700 motion-reduce:animate-none' : ''}`} onClick={startSubscriptionPayment} disabled={billingBusy || billingLoading || (!billingPhone.trim() && !billingEmail.trim())}>{billingBusy ? 'Opening checkout...' : <><CreditCard className="mr-2 h-4 w-4" />{partialBalanceDue ? 'Pay remaining balance' : 'Pay'} {billingMoney(invoiceTotal)}</>}</Button></div>
                  </div>}
                  {canPaySubscriptionInvoice && !partialBalanceDue && billingPeriods === '' && <p className="border-t pt-4 text-sm text-muted-foreground">Choose periods to see payment options.</p>}
                  {!canPaySubscriptionInvoice && <p className="text-sm text-muted-foreground">Your account can view and print billing records but cannot start subscription payments.</p>}
                </section>

                <section className="space-y-3" aria-label="Subscription receipts">
                  <div className="flex items-center justify-between"><h3 className="font-semibold">Payment history</h3><Button variant="ghost" size="sm" onClick={() => void loadBilling()} disabled={billingLoading}>{billingLoading ? 'Refreshing...' : 'Refresh'}</Button></div>
                  {billing.payments?.length ? <div className="divide-y rounded-lg border">
                    {billing.payments.map((payment: any) => {
                      const invoiceItems = payment.invoice?.lineItems?.map((item: any) => ({ label: item.description, amount: Number(item.amount) })) || [{ label: 'Subscription payment', amount: Number(payment.amount) }]
                      const date = payment.paidAt || payment.createdAt
                      return <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0"><p className="font-medium">{billingMoney(payment.amount, payment.currency)} <span className="ml-1 text-xs font-normal capitalize text-muted-foreground">{payment.status}</span></p><p className="break-all text-xs text-muted-foreground">{date ? new Date(date).toLocaleDateString('en-GB') : 'Date pending'} · {payment.paymentMethod || payment.provider || 'Payment'}{payment.reference ? ` · ${payment.reference}` : ''}</p>{payment.invoice?.periodCount && <p className="text-xs text-muted-foreground">Covers {payment.invoice.periodCount} {payment.invoice.periodUnit === 'yearly' ? 'year(s)' : 'month(s)'}</p>}</div>
                        <Button variant="outline" size="sm" disabled={payment.status !== 'completed'} onClick={() => printBillingDocument('Subscription Receipt', payment.reference || payment.merchantReference || payment.id, date ? new Date(date).toLocaleDateString('en-GB') : '', invoiceItems, Number(payment.amount), 'PAID')}><Printer className="mr-2 h-4 w-4" />Receipt</Button>
                      </div>
                    })}
                  </div> : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No subscription receipts have been recorded yet.</div>}
                </section>
              </div>
            </> : <p className="text-sm text-muted-foreground">Billing details are not available right now.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
