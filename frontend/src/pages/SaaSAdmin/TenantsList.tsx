import { apiFetch } from '../../lib/api'
import React, { useState, useEffect } from 'react'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/Pagination'
import { 
  Building, Search, Filter, MoreVertical, 
  Eye, Edit, Trash2, Ban, CheckCircle, 
  Loader2, RefreshCw, Plus
} from 'lucide-react'

export interface Tenant {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'trial' | 'expired'
  planId: string
  planName: string
  ownerId: string
  ownerName: string
  ownerEmail: string
  createdAt: string
  expiresAt?: string
  stats: {
    users: number
    branches: number
    products: number
    monthlySales: number
  }
}

export interface TenantsListProps {
  onViewTenant?: (tenant: Tenant) => void
  onEditTenant?: (tenant: Tenant) => void
  onSuspendTenant?: (tenant: Tenant) => void
}

class TenantService {
  private apiEndpoint = '/api/tenants'

  async getAll(filters?: { status?: string; search?: string; page?: number; limit?: number }): Promise<{ tenants: Tenant[]; total: number }> {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.limit) params.append('limit', String(filters.limit))
    const response = await apiFetch(`${this.apiEndpoint}?${params.toString()}`)
    if (!response.ok) throw new Error('Failed to fetch tenants')
    return response.json()
  }

  async suspend(id: string, reason?: string): Promise<Tenant> {
    const response = await apiFetch(`${this.apiEndpoint}/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) })
    if (!response.ok) throw new Error('Failed to suspend tenant')
    return response.json()
  }

  async activate(id: string): Promise<Tenant> {
    const response = await apiFetch(`${this.apiEndpoint}/${id}/activate`, { method: 'POST' })
    if (!response.ok) throw new Error('Failed to activate tenant')
    return response.json()
  }
}

const tenantService = new TenantService()

export const TenantsList: React.FC<TenantsListProps> = ({
  onViewTenant,
  onEditTenant,
  onSuspendTenant,
}) => {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const { paginatedItems: paginatedTenants, currentPage, totalPages, totalItems, goToPage, pageSize } = usePagination(tenants, 10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchTenants = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await tenantService.getAll({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search || undefined,
      })
      setTenants(result.tenants)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenants')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
  }, [statusFilter, search])

  const handleSuspend = async (tenant: Tenant) => {
    const action = tenant.status === 'suspended' ? 'activate' : 'suspend'
    const confirmMsg = action === 'suspend' 
      ? `Are you sure you want to suspend ${tenant.name}?`
      : `Are you sure you want to activate ${tenant.name}?`
    
    if (!confirm(confirmMsg)) return
    
    setActionLoading(tenant.id)
    try {
      if (action === 'suspend') {
        await tenantService.suspend(tenant.id)
      } else {
        await tenantService.activate(tenant.id)
      }
      fetchTenants()
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} tenant`)
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status: Tenant['status']) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      suspended: 'bg-red-100 text-red-800',
      trial: 'bg-blue-100 text-blue-800',
      expired: 'bg-gray-100 text-gray-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount)
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
          <h1 className="text-2xl font-bold text-gray-900">Business Tenants</h1>
          <p className="text-gray-500 mt-1">
            Manage all business tenants on the platform
          </p>
        </div>
        <button
          onClick={fetchTenants}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, owner, or email..."
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
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="trial">Trial</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-600">{error}</div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12">
            <Building className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No tenants found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Business</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Owner</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Plan</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Stats</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Created</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedTenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Building size={20} className="text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                        <div className="text-xs text-gray-500">{tenant.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{tenant.ownerName}</div>
                    <div className="text-xs text-gray-500">{tenant.ownerEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {tenant.planName}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(tenant.status)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-500 space-y-1">
                      <div>{tenant.stats.users} users</div>
                      <div>{tenant.stats.branches} branches</div>
                      <div>{tenant.stats.products} products</div>
                      <div className="font-medium text-gray-700">
                        {formatCurrency(tenant.stats.monthlySales)}/mo
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(tenant.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onViewTenant?.(tenant)}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleSuspend(tenant)}
                        disabled={actionLoading === tenant.id}
                        className={`p-1 rounded ${
                          tenant.status === 'suspended'
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-red-600 hover:bg-red-50'
                        }`}
                        title={tenant.status === 'suspended' ? 'Activate' : 'Suspend'}
                      >
                        {actionLoading === tenant.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : tenant.status === 'suspended' ? (
                          <CheckCircle size={16} />
                        ) : (
                          <Ban size={16} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

export default TenantsList
