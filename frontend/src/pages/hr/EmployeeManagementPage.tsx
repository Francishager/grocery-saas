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
  employeeNumber?: string
  firstName: string
  middleName?: string
  lastName: string
  email?: string
  phone?: string
  idNumber?: string
  nationalId?: string
  dateOfBirth?: string
  hireDate: string
  position?: string
  department?: string | { name?: string }
  department_text?: string
  status: string
  employmentType?: string
  basicSalary?: number
  tenantId: string
}

const today = () => new Date().toISOString().split('T')[0]

const toDateInput = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.split('T')[0] : date.toISOString().split('T')[0]
}

const formatStatus = (value?: string) =>
  (value || 'active')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const initialFormData = () => ({
  employeeNumber: '',
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  nationalId: '',
  dateOfBirth: '',
  hireDate: today(),
  position: '',
  department: '',
  employmentType: 'permanent',
  basicSalary: '',
  status: 'active',
})

export default function EmployeeManagementPage() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>(initialFormData())
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const columns: HRColumn[] = [
    {
      key: 'employeeNumber',
      label: 'Staff No.',
      sortable: true,
      width: '12%',
      render: (value) => value || '-',
    },
    {
      key: 'firstName',
      label: 'Full Name',
      sortable: true,
      width: '22%',
      render: (value, row) => [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' '),
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
      key: 'status',
      label: 'Status',
      width: '15%',
      render: (value) => (
        <Badge variant={value === 'active' ? 'default' : value === 'terminated' ? 'destructive' : 'secondary'}>
          {formatStatus(value)}
        </Badge>
      ),
    },
    {
      key: 'hireDate',
      label: 'Hire Date',
      width: '10%',
      render: (value) => value ? new Date(value).toLocaleDateString() : '-',
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
    setFormData(initialFormData())
    setFormError('')
    setOpenDialog(true)
  }

  const handleEdit = (id: string, row: Employee) => {
    const departmentName = typeof row.department === 'string'
      ? row.department
      : row.department?.name || row.department_text || ''

    setEditingId(id)
    setFormData({
      employeeNumber: row.employeeNumber || '',
      firstName: row.firstName,
      middleName: row.middleName || '',
      lastName: row.lastName,
      email: row.email || '',
      phone: row.phone || '',
      nationalId: row.nationalId || row.idNumber || '',
      dateOfBirth: toDateInput(row.dateOfBirth),
      hireDate: toDateInput(row.hireDate),
      position: row.position || '',
      department: departmentName,
      employmentType: row.employmentType || 'permanent',
      basicSalary: row.basicSalary || '',
      status: row.status || 'active',
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
      const payload = {
        ...formData,
        basicSalary: formData.basicSalary === '' ? undefined : Number(formData.basicSalary),
      }

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
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
      name: 'employeeNumber',
      label: 'Staff Number',
      type: 'text',
      placeholder: 'Auto-generated if left blank',
    },
    {
      name: 'firstName',
      label: 'First Name',
      type: 'text',
      required: true,
    },
    {
      name: 'middleName',
      label: 'Middle Name',
      type: 'text',
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
    },
    {
      name: 'phone',
      label: 'Phone',
      type: 'text',
    },
    {
      name: 'nationalId',
      label: 'National ID',
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
      name: 'employmentType',
      label: 'Employment Type',
      type: 'select',
      options: [
        { label: 'Permanent', value: 'permanent' },
        { label: 'Contract', value: 'contract' },
        { label: 'Temporary', value: 'temporary' },
        { label: 'Intern', value: 'intern' },
        { label: 'Casual', value: 'casual' },
      ],
    },
    {
      name: 'basicSalary',
      label: 'Basic Salary',
      type: 'number',
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'On Probation', value: 'on_probation' },
        { label: 'On Leave', value: 'on_leave' },
        { label: 'Suspended', value: 'suspended' },
        { label: 'Notice Period', value: 'notice_period' },
        { label: 'Resigned', value: 'resigned' },
        { label: 'Terminated', value: 'terminated' },
        { label: 'Retired', value: 'retired' },
        { label: 'Inactive', value: 'inactive' },
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
