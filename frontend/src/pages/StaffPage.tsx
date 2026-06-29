import { useEffect, useMemo, useState } from 'react'
import { Edit3, Loader2, RefreshCw, RotateCcw, ShieldCheck, UserPlus, UserX, CheckCircle, Copy, Eye, EyeOff, X } from 'lucide-react'
import { branchesApi, staffApi, type BranchOption, type StaffMember, type StaffPayload } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalStaff, getLocalBranches } from '@/db/hybrid'
import { UsageLimitBanner } from '@/components/UsageLimitBanner'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'

const staffRoles: Array<{ value: StaffPayload['role']; label: string }> = [
  { value: 'attendant', label: 'Attendant' },
  { value: 'manager', label: 'Manager' },
  { value: 'accountant', label: 'Accountant' },
]

const emptyForm = {
  name: '',
  email: '',
  password: '',
  phone: '',
  role: 'attendant' as StaffPayload['role'],
  branchId: '',
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const { paginatedItems: paginatedStaff, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(staff, 10)
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null)
  const [showCreatedPassword, setShowCreatedPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()
  const online = useOnlineStatus()

  const stats = useMemo(() => {
    const active = staff.filter((member) => member.isActive).length
    return {
      total: staff.length,
      active,
      inactive: staff.length - active,
    }
  }, [staff])

  const loadData = async () => {
    setLoading(true)
    try {
      if (online) {
        const [staffData, branchData] = await Promise.all([
          staffApi.list(),
          branchesApi.active(),
        ])
        setStaff(staffData)
        setBranches(branchData)
        setForm((prev) => ({ ...prev, branchId: prev.branchId || branchData[0]?.id || '' }))
      } else {
        const [localStaff, localBranches] = await Promise.all([
          getLocalStaff(),
          getLocalBranches(),
        ])
        setStaff(localStaff as any)
        setBranches(localBranches as any)
        setForm((prev) => ({ ...prev, branchId: prev.branchId || localBranches[0]?.id || '' }))
      }
    } catch (error) {
      try {
        const [localStaff, localBranches] = await Promise.all([
          getLocalStaff(),
          getLocalBranches(),
        ])
        setStaff(localStaff as any)
        setBranches(localBranches as any)
      } catch {
        toast({ variant: 'destructive', title: 'Staff unavailable', description: error instanceof Error ? error.message : 'Failed to load staff' })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setForm({
      ...emptyForm,
      branchId: branches[0]?.id || '',
    })
  }

  const startEdit = (member: StaffMember) => {
    setEditingId(member.id)
    setForm({
      name: member.name || [member.fname, member.lname].filter(Boolean).join(' '),
      email: member.email,
      password: '',
      phone: member.phone || '',
      role: member.role,
      branchId: member.branchId || member.branches?.[0]?.id || branches[0]?.id || '',
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.branchId) return
    if (!editingId && form.password.trim().length < 6) {
      toast({
        variant: 'destructive',
        title: 'Password required',
        description: 'Use at least 6 characters for new staff.',
      })
      return
    }

    setSaving(true)
    try {
      const payload: Partial<StaffPayload> = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        branchId: form.branchId,
      }
      if (form.password.trim()) payload.password = form.password.trim()

      if (editingId) {
        await staffApi.update(editingId, payload)
        toast({ title: 'Staff updated' })
      } else {
        const result = await staffApi.create(payload as StaffPayload)
        toast({ title: 'Staff created' })
        if (result?.password) {
          setCreatedCredentials({ email: form.email.trim().toLowerCase(), password: result.password })
          setShowCreatedPassword(false)
          setCopied(false)
        }
      }

      resetForm()
      await loadData()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save staff',
      })
    } finally {
      setSaving(false)
    }
  }

  const deactivateStaff = async (member: StaffMember) => {
    if (!confirm(`Deactivate ${member.name || member.email}?`)) return

    setActionLoading(member.id)
    try {
      await staffApi.deactivate(member.id)
      toast({ title: 'Staff deactivated' })
      await loadData()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Could not deactivate staff',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const reactivateStaff = async (member: StaffMember) => {
    setActionLoading(member.id)
    try {
      await staffApi.update(member.id, { isActive: true })
      toast({ title: 'Staff reactivated' })
      await loadData()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Could not reactivate staff',
      })
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          <p className="text-sm text-muted-foreground">Create staff accounts and assign their branch.</p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <UsageLimitBanner resource="users" label="Staff" currentCount={staff.length} />

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

      <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <UserPlus className="h-5 w-5" />
            {editingId ? 'Edit Staff' : 'Create Staff'}
          </h2>
          {editingId && (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="staff-name">Full Name</Label>
            <Input
              id="staff-name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={saving}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              disabled={saving || !!editingId}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-phone">Phone</Label>
            <Input
              id="staff-phone"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-role">Role</Label>
            <select
              id="staff-role"
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as StaffPayload['role'] }))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={saving}
            >
              {staffRoles.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-branch">Branch</Label>
            <select
              id="staff-branch"
              value={form.branchId}
              onChange={(event) => setForm((prev) => ({ ...prev, branchId: event.target.value }))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={saving || branches.length === 0}
              required
            >
              {branches.length === 0 ? (
                <option value="">No active branches</option>
              ) : (
                branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))
              )}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-password">{editingId ? 'New Password' : 'Password'}</Label>
            <Input
              id="staff-password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              disabled={saving}
              required={!editingId}
              minLength={editingId ? undefined : 6}
            />
          </div>
        </div>

        <Button type="submit" className="mt-4" disabled={saving || branches.length === 0}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          {editingId ? 'Save Staff' : 'Create Staff'}
        </Button>
      </form>

      <div className="overflow-hidden rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : staff.length === 0 ? (
          <div className="py-12 text-center">
            <UserPlus className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium">No staff yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Branch</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedStaff.map((member) => (
                  <tr key={member.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{member.name || member.email}</div>
                      <div className="text-xs text-muted-foreground">{member.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm capitalize">{member.role}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {member.branch?.name || member.branches?.[0]?.name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${member.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => startEdit(member)}>
                          <Edit3 className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        {member.isActive ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => deactivateStaff(member)}
                            disabled={actionLoading === member.id}
                          >
                            {actionLoading === member.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserX className="mr-2 h-4 w-4" />}
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => reactivateStaff(member)}
                            disabled={actionLoading === member.id}
                          >
                            {actionLoading === member.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            Reactivate
                          </Button>
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

      {createdCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCreatedCredentials(null)}>
          <div className="max-w-md w-full rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <h2 className="text-lg font-semibold">Staff Created Successfully</h2>
              </div>
              <button onClick={() => setCreatedCredentials(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Save these credentials and share them with the staff member securely.</p>
            <div className="space-y-3 rounded-md border bg-slate-50 p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Email</p>
                <p className="text-sm font-semibold text-slate-900 break-all">{createdCredentials.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Password</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900 break-all font-mono">{showCreatedPassword ? createdCredentials.password : '••••••••••••'}</p>
                  <button type="button" onClick={() => setShowCreatedPassword((p) => !p)} className="text-gray-400 hover:text-gray-600">
                    {showCreatedPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                {copied ? 'Copied!' : 'Copy Credentials'}
              </Button>
              <Button className="flex-1" onClick={() => setCreatedCredentials(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
