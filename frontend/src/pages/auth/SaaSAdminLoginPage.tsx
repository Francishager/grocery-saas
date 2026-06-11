import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, Loader2, Building } from 'lucide-react'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function SaaSAdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useJWTAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await login(email, password)

      // Route based on the actual login response (not stale React state)
      if (result.user?.role !== 'saas_admin' && !result.user?.isPlatformUser) {
        toast({
          variant: 'destructive',
          title: 'Access Denied',
          description: 'This login is for SaaS Administrators only. Business owners should login at /login',
        })
        return
      }

      toast({
        title: 'Welcome, SaaS Admin',
        description: 'Logged in successfully',
      })

      navigate('/saas/dashboard')
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Login failed',
        description: error.message || 'Invalid credentials',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <Card className="w-full max-w-md border-slate-700 bg-slate-800">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600">
              <Shield className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-white">SaaS Admin Portal</CardTitle>
          <CardDescription className="text-slate-400">
            Platform Administration Access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-200">Admin Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@saas.internal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-200">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
              />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In as SaaS Admin
            </Button>
          </form>
          
          <div className="mt-6 pt-6 border-t border-slate-700">
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-2">Are you a business owner?</p>
              <Link 
                to="/login" 
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
              >
                <Building className="h-4 w-4" />
                Login to your business account
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
