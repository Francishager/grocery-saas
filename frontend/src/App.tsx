import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Layout } from '@/components/layout/Layout'
import { RouteGuard } from '@/guard/RouteGuard'

// Pages
import LoginPage from '@/pages/auth/LoginPage'
import SaaSAdminLoginPage from '@/pages/auth/SaaSAdminLoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import AcceptInvitation from '@/pages/auth/AcceptInvitation'
import DashboardPage from '@/pages/DashboardPage'
import SalesPage from '@/pages/SalesPage'
import InventoryPage from '@/pages/InventoryPage'
import PurchasesPage from '@/pages/PurchasesPage'
import ReportsPage from '@/pages/ReportsPage'
import AdminPage from '@/pages/admin/AdminPage'
import SaaSAdminDashboard from '@/pages/SaaSAdmin/Dashboard'

// Public Route Component (redirects if already logged in)
function PublicRoute({ children, redirectTo = '/dashboard' }: { children: React.ReactNode, redirectTo?: string }) {
  const { isAuthenticated, isPlatformUser } = useJWTAuth()

  if (isAuthenticated) {
    // Redirect SaaS Admin to their dashboard, business users to theirs
    const dest = isPlatformUser() ? '/saas/dashboard' : redirectTo
    return <Navigate to={dest} replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        } />
        <Route path="/saas/login" element={
          <PublicRoute redirectTo="/saas/dashboard">
            <SaaSAdminLoginPage />
          </PublicRoute>
        } />
        <Route path="/register" element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        } />
        <Route path="/forgot-password" element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        } />
        <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />

        {/* SaaS Admin Routes (Platform Level) */}
        <Route path="/saas" element={
          <RouteGuard role="saas_admin" platformOnly>
            <Layout />
          </RouteGuard>
        }>
          <Route index element={<Navigate to="/saas/dashboard" replace />} />
          <Route path="dashboard" element={<SaaSAdminDashboard />} />
          <Route path="tenants" element={<SaaSAdminDashboard />} />
          <Route path="invitations" element={<SaaSAdminDashboard />} />
        </Route>

        {/* Business Routes (Tenant Level) - SaaS Admin BLOCKED */}
        <Route path="/" element={
          <RouteGuard accessesBusinessData>
            <Layout />
          </RouteGuard>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={
            <RouteGuard permission="view_dashboard" accessesBusinessData>
              <DashboardPage />
            </RouteGuard>
          } />
          <Route path="sales" element={
            <RouteGuard permission="view_sales" accessesBusinessData>
              <SalesPage />
            </RouteGuard>
          } />
          <Route path="inventory" element={
            <RouteGuard permission="view_inventory" accessesBusinessData>
              <InventoryPage />
            </RouteGuard>
          } />
          <Route path="purchases" element={
            <RouteGuard permission="view_purchases" accessesBusinessData>
              <PurchasesPage />
            </RouteGuard>
          } />
          <Route path="reports" element={
            <RouteGuard permission="view_reports" accessesBusinessData>
              <ReportsPage />
            </RouteGuard>
          } />
          <Route path="admin" element={
            <RouteGuard role="owner" accessesBusinessData>
              <AdminPage />
            </RouteGuard>
          } />
        </Route>

        {/* Catch all - redirect based on auth status */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
