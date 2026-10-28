import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { AppFeedback } from '@/lib/appFeedback'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { RoleRoute } from '@/guard/RoleRoute'
import { FeatureGuard } from '@/components/FeatureGuard'
import { PwaRefreshControl } from '@/components/PwaRefreshControl'
 

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const SaaSAdminLoginPage = lazy(() => import('@/pages/auth/SaaSAdminLoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const AcceptInvitation = lazy(() => import('@/pages/auth/AcceptInvitation'))
const UnauthorizedPage = lazy(() => import('@/pages/auth/UnauthorizedPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const SalesPage = lazy(() => import('@/pages/SalesPage'))
const InventoryPage = lazy(() => import('@/pages/InventoryPage'))
const BusinessAdvisorPage = lazy(() => import('@/pages/BusinessAdvisorPage'))
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'))
const BranchesPage = lazy(() => import('@/pages/BranchesPage'))
const TrashPage = lazy(() => import('@/pages/TrashPage'))
const StaffPage = lazy(() => import('@/pages/StaffPage'))
const BusinessSettingsPage = lazy(() => import('@/pages/BusinessSettingsPage'))
const RolesPermissionsPage = lazy(() => import('@/pages/RolesPermissionsPage'))
const TaxManagementPage = lazy(() => import('@/pages/TaxManagementPage'))
const ReceiptSettingsPage = lazy(() => import('@/pages/ReceiptSettingsPage'))
const ReceivablesPage = lazy(() => import('@/pages/receivables/ReceivablesPage'))
const CustomerProfilePage = lazy(() => import('@/pages/receivables/CustomerProfilePage'))
const ReceivableReconciliationPage = lazy(() => import('@/pages/receivables/ReceivableReconciliationPage'))
const PayablesPage = lazy(() => import('@/pages/receivables/PayablesPage'))
const RentalsPage = lazy(() => import('@/pages/RentalsPage'))
const RentalItemsPage = lazy(() => import('@/pages/RentalItemsPage'))
const RentalPaymentsPage = lazy(() => import('@/pages/RentalPaymentsPage'))
const RentalCRMPage = lazy(() => import('@/pages/CRMPage'))
const RentalPlannerPage = lazy(() => import('@/pages/RentalPlannerPage'))
const PropertyManagementPage = lazy(() => import('@/pages/PropertyManagementPage'))
const ReturnsPage = lazy(() => import('@/pages/ReturnsPage'))
const AccountingPage = lazy(() => import('@/pages/accounting/AccountingPage'))
const TransactionAccountsPage = lazy(() => import('@/pages/accounting/TransactionAccountsPage'))
const StaffTillSheetPage = lazy(() => import('@/pages/accounting/StaffTillSheetPage'))
const DataImporterPage = lazy(() => import('@/pages/inventory/DataImporterPage'))
const HRPage = lazy(() => import('@/pages/HRPage'))
const HRAccountingConfigPage = lazy(() => import('@/pages/HRAccountingConfigPage'))
const DepartmentManagementPage = lazy(() => import('@/pages/hr/DepartmentManagementPage'))
const PositionManagementPage = lazy(() => import('@/pages/hr/PositionManagementPage'))
const EmployeeManagementPage = lazy(() => import('@/pages/hr/EmployeeManagementPage'))
const ContractManagementPage = lazy(() => import('@/pages/hr/ContractManagementPage'))
const DocumentManagementPage = lazy(() => import('@/pages/hr/DocumentManagementPage'))
const UnitTeamManagementPage = lazy(() => import('@/pages/hr/UnitTeamManagementPage'))
const AttendanceListPage = lazy(() => import('@/pages/hr/AttendanceListPage'))
const AttendanceCheckPage = lazy(() => import('@/pages/hr/AttendanceCheckPage'))
const ShiftManagementPage = lazy(() => import('@/pages/hr/ShiftManagementPage'))
const LeaveRequestPage = lazy(() => import('@/pages/hr/LeaveRequestPage'))
const LeaveApprovalPage = lazy(() => import('@/pages/hr/LeaveApprovalPage'))
const TransfersPage = lazy(() => import('@/pages/TransfersPage'))
const CommunicationPage = lazy(() => import('@/pages/CommunicationPage'))
const IntegrationsPage = lazy(() => import('@/pages/IntegrationsPage'))
const RestaurantPage = lazy(() => import('@/pages/RestaurantPage'))
const FuelStationPage = lazy(() => import('@/pages/FuelStationPage'))
const ManufacturingPage = lazy(() => import('@/pages/ManufacturingPage'))
const AgriculturePage = lazy(() => import('@/pages/AgriculturePage'))
const ServiceBusinessPage = lazy(() => import('@/pages/ServiceBusinessPage'))
const PublicServiceFeedbackPage = lazy(() => import('@/pages/PublicServiceFeedbackPage'))
const UserProfilePage = lazy(() => import('@/pages/UserProfilePage'))
const ReferralPage = lazy(() => import('@/pages/ReferralPage'))
const ExpensesPage = lazy(() => import('@/pages/expenses/ExpensesPage'))
const CreditDebitNotesPage = lazy(() => import('@/pages/CreditDebitNotesPage'))
const PaymentPage = lazy(() => import('@/pages/PaymentPage'))
const ProcurementNetworkPage = lazy(() => import('@/pages/ProcurementNetworkPage'))
const SaaSAdminDashboard = lazy(() => import('@/pages/SaaSAdmin/Dashboard'))
const BusinessesPage = lazy(() => import('@/pages/SaaSAdmin/BusinessesPage'))
const ProvisionPage = lazy(() => import('@/pages/SaaSAdmin/ProvisionPage'))
const PlansPage = lazy(() => import('@/pages/SaaSAdmin/PlansPage'))
const FeaturesPage = lazy(() => import('@/pages/SaaSAdmin/FeaturesPage'))
const HRModuleSettingsPage = lazy(() => import('@/pages/SaaSAdmin/HRModuleSettingsPage'))
const OwnersPage = lazy(() => import('@/pages/SaaSAdmin/OwnersPage'))
const SubscriptionsPage = lazy(() => import('@/pages/SaaSAdmin/SubscriptionsPage'))
const InvitationsList = lazy(() => import('@/pages/SaaSAdmin/InvitationsList'))
const TenantDetailPage = lazy(() => import('@/pages/SaaSAdmin/TenantDetailPage'))
const PlatformAuditPage = lazy(() => import('@/pages/SaaSAdmin/PlatformAuditPage'))
const ReferralDashboard = lazy(() => import('@/pages/SaaSAdmin/ReferralDashboard'))
const UserGuidePage = lazy(() => import('@/pages/SaaSAdmin/UserGuidePage'))
const ManufacturingGuidePage = lazy(() => import('@/pages/SaaSAdmin/ManufacturingGuidePage'))
const ProcurementGuidePage = lazy(() => import('@/pages/SaaSAdmin/ProcurementGuidePage'))
const FuelStationGuidePage = lazy(() => import('@/pages/SaaSAdmin/FuelStationGuidePage'))
const PlatformStaffPage = lazy(() => import('@/pages/SaaSAdmin/PlatformStaffPage'))
const SaaSAdminLayout = lazy(() => import('@/components/layout/SaaSAdminLayout').then(module => ({ default: module.SaaSAdminLayout })))
const TenantLayout = lazy(() => import('@/components/layout/TenantLayout').then(module => ({ default: module.TenantLayout })))
 
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
  useEffect(() => {
    if (!isAuthenticated || isPlatformUser()) return
    let cancelled = false
    void import('@/db/sync').then(({ initSync }) => {
      if (!cancelled) return initSync()
    }).catch((error) => console.error('Offline data sync could not start:', error))
    return () => { cancelled = true }
  }, [isAuthenticated, isPlatformUser])

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-muted-foreground" role="status">Loading page...</div>}>
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
          <ForgotPasswordPage />
        } />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />
        <Route path="/service-feedback/:token" element={<PublicServiceFeedbackPage />} />
 
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
          <Route path="hr-settings" element={<HRModuleSettingsPage />} />
          <Route path="invitations" element={<InvitationsList />} />
          <Route path="owners" element={<OwnersPage />} />
          <Route path="staff" element={<PlatformStaffPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="businesses/:tenantId" element={<TenantDetailPage />} />
          <Route path="audit" element={<PlatformAuditPage />} />
          <Route path="referrals" element={<ReferralDashboard />} />
          <Route path="user-guide" element={<UserGuidePage />} />
          <Route path="manufacturing-guide" element={<ManufacturingGuidePage />} />
          <Route path="procurement-guide" element={<ProcurementGuidePage />} />
          <Route path="fuel-station-guide" element={<FuelStationGuidePage />} />
          <Route path="payment" element={<PaymentPage />} />
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
          <Route path="ai-advisor" element={<FeatureGuard feature="dashboard" permission="canUseBusinessAI"><BusinessAdvisorPage /></FeatureGuard>} />
          <Route path="sales" element={<FeatureGuard feature="sales"><SalesPage /></FeatureGuard>} />
          <Route path="inventory" element={<Navigate to="/tenant/inventory/products" replace />} />
          <Route path="inventory/rentals" element={<FeatureGuard feature="rentals" permission="canViewRental"><RentalItemsPage /></FeatureGuard>} />
          <Route path="inventory/:tab" element={<FeatureGuard feature="inventory"><InventoryPage /></FeatureGuard>} />
          <Route path="purchases" element={<Navigate to="/tenant/payables" replace />} />
          <Route path="receivables" element={<Navigate to="/tenant/receivables/customers" replace />} />
          <Route path="receivables/reconciliation" element={<FeatureGuard feature="receivables" permission="canViewReceivableReconciliation"><ReceivableReconciliationPage /></FeatureGuard>} />
          <Route path="receivables/customers/:customerId" element={<FeatureGuard feature="receivables"><CustomerProfilePage /></FeatureGuard>} />
          <Route path="receivables/:tab" element={<FeatureGuard feature="receivables"><ReceivablesPage /></FeatureGuard>} />
          <Route path="payables" element={<FeatureGuard feature="payables"><PayablesPage /></FeatureGuard>} />
          <Route path="procurement" element={<Navigate to="/tenant/procurement/buying/marketplace" replace />} />
          <Route path="procurement/buying" element={<Navigate to="/tenant/procurement/buying/marketplace" replace />} />
          <Route path="procurement/buying/marketplace" element={<FeatureGuard feature="procurement.buyer" permission="canViewProcurement"><ProcurementNetworkPage mode="buyer" section="marketplace" /></FeatureGuard>} />
          <Route path="procurement/buying/rfqs" element={<FeatureGuard feature="procurement.buyer" permission="canViewProcurement"><ProcurementNetworkPage mode="buyer" section="rfqs" /></FeatureGuard>} />
          <Route path="procurement/buying/purchases" element={<FeatureGuard feature="procurement.buyer" permission="canViewProcurement"><ProcurementNetworkPage mode="buyer" section="orders" /></FeatureGuard>} />
          <Route path="procurement/buying/suppliers" element={<FeatureGuard feature="procurement.buyer" permission="canViewProcurement"><ProcurementNetworkPage mode="buyer" section="relationships" /></FeatureGuard>} />
          <Route path="procurement/buying/sellers/:sellerTenantId" element={<FeatureGuard feature="procurement.buyer" permission="canViewProcurement"><ProcurementNetworkPage mode="buyer" section="seller-profile" /></FeatureGuard>} />
          <Route path="procurement/selling" element={<Navigate to="/tenant/procurement/selling/studio" replace />} />
          <Route path="procurement/selling/studio" element={<FeatureGuard feature="procurement.seller" permission="canViewProcurement"><ProcurementNetworkPage mode="seller" section="marketplace" /></FeatureGuard>} />
          <Route path="procurement/selling/rfqs" element={<FeatureGuard feature="procurement.seller" permission="canViewProcurement"><ProcurementNetworkPage mode="seller" section="rfqs" /></FeatureGuard>} />
          <Route path="procurement/selling/fulfilment" element={<FeatureGuard feature="procurement.seller" permission="canViewProcurement"><ProcurementNetworkPage mode="seller" section="orders" /></FeatureGuard>} />
          <Route path="procurement/selling/buyers" element={<FeatureGuard feature="procurement.seller" permission="canViewProcurement"><ProcurementNetworkPage mode="seller" section="relationships" /></FeatureGuard>} />
          <Route path="procurement/selling/profile" element={<FeatureGuard feature="procurement.seller" permission="canViewProcurement"><ProcurementNetworkPage mode="seller" section="profile" /></FeatureGuard>} />
          <Route path="credit-debit-notes" element={<FeatureGuard feature="accounting" permission={['canViewReceivable', 'canViewPayable', 'canViewAccounting']}><CreditDebitNotesPage /></FeatureGuard>} />
          <Route path="credit-debit-notes/:tab" element={<FeatureGuard feature="accounting" permission={['canViewReceivable', 'canViewPayable', 'canViewAccounting']}><CreditDebitNotesPage /></FeatureGuard>} />
          <Route path="rentals" element={<Navigate to="/tenant/rentals/bookings" replace />} />
          <Route path="rentals/bookings" element={<FeatureGuard feature="rentals" permission="canViewRental"><RentalsPage section="bookings" /></FeatureGuard>} />
          <Route path="rentals/planner" element={<FeatureGuard feature={['rentals', 'planner']} permission={['canViewRental', 'canViewPlanner', 'canManagePlanner']}><RentalPlannerPage /></FeatureGuard>} />
          <Route path="rentals/crm" element={<FeatureGuard feature={['rentals', 'crm']} permission={['canViewRental', 'canViewCRM']}><RentalCRMPage /></FeatureGuard>} />
          <Route path="rentals/returns" element={<FeatureGuard feature="rentals" permission="canViewRental"><RentalsPage section="returns" /></FeatureGuard>} />
          <Route path="rentals/items" element={<Navigate to="/tenant/inventory/rentals" replace />} />
          <Route path="rentals/payments" element={<FeatureGuard feature="rentals" permission="canViewRental"><RentalPaymentsPage /></FeatureGuard>} />
          <Route path="property-management" element={<Navigate replace to="/tenant/property-management/portfolio" />} />
          <Route path="property-management/:tab" element={<FeatureGuard feature={['property_management.landlord', 'property_management.agent']} permission={['canViewPropertyPortfolio', 'canViewPropertyManagement', 'canViewPropertyCollections', 'canViewPropertyReports', 'canViewPropertyStatements', 'canManageTenancies', 'canViewPropertySales', 'canViewPropertyLandPurchases', 'canCreatePropertyLandPurchase', 'canRecordPropertyLandPurchasePayment']}><PropertyManagementPage /></FeatureGuard>} />
          <Route path="returns" element={<FeatureGuard feature="sales.returns"><ReturnsPage /></FeatureGuard>} />
          <Route path="accounting" element={<FeatureGuard feature="accounting" permission={['canViewAccounting', 'canCreateAccounting', 'canEditAccounting', 'canDeleteAccounting', 'canReverseAccountingEntry', 'canViewChartOfAccounts', 'canCreateChartOfAccounts', 'canEditChartOfAccounts']}><AccountingPage /></FeatureGuard>} />
          <Route path="accounting/expenses" element={<FeatureGuard feature="expenses" permission={['canViewAccounting', 'canViewExpense', 'canCreateExpense']}><ExpensesPage /></FeatureGuard>} />
          <Route path="accounting/transactions" element={<FeatureGuard feature={['accounting', 'expenses']} permission="canViewTransactionAccount"><TransactionAccountsPage /></FeatureGuard>} />
          <Route path="accounting/staff-till" element={<FeatureGuard feature="accounting" permission="canViewStaffTillSheet"><StaffTillSheetPage /></FeatureGuard>} />
          <Route path="data-importer" element={<FeatureGuard feature="developer.data_importer"><DataImporterPage /></FeatureGuard>} />
          <Route path="hr" element={<Navigate to="/tenant/dashboard" replace />} />
          {/* Phase 1 HR Core Routes */}
          <Route path="hr/departments" element={<FeatureGuard feature="hr" permission={['canViewHR', 'canManageHRStructure']}><DepartmentManagementPage /></FeatureGuard>} />
          <Route path="hr/positions" element={<FeatureGuard feature="hr" permission={['canViewHR', 'canManageHRStructure']}><PositionManagementPage /></FeatureGuard>} />
          <Route path="hr/employees" element={<FeatureGuard feature="hr" permission={['canViewHR', 'canCreateHREmployee', 'canEditHREmployee', 'canDeleteHREmployee']}><EmployeeManagementPage /></FeatureGuard>} />
          <Route path="hr/contracts" element={<FeatureGuard feature="hr" permission={['canViewHRContracts', 'canManageHRContracts']}><ContractManagementPage /></FeatureGuard>} />
          <Route path="hr/documents" element={<FeatureGuard feature="hr" permission={['canViewHRDocuments', 'canManageHRDocuments']}><DocumentManagementPage /></FeatureGuard>} />
          <Route path="hr/units-teams" element={<FeatureGuard feature="hr" permission={['canViewHR', 'canManageHRStructure']}><UnitTeamManagementPage /></FeatureGuard>} />
          <Route path="hr/accounting" element={<FeatureGuard feature="hr" permission={['canViewHRPayroll', 'canCreateHRPayroll', 'canApproveHRPayroll', 'canPostHRPayroll', 'canPayHRPayroll', 'canManageHRPayrollSettings', 'canManageHRPayroll']}><HRAccountingConfigPage /></FeatureGuard>} />
          <Route path="hr/accounting/calculator" element={<FeatureGuard feature="hr" permission={['canViewHR', 'canViewHRPayroll', 'canCreateHRPayroll', 'canManageHRPayroll']}><HRAccountingConfigPage view="calculator" /></FeatureGuard>} />
          <Route path="hr/accounting/:tab" element={<FeatureGuard feature="hr" permission={['canViewHRPayroll', 'canCreateHRPayroll', 'canApproveHRPayroll', 'canPostHRPayroll', 'canPayHRPayroll', 'canManageHRPayrollSettings', 'canManageHRPayroll']}><HRAccountingConfigPage /></FeatureGuard>} />
          <Route path="hr/settings" element={<Navigate to="/tenant/roles" replace />} />
          <Route path="hr/legacy" element={<FeatureGuard feature="hr" permission="canViewHR"><HRPage /></FeatureGuard>} />
          {/* Phase 2 HR Attendance, Shift, Leave Routes */}
          <Route path="hr/attendance" element={<FeatureGuard feature="hr" permission={['canViewHRAttendance', 'canEditHRAttendance', 'canDeleteHRAttendance', 'canImportHRAttendance', 'canApproveHRAttendance', 'canManageHRAttendance']}><AttendanceListPage /></FeatureGuard>} />
          <Route path="hr/attendance/check" element={<FeatureGuard feature="hr" permission={['canRecordHRAttendance', 'canRecordOwnHRAttendance', 'canManageHRAttendance']}><AttendanceCheckPage /></FeatureGuard>} />
          <Route path="hr/shifts" element={<FeatureGuard feature="hr" permission="canViewHRShifts"><ShiftManagementPage /></FeatureGuard>} />
          <Route path="hr/leaves" element={<FeatureGuard feature="hr" permission={['canViewHRLeave', 'canRequestHRLeave']}><LeaveRequestPage /></FeatureGuard>} />
          <Route path="hr/leaves/approval" element={<FeatureGuard feature="hr" permission="canApproveHRLeave"><LeaveApprovalPage /></FeatureGuard>} />
          <Route path="transfers" element={<FeatureGuard feature="inventory.transfers"><TransfersPage /></FeatureGuard>} />
          <Route path="communication" element={<FeatureGuard feature="communication"><CommunicationPage /></FeatureGuard>} />
          <Route path="integrations" element={<FeatureGuard feature="integrations"><IntegrationsPage /></FeatureGuard>} />
          <Route path="restaurant" element={<Navigate to="/tenant/dashboard" replace />} />
          <Route path="restaurant/dashboard" element={<Navigate to="/tenant/dashboard" replace />} />
          <Route path="restaurant/:tab" element={<FeatureGuard feature="restaurant" permission="canViewRestaurant"><RestaurantPage /></FeatureGuard>} />
          <Route path="fuel-station" element={<Navigate to="/tenant/fuel-station/tanks" replace />} />
          <Route path="fuel-station/:tab" element={<FeatureGuard feature="fuel_station" permission="canViewFuelStation"><FuelStationPage /></FeatureGuard>} />
          <Route path="manufacturing" element={<FeatureGuard feature="manufacturing"><ManufacturingPage /></FeatureGuard>} />
          <Route path="agriculture" element={<FeatureGuard feature="agriculture"><AgriculturePage /></FeatureGuard>} />
          <Route path="service" element={<FeatureGuard feature="service"><ServiceBusinessPage /></FeatureGuard>} />
          <Route path="service/:tab" element={<FeatureGuard feature="service"><ServiceBusinessPage /></FeatureGuard>} />
          <Route path="reports" element={<FeatureGuard feature={['reports', 'property_management.landlord', 'property_management.agent']}><ReportsPage /></FeatureGuard>} />
          <Route path="audit" element={<FeatureGuard feature="audit"><AuditLogPage /></FeatureGuard>} />
          <Route path="branches" element={<FeatureGuard feature="multi_branch"><BranchesPage /></FeatureGuard>} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="staff" element={<FeatureGuard feature="settings.users"><StaffPage /></FeatureGuard>} />
          <Route path="profile" element={<UserProfilePage />} />
          <Route path="referrals" element={<FeatureGuard feature="referrals"><ReferralPage /></FeatureGuard>} />
          <Route path="settings" element={<FeatureGuard feature="settings"><BusinessSettingsPage /></FeatureGuard>} />
          <Route path="tax" element={<FeatureGuard feature="settings.taxes"><TaxManagementPage /></FeatureGuard>} />
          <Route path="receipt-settings" element={<FeatureGuard feature="settings"><ReceiptSettingsPage /></FeatureGuard>} />
          <Route path="roles" element={<FeatureGuard feature="settings.roles"><RolesPermissionsPage /></FeatureGuard>} />
          <Route path="admin" element={<Navigate to="/tenant/roles" replace />} />
          <Route path="payment" element={<PaymentPage />} />
        </Route>

        {/* ========== Catch-all ========== */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
      <PwaRefreshControl />
      <Toaster />
      <AppFeedback />
    </BrowserRouter>
  )
}

export default App
