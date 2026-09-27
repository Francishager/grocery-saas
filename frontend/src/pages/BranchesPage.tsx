import { appConfirm } from '@/lib/appFeedback'
import { useEffect, useMemo, useState, useRef } from 'react'
import { Building2, Edit3, Loader2, Plus, RefreshCw, Trash2, X, MoreVertical, Ban, AlertTriangle, MapPin } from 'lucide-react'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalBranches } from '@/db/hybrid'
import { queueMutation } from '@/db/sync'
import { db } from '@/db/index'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'

interface Branch {
  id: string
  name: string
  address?: string | null
  attendanceUseBusinessLocation?: boolean
  attendanceLatitude?: number | null
  attendanceLongitude?: number | null
  attendanceRadiusMeters?: number
  isActive: boolean
  status?: 'active' | 'inactive'
  userCount?: number
  createdAt: string
  updatedAt: string
}

const emptyForm = {
  name: '',
  address: '',
  isActive: true,
  attendanceUseBusinessLocation: true,
  attendanceLatitude: null as number | null,
  attendanceLongitude: null as number | null,
  attendanceRadiusMeters: 200,
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const { paginatedItems: paginatedBranches, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(branches, 10)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [capturingLocation, setCapturingLocation] = useState(false)
  const captureVersion = useRef(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [dropdownId, setDropdownId] = useState<string | null>(null)
  const [branchLimit, setBranchLimit] = useState<number | null>(null)
  const [branchUsagePct, setBranchUsagePct] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const { hasPermission } = useJWTAuth()
  const canCreate = hasPermission('canCreateBranch')
  const canEdit = hasPermission('canEditBranch')
  const canDelete = hasPermission('canDeleteBranch')
  const online = useOnlineStatus()

  useEffect(() => () => { captureVersion.current++ }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const stats = useMemo(() => {
    const active = branches.filter((branch) => branch.isActive).length
    return {
      total: branches.length,
      active,
      inactive: branches.length - active,
    }
  }, [branches])

  const loadBranches = async () => {
    setLoading(true)
    try {
      if (online) {
        const res = await apiFetch('/api/branches')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load branches')
        setBranches(Array.isArray(data?.branches) ? data.branches : Array.isArray(data) ? data : [])
        // Fetch usage limits
        const limitsRes = await apiFetch('/api/tenants/me/limits')
        if (limitsRes.ok) {
          const limitsData = await limitsRes.json().catch(() => ({}))
          if (limitsData.usage?.branches) {
            setBranchLimit(limitsData.usage.branches.limit)
            setBranchUsagePct(limitsData.usage.branches.percentage)
          } else if (limitsData.limits?.maxBranches) {
            setBranchLimit(limitsData.limits.maxBranches)
            const count = Array.isArray(data?.branches) ? data.branches.length : Array.isArray(data) ? data.length : 0
            setBranchUsagePct(Math.round((count / limitsData.limits.maxBranches) * 100))
          }
        }
      } else {
        const local = await getLocalBranches()
        setBranches(local)
      }
    } catch (error) {
      try {
        const local = await getLocalBranches()
        setBranches(local)
      } catch {
        toast({ variant: 'destructive', title: 'Branches unavailable', description: error instanceof Error ? error.message : 'Failed to load branches' })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBranches()
  }, [])

  const resetForm = () => {
    captureVersion.current++
    setCapturingLocation(false)
    setForm(emptyForm)
    setEditingId(null)
  }

  const captureBranchLocation = () => {
    if (!form.address.trim()) {
      toast({ variant: 'destructive', title: 'Set the branch address first' })
      return
    }
    if (!window.isSecureContext || !navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Device location is unavailable', description: 'Open the secure JibuSales site and enable device location.' })
      return
    }
    const version = ++captureVersion.current
    setCapturingLocation(true)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (version !== captureVersion.current) return
      setForm(current => ({ ...current, attendanceLatitude: coords.latitude, attendanceLongitude: coords.longitude }))
      setCapturingLocation(false)
      toast({ title: 'Branch location captured', description: 'Save the branch to activate its attendance location.' })
    }, (error) => {
      if (version !== captureVersion.current) return
      setCapturingLocation(false)
      toast({ variant: 'destructive', title: 'Unable to capture branch location', description: error.code === 1
        ? 'Allow Location in your browser site settings and device settings, then try again.'
        : 'Check device location settings and try again while at this branch.' })
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || capturingLocation || (editingId ? !canEdit : !canCreate)) return
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: 'Branch name is required' })
      return
    }

    if (!form.attendanceUseBusinessLocation && (!form.address.trim() || form.attendanceLatitude === null || form.attendanceLongitude === null)) {
      toast({ variant: 'destructive', title: 'Branch attendance location required', description: 'Set the branch address and capture its GPS location before saving.' })
      return
    }

    // Check branch limit before creating
    if (!editingId && branchLimit !== null && branches.length >= branchLimit) {
      toast({
        variant: 'destructive',
        title: 'Branch limit reached',
        description: `You have reached the maximum of ${branchLimit} branches. Contact JibuSales Admin to increase the limit.`,
      })
      return
    }

    setSaving(true)
    try {
      const path = editingId ? `/api/branches/${editingId}` : '/api/branches'
      const res = await apiFetch(path, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || null,
          isActive: form.isActive,
          attendanceUseBusinessLocation: form.attendanceUseBusinessLocation,
          attendanceLatitude: form.attendanceLatitude,
          attendanceLongitude: form.attendanceLongitude,
          attendanceRadiusMeters: form.attendanceRadiusMeters,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to save branch')

      toast({
        title: editingId ? 'Branch updated' : 'Branch created',
        description: `${data.branch?.name || form.name} is ready.`,
      })
      resetForm()
      await loadBranches()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save branch',
      })
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (branch: Branch) => {
    if (!canEdit) return
    captureVersion.current++
    setCapturingLocation(false)
    setEditingId(branch.id)
    setForm({
      name: branch.name,
      address: branch.address || '',
      isActive: branch.isActive,
      attendanceUseBusinessLocation: branch.attendanceUseBusinessLocation !== false,
      attendanceLatitude: branch.attendanceLatitude ?? null,
      attendanceLongitude: branch.attendanceLongitude ?? null,
      attendanceRadiusMeters: branch.attendanceRadiusMeters ?? 200,
    })
  }

  const toggleStatus = async (branch: Branch) => {
    setActionLoading(branch.id)
    try {
      const res = await apiFetch(`/api/branches/${branch.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !branch.isActive }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to update branch')
      await loadBranches()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Could not update branch',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const deleteBranch = async (branch: Branch) => {
    if (!(await appConfirm(`Delete ${branch.name}?`))) return

    setActionLoading(branch.id)
    try {
      const res = await apiFetch(`/api/branches/${branch.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to delete branch')
      toast({ title: 'Branch deleted', description: `${branch.name} was removed.` })
      if (editingId === branch.id) resetForm()
      await loadBranches()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Could not delete branch',
      })
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-sm text-muted-foreground">Create and manage business locations.</p>
        </div>
        <Button variant="outline" onClick={loadBranches} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="mt-1 text-2xl font-semibold text-green-700">{stats.active}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Inactive</p>
          <p className="mt-1 text-2xl font-semibold text-slate-600">{stats.inactive}</p>
        </div>
      </div>

      {branchLimit !== null && (
        <div className={`rounded-lg border p-4 ${branchUsagePct >= 100 ? 'border-red-200 bg-red-50' : branchUsagePct >= 80 ? 'border-yellow-200 bg-yellow-50' : 'border-blue-200 bg-blue-50'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {branchUsagePct >= 80 && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
              <span className="text-sm font-medium">
                Branch Usage: {stats.total} / {branchLimit}
              </span>
            </div>
            <span className={`text-sm font-semibold ${branchUsagePct >= 100 ? 'text-red-700' : branchUsagePct >= 80 ? 'text-yellow-700' : 'text-blue-700'}`}>
              {branchUsagePct}%
            </span>
          </div>
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${branchUsagePct >= 100 ? 'bg-red-500' : branchUsagePct >= 80 ? 'bg-yellow-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(branchUsagePct, 100)}%` }}
            />
          </div>
          {branchUsagePct >= 100 && (
            <p className="mt-2 text-xs text-red-700">Branch limit reached. Contact JibuSales Admin to increase the limit.</p>
          )}
          {branchUsagePct >= 80 && branchUsagePct < 100 && (
            <p className="mt-2 text-xs text-yellow-700">Approaching branch limit. You can create {branchLimit - stats.total} more branch(es).</p>
          )}
        </div>
      )}

      {(editingId ? canEdit : canCreate) && <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Building2 className="h-5 w-5" />
            {editingId ? 'Edit Branch' : 'Create Branch'}
          </h2>
          {editingId && (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="branch-name">Branch Name</Label>
            <Input
              id="branch-name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Main Branch"
              required
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-address">Address</Label>
            <Input
              id="branch-address"
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              placeholder="Street, market, or town"
              disabled={saving}
            />
          </div>
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <input
              id="branch-active"
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
              disabled={saving}
            />
            <Label htmlFor="branch-active" className="text-sm font-medium">Active</Label>
          </div>
        </div>

        <fieldset className="mt-5 space-y-4 border-t pt-4" disabled={saving || capturingLocation}>
          <legend className="px-1 text-sm font-semibold">Check-In/Out Location</legend>
          <div className="flex items-center gap-3">
            <input id="branch-attendance-inherit" type="checkbox" className="h-4 w-4 shrink-0"
              checked={form.attendanceUseBusinessLocation}
              onChange={event => setForm(current => ({ ...current, attendanceUseBusinessLocation: event.target.checked }))} />
            <Label htmlFor="branch-attendance-inherit">Use business profile attendance location</Label>
          </div>
          {!form.attendanceUseBusinessLocation && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Button type="button" variant="outline" onClick={captureBranchLocation} disabled={!online || capturingLocation}>
                {capturingLocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
                Capture Branch Location
              </Button>
              <div role="status" className="break-words text-sm text-muted-foreground">
                {capturingLocation ? 'Capturing branch location...' : form.attendanceLatitude !== null && form.attendanceLongitude !== null
                  ? `${form.attendanceLatitude.toFixed(6)}, ${form.attendanceLongitude.toFixed(6)}` : 'Branch GPS not configured'}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-attendance-radius">Allowed Radius (metres)</Label>
              <Input id="branch-attendance-radius" type="number" min="25" max="2000" step="1" required
                value={form.attendanceRadiusMeters}
                onChange={event => setForm(current => ({ ...current, attendanceRadiusMeters: Number(event.target.value) }))} />
            </div>
          </div>}
        </fieldset>

        <Button type="submit" className="mt-4" disabled={saving || capturingLocation || !form.name.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {editingId ? 'Save Branch' : 'Create Branch'}
        </Button>
      </form>}

      <div className="overflow-hidden rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : branches.length === 0 ? (
          <div className="py-12 text-center">
            <Building2 className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium">No branches yet</p>
            <p className="text-sm text-muted-foreground">Create the first branch for this business.</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full min-w-[720px]">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Branch</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Address</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Attendance Location</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Staff</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedBranches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-muted/30 group">
                    <td className="px-4 py-3">
                      <div className="font-medium">{branch.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(branch.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{branch.address || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {branch.attendanceUseBusinessLocation !== false ? 'Business profile' : branch.attendanceLatitude != null && branch.attendanceLongitude != null
                        ? `Branch GPS (${branch.attendanceRadiusMeters ?? 200}m)` : 'Not configured'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{branch.userCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${branch.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
                        {branch.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 overflow-visible">
                      <div className="relative flex items-center justify-end" ref={dropdownId === branch.id ? dropdownRef : undefined}>
                        {(canEdit || canDelete) && <button
                          aria-label={`Actions for ${branch.name}`}
                          onClick={() => setDropdownId(dropdownId === branch.id ? null : branch.id)}
                          className="p-1.5 rounded-md hover:bg-muted"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>}
                        {dropdownId === branch.id && (
                          <div className="absolute right-0 top-full mt-1 z-[100] w-40 rounded-md border bg-popover p-1 shadow-lg">
                            {canEdit && <button onClick={() => { startEdit(branch); setDropdownId(null) }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted">
                              <Edit3 className="h-3.5 w-3.5" /> Edit
                            </button>}
                            {canEdit && <button onClick={() => { toggleStatus(branch); setDropdownId(null) }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted text-orange-600" disabled={actionLoading === branch.id}>
                              <Ban className="h-3.5 w-3.5" /> {branch.isActive ? 'Deactivate' : 'Activate'}
                            </button>}
                            {canDelete && <button onClick={() => { deleteBranch(branch); setDropdownId(null) }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted text-destructive" disabled={actionLoading === branch.id}>
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={goToPage}
        />
      </div>
    </div>
  )
}
