import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { HRTable, HRColumn } from '@/components/hr/HRTable'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HRFormBuilder, HRFormField } from '@/components/hr/HRFormBuilder'

interface Position {
  id: string
  name: string
  code: string
  level: string
  minSalary: number
  maxSalary: number
  description?: string
  department?: string
  departmentId?: string
  isActive: boolean
}

interface Department {
  id: string
  name: string
}

const normalizeList = (payload: any) => (Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [])

export default function PositionManagementPage() {
  const { toast } = useToast()
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({
    name: '',
    code: '',
    level: 'mid',
    department: '',
    minSalary: '',
    maxSalary: '',
    description: '',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const columns: HRColumn[] = [
    {
      key: 'name',
      label: 'Position Title',
      sortable: true,
      width: '25%',
    },
    {
      key: 'code',
      label: 'Code',
      sortable: true,
      width: '15%',
    },
    {
      key: 'department',
      label: 'Department',
      width: '18%',
      render: (value) => value || '-',
    },
    {
      key: 'level',
      label: 'Level',
      width: '15%',
      render: (value) => (
        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded font-medium">
          {value || '-'}
        </span>
      ),
    },
    {
      key: 'minSalary',
      label: 'Min Salary',
      width: '15%',
      render: (value) => value ? `$${Number(value).toLocaleString()}` : '-',
    },
    {
      key: 'maxSalary',
      label: 'Max Salary',
      width: '15%',
      render: (value) => value ? `$${Number(value).toLocaleString()}` : '-',
    },
    {
      key: 'isActive',
      label: 'Status',
      width: '15%',
      render: (value) => (
        <span className={`px-2 py-1 rounded text-xs font-semibold ${value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
          {value ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ]

  const fetchPositions = async () => {
    try {
      setLoading(true)
      const [positionRes, departmentRes] = await Promise.all([
        apiFetch('/api/hr/positions?take=500'),
        apiFetch('/api/hr/departments?take=500'),
      ])
      if (positionRes.ok) {
        const data = await positionRes.json()
        setPositions(normalizeList(data))
      } else {
        toast({ variant: 'destructive', title: 'Failed to load positions' })
      }
      if (departmentRes.ok) {
        const data = await departmentRes.json()
        setDepartments(normalizeList(data))
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error loading positions' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPositions()
  }, [])

  const handleAdd = () => {
    setEditingId(null)
    setFormData({ name: '', code: '', level: 'mid', department: '', minSalary: '', maxSalary: '', description: '' })
    setFormError('')
    setOpenDialog(true)
  }

  const handleEdit = (id: string, row: Position) => {
    setEditingId(id)
    setFormData({
      name: row.name,
      code: row.code,
      level: row.level,
      department: row.department || '',
      minSalary: row.minSalary || '',
      maxSalary: row.maxSalary || '',
      description: row.description || '',
    })
    setFormError('')
    setOpenDialog(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this position?')) return

    try {
      const res = await apiFetch(`/api/hr/positions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Position deleted' })
        fetchPositions()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error || 'Failed to delete' })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error deleting position' })
    }
  }

  const handleSave = async () => {
    setFormLoading(true)
    setFormError('')

    try {
      const method = editingId ? 'PUT' : 'POST'
      const url = editingId ? `/api/hr/positions/${editingId}` : '/api/hr/positions'

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          ...formData,
          minSalary: formData.minSalary ? Number(formData.minSalary) : null,
          maxSalary: formData.maxSalary ? Number(formData.maxSalary) : null,
        }),
      })

      if (res.ok) {
        toast({ title: editingId ? 'Position updated' : 'Position created' })
        setOpenDialog(false)
        fetchPositions()
      } else {
        const data = await res.json()
        setFormError(data.error || 'Failed to save')
      }
    } catch (err) {
      setFormError('Error saving position')
    } finally {
      setFormLoading(false)
    }
  }

  const departmentOptions = departments.map((department) => ({
    label: department.name,
    value: department.name,
  }))

  const formFields: HRFormField[] = [
    {
      name: 'name',
      label: 'Position Title',
      type: 'text',
      required: true,
      placeholder: 'e.g., Software Engineer',
    },
    {
      name: 'code',
      label: 'Code',
      type: 'text',
      required: true,
      placeholder: 'e.g., SE-01',
    },
    {
      name: 'department',
      label: 'Department',
      type: 'select',
      options: departmentOptions,
      placeholder: departments.length ? 'Select Department' : 'Create a department first',
    },
    {
      name: 'level',
      label: 'Level',
      type: 'select',
      required: true,
      options: [
        { label: 'Entry', value: 'entry' },
        { label: 'Mid', value: 'mid' },
        { label: 'Senior', value: 'senior' },
        { label: 'Lead', value: 'lead' },
        { label: 'Manager', value: 'manager' },
        { label: 'Executive', value: 'executive' },
      ],
    },
    {
      name: 'minSalary',
      label: 'Minimum Salary',
      type: 'number',
      placeholder: '0',
    },
    {
      name: 'maxSalary',
      label: 'Maximum Salary',
      type: 'number',
      placeholder: '0',
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: 'Job description and responsibilities...',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Position Management</h1>
        <p className="text-muted-foreground">Manage job positions and salary ranges</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <HRTable
            columns={columns}
            data={positions}
            loading={loading}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            searchPlaceholder="Search positions..."
          />
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Position' : 'Create Position'}</DialogTitle>
            <DialogDescription>Manage a job position created for the selected department.</DialogDescription>
          </DialogHeader>
          <HRFormBuilder
            fields={formFields}
            values={formData}
            onChange={setFormData}
            onSubmit={handleSave}
            loading={formLoading}
            error={formError}
            submitLabel={editingId ? 'Update' : 'Create'}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
