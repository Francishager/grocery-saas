import { useEffect, useMemo, useState, useRef } from 'react'
import { Building2, Edit3, Loader2, Plus, RefreshCw, Trash2, X, MoreVertical, Ban } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

interface Branch {
  id: string
  name: string
  address?: string | null
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
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [dropdownId, setDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

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
      const res = await apiFetch('/api/branches')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to load branches')
      setBranches(Array.isArray(data?.branches) ? data.branches : Array.isArray(data) ? data : [])
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Branches unavailable',
        description: error instanceof Error ? error.message : 'Failed to load branches',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBranches()
  }, [])

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim()) return

    setSaving(true)
    try {
      const path = editingId ? `/api/branches/${editingId}` : '/api/branches'
      const res = await apiFetch(path, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || null,
          isActive: form.isActive,
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
    setEditingId(branch.id)
    setForm({
      name: branch.name,
      address: branch.address || '',
      isActive: branch.isActive,
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
    if (!confirm(`Delete ${branch.name}?`)) return

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

      <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4">
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

        <Button type="submit" className="mt-4" disabled={saving || !form.name.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {editingId ? 'Save Branch' : 'Create Branch'}
        </Button>
      </form>

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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Branch</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Address</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Staff</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {branches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-muted/30 group">
                    <td className="px-4 py-3">
                      <div className="font-medium">{branch.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(branch.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{branch.address || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{branch.userCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${branch.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
                        {branch.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative flex items-center justify-end" ref={dropdownId === branch.id ? dropdownRef : undefined}>
                        <button
                          onClick={() => setDropdownId(dropdownId === branch.id ? null : branch.id)}
                          className="p-1.5 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                        {dropdownId === branch.id && (
                          <div className="absolute right-0 bottom-0 z-50 w-40 rounded-md border bg-popover p-1 shadow-md">
                            <button onClick={() => { startEdit(branch); setDropdownId(null) }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted">
                              <Edit3 className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button onClick={() => { toggleStatus(branch); setDropdownId(null) }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted text-orange-600" disabled={actionLoading === branch.id}>
                              <Ban className="h-3.5 w-3.5" /> {branch.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => { deleteBranch(branch); setDropdownId(null) }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted text-destructive" disabled={actionLoading === branch.id}>
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
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
      </div>
    </div>
  )
}
