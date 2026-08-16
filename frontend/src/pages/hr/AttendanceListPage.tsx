import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { HRTable, HRColumn } from '@/components/hr/HRTable'
import { Badge } from '@/components/ui/badge'

interface AttendanceRecord {
  id: string
  employeeId: string
  employeeName: string
  date: string
  checkInTime?: string
  checkOutTime?: string
  lateMinutes: number
  overtimeMinutes: number
  method: string
  status: string
  isApproved: boolean
  approvedBy?: string
}

export default function AttendanceListPage() {
  const { toast } = useToast()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    employeeId: '',
    status: 'all',
    fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
  })

  const columns: HRColumn[] = [
    {
      key: 'employeeName',
      label: 'Employee',
      sortable: true,
      width: '18%',
    },
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      width: '15%',
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: 'checkInTime',
      label: 'Check-In',
      width: '12%',
      render: (value) => value ? new Date(value).toLocaleTimeString() : '-',
    },
    {
      key: 'checkOutTime',
      label: 'Check-Out',
      width: '12%',
      render: (value) => value ? new Date(value).toLocaleTimeString() : '-',
    },
    {
      key: 'lateMinutes',
      label: 'Late (min)',
      width: '10%',
      render: (value) => value > 0 ? `${value}m` : '-',
    },
    {
      key: 'overtimeMinutes',
      label: 'Overtime (min)',
      width: '12%',
      render: (value) => value > 0 ? `${value}m` : '-',
    },
    {
      key: 'status',
      label: 'Status',
      width: '12%',
      render: (value) => (
        <Badge variant={value === 'present' ? 'default' : value === 'absent' ? 'destructive' : 'secondary'}>
          {value}
        </Badge>
      ),
    },
    {
      key: 'isApproved',
      label: 'Approved',
      width: '8%',
      render: (value) => value ? '✓' : '✕',
    },
  ]

  const fetchRecords = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.employeeId) params.append('employeeId', filters.employeeId)
      if (filters.status !== 'all') params.append('status', filters.status)
      params.append('fromDate', filters.fromDate)
      params.append('toDate', filters.toDate)
      params.append('limit', '100')

      const res = await apiFetch(`/api/hr/attendance?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
      } else {
        toast({ title: 'Error', description: 'Failed to load attendance records', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (recordId: string) => {
    try {
      const res = await apiFetch(`/api/hr/attendance/${recordId}/approve`, {
        method: 'POST',
      })
      if (res.ok) {
        toast({ title: 'Success', description: 'Attendance approved' })
        fetchRecords()
      } else {
        toast({ title: 'Error', description: 'Failed to approve', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleDelete = async (recordId: string) => {
    if (!confirm('Delete this record?')) return
    try {
      const res = await apiFetch(`/api/hr/attendance/${recordId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast({ title: 'Success', description: 'Record deleted' })
        fetchRecords()
      } else {
        toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [filters])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">From Date</label>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">To Date</label>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full border rounded p-2"
              >
                <option value="all">All</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={fetchRecords} className="w-full">
                Filter
              </Button>
            </div>
          </div>

          <HRTable
            columns={columns}
            data={records}
            loading={loading}
            actions={[
              {
                label: 'Approve',
                onClick: (row) => handleApprove(row.id),
                visible: (row) => !row.isApproved,
                variant: 'default',
              },
              {
                label: 'Delete',
                onClick: (row) => handleDelete(row.id),
                variant: 'destructive',
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
