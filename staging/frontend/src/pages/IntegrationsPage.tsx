import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Plug, Plus, Check, X, Zap, CreditCard, Smartphone, QrCode, Globe, Building2, RefreshCw, Activity, Settings, ExternalLink, Search } from 'lucide-react'
import { useOnlineStatus } from '@/db/hooks'

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
  { id: 'stripe', name: 'Stripe', icon: CreditCard, description: 'Accept card payments globally', category: 'Payments', color: 'text-indigo-600', bg: 'bg-indigo-50', docs: 'https://stripe.com/docs' },
  { id: 'flutterwave', name: 'Flutterwave', icon: CreditCard, description: 'African payment gateway', category: 'Payments', color: 'text-orange-600', bg: 'bg-orange-50', docs: 'https://flutterwave.com/docs' },
  { id: 'mobile_money', name: 'Mobile Money', icon: Smartphone, description: 'MTN, Airtel, MoMo payments', category: 'Payments', color: 'text-yellow-600', bg: 'bg-yellow-50', docs: '' },
  { id: 'qr_payments', name: 'QR Payments', icon: QrCode, description: 'Scan-to-pay QR codes', category: 'Payments', color: 'text-purple-600', bg: 'bg-purple-50', docs: '' },
  { id: 'pesapal', name: 'Pesapal', icon: Building2, description: 'East African payment aggregator', category: 'Payments', color: 'text-red-600', bg: 'bg-red-50', docs: 'https://developer.pesapal.com' },
  { id: 'mpesa', name: 'M-Pesa', icon: Smartphone, description: 'Safaricom M-Pesa integration', category: 'Payments', color: 'text-green-600', bg: 'bg-green-50', docs: 'https://developer.safaricom.co.ke' },
  { id: 'mailgun', name: 'Mailgun', icon: Globe, description: 'Email delivery service', category: 'Communication', color: 'text-blue-600', bg: 'bg-blue-50', docs: 'https://documentation.mailgun.com' },
  { id: 'twilio', name: 'Twilio', icon: Globe, description: 'SMS & WhatsApp API', category: 'Communication', color: 'text-red-600', bg: 'bg-red-50', docs: 'https://www.twilio.com/docs' },
  { id: 'africa_stalking', name: 'Africa\'s Talking', icon: Smartphone, description: 'African SMS & USSD gateway', category: 'Communication', color: 'text-emerald-600', bg: 'bg-emerald-50', docs: 'https://docs.africastalking.com' },
]

export default function IntegrationsPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [provider, setProvider] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')

  const fetchIntegrations = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/integrations')
        if (res.ok) setIntegrations(await res.json())
      }
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
        toast({ title: 'Integration added successfully' })
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
  const categories = [...new Set(PROVIDERS.map(p => p.category))]

  const filteredProviders = PROVIDERS.filter(p => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.description.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (activeTab !== 'all' && p.category !== activeTab) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations Hub</h1>
          <p className="text-muted-foreground">Connect payment providers, communication gateways, and third-party services</p>
        </div>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogTrigger asChild><Button disabled={availableProviders.length === 0}><Plus className="h-4 w-4 mr-2" /> Add Integration</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader><DialogTitle>Add New Integration</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Provider</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 max-h-[300px] overflow-y-auto">
                  {availableProviders.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setProvider(p.id); setDisplayName(p.name) }}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${provider === p.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                    >
                      <div className={`h-8 w-8 rounded-lg ${p.bg} flex items-center justify-center ${p.color}`}><p.icon className="h-4 w-4" /></div>
                      <div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.category}</p></div>
                    </button>
                  ))}
                </div>
              </div>
              <div><Label>Display Name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. My Stripe Account" /></div>
              <div><Label>API Key</Label><Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your API key" /></div>
              <div><Label>Secret Key</Label><Input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="Your secret key" /></div>
              <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                <Settings className="h-4 w-4" />
                <span>Credentials are encrypted and stored securely. You can test the connection after adding.</span>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleCreate}>Add Integration</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Plug className="h-4 w-4" /> Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{integrations.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Zap className="h-4 w-4" /> Active</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{activeCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4" /> Available</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{availableProviders.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Globe className="h-4 w-4" /> Categories</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{categories.length}</div></CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search providers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map(cat => <TabsTrigger key={cat} value={cat}>{cat}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredProviders.map((p) => {
          const config = integrations.find((i) => i.provider === p.id)
          return (
            <Card key={p.id} className={config?.isActive ? 'border-green-200' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg ${p.bg} flex items-center justify-center ${p.color}`}>
                      <p.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <Badge variant="outline" className="text-xs">{p.category}</Badge>
                      </div>
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
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={config.isActive ? 'default' : 'secondary'} className={config.isActive ? 'bg-green-600' : ''}>
                          {config.isActive ? 'Connected' : 'Disabled'}
                        </Badge>
                        {config.webhookUrl && <span className="text-xs text-muted-foreground font-mono">{config.webhookUrl}</span>}
                      </div>
                      {config.lastSyncAt && <span className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="h-3 w-3" /> {new Date(config.lastSyncAt).toLocaleDateString()}</span>}
                    </div>
                    {config.displayName && <p className="text-xs text-muted-foreground">Display name: {config.displayName}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleTest(config.id)}><Zap className="h-3 w-3 mr-1" /> Test Connection</Button>
                      {p.docs && <Button size="sm" variant="ghost" onClick={() => window.open(p.docs, '_blank')}><ExternalLink className="h-3 w-3 mr-1" /> Docs</Button>}
                      <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(config.id)}><X className="h-3 w-3 mr-1" /> Remove</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Not configured yet.</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setShowModal(true); setProvider(p.id); setDisplayName(p.name) }}><Plus className="h-3 w-3 mr-1" /> Configure</Button>
                      {p.docs && <Button size="sm" variant="ghost" onClick={() => window.open(p.docs, '_blank')}><ExternalLink className="h-3 w-3 mr-1" /> Docs</Button>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
        {filteredProviders.length === 0 && !loading && <div className="text-center py-12 text-muted-foreground col-span-2"><Plug className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No providers found</p></div>}
      </div>
    </div>
  )
}
