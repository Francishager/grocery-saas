import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

const carouselImages = [
  { src: '/img/Tracking-Time-in-Sales.png', caption: 'Track sales and profit in real-time' },
  { src: '/img/Keep-nventory-accurate.jpg', caption: 'Keep inventory accurate and up to date' },
  { src: '/img/Empower-your-team.png', caption: 'Empower your team with role-based access' },
  { src: '/img/Visualize-daily-monthly.webp', caption: 'Visualize daily, monthly and staff performance' },
  { src: '/img/desktop-mobile.webp', caption: 'Fast checkout from desktop or mobile' },
  { src: '/img/Secure-cloud-based-scalable.jpg', caption: 'Secure, cloud-based and scalable' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentSlide, setCurrentSlide] = useState(0)
  const { login } = useJWTAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Auto-rotate carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselImages.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await login(email, password)

      // Handle force-reset from backend
      if (result.forceReset) {
        toast({ title: 'Password Reset Required', description: result.message || 'Please reset your password' })
        navigate(`/forgot-password?email=${encodeURIComponent(result.email || email)}&mode=reset`)
        return
      }

      // Route based on the actual login response (not stale React state)
      if (result.user?.isPlatformUser || result.user?.role === 'saas_admin') {
        toast({
          variant: 'destructive',
          title: 'Wrong Login Page',
          description: 'SaaS Administrators should login at /saas/login',
        })
        return
      }

      toast({
        title: 'Welcome back!',
        description: 'Logged in successfully',
      })

      navigate('/tenant/dashboard')
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
    <div className="min-h-screen flex">
      {/* Left: Image Carousel (hidden on mobile) */}
      <div className="hidden lg:block lg:w-[58.33%] relative overflow-hidden bg-slate-100">
        {carouselImages.map((img, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
          >
            <img
              src={img.src}
              alt={img.caption}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-8 left-0 right-0 text-center">
              <p className="inline-block bg-black/50 text-white px-4 py-2 rounded text-sm">
                {img.caption}
              </p>
            </div>
          </div>
        ))}
        
        {/* Carousel indicators */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {carouselImages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentSlide ? 'bg-white w-4' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Right: Login Form */}
      <div className="w-full lg:w-[41.67%] flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Welcome back</h1>
            <p className="text-gray-500">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="h-11"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 bg-blue-600 hover:bg-blue-700" 
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Login'}
            </Button>

            <div className="text-center">
              <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                Forgot password?
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
