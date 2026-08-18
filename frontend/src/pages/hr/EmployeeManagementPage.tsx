import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { HRTable, HRColumn } from '@/components/hr/HRTable'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  profilePhoto?: string
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
  employeeDocuments?: Array<{ id: string; fileName: string; fileUrl?: string; documentType: string }>
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
  profilePhoto: '',
})

export default function EmployeeManagementPage() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>(initialFormData())
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('')
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const columns: HRColumn[] = [
    {
      key: 'profilePhoto',
      label: 'Photo',
      width: '8%',
      render: (value, row: Employee) => {
        const initials = [row.firstName?.[0], row.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'HR'
        return value ? (
          <button type="button" onClick={() => handleView(row.id, row)} className="block">
            <img
              src={value}
              alt={`${row.firstName} ${row.lastName}`}
              className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleView(row.id, row)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-1 ring-border"
          >
            {initials}
          </button>
        )
      },
    },
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
    setProfilePhotoFile(null)
    setProfilePhotoPreview('')
    setFormError('')
    setOpenDialog(true)
  }

  const handleEdit = (id: string, row: Employee) => {
    const departmentName = typeof row.department === 'string'
      ? row.department
      : row.department?.name || row.department_text || ''

    setEditingId(id)
    setFormData({
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
      profilePhoto: row.profilePhoto || '',
    })
    setProfilePhotoFile(null)
    setProfilePhotoPreview(row.profilePhoto || '')
    setFormError('')
    setOpenDialog(true)
  }

  const handleView = async (id: string, row: Employee) => {
    setSelectedEmployee(row)
    setViewDialogOpen(true)
    try {
      const res = await apiFetch(`/api/hr/employees/${id}/profile`)
      const data = await res.json()
      if (res.ok) {
        setSelectedEmployee(data.data || data)
      }
    } catch {
      toast({ variant: 'destructive', title: 'Could not load full employee profile' })
    }
  }

  const handleProfilePhotoChange = (file?: File | null) => {
    setProfilePhotoFile(file || null)
    if (file) {
      setProfilePhotoPreview(URL.createObjectURL(file))
    } else {
      setProfilePhotoPreview(formData.profilePhoto || '')
    }
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
      const body = profilePhotoFile
        ? (() => {
            const data = new FormData()
            Object.entries(payload).forEach(([key, value]) => {
              if (key === 'profilePhoto') return
              if (value !== undefined && value !== null) data.append(key, String(value))
            })
            data.append('profilePhoto', profilePhotoFile)
            return data
          })()
        : JSON.stringify(payload)

      const res = await apiFetch(url, {
        method,
        body,
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
            onView={handleView}
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
          <div className="space-y-2">
            <Label htmlFor="profilePhoto">Passport Photo</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                {profilePhotoPreview ? (
                  <img src={profilePhotoPreview} alt="Passport preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">Photo</span>
                )}
              </div>
              <Input
                id="profilePhoto"
                type="file"
                accept="image/*"
                onChange={(event) => handleProfilePhotoChange(event.target.files?.[0] || null)}
              />
            </div>
            <p className="text-xs text-muted-foreground">Saved to Cloudinary and stored as the employee profile photo URL.</p>
          </div>
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

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Employee Profile</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                  {selectedEmployee.profilePhoto ? (
                    <img
                      src={selectedEmployee.profilePhoto}
                      alt={`${selectedEmployee.firstName} ${selectedEmployee.lastName}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">
                      {[selectedEmployee.firstName?.[0], selectedEmployee.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'HR'}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold">
                    {[selectedEmployee.firstName, selectedEmployee.middleName, selectedEmployee.lastName].filter(Boolean).join(' ')}
                  </h3>
                  <p className="text-sm text-muted-foreground">{selectedEmployee.employeeNumber || 'No staff number'}</p>
                  <Badge variant={selectedEmployee.status === 'active' ? 'default' : 'secondary'}>{formatStatus(selectedEmployee.status)}</Badge>
                </div>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedEmployee.email || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedEmployee.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Position</p>
                  <p className="font-medium">{selectedEmployee.position || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Department</p>
                  <p className="font-medium">
                    {typeof selectedEmployee.department === 'string'
                      ? selectedEmployee.department
                      : selectedEmployee.department?.name || selectedEmployee.department_text || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Employment Type</p>
                  <p className="font-medium">{formatStatus(selectedEmployee.employmentType)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Hire Date</p>
                  <p className="font-medium">{selectedEmployee.hireDate ? new Date(selectedEmployee.hireDate).toLocaleDateString() : '-'}</p>
                </div>
              </div>

              {selectedEmployee.employeeDocuments?.length ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Documents</p>
                  <div className="space-y-2">
                    {selectedEmployee.employeeDocuments.map((document) => (
                      <a
                        key={document.id}
                        href={document.fileUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border p-3 text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{document.fileName}</span>
                        <span className="ml-2 text-muted-foreground">({document.documentType})</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
