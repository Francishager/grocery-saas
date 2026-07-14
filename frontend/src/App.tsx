import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { initSync } from '@/db/sync'
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
import RentalsPage from '@/pages/RentalsPage'
import ReturnsPage from '@/pages/ReturnsPage'
import AccountingPage from '@/pages/accounting/AccountingPage'
import TransactionAccountsPage from '@/pages/accounting/TransactionAccountsPage'
import StaffTillSheetPage from '@/pages/accounting/StaffTillSheetPage'
import DataImporterPage from '@/pages/inventory/DataImporterPage'
import HRPage from '@/pages/HRPage'
import TransfersPage from '@/pages/TransfersPage'
import CommunicationPage from '@/pages/CommunicationPage'
import IntegrationsPage from '@/pages/IntegrationsPage'
import RestaurantPage from '@/pages/RestaurantPage'
import FuelStationPage from '@/pages/FuelStationPage'
import ManufacturingPage from '@/pages/ManufacturingPage'
import AgriculturePage from '@/pages/AgriculturePage'
import ServiceBusinessPage from '@/pages/ServiceBusinessPage'
import UserProfilePage from '@/pages/UserProfilePage'
import ReferralPage from '@/pages/ReferralPage'
import ExpensesPage from '@/pages/expenses/ExpensesPage'
 
// SaaS Admin Pages
import SaaSAdminDashboard from '@/pages/SaaSAdmin/Dashboard'
import BusinessesPage from '@/pages/SaaSAdmin/BusinessesPage'
import ProvisionPage from '@/pages/SaaSAdmin/ProvisionPage'
import PlansPage from '@/pages/SaaSAdmin/PlansPage'
import FeaturesPage from '@/pages/SaaSAdmin/FeaturesPage'
import OwnersPage from '@/pages/SaaSAdmin/OwnersPage'
import SubscriptionsPage from '@/pages/SaaSAdmin/SubscriptionsPage'
import InvitationsList from '@/pages/SaaSAdmin/InvitationsList'
import TenantDetailPage from '@/pages/SaaSAdmin/TenantDetailPage'
import PlatformAuditPage from '@/pages/SaaSAdmin/PlatformAuditPage'
import ReferralDashboard from '@/pages/SaaSAdmin/ReferralDashboard'
import UserGuidePage from '@/pages/SaaSAdmin/UserGuidePage'
 
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
  const { isAuthenticated, isPlatformUser } = useJWTAuth()
  useEffect(() => { if (isAuthenticated && !isPlatformUser()) initSync() }, [isAuthenticated, isPlatformUser])

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
          <Route path="businesses/:tenantId" element={<TenantDetailPage />} />
          <Route path="audit" element={<PlatformAuditPage />} />
          <Route path="referrals" element={<ReferralDashboard />} />
          <Route path="user-guide" element={<UserGuidePage />} />
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
          <Route path="inventory" element={<Navigate to="/tenant/inventory/products" replace />} />
          <Route path="inventory/:tab" element={<FeatureGuard feature="inventory"><InventoryPage /></FeatureGuard>} />
          <Route path="purchases" element={<Navigate to="/tenant/payables" replace />} />
          <Route path="receivables" element={<Navigate to="/tenant/receivables/customers" replace />} />
          <Route path="receivables/:tab" element={<FeatureGuard feature="receivables"><ReceivablesPage /></FeatureGuard>} />
          <Route path="payables" element={<FeatureGuard feature="payables"><PayablesPage /></FeatureGuard>} />
          <Route path="rentals" element={<FeatureGuard feature="rentals"><RentalsPage /></FeatureGuard>} />
          <Route path="returns" element={<FeatureGuard feature="sales.returns"><ReturnsPage /></FeatureGuard>} />
          <Route path="accounting" element={<FeatureGuard feature="accounting" permission={['canViewAccounting', 'canViewExpense', 'canCreateExpense', 'canViewFinancialReport']}><AccountingPage /></FeatureGuard>} />
          <Route path="accounting/expenses" element={<FeatureGuard feature="expenses" permission={['canViewAccounting', 'canViewExpense', 'canCreateExpense', 'canViewFinancialReport']}><ExpensesPage /></FeatureGuard>} />
          <Route path="accounting/transactions" element={<FeatureGuard feature="accounting"><TransactionAccountsPage /></FeatureGuard>} />
          <Route path="accounting/staff-till" element={<FeatureGuard feature="accounting" permission="canViewStaffTillSheet"><StaffTillSheetPage /></FeatureGuard>} />
          <Route path="data-importer" element={<FeatureGuard feature="inventory"><DataImporterPage /></FeatureGuard>} />
          <Route path="hr" element={<FeatureGuard feature="hr"><HRPage /></FeatureGuard>} />
          <Route path="transfers" element={<FeatureGuard feature="inventory.transfers"><TransfersPage /></FeatureGuard>} />
          <Route path="communication" element={<FeatureGuard feature="communication"><CommunicationPage /></FeatureGuard>} />
          <Route path="integrations" element={<FeatureGuard feature="integrations"><IntegrationsPage /></FeatureGuard>} />
          <Route path="restaurant" element={<FeatureGuard feature="restaurant"><RestaurantPage /></FeatureGuard>} />
          <Route path="fuel-station" element={<Navigate to="/tenant/fuel-station/tanks" replace />} />
          <Route path="fuel-station/:tab" element={<FeatureGuard feature="fuel_station" permission="canViewFuelStation"><FuelStationPage /></FeatureGuard>} />
          <Route path="manufacturing" element={<FeatureGuard feature="manufacturing"><ManufacturingPage /></FeatureGuard>} />
          <Route path="agriculture" element={<FeatureGuard feature="agriculture"><AgriculturePage /></FeatureGuard>} />
          <Route path="service" element={<Navigate to="/tenant/service/appointments" replace />} />
          <Route path="service/:tab" element={<FeatureGuard feature={["service", "fuel_station.car_wash", "fuel_station.garage", "fuel_station"]}><ServiceBusinessPage /></FeatureGuard>} />
          <Route path="reports" element={<FeatureGuard feature="reports"><ReportsPage /></FeatureGuard>} />
          <Route path="audit" element={<FeatureGuard feature="audit"><AuditLogPage /></FeatureGuard>} />
          <Route path="branches" element={<FeatureGuard feature="multi_branch"><BranchesPage /></FeatureGuard>} />
          <Route path="staff" element={<FeatureGuard feature="settings.users"><StaffPage /></FeatureGuard>} />
          <Route path="profile" element={<UserProfilePage />} />
          <Route path="referrals" element={<ReferralPage />} />
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
