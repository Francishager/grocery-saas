import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import { useFeatureAccess } from './services/featureAccessService'

// Create protected route component
const ProtectedRoute = ({ children, feature, role }: { 
  children: React.ReactNode
  feature?: string
  role?: string
}) => {
  const { isFeatureEnabled, canAccessFeature } = useFeatureAccess()
  
  // Check feature access
  if (feature && !isFeatureEnabled(feature)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Feature Not Available</h2>
          <p className="text-gray-600 mb-6">This feature is not available in your current plan.</p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Upgrade Your Plan</h3>
            <p className="text-blue-700 mb-4">
              Get access to this feature and more by upgrading to a higher plan.
            </p>
            <button 
              onClick={() => window.location.href = '/admin/plans'}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              View Plans
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Check role access
  if (role && !canAccessFeature(feature || '')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-6">You don't have permission to access this feature.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  // Auth routes
  {
    path: '/login',
    element: <ProtectedRoute feature="auth" />,
  },
  {
    path: '/saas/login',
    element: <ProtectedRoute feature="auth" />,
  },
  {
    path: '/register',
    element: <ProtectedRoute feature="auth" />,
  },
  {
    path: '/forgot-password',
    element: <ProtectedRoute feature="auth" />,
  },
  // Business routes (protected)
  {
    path: '/dashboard',
    element: <ProtectedRoute feature="pos" role="attendant" />,
  },
  {
    path: '/sales',
    element: <ProtectedRoute feature="pos" role="attendant" />,
  },
  {
    path: '/inventory',
    element: <ProtectedRoute feature="inventory" />,
  },
  {
    path: '/purchases',
    element: <ProtectedRoute feature="inventory" />,
  },
  {
    path: '/reports',
    element: <ProtectedRoute feature="reports" role="accountant" />,
  },
  // Receivables routes (protected)
  {
    path: '/receivables/*',
    element: <ProtectedRoute feature="credit" role="owner" />,
  },
  // Payables routes (protected)
  {
    path: '/receivables/suppliers',
    element: <ProtectedRoute feature="suppliers" role="owner" />,
  },
  {
    path: '/receivables/purchases',
    element: <ProtectedRoute feature="suppliers" role="owner" />,
  },
  {
    path: '/receivables/payments',
    element: <ProtectedRoute feature="suppliers" role="owner" />,
  },
  // Expenses routes (protected)
  {
    path: '/expenses/*',
    element: <ProtectedRoute feature="expenses" role="owner" />,
  },
  // SaaS Admin routes (protected)
  {
    path: '/admin/*',
    element: <ProtectedRoute feature="platform" role="saas_admin" />,
  },
])

export default function AppRouter() {
  return (
    <RouterProvider router={router}>
      <App />
    </RouterProvider>
  )
}
