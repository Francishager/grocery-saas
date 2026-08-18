import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { HRTable, HRColumn } from '@/components/hr/HRTable'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { HRFormBuilder, HRFormField } from '@/components/hr/HRFormBuilder'

interface Department {
  id: string
  name: string
  code: string
  description?: string
  headId?: string
  isActive: boolean
  tenantId: string
  employees?: any[]
  createdAt: string
}

export default function DepartmentManagementPage() {
  const { toast } = useToast()
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({
    name: '',
    code: '',
    description: '',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const columns: HRColumn[] = [
    {
      key: 'name',
      label: 'Department Name',
      sortable: true,
      width: '30%',
    },
    {
      key: 'code',
      label: 'Code',
      sortable: true,
      width: '15%',
    },
    {
      key: 'description',
      label: 'Description',
      width: '35%',
      render: (value) => value || '-',
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

  const fetchDepartments = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/hr/departments')
      if (res.ok) {
        const data = await res.json()
        setDepartments(Array.isArray(data.data) ? data.data : data)
      } else {
        toast({ variant: 'destructive', title: 'Failed to load departments' })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error loading departments' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDepartments()
  }, [])

  const handleAdd = () => {
    setEditingId(null)
    setFormData({ name: '', code: '', description: '' })
    setFormError('')
    setOpenDialog(true)
  }

  const handleEdit = (id: string, row: Department) => {
    setEditingId(id)
    setFormData({
      name: row.name,
      code: row.code,
      description: row.description || '',
    })
    setFormError('')
    setOpenDialog(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this department?')) return

    try {
      const res = await apiFetch(`/api/hr/departments/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Department deleted' })
        fetchDepartments()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error || 'Failed to delete' })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error deleting department' })
    }
  }

  const handleSave = async () => {
    setFormLoading(true)
    setFormError('')

    try {
      const method = editingId ? 'PUT' : 'POST'
      const url = editingId ? `/api/hr/departments/${editingId}` : '/api/hr/departments'

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        toast({ title: editingId ? 'Department updated' : 'Department created' })
        setOpenDialog(false)
        fetchDepartments()
      } else {
        const data = await res.json()
        setFormError(data.error || 'Failed to save')
      }
    } catch (err) {
      setFormError('Error saving department')
    } finally {
      setFormLoading(false)
    }
  }

  const formFields: HRFormField[] = [
    {
      name: 'name',
      label: 'Department Name',
      type: 'text',
      required: true,
      placeholder: 'e.g., Sales, HR, Finance',
    },
    {
      name: 'code',
      label: 'Code',
      type: 'text',
      required: true,
      placeholder: 'e.g., SALES-01',
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: 'Department description...',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Department Management</h1>
        <p className="text-muted-foreground">Manage organizational departments</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
        </CardHeader>
        <CardContent>
          <HRTable
            columns={columns}
            data={departments}
            loading={loading}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            searchPlaceholder="Search departments..."
            title="All Departments"
          />
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Department' : 'Create Department'}
            </DialogTitle>
            <DialogDescription>Manage a department that can be selected across HR records.</DialogDescription>
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
