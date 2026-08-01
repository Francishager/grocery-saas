import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useFeatureAccess } from '@/services/featureAccessService'
import { apiFetch, branchesApi, type BranchOption } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

interface Supplier {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  balance: number
  openingBalance?: number
  openingBalanceDate?: string | null
  openingBalanceNote?: string
  status: 'active' | 'inactive' | 'blocked'
  notes?: string
  branchId?: string | null
  branch?: BranchOption | null
}

interface CreateSupplierModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (supplier: Supplier) => void
  initialData?: Partial<Supplier>
}

const todayInputDate = () => new Date().toISOString().slice(0, 10)
const openingBalanceRoles = ['owner', 'admin', 'saas_admin', 'platform_admin', 'super_admin']

export default function CreateSupplierModal({ isOpen, onClose, onSuccess, initialData }: CreateSupplierModalProps) {
  const { isFeatureEnabled } = useFeatureAccess()
  const { user, hasPermission } = useJWTAuth()
  const { toast } = useToast()
  const canManageSuppliers = hasPermission('canCreatePurchase') || hasPermission('canViewPurchase')
  const canManageOpeningBalances = Boolean(
    user && (openingBalanceRoles.includes(user.role) || user.permissions?.includes('*'))
  )
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    openingBalance: 0,
    openingBalanceDate: todayInputDate(),
    openingBalanceNote: '',
    notes: '',
    branchId: '',
    ...initialData
  })
  
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
      ...initialData,
      openingBalance: initialData?.openingBalance ?? 0,
      openingBalanceDate: initialData?.openingBalanceDate ? String(initialData.openingBalanceDate).slice(0, 10) : todayInputDate(),
      openingBalanceNote: initialData?.openingBalanceNote || '',
      branchId: initialData?.branchId || initialData?.branch?.id || '',
    })
  }, [isOpen, initialData])

  useEffect(() => {
    if (!isOpen || !canManageSuppliers) {
      setBranches([])
      return
    }

    branchesApi.active()
      .then((data) => {
        setBranches(data)
        if (data.length === 1) {
          setFormData((prev) => ({ ...prev, branchId: prev.branchId || data[0].id }))
        }
      })
      .catch((error) => {
        console.error('Failed to load branches:', error)
        toast({
          title: 'Branches unavailable',
          description: 'Refresh and try again before saving this supplier.',
          variant: 'destructive'
        })
      })
  }, [isOpen, canManageSuppliers, toast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isFeatureEnabled('suppliers')) {
      toast({
        title: 'Feature Not Available',
        description: 'Supplier management is not available in your current plan',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    
    try {
      if (canManageSuppliers && branches.length === 0) {
        throw new Error('Create an active branch before adding suppliers')
      }

      if (canManageSuppliers && !formData.branchId) {
        throw new Error('Select the branch this supplier belongs to')
      }

      const url = initialData?.id 
        ? `/api/payables/suppliers/${initialData.id}`
        : '/api/payables/suppliers'
      const openingBalanceChanged = Boolean(
        initialData?.id &&
        canManageOpeningBalances &&
        Number(formData.openingBalance || 0) !== Number(initialData?.openingBalance || 0)
      )
      if (openingBalanceChanged && !window.confirm('Changing this opening balance will adjust the current supplier balance. Continue?')) {
        setLoading(false)
        return
      }
      const payload = {
        ...formData,
        branchId: canManageSuppliers ? formData.branchId : undefined,
        openingBalance: canManageOpeningBalances ? Number(formData.openingBalance || 0) : undefined,
        openingBalanceDate: canManageOpeningBalances ? formData.openingBalanceDate || null : undefined,
        openingBalanceNote: canManageOpeningBalances ? formData.openingBalanceNote || '' : undefined,
        confirmOpeningBalanceChange: openingBalanceChanged || undefined,
      }
      
      const response = await apiFetch(url, {
        method: initialData?.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save supplier')
      }

      const supplier = await response.json()
      onSuccess(supplier)
      onClose()
      
      toast({
        title: 'Success',
        description: `Supplier ${initialData?.id ? 'updated' : 'created'} successfully`
      })
      
      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        openingBalance: 0,
        openingBalanceDate: todayInputDate(),
        openingBalanceNote: '',
        notes: '',
        branchId: branches.length === 1 ? branches[0].id : '',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save supplier',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (!isFeatureEnabled('suppliers')) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upgrade Required</DialogTitle>
            <DialogDescription>
              Supplier management is not available in your current plan. Upgrade to access this feature.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Edit Supplier' : 'Add New Supplier'}</DialogTitle>
          <DialogDescription>
            {initialData?.id ? 'Update supplier information' : 'Add a new supplier to your business'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter supplier name"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Enter email address"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Enter supplier address"
              />
            </div>
          </div>

          {canManageOpeningBalances && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplierOpeningBalance">Opening Balance</Label>
                  <Input
                    id="supplierOpeningBalance"
                    type="number"
                    value={formData.openingBalance}
                    onChange={(e) => handleInputChange('openingBalance', Number(e.target.value))}
                    min="0"
                    step="0.01"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplierOpeningBalanceDate">Opening Balance Date</Label>
                  <Input
                    id="supplierOpeningBalanceDate"
                    type="date"
                    value={formData.openingBalanceDate || ''}
                    onChange={(e) => handleInputChange('openingBalanceDate', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplierOpeningBalanceNote">Opening Balance Note</Label>
                <Textarea
                  id="supplierOpeningBalanceNote"
                  value={formData.openingBalanceNote || ''}
                  onChange={(e) => handleInputChange('openingBalanceNote', e.target.value)}
                  placeholder="Optional migration note"
                  rows={2}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Enter any additional notes"
              rows={3}
            />
          </div>

          {canManageSuppliers && (
            <div className="space-y-2">
              <Label htmlFor="supplierBranch">Branch *</Label>
              <Select
                value={formData.branchId || ''}
                onValueChange={(value) => handleInputChange('branchId', value)}
                disabled={branches.length === 0 || loading}
              >
                <SelectTrigger id="supplierBranch">
                  <SelectValue placeholder={branches.length === 0 ? 'No active branches' : 'Select branch'} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : initialData?.id ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
