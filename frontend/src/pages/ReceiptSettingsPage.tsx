import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { settingsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function ReceiptSettingsPage() {
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
      toast({ title: 'Receipt settings saved' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err?.message })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Receipt Settings</h1>
        <p className="text-muted-foreground">Customize how your receipts look and what they display</p>
      </div>

      {settings && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Receipt Template</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Receipt Header Text</Label>
              <Input value={settings.receiptHeader || ''} onChange={e => setSettings((s: any) => ({ ...s, receiptHeader: e.target.value }))} placeholder="e.g. Thank you for shopping with us!" />
              <p className="text-xs text-muted-foreground">Displayed above "Thank you for your purchase!" on receipts</p>
            </div>
            <div className="space-y-2">
              <Label>Receipt Footer Text</Label>
              <Input value={settings.receiptFooter || ''} onChange={e => setSettings((s: any) => ({ ...s, receiptFooter: e.target.value }))} placeholder="e.g. Goods sold are not refundable" />
              <p className="text-xs text-muted-foreground">Displayed below "Thank you for your purchase!" on receipts</p>
            </div>
            <div className="rounded-lg border p-4 bg-muted/30">
              <p className="text-sm font-medium mb-2">Receipt Layout Preview</p>
              <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                <p className="text-center font-bold">{settings.name || 'Business Name'}</p>
                <p className="text-center">{settings.address || 'Address'}</p>
                <p className="text-center">Tel: {settings.phone || '---'} | {settings.email || '---'}</p>
                <p className="text-center">Branch: ---</p>
                <p className="text-center">- - - - - - - - - -</p>
                <p>Receipt: R-0001</p>
                <p>Date: --</p>
                <p className="text-center">- - - - - - - - - -</p>
                <p>Item     Qty  Price  Total</p>
                <p className="text-center">- - - - - - - - - -</p>
                <p>Subtotal:    ---.--</p>
                {settings.taxEnabled !== false
                  ? <p>Tax{settings.taxId ? ` (${settings.taxId})` : ''}: ---.--</p>
                  : <p>Tax: 0.00</p>
                }
                <p className="font-bold">TOTAL: ---.--</p>
                <p className="text-center">- - - - - - - - - -</p>
                {settings.receiptHeader && <p className="text-center">{settings.receiptHeader}</p>}
                <p className="text-center">Thank you for your purchase!</p>
                {settings.receiptFooter && <p className="text-center">{settings.receiptFooter}</p>}
                <p className="text-center">Powered by JibuSales</p>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Receipt Settings'}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
