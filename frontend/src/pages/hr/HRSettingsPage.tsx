import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { AlertCircle, Shield, Settings as SettingsIcon } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface HRFeature {
  id: string
  featureName: string
  isEnabled: boolean
  config?: Record<string, any>
}

interface HRPermission {
  id: string
  code: string
  name: string
  description?: string
  granted: boolean
}

export default function HRSettingsPage() {
  const { toast } = useToast()
  const [features, setFeatures] = useState<HRFeature[]>([])
  const [permissions, setPermissions] = useState<HRPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const allFeatures = [
    { name: 'attendance_tracking', label: 'Attendance Tracking', description: 'Enable/disable attendance tracking' },
    { name: 'shift_management', label: 'Shift Management', description: 'Enable/disable shift management' },
    { name: 'payroll_processing', label: 'Payroll Processing', description: 'Enable/disable payroll processing' },
    { name: 'leave_management', label: 'Leave Management', description: 'Enable/disable leave requests and approvals' },
    { name: 'performance_management', label: 'Performance Management', description: 'Enable/disable performance reviews' },
    { name: 'training_management', label: 'Training Management', description: 'Enable/disable training programs' },
  ]

  const allPermissions = [
    { code: 'HR_PERMISSION_MANAGE', label: 'Manage Permissions', description: 'Grant/revoke HR permissions' },
    { code: 'HR_FEATURE_MANAGE', label: 'Manage Features', description: 'Enable/disable HR features' },
    { code: 'EMPLOYEE_CREATE', label: 'Create Employees', description: 'Create new employee records' },
    { code: 'EMPLOYEE_EDIT', label: 'Edit Employees', description: 'Edit employee information' },
    { code: 'EMPLOYEE_DELETE', label: 'Delete Employees', description: 'Delete employee records' },
    { code: 'SALARY_VIEW', label: 'View Salary', description: 'View salary information' },
    { code: 'SALARY_EDIT', label: 'Edit Salary', description: 'Modify salary records' },
    { code: 'CONTRACT_MANAGE', label: 'Manage Contracts', description: 'Create/edit contracts' },
    { code: 'DOCUMENT_MANAGE', label: 'Manage Documents', description: 'Upload/delete documents' },
  ]

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const [featureRes, permRes] = await Promise.all([
        apiFetch('/api/hr/settings/features'),
        apiFetch('/api/hr/settings/permissions/all'),
      ])

      if (featureRes.ok) {
        const data = await featureRes.json()
        setFeatures(Array.isArray(data.data) ? data.data : data.data || [])
      }

      if (permRes.ok) {
        const data = await permRes.json()
        setPermissions(Array.isArray(data.data) ? data.data : data.data || [])
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error loading settings' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleFeatureToggle = async (featureName: string, enabled: boolean) => {
    try {
      setSaving(true)
      const url = enabled
        ? `/api/hr/settings/features/${featureName}/enable`
        : `/api/hr/settings/features/${featureName}/disable`

      const res = await apiFetch(url, { method: 'POST' })

      if (res.ok) {
        toast({ title: `Feature ${enabled ? 'enabled' : 'disabled'}` })
        fetchSettings()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error || 'Failed to update' })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error updating feature' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading settings...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-8 w-8" />
          HR Settings
        </h1>
        <p className="text-muted-foreground">Configure HR module features and permissions</p>
      </div>

      <Tabs defaultValue="features" className="space-y-4">
        <TabsList>
          <TabsTrigger value="features" className="gap-2">
            <SettingsIcon className="h-4 w-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <Shield className="h-4 w-4" />
            Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="features" className="space-y-4">
          <div className="grid gap-4">
            {allFeatures.map((feature) => {
              const enabled = features.some((f) => f.featureName === feature.name && f.isEnabled)
              return (
                <Card key={feature.name}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{feature.label}</h3>
                        <p className="text-sm text-gray-600">{feature.description}</p>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) => handleFeatureToggle(feature.name, checked)}
                        disabled={saving}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-semibold">Permission Management</p>
              <p>Permissions control what actions users can perform in the HR module.</p>
            </div>
          </div>

          <div className="grid gap-3">
            {allPermissions.map((perm) => (
              <Card key={perm.code}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold">{perm.label}</h3>
                      <p className="text-sm text-gray-600">{perm.description}</p>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded mt-2 inline-block">
                        {perm.code}
                      </code>
                    </div>
                    <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded">
                      Role-based
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
            <p className="font-semibold mb-2">Permission Assignment:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Go to Staff Management → Select User → Assign HR Permissions</li>
              <li>Permissions are assigned per user within your tenant</li>
              <li>Users inherit default permissions based on their role</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
