import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Building2, Loader2, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface HRFeatureCatalogItem {
  name: string
  label: string
  description: string
}

interface HRModuleFeature {
  id?: string
  tenantId?: string
  featureName: string
  isEnabled: boolean
  config?: Record<string, unknown>
  updatedAt?: string
}

interface TenantFeatureRow {
  id: string
  name: string
  slug?: string | null
  status?: string | null
  plan?: { id: string; name: string } | null
  hrModuleFeatures?: HRModuleFeature[]
}

export default function HRModuleSettingsPage() {
  const { toast } = useToast()
  const [tenants, setTenants] = useState<TenantFeatureRow[]>([])
  const [features, setFeatures] = useState<HRFeatureCatalogItem[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingFeature, setSavingFeature] = useState<string | null>(null)

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) || tenants[0],
    [selectedTenantId, tenants]
  )

  const featureState = useMemo(() => {
    return new Map((selectedTenant?.hrModuleFeatures || []).map((feature) => [feature.featureName, feature]))
  }, [selectedTenant])

  const loadTenants = async (query = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('search', query.trim())
      const response = await apiFetch(`/api/platform/hr-features/tenants${params.toString() ? `?${params}` : ''}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Failed to load HR module settings')

      const nextTenants = data.tenants || []
      setTenants(nextTenants)
      setFeatures(data.features || [])
      setSelectedTenantId((current) => {
        if (current && nextTenants.some((tenant: TenantFeatureRow) => tenant.id === current)) return current
        return nextTenants[0]?.id || ''
      })
    } catch (error) {
      toast({
        title: 'Could not load HR settings',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTenants()
  }, [])

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadTenants(search)
  }

  const updateFeature = async (featureName: string, isEnabled: boolean) => {
    if (!selectedTenant) return
    setSavingFeature(featureName)
    try {
      const response = await apiFetch(`/api/platform/hr-features/${selectedTenant.id}/${featureName}`, {
        method: 'PUT',
        body: JSON.stringify({ isEnabled }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Failed to update HR feature')

      const updatedFeature = data.feature as HRModuleFeature
      setTenants((currentTenants) =>
        currentTenants.map((tenant) => {
          if (tenant.id !== selectedTenant.id) return tenant
          const nextFeatures = [...(tenant.hrModuleFeatures || [])]
          const existingIndex = nextFeatures.findIndex((feature) => feature.featureName === updatedFeature.featureName)
          if (existingIndex >= 0) {
            nextFeatures[existingIndex] = { ...nextFeatures[existingIndex], ...updatedFeature }
          } else {
            nextFeatures.push(updatedFeature)
          }
          return { ...tenant, hrModuleFeatures: nextFeatures }
        })
      )
      toast({
        title: isEnabled ? 'HR feature enabled' : 'HR feature disabled',
        description: `${featureName.replace(/_/g, ' ')} was updated for ${selectedTenant.name}.`,
      })
    } catch (error) {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingFeature(null)
    }
  }

  const enabledCount = features.filter((feature) => featureState.get(feature.name)?.isEnabled).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">SaaS Admin</p>
          <h1 className="text-2xl font-semibold text-foreground">HR Module Settings</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Control HR feature availability for each business. User access remains inside the tenant Roles & Permissions page.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadTenants(search)} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" />
              Businesses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search business"
                className="h-10"
              />
              <Button type="submit" variant="outline" size="icon" disabled={loading} aria-label="Search businesses">
                <Search className="h-4 w-4" />
              </Button>
            </form>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading businesses
              </div>
            ) : tenants.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No businesses found.
              </div>
            ) : (
              <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {tenants.map((tenant) => (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => setSelectedTenantId(tenant.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedTenant?.id === tenant.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{tenant.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{tenant.slug || tenant.id}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {tenant.status || 'active'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{tenant.plan?.name || 'No plan assigned'}</p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Selected Business</p>
                  <p className="line-clamp-1 text-sm font-semibold">{selectedTenant?.name || 'None'}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Enabled HR Features</p>
                  <p className="text-sm font-semibold">{enabledCount} of {features.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Business Status</p>
                  <p className="text-sm font-semibold capitalize">{selectedTenant?.status || 'active'}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Feature Availability</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enable module features here, then assign user-level actions from the tenant Roles & Permissions page.
              </p>
            </CardHeader>
            <CardContent>
              {!selectedTenant ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Select a business to configure HR features.
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {features.map((feature) => {
                    const currentFeature = featureState.get(feature.name)
                    const checked = Boolean(currentFeature?.isEnabled)
                    const saving = savingFeature === feature.name
                    return (
                      <div key={feature.name} className="rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold">{feature.label}</h3>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                checked ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                              }`}>
                                {checked ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{feature.description}</p>
                            <p className="text-xs text-muted-foreground">{feature.name}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                            <Switch
                              checked={checked}
                              disabled={Boolean(savingFeature)}
                              onCheckedChange={(nextChecked) => void updateFeature(feature.name, nextChecked)}
                              aria-label={`Toggle ${feature.label}`}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
