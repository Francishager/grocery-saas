import React, { useState, useEffect, useRef } from 'react'
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
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

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
  taxId?: string
  socialSecurityNumber?: string
  dateOfBirth?: string
  hireDate: string
  branchId?: string
  unitId?: string
  teamId?: string
  supervisorId?: string
  departmentId?: string
  positionId?: string
  position?: string
  positionRole?: { name?: string }
  department?: string | { name?: string }
  department_text?: string
  branch?: { id?: string; name?: string }
  unit?: { id?: string; name?: string }
  team?: { id?: string; name?: string; unitId?: string }
  supervisor?: { id?: string; firstName?: string; lastName?: string; employeeNumber?: string }
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
  salaryAdvanceBalance?: number
  salaryPayableBalance?: number
  openingSalaryAdvanceBalance?: number
  openingSalaryPayableBalance?: number
  openingHrBalanceDate?: string
  openingHrBalanceNote?: string
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

interface Branch {
  id: string
  name: string
}

interface Unit {
  id: string
  name: string
  departmentId?: string
}

interface Team {
  id: string
  name: string
  unitId?: string
  departmentId?: string
}

const NONE_VALUE = '__none__'
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

const normalizeList = (payload: any) => (
  Array.isArray(payload?.data) ? payload.data :
  Array.isArray(payload?.branches) ? payload.branches :
  Array.isArray(payload?.units) ? payload.units :
  Array.isArray(payload?.teams) ? payload.teams :
  Array.isArray(payload) ? payload :
  []
)

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
  return amount ? formatCurrency(amount) : '-'
}

const formatDate = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString()
}

const normalizeNin = (value?: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, '')
const validateUgandanNin = (value?: string) => {
  const normalized = normalizeNin(value)
  if (!normalized) return null
  return /^[A-Z0-9]{14}$/.test(normalized) ? null : 'Ugandan NIN must be exactly 14 letters and digits'
}
const normalizeDigits = (value?: string) => String(value || '').replace(/\D/g, '')
const validateTenDigitNumber = (label: string) => (value?: string) => {
  const normalized = normalizeDigits(value)
  if (!normalized) return null
  return /^\d{10}$/.test(normalized) ? null : `${label} must be exactly 10 digits`
}
const validateNonNegativeAmount = (label: string) => (value?: string) => {
  if (value === undefined || value === null || value === '') return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return `${label} must be a valid amount`
  return amount >= 0 ? null : `${label} cannot be negative`
}

const initialFormData = () => ({
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  nationalId: '',
  taxId: '',
  socialSecurityNumber: '',
  gender: '',
  nationality: '',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  nextOfKinName: '',
  nextOfKinPhone: '',
  dateOfBirth: '',
  hireDate: today(),
  branchId: '',
  unitId: '',
  teamId: '',
  supervisorId: '',
  positionId: '',
  departmentId: '',
  position: '',
  department: '',
  employmentType: 'permanent',
  basicSalary: '',
  openingSalaryAdvanceBalance: '',
  openingSalaryPayableBalance: '',
  openingHrBalanceDate: '',
  openingHrBalanceNote: '',
  status: 'active',
  profilePhoto: '',
})

export default function EmployeeManagementPage() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [teams, setTeams] = useState<Team[]>([])
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
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null)
  const profilePhotoCameraInputRef = useRef<HTMLInputElement | null>(null)

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
    { key: 'firstName', label: 'First Name', sortable: true, width: '14%', render: (value) => value || '-' },
    { key: 'middleName', label: 'Middle Name', width: '14%', render: (value) => value || '-' },
    { key: 'lastName', label: 'Last Name', sortable: true, width: '14%', render: (value) => value || '-' },
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
      key: 'nationalId',
      label: 'NIN / National ID',
      width: '16%',
      render: (value, row) => value || row.idNumber || '-',
      searchValue: (row) => row.nationalId || row.idNumber || '',
    },
    {
      key: 'taxId',
      label: 'PAYE TIN',
      width: '14%',
      render: (value) => value || '-',
    },
    {
      key: 'socialSecurityNumber',
      label: 'Social Security No.',
      width: '16%',
      render: (value) => value || '-',
    },
    {
      key: 'gender',
      label: 'Gender',
      width: '12%',
      render: (value) => formatOptionalLabel(value),
    },
    {
      key: 'nationality',
      label: 'Nationality',
      width: '14%',
      render: (value) => value || '-',
    },
    {
      key: 'address',
      label: 'Address',
      width: '20%',
      render: (value) => value || '-',
    },
    {
      key: 'emergencyContactName',
      label: 'Emergency Contact',
      width: '16%',
      render: (value) => value || '-',
    },
    {
      key: 'emergencyContactPhone',
      label: 'Emergency Phone',
      width: '16%',
      render: (value) => value || '-',
    },
    {
      key: 'nextOfKinName',
      label: 'Next of Kin',
      width: '16%',
      render: (value) => value || '-',
    },
    {
      key: 'nextOfKinPhone',
      label: 'Next of Kin Phone',
      width: '16%',
      render: (value) => value || '-',
    },
    {
      key: 'position',
      label: 'Position',
      width: '15%',
      render: (_value, row) => employeePositionName(row) || '-',
      searchValue: (row) => employeePositionName(row),
    },
    {
      key: 'departmentId',
      label: 'Department',
      width: '15%',
      render: (_value, row) => employeeDepartmentName(row) || '-',
      searchValue: (row) => employeeDepartmentName(row),
    },
    {
      key: 'branchId',
      label: 'Branch',
      width: '15%',
      render: (_value, row) => row.branch?.name || '-',
      searchValue: (row) => row.branch?.name || '',
    },
    {
      key: 'unitId',
      label: 'Unit',
      width: '15%',
      render: (_value, row) => row.unit?.name || '-',
      searchValue: (row) => row.unit?.name || '',
    },
    {
      key: 'teamId',
      label: 'Team',
      width: '15%',
      render: (_value, row) => row.team?.name || '-',
      searchValue: (row) => row.team?.name || '',
    },
    {
      key: 'supervisorId',
      label: 'Supervisor',
      width: '18%',
      render: (_value, row) => row.supervisor ? fullName(row.supervisor) : '-',
      searchValue: (row) => row.supervisor ? fullName(row.supervisor) : '',
    },
    {
      key: 'employmentType',
      label: 'Employment Type',
      width: '14%',
      render: (value) => formatOptionalLabel(value),
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
      key: 'dateOfBirth',
      label: 'Date of Birth',
      width: '12%',
      render: (value) => formatDate(value),
    },
    {
      key: 'hireDate',
      label: 'Hire Date',
      width: '10%',
      render: (value) => formatDate(value),
    },
    {
      key: 'basicSalary',
      label: 'Basic Salary',
      width: '14%',
      render: (value) => formatMoney(value),
    },
    {
      key: 'salaryAdvanceBalance',
      label: 'Advance / Loan',
      width: '14%',
      render: (value) => formatMoney(value),
    },
    {
      key: 'salaryPayableBalance',
      label: 'Salary Owed',
      width: '14%',
      render: (value) => formatMoney(value),
    },
    {
      key: 'workLocation',
      label: 'Work Location',
      width: '16%',
      render: (value) => value || '-',
    },
    {
      key: 'costCentre',
      label: 'Cost Centre',
      width: '14%',
      render: (value) => value || '-',
    },
    {
      key: 'employeeDocuments',
      label: 'Documents',
      width: '12%',
      render: (value) => Array.isArray(value) ? value.length : 0,
    },
  ]

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      let employeeList: Employee[] = []
      const [employeeRes, departmentRes, positionRes, branchRes, unitRes, teamRes] = await Promise.all([
        apiFetch('/api/hr/employees?take=500'),
        apiFetch('/api/hr/departments?take=500'),
        apiFetch('/api/hr/positions?take=500'),
        apiFetch('/api/branches?status=active'),
        apiFetch('/api/hr/units?take=500'),
        apiFetch('/api/hr/teams?take=500'),
      ])

      if (employeeRes.ok) {
        const data = await employeeRes.json()
        employeeList = normalizeList(data)
        setEmployees(employeeList)
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

      if (branchRes.ok) {
        const data = await branchRes.json()
        setBranches(normalizeList(data))
      } else {
        const branchMap = new Map<string, Branch>()
        employeeList.forEach((employee) => {
          if (employee.branch?.id && employee.branch?.name) {
            branchMap.set(employee.branch.id, { id: employee.branch.id, name: employee.branch.name })
          }
        })
        setBranches([...branchMap.values()])
      }

      if (unitRes.ok) {
        const data = await unitRes.json()
        setUnits(normalizeList(data))
      }

      if (teamRes.ok) {
        const data = await teamRes.json()
        setTeams(normalizeList(data))
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
      taxId: row.taxId || '',
      socialSecurityNumber: row.socialSecurityNumber || '',
      gender: row.gender || '',
      nationality: row.nationality || '',
      address: row.address || '',
      emergencyContactName: row.emergencyContactName || '',
      emergencyContactPhone: row.emergencyContactPhone || '',
      nextOfKinName: row.nextOfKinName || '',
      nextOfKinPhone: row.nextOfKinPhone || '',
      dateOfBirth: toDateInput(row.dateOfBirth),
      hireDate: toDateInput(row.hireDate),
      branchId: row.branchId || row.branch?.id || '',
      unitId: row.unitId || row.unit?.id || '',
      teamId: row.teamId || row.team?.id || '',
      supervisorId: row.supervisorId || row.supervisor?.id || '',
      positionId: row.positionId || '',
      departmentId: row.departmentId || '',
      position: positionName,
      department: departmentName,
      employmentType: row.employmentType || 'permanent',
      basicSalary: row.basicSalary || '',
      openingSalaryAdvanceBalance: row.openingSalaryAdvanceBalance || '',
      openingSalaryPayableBalance: row.openingSalaryPayableBalance || '',
      openingHrBalanceDate: toDateInput(row.openingHrBalanceDate),
      openingHrBalanceNote: row.openingHrBalanceNote || '',
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
      const selectedTeam = teams.find((team) => team.id === formData.teamId)
      const selectedTeamMatchesUnit =
        selectedTeam &&
        (!formData.unitId || formData.unitId === NONE_VALUE || !selectedTeam.unitId || selectedTeam.unitId === formData.unitId)
      const relationValue = (value: any) => {
        const normalized = String(value || '').trim()
        return normalized && normalized !== NONE_VALUE ? normalized : null
      }
      const openingSalaryAdvanceBalance = formData.openingSalaryAdvanceBalance === ''
        ? 0
        : Number(formData.openingSalaryAdvanceBalance)
      const openingSalaryPayableBalance = formData.openingSalaryPayableBalance === ''
        ? 0
        : Number(formData.openingSalaryPayableBalance)

      if (
        !Number.isFinite(openingSalaryAdvanceBalance) ||
        !Number.isFinite(openingSalaryPayableBalance) ||
        openingSalaryAdvanceBalance < 0 ||
        openingSalaryPayableBalance < 0
      ) {
        setFormError('Opening advance, loan, and salary balances must be valid non-negative amounts')
        return
      }

      if ((openingSalaryAdvanceBalance > 0 || openingSalaryPayableBalance > 0) && !formData.openingHrBalanceDate) {
        setFormError('Opening balance date is required when an opening advance, loan, or salary balance is entered')
        return
      }

      const payload = {
        ...formData,
        nationalId: formData.nationalId ? normalizeNin(formData.nationalId) : undefined,
        taxId: formData.taxId ? normalizeDigits(formData.taxId) : null,
        socialSecurityNumber: formData.socialSecurityNumber ? normalizeDigits(formData.socialSecurityNumber) : null,
        departmentId: relationValue(formData.departmentId),
        positionId: relationValue(formData.positionId),
        branchId: relationValue(formData.branchId),
        unitId: relationValue(formData.unitId),
        teamId: selectedTeamMatchesUnit ? relationValue(formData.teamId) : null,
        supervisorId: relationValue(formData.supervisorId),
        department: selectedDepartment?.name || formData.department || undefined,
        position: selectedPosition?.name || formData.position || undefined,
        jobTitle: selectedPosition?.name || formData.position || undefined,
        basicSalary: formData.basicSalary === '' ? undefined : Number(formData.basicSalary),
        openingSalaryAdvanceBalance,
        openingSalaryPayableBalance,
        openingHrBalanceDate: formData.openingHrBalanceDate || null,
        openingHrBalanceNote: formData.openingHrBalanceNote || null,
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

  const branchOptions = [
    { label: 'No branch', value: NONE_VALUE },
    ...branches.map((branch) => ({ label: branch.name, value: branch.id })),
  ]

  const unitOptions = [
    { label: 'No unit', value: NONE_VALUE },
    ...units.map((unit) => ({ label: unit.name, value: unit.id })),
  ]

  const teamOptions = [
    { label: 'No team', value: NONE_VALUE },
    ...teams
      .filter((team) => !formData.unitId || formData.unitId === NONE_VALUE || !team.unitId || team.unitId === formData.unitId)
      .map((team) => ({ label: team.name, value: team.id })),
  ]

  const supervisorOptions = [
    { label: 'No supervisor', value: NONE_VALUE },
    ...employees
      .filter((employee) => employee.id !== editingId)
      .map((employee) => ({
        label: [employee.employeeNumber, fullName(employee)].filter(Boolean).join(' - '),
        value: employee.id,
      })),
  ]

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
      label: 'NIN / National ID',
      type: 'text',
      placeholder: '14 letters and digits',
      validation: validateUgandanNin,
    },
    {
      name: 'taxId',
      label: 'PAYE TIN',
      type: 'text',
      placeholder: '10 digits',
      validation: validateTenDigitNumber('PAYE TIN'),
    },
    {
      name: 'socialSecurityNumber',
      label: 'Social Security No.',
      type: 'text',
      placeholder: '10 digits',
      validation: validateTenDigitNumber('Social security number'),
    },
    {
      name: 'gender',
      label: 'Gender',
      type: 'select',
      options: [
        { label: 'Male', value: 'male' },
        { label: 'Female', value: 'female' },
        { label: 'Other', value: 'other' },
        { label: 'Prefer not to say', value: 'prefer_not_to_say' },
      ],
    },
    {
      name: 'nationality',
      label: 'Nationality',
      type: 'text',
    },
    {
      name: 'address',
      label: 'Address',
      type: 'textarea',
    },
    {
      name: 'emergencyContactName',
      label: 'Emergency Contact',
      type: 'text',
    },
    {
      name: 'emergencyContactPhone',
      label: 'Emergency Phone',
      type: 'text',
    },
    {
      name: 'nextOfKinName',
      label: 'Next of Kin',
      type: 'text',
    },
    {
      name: 'nextOfKinPhone',
      label: 'Next of Kin Phone',
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
      name: 'branchId',
      label: 'Branch',
      type: 'select',
      options: branchOptions,
      placeholder: branches.length ? 'Select Branch' : 'No branches available',
    },
    {
      name: 'unitId',
      label: 'Unit',
      type: 'select',
      options: unitOptions,
      placeholder: units.length ? 'Select Unit' : 'No units available',
    },
    {
      name: 'teamId',
      label: 'Team',
      type: 'select',
      options: teamOptions,
      placeholder: teams.length ? 'Select Team' : 'No teams available',
    },
    {
      name: 'supervisorId',
      label: 'Supervisor',
      type: 'select',
      options: supervisorOptions,
      placeholder: employees.length ? 'Select Supervisor' : 'No supervisors available',
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
      name: 'openingSalaryAdvanceBalance',
      label: 'Opening Advance / Loan Balance',
      type: 'number',
      placeholder: '0',
      validation: validateNonNegativeAmount('Opening advance / loan balance'),
    },
    {
      name: 'openingSalaryPayableBalance',
      label: 'Opening Salary Owed',
      type: 'number',
      placeholder: '0',
      validation: validateNonNegativeAmount('Opening salary owed'),
    },
    {
      name: 'openingHrBalanceDate',
      label: 'Opening Balance Date',
      type: 'date',
    },
    {
      name: 'openingHrBalanceNote',
      label: 'Opening Balance Notes',
      type: 'textarea',
      placeholder: 'Optional note',
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
      ['PAYE TIN', personal.taxId || selectedEmployee.taxId || '-'],
      ['Social Security No.', personal.socialSecurityNumber || selectedEmployee.socialSecurityNumber || '-'],
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
      ['Opening Advance / Loan', formatMoney(compensation.openingSalaryAdvanceBalance || selectedEmployee.openingSalaryAdvanceBalance)],
      ['Opening Salary Owed', formatMoney(compensation.openingSalaryPayableBalance || selectedEmployee.openingSalaryPayableBalance)],
      ['Opening Balance Date', formatDate(compensation.openingHrBalanceDate || selectedEmployee.openingHrBalanceDate)],
      ['Opening Balance Notes', compensation.openingHrBalanceNote || selectedEmployee.openingHrBalanceNote || '-'],
      ['Current Advance / Loan Balance', formatMoney(compensation.salaryAdvanceBalance || selectedEmployee.salaryAdvanceBalance)],
      ['Current Salary Owed', formatMoney(compensation.salaryPayableBalance || selectedEmployee.salaryPayableBalance)],
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
            searchPlaceholder="Search employees by name, staff no, NIN, TIN, social security, email or phone..."
            pageSize={10}
            enableColumnFilter
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
              <div className="flex flex-1 flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                    <span>Choose Photo</span>
                    <Input
                      ref={profilePhotoInputRef}
                      id="profilePhoto"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      aria-label="Choose an employee photo from the gallery"
                      onChange={(event) => handleProfilePhotoChange(event.target.files?.[0] || null)}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                    <span>Take Photo</span>
                    <Input
                      ref={profilePhotoCameraInputRef}
                      id="profilePhotoCamera"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      aria-label="Take an employee photo with the camera"
                      onChange={(event) => handleProfilePhotoChange(event.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Select a photo from your gallery or use your device camera to capture the employee’s passport photo.</p>
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
