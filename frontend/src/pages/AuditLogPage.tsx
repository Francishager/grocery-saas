import { useEffect, useState } from 'react'
import { ClipboardList, Filter, RefreshCw } from 'lucide-react'
import { auditApi, type AuditLogEntry, type AuditLogList } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  login: 'bg-purple-100 text-purple-800',
  checkout: 'bg-yellow-100 text-yellow-800',
  read: 'bg-gray-100 text-gray-800',
}

const MODEL_ICONS: Record<string, string> = {
  Product: '📦',
  Sale: '💰',
  Purchase: '🛒',
  User: '👤',
  Tenant: '🏢',
  Receipt: '🧾',
  Admin: '⚙️',
  Expense: '💸',
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterModel, setFilterModel] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const { toast } = useToast()

  const loadLogs = async (p = page) => {
    setLoading(true)
    try {
      const data = await auditApi.list({
        model: filterModel || undefined,
        action: filterAction || undefined,
        page: p,
        limit: 50,
      })
      const list = data as AuditLogList
      setLogs(Array.isArray(list?.logs) ? list.logs : [])
      setTotal(list?.total || 0)
      setPage(p)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load audit logs',
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs(1)
  }, [])

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          Track all changes — who did what and when
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-sm font-medium mb-1 block">Model</label>
              <select
                value={filterModel}
                onChange={(e) => setFilterModel(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">All Models</option>
                <option value="Product">Product</option>
                <option value="Sale">Sale</option>
                <option value="Purchase">Purchase</option>
                <option value="User">User</option>
                <option value="Tenant">Tenant</option>
                <option value="Receipt">Receipt</option>
                <option value="Expense">Expense</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Action</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">All Actions</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
                <option value="checkout">Checkout</option>
                <option value="login">Login</option>
              </select>
            </div>
            <Button onClick={() => loadLogs(1)} size="sm">
              Apply
            </Button>
            <Button variant="ghost" size="sm" onClick={loadLogs}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Activity Log
          </CardTitle>
          <CardDescription>{total} entries found</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No audit logs found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-sm">When</th>
                    <th className="pb-3 font-medium text-sm">Who</th>
                    <th className="pb-3 font-medium text-sm">Action</th>
                    <th className="pb-3 font-medium text-sm">Model</th>
                    <th className="pb-3 font-medium text-sm">Record</th>
                    <th className="pb-3 font-medium text-sm">Changes</th>
                    <th className="pb-3 font-medium text-sm">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 text-sm">{log.userEmail}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 text-sm">
                        {MODEL_ICONS[log.model] || '📄'} {log.model}
                      </td>
                      <td className="py-3 text-sm font-mono">
                        {log.recordId ? log.recordId.substring(0, 8) + '...' : '—'}
                      </td>
                      <td className="py-3 text-sm max-w-[200px] truncate">
                        {log.changes ? (
                          <details>
                            <summary className="cursor-pointer text-primary hover:underline">
                              View changes
                            </summary>
                            <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                              {JSON.stringify(log.changes, null, 2)}
                            </pre>
                          </details>
                        ) : '—'}
                      </td>
                      <td className="py-3 text-sm text-muted-foreground font-mono">
                        {log.ip || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} entries)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => loadLogs(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => loadLogs(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
