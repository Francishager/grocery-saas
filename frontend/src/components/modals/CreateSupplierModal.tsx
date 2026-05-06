import React, { useState } from 'react'
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

interface Supplier {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  balance: number
  status: 'active' | 'inactive' | 'blocked'
  notes?: string
}

interface CreateSupplierModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (supplier: Supplier) => void
  initialData?: Partial<Supplier>
}

export default function CreateSupplierModal({ isOpen, onClose, onSuccess, initialData }: CreateSupplierModalProps) {
  const { isFeatureEnabled } = useFeatureAccess()
  const { toast } = useToast()
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    ...initialData
  })
  
  const [loading, setLoading] = useState(false)

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
      const API_URL = import.meta.env.VITE_API_URL || ''
      const url = initialData?.id 
        ? `${API_URL}/api/payables/suppliers/${initialData.id}`
        : `${API_URL}/api/payables/suppliers`
      
      const response = await fetch(url, {
        method: initialData?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(formData)
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
        notes: ''
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
      <DialogContent className="sm:max-w-[425px]">
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
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Enter phone number"
                required
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
