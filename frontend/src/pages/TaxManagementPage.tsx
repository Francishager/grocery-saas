import { useEffect, useState } from 'react'
import { CheckCircle2, DollarSign, ExternalLink, ShieldCheck } from 'lucide-react'
import { settingsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalSettings } from '@/db/hybrid'
import { Switch } from '@/components/ui/switch'

export default function TaxManagementPage() {
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [efrisEnabled, setEfrisEnabled] = useState(false)
  const [efrisLoading, setEfrisLoading] = useState(true)
  const [efrisSaving, setEfrisSaving] = useState(false)
  const { toast } = useToast()
  const { hasPermission } = useAuth()
  const canManageTax = hasPermission('canManageTax')
  const online = useOnlineStatus()

  useEffect(() => {
    loadSettings()
    if (online) {
      settingsApi.getEfrisConfig()
        .then((config) => setEfrisEnabled(config.enabled))
        .catch(() => setEfrisEnabled(false))
        .finally(() => setEfrisLoading(false))
    } else {
      setEfrisLoading(false)
    }
  }, [online])

  const loadSettings = async () => {
    try {
      if (online) {
        const data = await settingsApi.get()
        setSettings(data)
      } else {
        const local = await getLocalSettings()
        setSettings(local)
      }
    } catch (err: any) {
      try { setSettings(await getLocalSettings()) } catch {
        toast({ variant: 'destructive', title: 'Failed to load settings', description: err?.message })
      }
    } finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (settings?.taxEnabled && (settings.taxRate === undefined || settings.taxRate === null || settings.taxRate < 0)) {
      toast({ variant: 'destructive', title: 'Enter a valid tax rate' })
      return
    }
    setSaving(true)
    try {
      await settingsApi.update(settings)
      toast({ title: 'Tax settings saved' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err?.message })
    } finally { setSaving(false) }
  }

  const handleEfrisToggle = async (enabled: boolean) => {
    setEfrisSaving(true)
    try {
      const config = await settingsApi.updateEfrisConfig(enabled)
      setEfrisEnabled(config.enabled)
      toast({ title: enabled ? 'EFRIS setup enabled' : 'EFRIS setup hidden' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not update EFRIS setup', description: err?.message })
    } finally {
      setEfrisSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tax Management</h1>
        <p className="text-muted-foreground">Configure URA VAT and tax settings for your business</p>
      </div>

      {settings && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Tax Configuration</CardTitle>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${settings.taxEnabled ? 'text-green-600' : 'text-red-500'}`}>{settings.taxEnabled ? 'Tax is ON' : 'Tax is OFF'}</span>
                <button
                  onClick={() => setSettings((s: any) => ({ ...s, taxEnabled: !s.taxEnabled }))}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${settings.taxEnabled ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.taxEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`space-y-4 ${!settings.taxEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground">Configure tax settings for URA (Uganda Revenue Authority) VAT and other tax types. When tax is OFF, receipts will show zero tax and no tax will be charged on sales.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <Input type="number" step="any" min="0" value={settings.taxRate || 0} onChange={e => setSettings((s: any) => ({ ...s, taxRate: parseFloat(e.target.value) || 0 }))} placeholder="e.g. 18 for 18% VAT" />
                  <p className="text-xs text-muted-foreground">Standard URA VAT rate is 18%</p>
                </div>
                <div className="space-y-2">
                  <Label>TIN / VAT Registration Number</Label>
                  <Input value={settings.taxId || ''} onChange={e => setSettings((s: any) => ({ ...s, taxId: e.target.value }))} placeholder="e.g. 1012345678" />
                  <p className="text-xs text-muted-foreground">Your URA Tax Identification Number</p>
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium mb-2">Tax Preview</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Status: <span className={settings.taxEnabled ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{settings.taxEnabled ? 'ACTIVE' : 'DISABLED'}</span></p>
                  <p>Rate: {settings.taxRate || 0}% {settings.taxRate === 18 ? '(Standard VAT)' : ''}</p>
                  <p>TIN: {settings.taxId || 'Not set'}</p>
                  <p>Receipts will show: Tax{settings.taxId ? ` (${settings.taxId})` : ''}: {settings.taxEnabled ? 'calculated per sale' : '0.00'}</p>
                </div>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Tax Settings'}</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />URA EFRIS</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Choose whether EFRIS setup appears for this business.</p>
          </div>
          <Switch
            checked={efrisEnabled}
            disabled={efrisLoading || efrisSaving || !online || !canManageTax}
            onCheckedChange={handleEfrisToggle}
            aria-label="Enable EFRIS setup"
          />
        </CardHeader>
        {efrisEnabled && (
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="min-w-0">
                <p className="font-medium">Setup is enabled, but URA is not connected.</p>
                <p className="mt-1 text-sm">Sales, tax calculations, and receipts continue using the existing workflow. No invoice is being submitted or fiscalized through EFRIS yet.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-4">
                <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />Business tax details</p>
                <p className="mt-1 text-sm text-muted-foreground">TIN currently recorded: {settings?.taxId || 'Not set'}. Review the tax details above before onboarding.</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="font-medium">URA system-to-system onboarding</p>
                <p className="mt-1 text-sm text-muted-foreground">Complete URA onboarding and obtain the approved technical specification and test credentials before connecting fiscal submissions.</p>
                <a className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline" href="https://ura.go.ug/en/efris/" target="_blank" rel="noreferrer">EFRIS information <ExternalLink className="h-3.5 w-3.5" /></a>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
