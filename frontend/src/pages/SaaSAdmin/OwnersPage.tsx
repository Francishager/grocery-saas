import { appNotify } from '@/lib/appFeedback'
import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'
import { Users, Search, Mail, Key, KeyRound, Copy, Loader2, RefreshCw, X } from 'lucide-react'

interface Owner {
  id: string; name: string; email: string; role: string; isActive: boolean; lastLogin: string | null; createdAt: string
  tenant?: { id: string; name: string; status: string } | null
}

export const OwnersPage: React.FC = () => {
  const [owners, setOwners] = useState<Owner[]>([])
  const { paginatedItems: paginatedOwners, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(owners, 10)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Owner | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [resetCodeTarget, setResetCodeTarget] = useState<Owner | null>(null)
  const [generatedReset, setGeneratedReset] = useState<{ owner: Owner; otp: string; expiresAt: string } | null>(null)

  const fetchOwners = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      const res = await apiFetch(`/api/admin/owners?${params}`, {})
      if (res.ok) { const d = await res.json(); setOwners(Array.isArray(d?.owners) ? d.owners : Array.isArray(d) ? d : []) }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchOwners() }, [])

  const handleResetPassword = async (id: string) => {
    setResetting(id)
    try {
      const res = await apiFetch(`/api/admin/owners/${id}/reset-password`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error([payload.error, payload.detail].filter(Boolean).join(' '))
      appNotify(payload.message || 'Password reset code sent to the owner.')
    } catch (error: any) { appNotify(error.message || 'Password reset email could not be sent.') }
    setResetting(null)
  }

  const handleGenerateResetCode = async () => {
    const owner = resetCodeTarget
    if (!owner) return
    setResetCodeTarget(null)
    setResetting(owner.id)
    try {
      const res = await apiFetch(`/api/admin/owners/${owner.id}/reset-password-code`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Could not generate the reset code.')
      setGeneratedReset({ owner, otp: payload.otp, expiresAt: payload.expiresAt })
    } catch (error: any) { appNotify(error.message || 'Could not generate the reset code.') }
    setResetting(null)
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'Never'

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
          <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
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
              {paginatedOwners.map(o => (
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
                      <button onClick={() => setResetCodeTarget(o)} disabled={resetting === o.id} className="p-1 text-amber-700 hover:bg-amber-50 rounded" title="Generate reset code if email was not received" aria-label={`Generate password reset code for ${o.name}`}>
                        {resetting === o.id ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                      </button>
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

      {resetCodeTarget && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-reset-code-title">
          <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-xl">
            <h2 id="confirm-reset-code-title" className="text-lg font-semibold">Generate a reset code?</h2>
            <p className="mt-2 text-sm text-gray-600">This creates a new code for {resetCodeTarget.name} and invalidates any earlier code. Verify the owner's identity through a trusted channel before sharing it.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setResetCodeTarget(null)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={() => void handleGenerateResetCode()} className="inline-flex items-center gap-2 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"><KeyRound size={16} />Generate code</button>
            </div>
          </div>
        </div>
      )}

      {generatedReset && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="generated-reset-title">
          <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="generated-reset-title" className="text-lg font-semibold">Password reset code</h2><p className="mt-1 text-sm text-gray-600">For {generatedReset.owner.name} · {generatedReset.owner.email}</p></div>
              <button type="button" onClick={() => setGeneratedReset(null)} aria-label="Close reset code" className="rounded p-1 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 rounded-md border bg-gray-50 px-4 py-3">
              <code className="text-2xl font-semibold tracking-[0.2em] text-gray-900">{generatedReset.otp}</code>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(generatedReset.otp).then(() => appNotify('Reset code copied.')).catch(() => appNotify('Could not access the clipboard; select and copy the code.')) }} className="inline-flex min-h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium hover:bg-gray-50"><Copy size={15} />Copy</button>
            </div>
            <p className="mt-3 text-xs text-gray-600">Expires {new Date(generatedReset.expiresAt).toLocaleString()}. Generating this code invalidated the previous code. Verify the owner’s identity before sharing it, and ask them to reset their password promptly.</p>
            <div className="mt-5 flex justify-end"><button type="button" onClick={() => setGeneratedReset(null)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Done</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OwnersPage
