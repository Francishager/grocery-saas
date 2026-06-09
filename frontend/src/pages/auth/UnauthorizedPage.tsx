import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  const { isPlatformUser, user } = useJWTAuth()

  const goBack = () => {
    if (isPlatformUser()) {
      navigate('/saas/dashboard')
    } else if (user?.tenantId) {
      navigate('/dashboard')
    } else {
      navigate('/login')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <ShieldAlert className="w-10 h-10 text-red-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
      <p className="text-gray-500 mb-6 text-center max-w-md">
        You don't have permission to access this page. Contact your administrator if you believe this is an error.
      </p>
      <button
        onClick={goBack}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Go to Dashboard
      </button>
    </div>
  )
}
