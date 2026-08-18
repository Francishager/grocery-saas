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
import { Badge } from '@/components/ui/badge'

interface Contract {
  id: string
  contractNo: string
  employeeId: string
  contractType: string
  status: string
  startDate: string
  endDate?: string
  salary: number
  probationPeriod?: number
  createdAt: string
  employee?: { id: string; firstName?: string; lastName?: string; employeeNumber?: string }
}

export default function ContractManagementPage() {
  const { toast } = useToast()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({
    employeeId: '',
    contractNo: '',
    contractType: 'permanent',
    status: 'active',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    salary: '',
    probationPeriod: '',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const columns: HRColumn[] = [
    {
      key: 'contractNo',
      label: 'Contract No',
      sortable: true,
      width: '15%',
    },
    {
      key: 'employeeId',
      label: 'Employee',
      width: '20%',
      render: (value, row) => {
        if (row.employee) {
          return [row.employee.firstName, row.employee.lastName].filter(Boolean).join(' ') || row.employee.employeeNumber || value
        }
        const emp = employees.find((e) => e.id === value)
        return emp ? `${emp.firstName} ${emp.lastName}` : value
      },
    },
    {
      key: 'contractType',
      label: 'Type',
      width: '15%',
      render: (value) => (
        <Badge variant={value === 'permanent' ? 'default' : 'secondary'}>{value}</Badge>
      ),
    },
    {
      key: 'salary',
      label: 'Salary',
      width: '15%',
      render: (value) => `$${Number(value).toLocaleString()}`,
    },
    {
      key: 'startDate',
      label: 'Start Date',
      width: '15%',
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: 'status',
      label: 'Status',
      width: '15%',
      render: (value) => (
        <Badge variant={value === 'active' ? 'default' : 'destructive'}>{value}</Badge>
      ),
    },
  ]

  const fetchContracts = async () => {
    try {
      setLoading(true)
      const [contractRes, employeeRes] = await Promise.all([
        apiFetch('/api/hr/contracts'),
        apiFetch('/api/hr/employees'),
      ])

      if (contractRes.ok) {
        const data = await contractRes.json()
        setContracts(Array.isArray(data.data) ? data.data : data)
      }

      if (employeeRes.ok) {
        const data = await employeeRes.json()
        setEmployees(Array.isArray(data.data) ? data.data : data)
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error loading data' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContracts()
  }, [])

  const handleAdd = () => {
    setEditingId(null)
    setFormData({
      employeeId: '',
      contractNo: '',
      contractType: 'permanent',
      status: 'active',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      salary: '',
      probationPeriod: '',
    })
    setFormError('')
    setOpenDialog(true)
  }

  const handleEdit = (id: string, row: Contract) => {
    setEditingId(id)
    setFormData({
      employeeId: row.employeeId,
      contractNo: row.contractNo,
      contractType: row.contractType,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate || '',
      salary: row.salary,
      probationPeriod: row.probationPeriod || '',
    })
    setFormError('')
    setOpenDialog(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Contracts should not be deleted. Terminate instead.')) return
  }

  const handleSave = async () => {
    setFormLoading(true)
    setFormError('')

    try {
      const method = editingId ? 'PUT' : 'POST'
      const url = editingId ? `/api/hr/contracts/${editingId}` : '/api/hr/contracts'

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          ...formData,
          salary: Number(formData.salary),
          probationPeriod: formData.probationPeriod ? Number(formData.probationPeriod) : null,
        }),
      })

      if (res.ok) {
        toast({ title: editingId ? 'Contract updated' : 'Contract created' })
        setOpenDialog(false)
        fetchContracts()
      } else {
        const data = await res.json()
        setFormError(data.error || 'Failed to save')
      }
    } catch (err) {
      setFormError('Error saving contract')
    } finally {
      setFormLoading(false)
    }
  }

  const employeeOptions = employees.map((e) => ({
    label: `${e.firstName} ${e.lastName}`,
    value: e.id,
  }))

  const formFields: HRFormField[] = [
    {
      name: 'employeeId',
      label: 'Employee',
      type: 'select',
      required: true,
      options: employeeOptions,
    },
    {
      name: 'contractNo',
      label: 'Contract Number',
      type: 'text',
      required: true,
      placeholder: 'e.g., CONT-001',
    },
    {
      name: 'contractType',
      label: 'Contract Type',
      type: 'select',
      required: true,
      options: [
        { label: 'Permanent', value: 'permanent' },
        { label: 'Temporary', value: 'temporary' },
        { label: 'Contract', value: 'contract' },
        { label: 'Probation', value: 'probation' },
      ],
    },
    {
      name: 'salary',
      label: 'Salary',
      type: 'number',
      required: true,
    },
    {
      name: 'probationPeriod',
      label: 'Probation Period (months)',
      type: 'number',
    },
    {
      name: 'startDate',
      label: 'Start Date',
      type: 'date',
      required: true,
    },
    {
      name: 'endDate',
      label: 'End Date',
      type: 'date',
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Terminated', value: 'terminated' },
        { label: 'Suspended', value: 'suspended' },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contract Management</h1>
        <p className="text-muted-foreground">Manage employee contracts and agreements</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <HRTable
            columns={columns}
            data={contracts}
            loading={loading}
            onAdd={handleAdd}
            onEdit={handleEdit}
            searchPlaceholder="Search contracts..."
            actions={!editingId}
          />
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Contract' : 'Create Contract'}</DialogTitle>
            <DialogDescription>Manage employee contract dates, salary, and status.</DialogDescription>
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
