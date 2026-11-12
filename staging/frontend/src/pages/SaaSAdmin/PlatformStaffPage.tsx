import { appNotify } from '@/lib/appFeedback'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api'

type Permission = { id: string; name: string; description: string; category: string }
type JobPreset = { id: string; name: string; permissions: string[] }
type Staff = { id: string; email: string; fname?: string; lname?: string; phone?: string; role: string; isActive: boolean; createdAt: string; platformPermissions?: string[] }

export default function PlatformStaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [presets, setPresets] = useState<JobPreset[]>([])
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [job, setJob] = useState('tenant_support')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const grouped = useMemo(() => permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    (groups[permission.category] ||= []).push(permission)
    return groups
  }, {}), [permissions])

  const load = async () => {
    const [staffResponse, schemaResponse] = await Promise.all([
      apiFetch('/api/admin/platform-staff'),
      apiFetch('/api/admin/platform-staff/permission-schema'),
    ])
    if (staffResponse.ok) setStaff((await staffResponse.json()).staff || [])
    if (schemaResponse.ok) {
      const schema = await schemaResponse.json()
      setPermissions(schema.permissions || [])
      setPresets(schema.jobPresets || [])
      if (!Object.keys(selected).length) setSelected(Object.fromEntries((schema.jobPresets?.[0]?.permissions || []).map((key: string) => [key, true])))
    }
  }
  useEffect(() => { load().catch(() => appNotify('Unable to load SaaS staff')) }, [])

  const applyJob = (jobId: string) => {
    setJob(jobId)
    const preset = presets.find(item => item.id === jobId)
    setSelected(Object.fromEntries((preset?.permissions || []).map(key => [key, true])))
  }
  const toggleCategory = (category: string, checked: boolean) => setSelected(previous => ({
    ...previous,
    ...Object.fromEntries((grouped[category] || []).map(permission => [permission.id, checked])),
  }))

  const saveStaffPermissions = async () => {
    if (!editingStaff) return
    const platformPermissions = permissions.filter(permission => selected[permission.id]).map(permission => permission.id)
    if (!platformPermissions.length) { appNotify('Assign at least one SaaS platform task.'); return }
    setLoading(true)
    try {
      const response = await apiFetch('/api/admin/platform-staff/' + editingStaff.id + '/permissions', { method: 'PUT', body: JSON.stringify({ platformPermissions }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to update platform staff access')
      setEditingStaff(null)
      await load()
      appNotify('SaaS staff access updated')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Unable to update platform staff access') }
    finally { setLoading(false) }
  }

  const createStaff = async () => {
    const assigned = permissions.filter(permission => selected[permission.id]).map(permission => permission.id)
    if (!form.name.trim() || !form.email.trim() || form.password.length < 10 || !assigned.length) {
      appNotify('Enter staff details, use a password of at least 10 characters, and assign at least one platform task.')
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch('/api/admin/platform-staff', { method: 'POST', body: JSON.stringify({ ...form, platformPermissions: assigned, job }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to create SaaS staff member')
      setForm({ name: '', email: '', password: '', phone: '' })
      applyJob('tenant_support')
      await load()
      appNotify('SaaS staff member created')
    } catch (error) {
      appNotify(error instanceof Error ? error.message : 'Failed to create SaaS staff member')
    } finally {
      setLoading(false)
    }
  }

  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold">JibuSales Admin Staff</h1><p className="mt-1 text-sm text-gray-600">Create platform staff accounts and assign the SaaS work they are responsible for.</p></header>
    <section className="rounded-lg border bg-white p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Add SaaS staff member</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Full name<input autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>
        <label className="text-sm">Work email<input type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>
        <label className="text-sm">Initial password<input type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /><span className="mt-1 block text-xs text-gray-500">At least 10 characters</span></label>
        <label className="text-sm">Phone (optional)<input type="tel" autoComplete="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>
      </div>
      <div className="mt-5 max-w-md"><label className="text-sm font-medium" htmlFor="platform-job">Platform assignment</label><select id="platform-job" value={job} onChange={event => applyJob(event.target.value)} className="mt-1 w-full rounded-md border bg-white px-3 py-2">{presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></div>
      <div className="mt-4 space-y-4">{Object.entries(grouped).map(([category, items]) => {
        const allChecked = items.length > 0 && items.every(item => selected[item.id])
        return <fieldset key={category} className="border-t pt-3"><div className="mb-2 flex items-center justify-between gap-3"><legend className="font-medium">{category}</legend><label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={allChecked} onChange={event => toggleCategory(category, event.target.checked)} />Select all</label></div><div className="grid gap-2 sm:grid-cols-2">{items.map(permission => <label key={permission.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50"><input className="mt-0.5" type="checkbox" checked={!!selected[permission.id]} onChange={event => setSelected(previous => ({ ...previous, [permission.id]: event.target.checked }))} /><span><span className="block text-sm font-medium">{permission.name}</span><span className="block text-xs text-gray-500">{permission.description}</span></span></label>)}</div></fieldset>
      })}</div>
      <button onClick={createStaff} disabled={loading} className="mt-5 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">{loading ? 'Creating account...' : 'Create SaaS staff account'}</button>
    </section>
    {editingStaff && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="edit-platform-access" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 id="edit-platform-access" className="text-lg font-semibold">Edit SaaS tasks</h2><p className="text-sm text-gray-600">{[editingStaff.fname, editingStaff.lname].filter(Boolean).join(' ') || editingStaff.email}</p></div><button type="button" aria-label="Close" onClick={() => setEditingStaff(null)} className="rounded p-2 hover:bg-gray-100">×</button></div><div className="mt-4 space-y-4">{Object.entries(grouped).map(([category, items]) => <fieldset key={category} className="border-t pt-3"><div className="mb-2 flex items-center justify-between"><legend className="font-medium">{category}</legend><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={items.length > 0 && items.every(item => selected[item.id])} onChange={event => toggleCategory(category, event.target.checked)} />Select all</label></div><div className="grid gap-2 sm:grid-cols-2">{items.map(permission => <label key={permission.id} className="flex items-start gap-2"><input type="checkbox" checked={!!selected[permission.id]} onChange={event => setSelected(previous => ({ ...previous, [permission.id]: event.target.checked }))} /><span><span className="block text-sm">{permission.name}</span><span className="text-xs text-gray-500">{permission.description}</span></span></label>)}</div></fieldset>)}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditingStaff(null)} className="rounded-md border px-3 py-2 text-sm">Close</button><button type="button" disabled={loading} onClick={saveStaffPermissions} className="rounded-md bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">Save access</button></div></section></div>}
    <section className="overflow-x-auto rounded-lg border bg-white"><table className="w-full min-w-[600px] text-sm"><thead className="border-b bg-gray-50"><tr><th className="px-4 py-3 text-left">Staff member</th><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-left">Platform role</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Tasks</th></tr></thead><tbody className="divide-y">{staff.map(member => <tr key={member.id}><td className="px-4 py-3">{[member.fname, member.lname].filter(Boolean).join(' ') || member.email}</td><td className="px-4 py-3">{member.email}</td><td className="px-4 py-3">SaaS Platform Staff</td><td className="px-4 py-3">{member.isActive ? 'Active' : 'Inactive'}</td><td className="px-4 py-3"><div className="mb-1 max-w-sm text-xs text-gray-600">{(member.platformPermissions || []).map(key => permissions.find(item => item.id === key)?.name || key).join(', ') || 'No tasks assigned'}</div><button type="button" className="text-blue-700 hover:underline" onClick={() => { setEditingStaff(member); setSelected(Object.fromEntries((member.platformPermissions || []).map(key => [key, true]))) }}>Edit access</button></td></tr>)}{!staff.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No platform staff found.</td></tr>}</tbody></table></section>
  </div>
}
