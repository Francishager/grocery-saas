import { useEffect, useState } from 'react'
import { Upload, Building2 } from 'lucide-react'
import { settingsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalSettings } from '@/db/hybrid'
import { db } from '@/db/index'

export default function BusinessSettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
      try {
        const local = await getLocalSettings()
        setSettings(local)
      } catch {
        toast({ variant: 'destructive', title: 'Failed to load settings', description: err?.message })
      }
    } finally { setLoading(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await settingsApi.update(settings)
      toast({ title: 'Settings saved' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err?.message })
    } finally { setSaving(false) }
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

      {settings && (
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
              <div className="space-y-2">
                <Label>Currency</Label>
                <select value={settings.currency || 'UGX'} onChange={e => setSettings((s: any) => ({ ...s, currency: e.target.value }))}
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
                <select value={settings.timezone || 'Africa/Kampala'} onChange={e => setSettings((s: any) => ({ ...s, timezone: e.target.value }))}
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
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
