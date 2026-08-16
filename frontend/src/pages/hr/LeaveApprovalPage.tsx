import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { HRTable, HRColumn } from '@/components/hr/HRTable'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface LeaveRequest {
  id: string
  employeeId: string
  employeeName: string
  leaveTypeName: string
  startDate: string
  endDate: string
  reason: string
  status: string
  approverLevel: string
  approvalNotes?: string
}

export default function LeaveApprovalPage() {
  const { toast } = useToast()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [approvalNotes, setApprovalNotes] = useState('')

  const columns: HRColumn[] = [
    { key: 'employeeName', label: 'Employee', width: '18%', sortable: true },
    { key: 'leaveTypeName', label: 'Leave Type', width: '15%' },
    {
      key: 'startDate',
      label: 'From Date',
      width: '12%',
      render: (v) => new Date(v).toLocaleDateString(),
    },
    {
      key: 'endDate',
      label: 'To Date',
      width: '12%',
      render: (v) => new Date(v).toLocaleDateString(),
    },
    { key: 'reason', label: 'Reason', width: '18%', render: (v) => v || '-' },
    {
      key: 'status',
      label: 'Status',
      width: '15%',
      render: (v) => {
        const variants: Record<string, any> = {
          pending_l1: 'default',
          pending_l2: 'default',
          approved: 'default',
          rejected: 'destructive',
        }
        return <Badge variant={variants[v] || 'secondary'}>{v.replace('_', ' ')}</Badge>
      },
    },
  ]

  const fetchPendingRequests = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/hr/leave-requests/pending-approvals')
      if (res.ok) {
        const data = await res.json()
        setRequests(data.data || [])
      } else {
        toast({ title: 'Error', description: 'Failed to load requests', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleApproveL1 = async () => {
    if (!selectedRequest) return

    try {
      const res = await apiFetch(`/api/hr/leave-requests/${selectedRequest.id}/approve-l1`, {
        method: 'POST',
        body: JSON.stringify({ notes: approvalNotes }),
      })

      if (res.ok) {
        toast({ title: 'Success', description: 'Leave request approved (Manager level)' })
        setOpenDialog(false)
        setApprovalNotes('')
        fetchPendingRequests()
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleApproveL2 = async () => {
    if (!selectedRequest) return

    try {
      const res = await apiFetch(`/api/hr/leave-requests/${selectedRequest.id}/approve-l2`, {
        method: 'POST',
        body: JSON.stringify({ notes: approvalNotes }),
      })

      if (res.ok) {
        toast({ title: 'Success', description: 'Leave request approved (HR level)' })
        setOpenDialog(false)
        setApprovalNotes('')
        fetchPendingRequests()
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleReject = async () => {
    if (!selectedRequest) return
    if (!approvalNotes.trim()) {
      toast({ title: 'Error', description: 'Please provide a rejection reason', variant: 'destructive' })
      return
    }

    try {
      const res = await apiFetch(`/api/hr/leave-requests/${selectedRequest.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: approvalNotes }),
      })

      if (res.ok) {
        toast({ title: 'Success', description: 'Leave request rejected' })
        setOpenDialog(false)
        setApprovalNotes('')
        fetchPendingRequests()
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  useEffect(() => {
    fetchPendingRequests()
  }, [])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Pending Leave Approvals</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500">
              No pending leave requests to approve
            </div>
          )}

          {requests.length > 0 && (
            <HRTable
              columns={columns}
              data={requests}
              loading={loading}
              actions={[
                {
                  label: 'Review',
                  onClick: (row) => {
                    setSelectedRequest(row)
                    setApprovalNotes('')
                    setOpenDialog(true)
                  },
                  variant: 'default',
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      {/* Approval Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Leave Request</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              {/* Request Details */}
              <div className="bg-gray-50 p-4 rounded space-y-2">
                <div>
                  <div className="text-sm text-gray-600">Employee</div>
                  <div className="font-semibold">{selectedRequest.employeeName}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Leave Type</div>
                  <div className="font-semibold">{selectedRequest.leaveTypeName}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">From Date</div>
                    <div className="font-semibold">
                      {new Date(selectedRequest.startDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">To Date</div>
                    <div className="font-semibold">
                      {new Date(selectedRequest.endDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {selectedRequest.reason && (
                  <div>
                    <div className="text-sm text-gray-600">Reason</div>
                    <div>{selectedRequest.reason}</div>
                  </div>
                )}
              </div>

              {/* Approval Notes */}
              <div>
                <label className="text-sm font-medium">Approval Notes/Reason</label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Add comments or rejection reason"
                  rows={3}
                  className="w-full border rounded p-2 mt-1"
                />
              </div>

              {/* Status Info */}
              <div className="text-sm text-gray-600 p-2 bg-blue-50 rounded">
                Status: <Badge>{selectedRequest.status}</Badge>
                {selectedRequest.status === 'pending_l1' && (
                  <p className="mt-1">This is a manager-level approval</p>
                )}
                {selectedRequest.status === 'pending_l2' && (
                  <p className="mt-1">This is an HR-level approval</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setOpenDialog(false)}>
                  Close
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={!approvalNotes.trim()}
                >
                  Reject
                </Button>
                {selectedRequest.status === 'pending_l1' && (
                  <Button onClick={handleApproveL1}>
                    Approve (Manager)
                  </Button>
                )}
                {selectedRequest.status === 'pending_l2' && (
                  <Button onClick={handleApproveL2}>
                    Approve (HR)
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
