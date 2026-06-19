import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Copy, KeyRound, Loader2, Package } from 'lucide-react'
import { authApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'request' | 'reset' | 'done'>(searchParams.get('mode') === 'reset' ? 'reset' : 'request')
  const [fallbackOtp, setFallbackOtp] = useState<string | null>(null)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const { toast } = useToast()

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFallbackOtp(null)
    setDeliveryError(null)

    try {
      const result = await authApi.requestReset(email)
      setFallbackOtp(result.otp || null)
      setOtp(result.otp || '')
      setDeliveryError(result.emailSent === false ? result.emailError || result.message : null)
      setStep('reset')
      toast({
        title: result.emailSent === false ? 'Reset code generated' : 'Reset code sent',
        description: result.emailSent === false ? 'Email delivery failed, use the code shown on this page.' : 'Check your email for the code.',
      })
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Request failed',
        description: error.message || 'Could not send reset code',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Use at least 6 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Passwords do not match', description: 'Confirm the new password again.' })
      return
    }

    setLoading(true)
    try {
      await authApi.resetPassword({ email, otp, newPassword })
      setStep('done')
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Reset failed',
        description: error.message || 'Could not reset password',
      })
    } finally {
      setLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl">Password updated</CardTitle>
            <CardDescription>
              You can now sign in with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/login">
              <Button className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Package className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Forgot password?</CardTitle>
          <CardDescription>
            {step === 'request' ? "Enter your email and we'll send you a reset code" : 'Enter the reset code and choose a new password'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'request' ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Code
              </Button>
              {email && (
                <Button type="button" variant="outline" className="w-full" onClick={() => setStep('reset')}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  I Already Have a Code
                </Button>
              )}
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {fallbackOtp && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm font-medium text-yellow-900">Email delivery failed</p>
                  {deliveryError && <p className="mt-1 text-sm text-yellow-800">{deliveryError}</p>}
                  <div className="mt-3 flex items-center justify-between rounded-md bg-white px-3 py-2">
                    <span className="font-mono text-lg font-semibold tracking-widest text-yellow-950">{fallbackOtp}</span>
                    <button type="button" onClick={() => navigator.clipboard.writeText(fallbackOtp)} className="rounded p-1 text-yellow-800 hover:bg-yellow-100">
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="otp">Reset Code</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="123456"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset Password
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => setStep('request')} disabled={loading}>
                Request a New Code
              </Button>
            </form>
          )}
          <div className="mt-4 text-center">
            <Link to="/login" className="text-sm text-primary hover:underline">
              Back to login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
