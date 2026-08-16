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

interface ShiftTemplate {
  id: string
  name: string
  code: string
  startTime: string
  endTime: string
  breakDuration: number
  workingHours: number
  isActive: boolean
}

interface ShiftAssignment {
  id: string
  employeeId: string
  employeeName: string
  shiftTemplateId: string
  shiftName: string
  startDate: string
  endDate?: string
  rotationType: string
}

export default function ShiftManagementPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'templates' | 'assignments'>('templates')
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    startTime: '09:00',
    endTime: '17:00',
    breakDuration: 60,
  })

  const templateColumns: HRColumn[] = [
    { key: 'name', label: 'Shift Name', width: '20%' },
    { key: 'code', label: 'Code', width: '15%' },
    { key: 'startTime', label: 'Start Time', width: '15%' },
    { key: 'endTime', label: 'End Time', width: '15%' },
    { key: 'breakDuration', label: 'Break (min)', width: '12%', render: (v) => `${v}m` },
    {
      key: 'isActive',
      label: 'Status',
      width: '15%',
      render: (v) => <Badge variant={v ? 'default' : 'secondary'}>{v ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  const assignmentColumns: HRColumn[] = [
    { key: 'employeeName', label: 'Employee', width: '20%' },
    { key: 'shiftName', label: 'Shift', width: '18%' },
    {
      key: 'startDate',
      label: 'Start Date',
      width: '15%',
      render: (v) => new Date(v).toLocaleDateString(),
    },
    {
      key: 'endDate',
      label: 'End Date',
      width: '15%',
      render: (v) => v ? new Date(v).toLocaleDateString() : 'Ongoing',
    },
    { key: 'rotationType', label: 'Type', width: '15%' },
    {
      key: 'id',
      label: 'Status',
      width: '12%',
      render: () => <Badge variant="default">Active</Badge>,
    },
  ]

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/hr/shifts/templates')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.data || [])
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const fetchAssignments = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/hr/shifts/assignments')
      if (res.ok) {
        const data = await res.json()
        setAssignments(data.data || [])
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async () => {
    try {
      const url = editingId ? `/api/hr/shifts/templates/${editingId}` : '/api/hr/shifts/templates'
      const method = editingId ? 'PUT' : 'POST'

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        toast({ title: 'Success', description: editingId ? 'Template updated' : 'Template created' })
        setOpenDialog(false)
        setFormData({ name: '', code: '', startTime: '09:00', endTime: '17:00', breakDuration: 60 })
        setEditingId(null)
        fetchTemplates()
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this shift template?')) return
    try {
      const res = await apiFetch(`/api/hr/shifts/templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Success', description: 'Template deleted' })
        fetchTemplates()
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  useEffect(() => {
    if (tab === 'templates') {
      fetchTemplates()
    } else {
      fetchAssignments()
    }
  }, [tab])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Shift Management</CardTitle>
            {tab === 'templates' && (
              <Button
                onClick={() => {
                  setEditingId(null)
                  setFormData({ name: '', code: '', startTime: '09:00', endTime: '17:00', breakDuration: 60 })
                  setOpenDialog(true)
                }}
              >
                + New Shift Template
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b">
            <button
              onClick={() => setTab('templates')}
              className={`px-4 py-2 font-medium ${
                tab === 'templates' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'
              }`}
            >
              Shift Templates
            </button>
            <button
              onClick={() => setTab('assignments')}
              className={`px-4 py-2 font-medium ${
                tab === 'assignments' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'
              }`}
            >
              Assignments
            </button>
          </div>

          {/* Templates Tab */}
          {tab === 'templates' && (
            <HRTable
              columns={templateColumns}
              data={templates}
              loading={loading}
              actions={[
                {
                  label: 'Edit',
                  onClick: (row) => {
                    setEditingId(row.id)
                    setFormData({
                      name: row.name,
                      code: row.code,
                      startTime: row.startTime,
                      endTime: row.endTime,
                      breakDuration: row.breakDuration,
                    })
                    setOpenDialog(true)
                  },
                  variant: 'outline',
                },
                {
                  label: 'Delete',
                  onClick: (row) => handleDeleteTemplate(row.id),
                  variant: 'destructive',
                },
              ]}
            />
          )}

          {/* Assignments Tab */}
          {tab === 'assignments' && (
            <HRTable
              columns={assignmentColumns}
              data={assignments}
              loading={loading}
              actions={[
                {
                  label: 'View',
                  onClick: (row) => toast({ title: 'Info', description: 'Detailed view coming soon' }),
                  variant: 'outline',
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      {/* Template Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Shift Template' : 'New Shift Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Shift Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Morning Shift"
                className="w-full border rounded p-2 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Shift Code</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., MS"
                className="w-full border rounded p-2 mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Start Time</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="w-full border rounded p-2 mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Time</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="w-full border rounded p-2 mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Break Duration (minutes)</label>
              <input
                type="number"
                value={formData.breakDuration}
                onChange={(e) => setFormData({ ...formData, breakDuration: parseInt(e.target.value) })}
                min="0"
                max="120"
                className="w-full border rounded p-2 mt-1"
              />
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setOpenDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate}>
                {editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
