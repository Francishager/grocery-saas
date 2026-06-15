import React, { useEffect, useState } from 'react'
import { X, Mail, User, Phone, Building, Send, Loader2, MapPin } from 'lucide-react'
import InviteService, { InvitationCreateInput } from '@/services/InviteService'
import { apiFetch } from '@/lib/api'

export interface InviteBusinessOwnerModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (invitation: any) => void
  plans?: { id: string; name: string }[]
}

const emptyForm = (planId = ''): InvitationCreateInput => ({
  email: '',
  name: '',
  phone: '',
  businessName: '',
  businessLocation: '',
  businessPhone: '',
  planId,
  message: '',
})

export const InviteBusinessOwnerModal: React.FC<InviteBusinessOwnerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  plans: propPlans,
}) => {
  const [plans, setPlans] = useState(propPlans || [])
  const [formData, setFormData] = useState<InvitationCreateInput>(() => emptyForm(propPlans?.[0]?.id || ''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [otpCode, setOtpCode] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState<boolean | null>(null)
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null)

  useEffect(() => {
    if (propPlans?.length) {
      setPlans(propPlans)
      setFormData((prev) => prev.planId ? prev : { ...prev, planId: propPlans[0].id })
    }
  }, [propPlans])

  useEffect(() => {
    if (!isOpen || propPlans?.length) return

    apiFetch('/api/platform/plans')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.plans || []
        const mapped = list.map((p: any) => ({ id: p.id, name: p.name }))
        setPlans(mapped)
        if (mapped.length) setFormData((prev) => prev.planId ? prev : { ...prev, planId: mapped[0].id })
      })
      .catch(() => {})
  }, [isOpen, propPlans])

  const resetDeliveryState = () => {
    setSuccess(false)
    setOtpCode(null)
    setEmailSent(null)
    setDeliveryMessage(null)
  }

  const resetAndClose = () => {
    setFormData(emptyForm(plans[0]?.id || ''))
    setError(null)
    resetDeliveryState()
    onClose()
  }

  const handleChange = (field: keyof InvitationCreateInput, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    resetDeliveryState()

    try {
      const result = await InviteService.create(formData)
      setOtpCode(result.otpCode || null)
      setEmailSent(result.emailSent !== false)
      setDeliveryMessage(result.deliveryMessage || null)
      setSuccess(true)
      onSuccess?.(result)

      if (result.emailSent !== false) {
        setTimeout(() => {
          resetAndClose()
        }, 2000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-lg font-semibold text-gray-900">Create Business</h2>
            <button
              onClick={resetAndClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-4">
            {success ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">
                  {emailSent === false ? 'Invitation Created' : 'Invitation Sent!'}
                </h3>
                <p className="text-gray-500 mt-2">
                  {emailSent === false
                    ? `Email delivery failed for ${formData.email}.`
                    : `An email has been sent to ${formData.email}`}
                </p>
                {deliveryMessage && <p className="text-sm text-gray-500 mt-1">{deliveryMessage}</p>}
                {otpCode && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm font-medium text-yellow-800">
                      Email delivery unavailable - share this OTP manually:
                    </p>
                    <p className="text-2xl font-bold text-yellow-900 mt-1 tracking-widest">{otpCode}</p>
                  </div>
                )}
                {emailSent === false && (
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="mt-4 w-full rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                )}
              </div>
            ) : (
              <>
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="owner@business.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="John Doe"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Owner Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="+256 700 123 456"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Name *
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={formData.businessName}
                      onChange={(e) => handleChange('businessName', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Business name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Location
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.businessLocation}
                      onChange={(e) => handleChange('businessLocation', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="City, district, or address"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.businessPhone}
                      onChange={(e) => handleChange('businessPhone', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="+256 700 123 456"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subscription Plan
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={formData.planId}
                      onChange={(e) => handleChange('planId', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Personal Message (Optional)
                  </label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => handleChange('message', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Welcome to jibuSales..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !formData.email || !formData.businessName}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Invitation
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

export default InviteBusinessOwnerModal
