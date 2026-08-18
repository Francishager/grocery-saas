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
  DialogDescription,
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
  departmentId?: string
  positionId?: string
  position?: string
  positionRole?: { name?: string }
  department?: string | { name?: string }
  department_text?: string
  branch?: { name?: string }
  unit?: { name?: string }
  team?: { name?: string }
  supervisor?: { firstName?: string; lastName?: string }
  gender?: string
  nationality?: string
  address?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  nextOfKinName?: string
  nextOfKinPhone?: string
  workLocation?: string
  costCentre?: string
  status: string
  employmentType?: string
  basicSalary?: number
  tenantId: string
  employeeDocuments?: Array<{ id: string; fileName: string; fileUrl?: string; documentType: string }>
}

interface Department {
  id: string
  name: string
}

interface Position {
  id: string
  name: string
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

const formatOptionalLabel = (value?: string) => (value ? formatStatus(value) : '-')

const normalizeList = (payload: any) => (Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [])

const employeeDepartmentName = (employee: any) =>
  employee?.employment?.department ||
  (typeof employee?.department === 'string' ? employee.department : employee?.department?.name) ||
  employee?.department_text ||
  ''

const employeePositionName = (employee: any) =>
  employee?.employment?.position ||
  employee?.positionRole?.name ||
  employee?.position ||
  employee?.jobTitle ||
  ''

const fullName = (employee: any) =>
  [employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(' ').trim()

const formatMoney = (value?: number | string) => {
  const amount = Number(value || 0)
  return amount ? `UGX ${amount.toLocaleString()}` : '-'
}

const formatDate = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString()
}

const initialFormData = () => ({
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  nationalId: '',
  dateOfBirth: '',
  hireDate: today(),
  positionId: '',
  departmentId: '',
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
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>(initialFormData())
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('')
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null)
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
      render: (_value, row) => employeePositionName(row) || '-',
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
      const [employeeRes, departmentRes, positionRes] = await Promise.all([
        apiFetch('/api/hr/employees?take=500'),
        apiFetch('/api/hr/departments?take=500'),
        apiFetch('/api/hr/positions?take=500'),
      ])

      if (employeeRes.ok) {
        const data = await employeeRes.json()
        setEmployees(normalizeList(data))
      } else {
        toast({ variant: 'destructive', title: 'Failed to load employees' })
      }

      if (departmentRes.ok) {
        const data = await departmentRes.json()
        setDepartments(normalizeList(data))
      }

      if (positionRes.ok) {
        const data = await positionRes.json()
        setPositions(normalizeList(data))
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
    const departmentName = employeeDepartmentName(row)
    const positionName = employeePositionName(row)

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
      positionId: row.positionId || '',
      departmentId: row.departmentId || '',
      position: positionName,
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
      const selectedDepartment = departments.find((department) => department.id === formData.departmentId)
      const selectedPosition = positions.find((position) => position.id === formData.positionId)
      const payload = {
        ...formData,
        departmentId: formData.departmentId || undefined,
        positionId: formData.positionId || undefined,
        department: selectedDepartment?.name || formData.department || undefined,
        position: selectedPosition?.name || formData.position || undefined,
        jobTitle: selectedPosition?.name || formData.position || undefined,
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

  const departmentOptions = departments.map((department) => ({
    label: department.name,
    value: department.id,
  }))

  const positionOptions = positions.map((position) => ({
    label: position.name,
    value: position.id,
  }))

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
      name: 'departmentId',
      label: 'Department',
      type: 'select',
      options: departmentOptions,
      placeholder: departments.length ? 'Select Department' : 'Create a department first',
    },
    {
      name: 'positionId',
      label: 'Position',
      type: 'select',
      options: positionOptions,
      placeholder: positions.length ? 'Select Position' : 'Create a position first',
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

  const renderEmployeeProfile = () => {
    if (!selectedEmployee) return null

    const personal = selectedEmployee.personal || selectedEmployee
    const employment = selectedEmployee.employment || {}
    const compensation = selectedEmployee.compensation || selectedEmployee
    const supervision = selectedEmployee.supervision || {}
    const documents = selectedEmployee.documents || selectedEmployee.employeeDocuments || []
    const displayName = fullName(personal) || fullName(selectedEmployee) || 'Employee'
    const photo = personal.profilePhoto || selectedEmployee.profilePhoto
    const department = employment.department || employeeDepartmentName(selectedEmployee)
    const position = employment.position || employeePositionName(selectedEmployee)
    const supervisor =
      supervision.supervisor ||
      (selectedEmployee.supervisor ? fullName(selectedEmployee.supervisor) : '')

    const items = [
      ['Staff No.', personal.employeeNumber || selectedEmployee.employeeNumber || '-'],
      ['Email', personal.email || selectedEmployee.email || '-'],
      ['Phone', personal.phone || selectedEmployee.phone || '-'],
      ['National ID', personal.nationalId || selectedEmployee.nationalId || selectedEmployee.idNumber || '-'],
      ['Date of Birth', formatDate(personal.dateOfBirth || selectedEmployee.dateOfBirth)],
      ['Gender', formatOptionalLabel(personal.gender || selectedEmployee.gender)],
      ['Nationality', personal.nationality || selectedEmployee.nationality || '-'],
      ['Address', personal.address || selectedEmployee.address || '-'],
      ['Emergency Contact', personal.emergencyContactName || selectedEmployee.emergencyContactName || '-'],
      ['Emergency Phone', personal.emergencyContactPhone || selectedEmployee.emergencyContactPhone || '-'],
      ['Next of Kin', personal.nextOfKinName || selectedEmployee.nextOfKinName || '-'],
      ['Next of Kin Phone', personal.nextOfKinPhone || selectedEmployee.nextOfKinPhone || '-'],
      ['Position', position || '-'],
      ['Department', department || '-'],
      ['Unit', employment.unit || selectedEmployee.unit?.name || '-'],
      ['Team', employment.team || selectedEmployee.team?.name || '-'],
      ['Branch', employment.branch || selectedEmployee.branch?.name || '-'],
      ['Supervisor', supervisor || '-'],
      ['Employment Type', formatOptionalLabel(employment.employmentType || selectedEmployee.employmentType)],
      ['Status', formatOptionalLabel(employment.status || selectedEmployee.status)],
      ['Hire Date', formatDate(employment.hireDate || selectedEmployee.hireDate)],
      ['Work Location', employment.workLocation || selectedEmployee.workLocation || '-'],
      ['Cost Centre', employment.costCentre || selectedEmployee.costCentre || '-'],
      ['Basic Salary', formatMoney(compensation.basicSalary || selectedEmployee.basicSalary)],
    ]

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
            {photo ? (
              <img
                src={photo}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-semibold text-muted-foreground">
                {[personal.firstName?.[0], personal.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'HR'}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{displayName}</h3>
            <p className="text-sm text-muted-foreground">{personal.employeeNumber || selectedEmployee.employeeNumber || 'No staff number'}</p>
            <Badge variant={(employment.status || selectedEmployee.status) === 'active' ? 'default' : 'secondary'}>
              {formatStatus(employment.status || selectedEmployee.status)}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {items.map(([label, value]) => (
            <div key={label}>
              <p className="text-muted-foreground">{label}</p>
              <p className="break-words font-medium">{value}</p>
            </div>
          ))}
        </div>

        {documents.length ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Documents</p>
            <div className="space-y-2">
              {documents.map((document: any) => (
                <a
                  key={document.id}
                  href={document.fileUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border p-3 text-sm hover:bg-muted"
                >
                  <span className="break-words font-medium">{document.fileName}</span>
                  <span className="ml-2 text-muted-foreground">({formatStatus(document.documentType)})</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

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
            <DialogDescription>Manage employee identity, contact, department, position, and payroll details.</DialogDescription>
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
            <p className="text-xs text-muted-foreground">Used as the employee passport photo across HR records.</p>
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
            <DialogDescription>Review employee personal, employment, compensation, and document details.</DialogDescription>
          </DialogHeader>
          {renderEmployeeProfile()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
