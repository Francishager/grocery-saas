import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { SaaSAdminLayout } from '@/components/layout/SaaSAdminLayout'
import { TenantLayout } from '@/components/layout/TenantLayout'
import { RouteGuard } from '@/guard/RouteGuard'

// Pages
import LoginPage from '@/pages/auth/LoginPage'
import SaaSAdminLoginPage from '@/pages/auth/SaaSAdminLoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import AcceptInvitation from '@/pages/auth/AcceptInvitation'
import UnauthorizedPage from '@/pages/auth/UnauthorizedPage'
import DashboardPage from '@/pages/DashboardPage'
import SalesPage from '@/pages/SalesPage'
import InventoryPage from '@/pages/InventoryPage'
import PurchasesPage from '@/pages/PurchasesPage'
import ReportsPage from '@/pages/ReportsPage'
import AdminPage from '@/pages/admin/AdminPage'
import SaaSAdminDashboard from '@/pages/SaaSAdmin/Dashboard'
import BusinessesPage from '@/pages/SaaSAdmin/BusinessesPage'
import ProvisionPage from '@/pages/SaaSAdmin/ProvisionPage'
import PlansPage from '@/pages/SaaSAdmin/PlansPage'
import FeaturesPage from '@/pages/SaaSAdmin/FeaturesPage'
import OwnersPage from '@/pages/SaaSAdmin/OwnersPage'
import SubscriptionsPage from '@/pages/SaaSAdmin/SubscriptionsPage'
import InvitationsList from '@/pages/SaaSAdmin/InvitationsList'

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
          <PublicRoute redirectTo="/dashboard">
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
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />

        {/* SaaS Admin Routes (Platform Level) */}
        <Route path="/saas" element={
          <RouteGuard role="saas_admin" platformOnly>
            <SaaSAdminLayout />
          </RouteGuard>
        }>
          <Route index element={<Navigate to="/saas/dashboard" replace />} />
          <Route path="dashboard" element={<SaaSAdminDashboard />} />
          <Route path="businesses" element={<BusinessesPage />} />
          <Route path="provision" element={<ProvisionPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="invitations" element={<InvitationsList />} />
          <Route path="owners" element={<OwnersPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
        </Route>

        {/* Business Routes (Tenant Level) - SaaS Admin BLOCKED */}
        <Route path="/" element={
          <RouteGuard accessesBusinessData>
            <TenantLayout />
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
