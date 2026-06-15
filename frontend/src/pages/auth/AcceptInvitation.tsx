import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  Building, User, Mail, Lock, Phone, 
  Loader2, CheckCircle, AlertCircle, Eye, EyeOff 
} from 'lucide-react'
import InviteService from '@/services/InviteService'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

const AcceptInvitation: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { setTokens, updateUser } = useJWTAuth()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [invitation, setInvitation] = useState<any>(null)
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    otp: '',
    password: '',
    confirmPassword: '',
    name: '',
    phone: '',
    businessName: '',
    businessType: '',
  })

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchInvitation = async () => {
      if (!token) {
        setError('Invalid invitation link')
        setLoading(false)
        return
      }

      try {
        const inv = await InviteService.getByToken(token)
        setInvitation(inv)
        setFormData((prev) => ({
          ...prev,
          name: inv.name || '',
          phone: inv.phone || '',
          businessName: inv.businessName || '',
        }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid or expired invitation')
      } finally {
        setLoading(false)
      }
    }

    fetchInvitation()
  }, [token])

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setFormErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.otp.trim()) {
      errors.otp = 'OTP code is required'
    }

    if (!formData.name.trim()) {
      errors.name = 'Name is required'
    }

    if (!formData.password) {
      errors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    if (!formData.businessName.trim() && !invitation?.tenantId) {
      errors.businessName = 'Business name is required'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validate() || !token) return

    setSubmitting(true)
    setError(null)

    try {
      const result = await InviteService.accept(token, {
        otp: formData.otp,
        password: formData.password,
        name: formData.name,
        phone: formData.phone || undefined,
        businessName: formData.businessName || invitation?.businessName || undefined,
        businessType: formData.businessType || undefined,
      })

      setSuccess(true)

      // Store auth tokens and user
      if (result.tokens && result.user) {
        localStorage.setItem('auth_tokens', JSON.stringify(result.tokens))
        localStorage.setItem('auth_user', JSON.stringify(result.user))
        setTokens(result.tokens)
        updateUser(result.user)
      }

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/tenant/dashboard')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Verifying invitation...</p>
        </div>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Invalid Invitation</h1>
          <p className="mt-2 text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Welcome to jibuSales!</h1>
          <p className="mt-2 text-gray-600">
            Your account has been created successfully. Redirecting to your dashboard...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <Building className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            Accept Your Invitation
          </h1>
          <p className="mt-2 text-gray-600">
            You've been invited to join jibuSales as a business owner
          </p>
        </div>

        {/* Invitation Details */}
        {invitation && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Invited as: {invitation.email}
                </p>
                {invitation.planName && (
                  <p className="text-sm text-blue-700">
                    Plan: {invitation.planName}
                  </p>
                )}
                {invitation.businessName && (
                  <p className="text-sm text-blue-700">
                    Business: {invitation.businessName}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Personal Information */}
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Personal Information</h2>
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      formErrors.name ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="John Doe"
                  />
                </div>
                {formErrors.name && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
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
            </div>
          </div>

          {/* OTP Verification */}
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Verification Code</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OTP Code *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.otp}
                  onChange={(e) => handleChange('otp', e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formErrors.otp ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Enter the 6-digit code sent to your email"
                  maxLength={6}
                />
              </div>
              {formErrors.otp && (
                <p className="mt-1 text-sm text-red-600">{formErrors.otp}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">Check your email for the verification code</p>
            </div>
          </div>

          {/* Password */}
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Create Password</h2>
            <div className="space-y-4">
              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    className={`w-full pl-10 pr-12 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      formErrors.password ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {formErrors.password && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.password}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      formErrors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="••••••••"
                  />
                </div>
                {formErrors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.confirmPassword}</p>
                )}
              </div>
            </div>
          </div>

          {/* Business Information */}
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Business Information</h2>
            <div className="space-y-4">
              {/* Business Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Name *
                </label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => handleChange('businessName', e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      formErrors.businessName ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="My Business"
                  />
                </div>
                {formErrors.businessName && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.businessName}</p>
                )}
              </div>

              {/* Business Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Type
                </label>
                <select
                  value={formData.businessType}
                  onChange={(e) => handleChange('businessType', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select type...</option>
                  <option value="retail">Retail Store</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="supermarket">Supermarket</option>
                  <option value="convenience">Convenience Store</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Account...
              </>
            ) : (
              'Create Account & Accept Invitation'
            )}
          </button>

          {/* Terms */}
          <p className="text-center text-sm text-gray-500">
            By creating an account, you agree to our{' '}
            <a href="/terms" className="text-blue-600 hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}

export default AcceptInvitation
