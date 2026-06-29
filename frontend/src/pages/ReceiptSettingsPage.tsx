import { useEffect, useState, useRef } from 'react'
import { FileText, Camera, Upload, Loader2 } from 'lucide-react'
import { settingsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalSettings } from '@/db/hybrid'

export default function ReceiptSettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const online = useOnlineStatus()

  useEffect(() => { loadSettings() }, [])

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
    setSaving(true)
    try {
      await settingsApi.update(settings)
      toast({ title: 'Receipt settings saved' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err?.message })
    } finally { setSaving(false) }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Max 2MB' })
      return
    }
    setUploading(true)
    try {
      const result = await settingsApi.uploadLogo(file)
      if (result.logo) {
        setSettings((s: any) => ({ ...s, logo: result.logo }))
        toast({ title: 'Logo uploaded' })
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err?.message })
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Receipt Settings</h1>
        <p className="text-muted-foreground">Customize how your receipts look and what they display</p>
      </div>

      {settings && (
        <>
          {/* Logo Section */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" />Business Logo</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="relative">
                  {settings.logo ? (
                    <img src={settings.logo} alt="Business Logo" className="h-20 w-20 rounded-lg object-contain border-2 border-muted bg-white p-1" />
                  ) : (
                    <div className="h-20 w-20 rounded-lg bg-muted/30 flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
                      <Upload className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </div>
                <div>
                  <p className="text-sm font-medium">Receipt Logo</p>
                  <p className="text-xs text-muted-foreground">Displayed on the left side above your business name on receipts</p>
                  <p className="text-xs text-muted-foreground mt-1">Recommended: Square image, max 2MB</p>
                  {settings.logo && (
                    <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => setSettings((s: any) => ({ ...s, logo: '' }))}>
                      Remove Logo
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Receipt Template */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Receipt Template</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Business Name on Receipt</Label>
                <Input value={settings.name || ''} onChange={e => setSettings((s: any) => ({ ...s, name: e.target.value }))} placeholder="Business Name" />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input value={settings.phone || ''} onChange={e => setSettings((s: any) => ({ ...s, phone: e.target.value }))} placeholder="+256..." />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={settings.email || ''} onChange={e => setSettings((s: any) => ({ ...s, email: e.target.value }))} placeholder="business@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={settings.address || ''} onChange={e => setSettings((s: any) => ({ ...s, address: e.target.value }))} placeholder="Business address" />
              </div>
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

              {/* Preview */}
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-sm font-medium mb-2">Receipt Layout Preview</p>
                <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                  {settings.logo && <p className="text-left">[Logo]</p>}
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
        </>
      )}
    </div>
  )
}
