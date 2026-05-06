import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useFeatureAccess, Feature } from '@/services/featureAccessService'
import CreateCustomerModal from '@/components/modals/CreateCustomerModal'
import CreateSupplierModal from '@/components/modals/CreateSupplierModal'
import CreateExpenseModal from '@/components/modals/CreateExpenseModal'
import { 
  Users, 
  Building2, 
  CreditCard, 
  FileText, 
  TrendingUp,
  Wallet,
  Settings,
  Shield,
  Mail,
  MessageSquare
} from 'lucide-react'

interface Tenant {
  id: string
  name: string
  slug: string
  email: string
  phone?: string
  address?: string
  logo?: string
  status: 'active' | 'suspended' | 'cancelled' | 'trial'
  planId?: string
  plan?: {
    id: string
    name: string
    price: number
    currency: string
    billingCycle: string
  }
  usageLimit?: {
    maxProducts: number
    maxUsers: number
    maxBranches: number
    maxCustomers: number
    maxSuppliers: number
  }
  _count?: {
    users: number
    customers: number
    suppliers: number
  }
}

interface Plan {
  id: string
  name: string
  slug: string
  price: number
  currency: string
  billingCycle: string
  maxUsers: number
  maxProducts: number
  isDefault: boolean
  features: Array<{
    feature: Feature
    enabled: boolean
  }>
  _count?: {
    tenants: number
  }
}

export default function SaaSAdminDashboard() {
  const { features, isFeatureEnabled, canAccessFeature } = useFeatureAccess()
  const { toast } = useToast()
  
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  
  // Modal states for tenant features
  const [tenantFeatures, setTenantFeatures] = useState<Record<string, any>>({})
  const [showFeatureModal, setShowFeatureModal] = useState(false)
  const [selectedTenantForFeatures, setSelectedTenantForFeatures] = useState<string>('')

  useEffect(() => {
    loadTenants()
    loadPlans()
  }, [])

  const loadTenants = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const params = new URLSearchParams({
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter && { status: statusFilter })
      })
      
      const response = await fetch(`${API_URL}/api/platform/tenants?${params}`)
      if (response.ok) {
        const data = await response.json()
        setTenants(data.tenants)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load tenants',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const loadPlans = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/api/platform/plans`)
      if (response.ok) {
        const data = await response.json()
        setPlans(data)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load plans',
        variant: 'destructive'
      })
    }
  }

  const loadTenantFeatures = async (tenantId: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/api/platform/tenant/${tenantId}/features`)
      if (response.ok) {
        const data = await response.json()
        setTenantFeatures(data.features)
        setSelectedTenantForFeatures(tenantId)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load tenant features',
        variant: 'destructive'
      })
    }
  }

  const updateTenantStatus = async (tenantId: string, status: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/api/platform/tenants/${tenantId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({ status })
      })

      if (response.ok) {
        toast({
          title: 'Success',
          description: `Tenant ${status === 'suspended' ? 'suspended' : 'activated'} successfully`
        })
        loadTenants()
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update tenant status',
        variant: 'destructive'
      })
    }
  }

  const toggleTenantFeature = async (tenantId: string, featureName: string, enabled: boolean) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/api/platform/tenant/${tenantId}/features/${featureName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({ enabled })
      })

      if (response.ok) {
        toast({
          title: 'Success',
          description: `Feature ${featureName} ${enabled ? 'enabled' : 'disabled'} successfully`
        })
        loadTenantFeatures(tenantId)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update feature',
        variant: 'destructive'
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      active: 'default',
      suspended: 'destructive',
      cancelled: 'secondary',
      trial: 'outline'
    }
    return (
      <Badge variant={variants[status as keyof typeof variants]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const getFeatureIcon = (category: string) => {
    const icons = {
      core: <Settings className="h-4 w-4" />,
      advanced: <TrendingUp className="h-4 w-4" />,
      integration: <MessageSquare className="h-4 w-4" />
    }
    return icons[category as keyof typeof icons] || <Settings className="h-4 w-4" />
  }

  if (!canAccessFeature('platform')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access this feature.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SaaS Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage tenants, plans, and platform features</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowCustomerModal(true)} disabled={!isFeatureEnabled('customers')}>
            <Users className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
          <Button onClick={() => setShowSupplierModal(true)} disabled={!isFeatureEnabled('suppliers')}>
            <Building2 className="h-4 w-4 mr-2" />
            Add Supplier
          </Button>
          <Button onClick={() => setShowExpenseModal(true)} disabled={!isFeatureEnabled('expenses')}>
            <FileText className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
            <p className="text-xs text-muted-foreground">Active businesses</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tenants</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tenants.filter(t => t.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">Currently running</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tenants.reduce((sum, t) => sum + (t._count?.users || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">Across all tenants</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${tenants.reduce((sum, t) => sum + (t.plan?.price || 0), 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">From active plans</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenants Management */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant Management</CardTitle>
          <CardDescription>Manage all business tenants</CardDescription>
          <div className="flex items-center gap-2 mt-2">
            <Input
              placeholder="Search tenants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{tenant.name}</h3>
                    <p className="text-sm text-muted-foreground">{tenant.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusBadge(tenant.status)}
                      <span className="text-sm text-muted-foreground">
                        {tenant.plan?.name || 'No Plan'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadTenantFeatures(tenant.id)}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    Features
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTenant(tenant)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant={tenant.status === 'active' ? 'destructive' : 'default'}
                    size="sm"
                    onClick={() => updateTenantStatus(tenant.id, tenant.status === 'active' ? 'suspended' : 'active')}
                  >
                    {tenant.status === 'active' ? 'Suspend' : 'Activate'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Plans Management */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription Plans</CardTitle>
          <CardDescription>Manage pricing plans and feature assignments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {plans.map((plan) => (
              <div key={plan.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h3 className="font-semibold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    ${plan.price}/{plan.billingCycle} • {plan._count?.tenants || 0} tenants
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">
                      {plan.maxUsers} users
                    </Badge>
                    <Badge variant="outline">
                      {plan.maxProducts} products
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPlan(plan)}
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Feature Management Modal */}
      {showFeatureModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  Features for {tenants.find(t => t.id === selectedTenantForFeatures)?.name}
                </h2>
                <Button variant="outline" onClick={() => setShowFeatureModal(false)}>
                  Close
                </Button>
              </div>
              
              <div className="space-y-4">
                {Object.entries(tenantFeatures).map(([featureName, access]) => (
                  <div key={featureName} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      {getFeatureIcon(access.category)}
                      <div>
                        <p className="font-medium">
                          {featureName.replace(/_/g, ' ').replace(/\b\w/g, word => word.charAt(0).toUpperCase() + word.slice(1))}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {access.source === 'override' ? 'Manual override' : 
                           access.source === 'plan' ? 'From plan' : 'Default'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={access.enabled ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleTenantFeature(selectedTenantForFeatures, featureName, !access.enabled)}
                    >
                      {access.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateCustomerModal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSuccess={() => {
          setShowCustomerModal(false)
          toast({
            title: 'Success',
            description: 'Customer created successfully'
          })
        }}
      />

      <CreateSupplierModal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        onSuccess={() => {
          setShowSupplierModal(false)
          toast({
            title: 'Success',
            description: 'Supplier created successfully'
          })
        }}
      />

      <CreateExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onSuccess={() => {
          setShowExpenseModal(false)
          toast({
            title: 'Success',
            description: 'Expense recorded successfully'
          })
        }}
      />
    </div>
  )
}
