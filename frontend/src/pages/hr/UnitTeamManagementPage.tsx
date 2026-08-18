import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Users } from 'lucide-react'

interface Unit {
  id: string
  name: string
  code: string
  description?: string
  departmentId: string
  headId?: string
  isActive: boolean
}

interface Team {
  id: string
  name: string
  code: string
  description?: string
  departmentId: string
  unitId?: string
  leaderId?: string
  size: number
  isActive: boolean
}

export default function UnitTeamManagementPage() {
  const { toast } = useToast()
  const [units, setUnits] = useState<Unit[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [activeTab, setActiveTab] = useState('units')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({
    name: '',
    code: '',
    description: '',
    departmentId: '',
    size: '',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const unitColumns: HRColumn[] = [
    {
      key: 'name',
      label: 'Unit Name',
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

  const teamColumns: HRColumn[] = [
    {
      key: 'name',
      label: 'Team Name',
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
      key: 'size',
      label: 'Size',
      width: '10%',
      render: (value) => (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4" />
          {value || 0}
        </div>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      width: '30%',
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

  const fetchData = async () => {
    try {
      setLoading(true)
      const [unitRes, teamRes, deptRes] = await Promise.all([
        apiFetch('/api/hr/units'),
        apiFetch('/api/hr/teams'),
        apiFetch('/api/hr/departments'),
      ])

      if (unitRes.ok) {
        const data = await unitRes.json()
        setUnits(Array.isArray(data.data) ? data.data : data)
      }

      if (teamRes.ok) {
        const data = await teamRes.json()
        setTeams(Array.isArray(data.data) ? data.data : data)
      }

      if (deptRes.ok) {
        const data = await deptRes.json()
        setDepartments(Array.isArray(data.data) ? data.data : data)
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error loading data' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAdd = () => {
    setEditingId(null)
    setFormData({
      name: '',
      code: '',
      description: '',
      departmentId: '',
      size: '',
    })
    setFormError('')
    setOpenDialog(true)
  }

  const handleEdit = (id: string, row: Unit | Team) => {
    setEditingId(id)
    setFormData({
      name: row.name,
      code: row.code,
      description: row.description || '',
      departmentId: row.departmentId,
      size: 'size' in row ? row.size : '',
    })
    setFormError('')
    setOpenDialog(true)
  }

  const handleDelete = async (id: string, type: 'unit' | 'team') => {
    if (!confirm(`Delete this ${type}?`)) return

    try {
      const url = type === 'unit' ? `/api/hr/units/${id}` : `/api/hr/teams/${id}`
      const res = await apiFetch(url, { method: 'DELETE' })

      if (res.ok) {
        toast({ title: `${type} deleted` })
        fetchData()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error || 'Failed to delete' })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error deleting' })
    }
  }

  const handleSave = async () => {
    setFormLoading(true)
    setFormError('')

    try {
      const isUnit = activeTab === 'units'
      const method = editingId ? 'PUT' : 'POST'
      const url = editingId
        ? isUnit
          ? `/api/hr/units/${editingId}`
          : `/api/hr/teams/${editingId}`
        : isUnit
        ? '/api/hr/units'
        : '/api/hr/teams'

      const payload = {
        name: formData.name,
        code: formData.code,
        description: formData.description,
        departmentId: formData.departmentId,
        ...(activeTab === 'teams' && { size: formData.size ? Number(formData.size) : 0 }),
      }

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const label = isUnit ? 'Unit' : 'Team'
        toast({ title: editingId ? `${label} updated` : `${label} created` })
        setOpenDialog(false)
        fetchData()
      } else {
        const data = await res.json()
        setFormError(data.error || 'Failed to save')
      }
    } catch (err) {
      setFormError('Error saving')
    } finally {
      setFormLoading(false)
    }
  }

  const deptOptions = departments.map((d) => ({
    label: d.name,
    value: d.id,
  }))

  const commonFields: HRFormField[] = [
    {
      name: 'name',
      label: activeTab === 'units' ? 'Unit Name' : 'Team Name',
      type: 'text',
      required: true,
    },
    {
      name: 'code',
      label: 'Code',
      type: 'text',
      required: true,
    },
    {
      name: 'departmentId',
      label: 'Department',
      type: 'select',
      required: true,
      options: deptOptions,
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
    },
  ]

  const formFields =
    activeTab === 'teams'
      ? [
          ...commonFields,
          {
            name: 'size',
            label: 'Team Size',
            type: 'number',
          },
        ]
      : commonFields

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Units & Teams</h1>
        <p className="text-muted-foreground">Manage organizational units and teams</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        <TabsContent value="units" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Units</CardTitle>
            </CardHeader>
            <CardContent>
              <HRTable
                columns={unitColumns}
                data={units}
                loading={loading}
                onAdd={handleAdd}
                onEdit={(id, row) => {
                  handleEdit(id, row)
                  setActiveTab('units')
                }}
                onDelete={(id) => handleDelete(id, 'unit')}
                searchPlaceholder="Search units..."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Teams</CardTitle>
            </CardHeader>
            <CardContent>
              <HRTable
                columns={teamColumns}
                data={teams}
                loading={loading}
                onAdd={handleAdd}
                onEdit={(id, row) => {
                  handleEdit(id, row)
                  setActiveTab('teams')
                }}
                onDelete={(id) => handleDelete(id, 'team')}
                searchPlaceholder="Search teams..."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? `Edit ${activeTab === 'units' ? 'Unit' : 'Team'}` : `Create ${activeTab === 'units' ? 'Unit' : 'Team'}`}
            </DialogTitle>
            <DialogDescription>
              {activeTab === 'units' ? 'Manage a department unit.' : 'Manage a team within a department.'}
            </DialogDescription>
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
