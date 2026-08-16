import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { HRTable, HRColumn } from '@/components/hr/HRTable'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HRFormBuilder, HRFormField } from '@/components/hr/HRFormBuilder'
import { Badge } from '@/components/ui/badge'

interface Employee {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  idNumber?: string
  dateOfBirth?: string
  hireDate: string
  position?: string
  department?: string
  employmentStatus: string
  isActive: boolean
  tenantId: string
}

export default function EmployeeManagementPage() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    idNumber: '',
    dateOfBirth: '',
    hireDate: new Date().toISOString().split('T')[0],
    position: '',
    department: '',
    employmentStatus: 'active',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const columns: HRColumn[] = [
    {
      key: 'firstName',
      label: 'Full Name',
      sortable: true,
      width: '25%',
      render: (value, row) => `${row.firstName} ${row.lastName}`,
    },
    {
      key: 'email',
      label: 'Email',
      width: '20%',
      render: (value) => value || '-',
    },
    {
      key: 'phone',
      label: 'Phone',
      width: '15%',
      render: (value) => value || '-',
    },
    {
      key: 'position',
      label: 'Position',
      width: '15%',
      render: (value) => value || '-',
    },
    {
      key: 'employmentStatus',
      label: 'Status',
      width: '15%',
      render: (value) => (
        <Badge variant={value === 'active' ? 'default' : value === 'terminated' ? 'destructive' : 'secondary'}>
          {value}
        </Badge>
      ),
    },
    {
      key: 'hireDate',
      label: 'Hire Date',
      width: '10%',
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ]

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/hr/employees')
      if (res.ok) {
        const data = await res.json()
        setEmployees(Array.isArray(data.data) ? data.data : data)
      } else {
        toast({ variant: 'destructive', title: 'Failed to load employees' })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error loading employees' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmployees()
  }, [])

  const handleAdd = () => {
    setEditingId(null)
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      idNumber: '',
      dateOfBirth: '',
      hireDate: new Date().toISOString().split('T')[0],
      position: '',
      department: '',
      employmentStatus: 'active',
    })
    setFormError('')
    setOpenDialog(true)
  }

  const handleEdit = (id: string, row: Employee) => {
    setEditingId(id)
    setFormData({
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email || '',
      phone: row.phone || '',
      idNumber: row.idNumber || '',
      dateOfBirth: row.dateOfBirth || '',
      hireDate: row.hireDate,
      position: row.position || '',
      department: row.department || '',
      employmentStatus: row.employmentStatus,
    })
    setFormError('')
    setOpenDialog(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee? This action cannot be undone.')) return

    try {
      const res = await apiFetch(`/api/hr/employees/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Employee deleted' })
        fetchEmployees()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error || 'Failed to delete' })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error deleting employee' })
    }
  }

  const handleSave = async () => {
    setFormLoading(true)
    setFormError('')

    try {
      const method = editingId ? 'PUT' : 'POST'
      const url = editingId ? `/api/hr/employees/${editingId}` : '/api/hr/employees'

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        toast({ title: editingId ? 'Employee updated' : 'Employee created' })
        setOpenDialog(false)
        fetchEmployees()
      } else {
        const data = await res.json()
        setFormError(data.error || 'Failed to save')
      }
    } catch (err) {
      setFormError('Error saving employee')
    } finally {
      setFormLoading(false)
    }
  }

  const formFields: HRFormField[] = [
    {
      name: 'firstName',
      label: 'First Name',
      type: 'text',
      required: true,
    },
    {
      name: 'lastName',
      label: 'Last Name',
      type: 'text',
      required: true,
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
    },
    {
      name: 'phone',
      label: 'Phone',
      type: 'text',
    },
    {
      name: 'idNumber',
      label: 'ID Number',
      type: 'text',
    },
    {
      name: 'dateOfBirth',
      label: 'Date of Birth',
      type: 'date',
    },
    {
      name: 'hireDate',
      label: 'Hire Date',
      type: 'date',
      required: true,
    },
    {
      name: 'position',
      label: 'Position',
      type: 'text',
    },
    {
      name: 'department',
      label: 'Department',
      type: 'text',
    },
    {
      name: 'employmentStatus',
      label: 'Employment Status',
      type: 'select',
      required: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'On Leave', value: 'on_leave' },
        { label: 'Terminated', value: 'terminated' },
        { label: 'Suspended', value: 'suspended' },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Employee Management</h1>
        <p className="text-muted-foreground">Manage employee profiles and information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employees</CardTitle>
        </CardHeader>
        <CardContent>
          <HRTable
            columns={columns}
            data={employees}
            loading={loading}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            searchPlaceholder="Search employees by name, email or phone..."
          />
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Employee' : 'Create Employee'}</DialogTitle>
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
