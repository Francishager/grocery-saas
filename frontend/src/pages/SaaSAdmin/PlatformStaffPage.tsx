import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

type Permission = { id: string; name: string }
type Staff = { id: string; email: string; fname?: string; lname?: string; phone?: string; role: string; isActive: boolean; createdAt: string }

export default function PlatformStaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)

  const load = async () => {
    const [staffResponse, schemaResponse] = await Promise.all([
      apiFetch('/api/admin/platform-staff'),
      apiFetch('/api/staff/permissions/schema'),
    ])
    if (staffResponse.ok) setStaff((await staffResponse.json()).staff || [])
    if (schemaResponse.ok) setPermissions((await schemaResponse.json()).permissions || [])
  }

  useEffect(() => { load().catch(() => {}) }, [])

  const createStaff = async () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      alert('Name, email, and a password of at least 6 characters are required')
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch('/api/admin/platform-staff', { method: 'POST', body: JSON.stringify({ ...form, permissions: selected }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to create platform staff')
      setForm({ name: '', email: '', password: '', phone: '' })
      setSelected({})
      await load()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create platform staff')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Staff</h1>
        <p className="text-sm text-gray-500">Create and manage staff for the SaaS Admin account.</p>
      </div>
      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold">Create Platform Staff</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(['name', 'email', 'password', 'phone'] as const).map((field) => (
            <input key={field} type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'} value={form[field]} onChange={event => setForm(prev => ({ ...prev, [field]: event.target.value }))} placeholder={field === 'phone' ? 'Phone (optional)' : field[0].toUpperCase() + field.slice(1)} className="rounded-lg border px-3 py-2 text-sm" />
          ))}
        </div>
        <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {permissions.map(permission => (
            <label key={permission.id} className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={!!selected[permission.id]} onChange={event => setSelected(prev => ({ ...prev, [permission.id]: event.target.checked }))} />
              <span>{permission.name}</span>
            </label>
          ))}
        </div>
        <button onClick={createStaff} disabled={loading} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Creating...' : 'Create Staff'}</button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[600px] text-sm"><thead className="border-b bg-gray-50"><tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Status</th></tr></thead><tbody className="divide-y">
          {staff.map(member => <tr key={member.id}><td className="px-4 py-3">{`${member.fname || ''} ${member.lname || ''}`.trim() || member.email}</td><td className="px-4 py-3">{member.email}</td><td className="px-4 py-3">{member.role}</td><td className="px-4 py-3">{member.isActive ? 'Active' : 'Inactive'}</td></tr>)}
          {!staff.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No platform staff found.</td></tr>}
        </tbody></table>
      </div>
    </div>
  )
}
