import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { HRTable, HRColumn } from '@/components/hr/HRTable'
import { ExternalLink, FileText, AlertTriangle, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HRFormBuilder, HRFormField } from '@/components/hr/HRFormBuilder'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Document {
  id: string
  employeeId: string
  documentType: string
  fileName: string
  fileUrl?: string
  employee?: { id: string; firstName?: string; lastName?: string; employeeNumber?: string }
  issueDate?: string
  expiryDate?: string
  uploadedBy?: string
  isExpired?: boolean
  daysUntilExpiry?: number
  uploadedAt?: string
  createdAt: string
}

const formatLabel = (value?: string) =>
  (value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export default function DocumentManagementPage() {
  const { toast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({
    employeeId: '',
    documentType: 'passport',
    issueDate: '',
    expiryDate: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const columns: HRColumn[] = [
    {
      key: 'employeeId',
      label: 'Employee',
      width: '20%',
      render: (value) => {
        const emp = employees.find((e) => e.id === value)
        return emp ? `${emp.firstName} ${emp.lastName}` : value
      },
    },
    {
      key: 'documentType',
      label: 'Document Type',
      width: '15%',
      render: (value) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <span>{formatLabel(value)}</span>
        </div>
      ),
    },
    {
      key: 'fileName',
      label: 'File Name',
      width: '25%',
      render: (value, row: Document) => row.fileUrl ? (
        <button
          type="button"
          onClick={() => handleView(row.id, row)}
          className="inline-flex max-w-full items-center gap-2 text-left text-primary hover:underline"
          title={value || 'Open document'}
        >
          <span className="truncate">{value || 'Open document'}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </button>
      ) : value || '-',
    },
    {
      key: 'expiryDate',
      label: 'Expiry Date',
      width: '15%',
      render: (value, row: Document) => {
        if (!value) return '-'
        const date = new Date(value)
        const today = new Date()
        const daysLeft = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysLeft < 0) {
          return (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> Expired
            </Badge>
          )
        } else if (daysLeft <= 30) {
          return (
            <Badge variant="secondary" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {daysLeft}d left
            </Badge>
          )
        }
        return date.toLocaleDateString()
      },
    },
    {
      key: 'createdAt',
      label: 'Uploaded',
      width: '15%',
      render: (value, row: Document) => {
        const dateValue = row.uploadedAt || value
        return dateValue ? new Date(dateValue).toLocaleDateString() : '-'
      },
    },
  ]

  const fetchData = async () => {
    try {
      setLoading(true)
      const [docRes, empRes] = await Promise.all([
        apiFetch('/api/hr/documents'),
        apiFetch('/api/hr/employees'),
      ])

      if (docRes.ok) {
        const data = await docRes.json()
        setDocuments(Array.isArray(data.data) ? data.data : data)
      }

      if (empRes.ok) {
        const data = await empRes.json()
        setEmployees(Array.isArray(data.data) ? data.data : data)
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
      employeeId: '',
      documentType: 'passport',
      issueDate: '',
      expiryDate: '',
    })
    setFile(null)
    setFormError('')
    setOpenDialog(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const res = await apiFetch(`/api/hr/documents/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Document deleted' })
        fetchData()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error || 'Failed to delete' })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error deleting document' })
    }
  }

  const handleView = (_id: string, row: Document) => {
    if (!row.fileUrl) {
      toast({ variant: 'destructive', title: 'Document file is missing' })
      return
    }
    window.open(row.fileUrl, '_blank', 'noopener,noreferrer')
  }

  const handleSave = async () => {
    if (!file) {
      setFormError('Please select a file to upload')
      return
    }

    setFormLoading(true)
    setFormError('')

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('employeeId', formData.employeeId)
      formDataToSend.append('documentType', formData.documentType)
      formDataToSend.append('issueDate', formData.issueDate || '')
      formDataToSend.append('expiryDate', formData.expiryDate || '')
      formDataToSend.append('file', file)

      const res = await apiFetch('/api/hr/documents', {
        method: 'POST',
        body: formDataToSend,
      })

      if (res.ok) {
        toast({ title: 'Document uploaded' })
        setOpenDialog(false)
        fetchData()
      } else {
        const data = await res.json()
        setFormError(data.error || 'Failed to upload')
      }
    } catch (err) {
      setFormError('Error uploading document')
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
      name: 'documentType',
      label: 'Document Type',
      type: 'select',
      required: true,
      options: [
        { label: 'CV', value: 'cv' },
        { label: 'Passport', value: 'passport' },
        { label: 'National ID', value: 'national_id' },
        { label: 'Driver License', value: 'driver_license' },
        { label: 'Employment Contract', value: 'employment_contract' },
        { label: 'Academic Certificate', value: 'academic_certificate' },
        { label: 'Professional Certificate', value: 'professional_certificate' },
        { label: 'Appointment Letter', value: 'appointment_letter' },
        { label: 'Promotion Letter', value: 'promotion_letter' },
        { label: 'Warning Letter', value: 'warning_letter' },
        { label: 'Training Certificate', value: 'training_certificate' },
        { label: 'Medical Document', value: 'medical_document' },
        { label: 'Work Permit', value: 'work_permit' },
        { label: 'Vaccination', value: 'vaccination' },
        { label: 'Medical Certificate', value: 'medical_certificate' },
        { label: 'Insurance', value: 'insurance' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      name: 'issueDate',
      label: 'Issue Date',
      type: 'date',
    },
    {
      name: 'expiryDate',
      label: 'Expiry Date',
      type: 'date',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Document Management</h1>
        <p className="text-muted-foreground">Manage employee documents with expiry tracking</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <HRTable
            columns={columns}
            data={documents}
            loading={loading}
            onAdd={handleAdd}
            onView={handleView}
            onDelete={handleDelete}
            searchPlaceholder="Search documents..."
            actions={true}
          />
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
            <DialogDescription>Attach employee records for viewing from HR profiles and document management.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <HRFormBuilder
              fields={formFields}
              values={formData}
              onChange={setFormData}
              onSubmit={() => {}}
              loading={false}
              showSubmit={false}
            />

            <div className="space-y-2">
              <Label htmlFor="file">Document File</Label>
              <Input
                id="file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".pdf,.doc,.docx,.jpg,.png"
              />
              {file && <p className="text-sm text-gray-600">Selected: {file.name}</p>}
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {formError}
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={formLoading || !file}
              className="w-full gap-2"
            >
              <Upload className="h-4 w-4" />
              {formLoading ? 'Saving...' : 'Save Document'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
