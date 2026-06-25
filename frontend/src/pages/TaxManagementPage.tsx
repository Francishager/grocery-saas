import { useEffect, useState } from 'react'
import { DollarSign } from 'lucide-react'
import { settingsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function TaxManagementPage() {
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    try {
      const data = await settingsApi.get()
      setSettings(data)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to load settings', description: err?.message })
    } finally { setLoading(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await settingsApi.update(settings)
      toast({ title: 'Tax settings saved' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err?.message })
    } finally { setSaving(false) }
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
    </div>
  )
}
