import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Plug, Plus, Check, X, Zap, CreditCard, Smartphone, QrCode } from 'lucide-react'

interface IntegrationConfig {
  id: string
  provider: string
  displayName: string
  isActive: boolean
  webhookUrl?: string
  lastSyncAt?: string
  createdAt: string
  settings?: any
}

const PROVIDERS = [
  { id: 'stripe', name: 'Stripe', icon: CreditCard, description: 'Accept card payments globally' },
  { id: 'flutterwave', name: 'Flutterwave', icon: CreditCard, description: 'African payment gateway' },
  { id: 'mobile_money', name: 'Mobile Money', icon: Smartphone, description: 'MTN, Airtel, MoMo payments' },
  { id: 'qr_payments', name: 'QR Payments', icon: QrCode, description: 'Scan-to-pay QR codes' },
]

export default function IntegrationsPage() {
  const { toast } = useToast()
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const [provider, setProvider] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')

  const fetchIntegrations = async () => {
    try {
      const res = await apiFetch('/api/integrations')
      if (res.ok) setIntegrations(await res.json())
    } catch (err) { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchIntegrations() }, [])

  const handleCreate = async () => {
    if (!provider || !displayName) return toast({ variant: 'destructive', title: 'Provider and display name required' })
    try {
      const res = await apiFetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          displayName,
          credentials: { apiKey, secretKey },
          isActive: false,
        }),
      })
      if (res.ok) {
        toast({ title: 'Integration added' })
        setShowModal(false)
        setProvider(''); setDisplayName(''); setApiKey(''); setSecretKey('')
        fetchIntegrations()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to add integration' })
    }
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const res = await apiFetch(`/api/integrations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      if (res.ok) {
        toast({ title: `Integration ${isActive ? 'enabled' : 'disabled'}` })
        fetchIntegrations()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to update' })
    }
  }

  const handleTest = async (id: string) => {
    try {
      const res = await apiFetch(`/api/integrations/${id}/test`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast({ title: data.message })
        fetchIntegrations()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Test failed' })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await apiFetch(`/api/integrations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Integration removed' })
        fetchIntegrations()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to remove' })
    }
  }

  const activeCount = integrations.filter(i => i.isActive).length
  const availableProviders = PROVIDERS.filter(p => !integrations.some(i => i.provider === p.id))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">Connect payment providers and third-party services</p>
        </div>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogTrigger asChild><Button disabled={availableProviders.length === 0}><Plus className="h-4 w-4 mr-2" /> Add Integration</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Integration</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Provider</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {availableProviders.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setProvider(p.id); setDisplayName(p.name) }}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${provider === p.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                    >
                      <p.icon className="h-5 w-5" />
                      <div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.description}</p></div>
                    </button>
                  ))}
                </div>
              </div>
              <div><Label>Display Name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
              <div><Label>API Key</Label><Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your API key" /></div>
              <div><Label>Secret Key</Label><Input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="Your secret key" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleCreate}>Add</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Plug className="h-4 w-4" /> Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{integrations.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Zap className="h-4 w-4" /> Active</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{activeCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Available</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{availableProviders.length}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((p) => {
          const config = integrations.find((i) => i.provider === p.id)
          return (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <p.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{p.description}</p>
                    </div>
                  </div>
                  {config && (
                    <Switch
                      checked={config.isActive}
                      onCheckedChange={(checked) => handleToggle(config.id, checked)}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {config ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant={config.isActive ? 'default' : 'secondary'}>{config.isActive ? 'Connected' : 'Disabled'}</Badge>
                      {config.lastSyncAt && <span className="text-xs text-muted-foreground">Last sync: {new Date(config.lastSyncAt).toLocaleString()}</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleTest(config.id)}><Zap className="h-3 w-3 mr-1" /> Test</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(config.id)}><X className="h-3 w-3 mr-1" /> Remove</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not configured. Click "Add Integration" to set up.</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
