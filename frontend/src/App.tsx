import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { SaaSAdminLayout } from '@/components/layout/SaaSAdminLayout'
import { TenantLayout } from '@/components/layout/TenantLayout'
import { RoleRoute } from '@/guard/RoleRoute'
import { FeatureGuard } from '@/components/FeatureGuard'
 
// Auth Pages
import LoginPage from '@/pages/auth/LoginPage'
import SaaSAdminLoginPage from '@/pages/auth/SaaSAdminLoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import AcceptInvitation from '@/pages/auth/AcceptInvitation'
import UnauthorizedPage from '@/pages/auth/UnauthorizedPage'
 
// Tenant (Business) Pages
import DashboardPage from '@/pages/DashboardPage'
import SalesPage from '@/pages/SalesPage'
import InventoryPage from '@/pages/InventoryPage'
import ReportsPage from '@/pages/ReportsPage'
import AuditLogPage from '@/pages/AuditLogPage'
import BranchesPage from '@/pages/BranchesPage'
import StaffPage from '@/pages/StaffPage'
import BusinessSettingsPage from '@/pages/BusinessSettingsPage'
import RolesPermissionsPage from '@/pages/RolesPermissionsPage'
import TaxManagementPage from '@/pages/TaxManagementPage'
import ReceiptSettingsPage from '@/pages/ReceiptSettingsPage'
import ReceivablesPage from '@/pages/receivables/ReceivablesPage'
import PayablesPage from '@/pages/receivables/PayablesPage'
import ExpensesPage from '@/pages/expenses/ExpensesPage'
import RentalsPage from '@/pages/RentalsPage'
import UserProfilePage from '@/pages/UserProfilePage'
 
// SaaS Admin Pages
import SaaSAdminDashboard from '@/pages/SaaSAdmin/Dashboard'
import BusinessesPage from '@/pages/SaaSAdmin/BusinessesPage'
import ProvisionPage from '@/pages/SaaSAdmin/ProvisionPage'
import PlansPage from '@/pages/SaaSAdmin/PlansPage'
import FeaturesPage from '@/pages/SaaSAdmin/FeaturesPage'
import OwnersPage from '@/pages/SaaSAdmin/OwnersPage'
import SubscriptionsPage from '@/pages/SaaSAdmin/SubscriptionsPage'
import InvitationsList from '@/pages/SaaSAdmin/InvitationsList'
 
// Public Route — redirects logged-in users to their dashboard
function PublicRoute({ children, redirectTo = '/tenant/dashboard' }: { children: React.ReactNode; redirectTo?: string }) {
  const { isAuthenticated, isPlatformUser } = useJWTAuth()
 
  if (isAuthenticated) {
    const dest = isPlatformUser() ? '/saas/dashboard' : redirectTo
    return <Navigate to={dest} replace />
  }
 
  return <>{children}</>
}
 
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ========== Public Routes ========== */}
        <Route path="/login" element={
          <PublicRoute redirectTo="/tenant/dashboard">
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
 
        {/* ========== SaaS Admin Routes — /saas/* ========== */}
        <Route
          path="/saas"
          element={
            <RoleRoute roles={['saas_admin']} loginPath="/saas/login">
              <SaaSAdminLayout />
            </RoleRoute>
          }
        >
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
 
        {/* ========== Tenant (Business) Routes — /tenant/* ========== */}
        <Route
          path="/tenant"
          element={
            <RoleRoute roles={['owner', 'manager', 'accountant', 'attendant']} loginPath="/login">
              <TenantLayout />
            </RoleRoute>
          }
        >
          <Route index element={<Navigate to="/tenant/dashboard" replace />} />
          <Route path="dashboard" element={<FeatureGuard feature="dashboard"><DashboardPage /></FeatureGuard>} />
          <Route path="sales" element={<FeatureGuard feature="sales"><SalesPage /></FeatureGuard>} />
          <Route path="inventory" element={<FeatureGuard feature="inventory"><InventoryPage /></FeatureGuard>} />
          <Route path="purchases" element={<Navigate to="/tenant/payables" replace />} />
          <Route path="receivables" element={<FeatureGuard feature="receivables"><ReceivablesPage /></FeatureGuard>} />
          <Route path="payables" element={<FeatureGuard feature="payables"><PayablesPage /></FeatureGuard>} />
          <Route path="expenses" element={<FeatureGuard feature="expenses"><ExpensesPage /></FeatureGuard>} />
          <Route path="rentals" element={<FeatureGuard feature="rentals"><RentalsPage /></FeatureGuard>} />
          <Route path="reports" element={<FeatureGuard feature="reports"><ReportsPage /></FeatureGuard>} />
          <Route path="audit" element={<FeatureGuard feature="audit"><AuditLogPage /></FeatureGuard>} />
          <Route path="branches" element={<FeatureGuard feature="multi_branch"><BranchesPage /></FeatureGuard>} />
          <Route path="staff" element={<FeatureGuard feature="settings.users"><StaffPage /></FeatureGuard>} />
          <Route path="profile" element={<UserProfilePage />} />
          <Route path="settings" element={<FeatureGuard feature="settings"><BusinessSettingsPage /></FeatureGuard>} />
          <Route path="tax" element={<FeatureGuard feature="settings.taxes"><TaxManagementPage /></FeatureGuard>} />
          <Route path="receipt-settings" element={<FeatureGuard feature="settings"><ReceiptSettingsPage /></FeatureGuard>} />
          <Route path="roles" element={<FeatureGuard feature="settings.roles"><RolesPermissionsPage /></FeatureGuard>} />
          <Route path="admin" element={<Navigate to="/tenant/roles" replace />} />
        </Route>

        {/* ========== Catch-all ========== */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
