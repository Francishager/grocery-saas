import React, { useState, useEffect } from 'react'
import { 
  Mail, Clock, CheckCircle, XCircle, RefreshCw, 
  Search, Filter, Loader2
} from 'lucide-react'
import InviteService, { Invitation, InvitationStats } from '@/services/InviteService'

export const InvitationsList: React.FC = () => {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [stats, setStats] = useState<InvitationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchInvitations = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await InviteService.getAll({
        status: statusFilter !== 'all' ? statusFilter as any : undefined,
        search: search || undefined,
      })
      setInvitations(result.invitations)
      setStats(result.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invitations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvitations()
  }, [statusFilter, search])

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return
    setActionLoading(id)
    try {
      await InviteService.cancel(id)
      fetchInvitations()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel invitation')
    } finally {
      setActionLoading(null)
    }
  }

  const handleResend = async (id: string) => {
    setActionLoading(id)
    try {
      const result = await InviteService.resend(id)
      if (result.emailSent === false) {
        alert(`Invitation updated, but email delivery failed.${result.otpCode ? ` Share this OTP manually: ${result.otpCode}` : ''}`)
      } else {
        alert(result.message || 'Invitation resent successfully')
      }
      fetchInvitations()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resend invitation')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status: Invitation['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-green-100 text-green-800',
      expired: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
    }
    const icons = {
      pending: Clock,
      accepted: CheckCircle,
      expired: XCircle,
      cancelled: XCircle,
    }
    const Icon = icons[status]
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        <Icon size={12} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Owner Invitations</h1>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-500">Accepted</p>
            <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-500">Expired</p>
            <p className="text-2xl font-bold text-gray-600">{stats.expired}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-500">Cancelled</p>
            <p className="text-2xl font-bold text-red-600">{stats.cancelled}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button
          onClick={fetchInvitations}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-600">{error}</div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-12">
            <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No invitations found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Plan</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Invited</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Expires</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invitations.map((invitation) => (
                <tr key={invitation.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{invitation.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {invitation.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {invitation.planName || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(invitation.status)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(invitation.invitedAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(invitation.expiresAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {invitation.status === 'pending' && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleResend(invitation.id)}
                          disabled={actionLoading === invitation.id}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Resend"
                        >
                          {actionLoading === invitation.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <RefreshCw size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => handleCancel(invitation.id)}
                          disabled={actionLoading === invitation.id}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Cancel"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default InvitationsList
