import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { Users, Search, Mail, Key, Loader2, RefreshCw, X } from 'lucide-react'

interface Owner {
  id: string; name: string; email: string; role: string; isActive: boolean; lastLogin: string | null; createdAt: string
  tenant?: { id: string; name: string; status: string } | null
}


  const t = localStorage.getItem('auth_tokens')
  if (t) { try { h['Authorization'] = `Bearer ${JSON.parse(t).accessToken}` } catch {} }
  return h
}

export const OwnersPage: React.FC = () => {
  const [owners, setOwners] = useState<Owner[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Owner | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)

  const fetchOwners = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      const res = await apiFetch(`/api/admin/owners?${params}`, {})
      if (res.ok) { const d = await res.json(); setOwners(d.owners || d) }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchOwners() }, [])

  const handleResetPassword = async (id: string) => {
    const newPass = prompt('Enter new password for this owner (min 6 chars):')
    if (!newPass || newPass.length < 6) { alert('Password must be at least 6 characters'); return }
    setResetting(id)
    try {
      const res = await apiFetch(`/api/admin/owners/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: newPass }) })
      if (res.ok) alert('Password reset successfully'); else alert('Failed to reset password')
    } catch { alert('Request failed') }
    setResetting(null)
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Never'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Business Owners</h1><p className="text-gray-500">View and manage all business owners</p></div>
        <button onClick={fetchOwners} className="px-3 py-2 border rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchOwners()} placeholder="Search by name or email..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : owners.length === 0 ? (
          <div className="text-center py-12"><Users className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No owners found</p></div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Owner</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Business</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Last Login</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Created</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {owners.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><Users size={18} className="text-purple-600" /></div>
                      <div><div className="text-sm font-medium">{o.name}</div><div className="text-xs text-gray-500">{o.email}</div></div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{o.tenant?.name || '-'}</div>
                    <span className={`text-xs px-2 py-0.5 rounded ${o.tenant?.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{o.tenant?.status || '-'}</span>
                  </td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${o.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{o.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(o.lastLogin)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setSelected(o)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="View"><Mail size={16} /></button>
                      <button onClick={() => handleResetPassword(o.id)} disabled={resetting === o.id} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Reset Password">
                        {resetting === o.id ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{selected.name}</h2><button onClick={() => setSelected(null)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button></div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{selected.email}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Role</span><span>{selected.role}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={selected.isActive ? 'text-green-600' : 'text-red-600'}>{selected.isActive ? 'Active' : 'Inactive'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Business</span><span>{selected.tenant?.name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Last Login</span><span>{fmtDate(selected.lastLogin)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{fmtDate(selected.createdAt)}</span></div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => handleResetPassword(selected.id)} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"><Key size={16} /> Reset Password</button>
              <button onClick={() => setSelected(null)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OwnersPage
