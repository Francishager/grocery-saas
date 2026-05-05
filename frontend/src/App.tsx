import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { useAuthStore } from '@/stores/auth-store'
import { Layout } from '@/components/layout/Layout'

// Pages
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import SalesPage from '@/pages/SalesPage'
import InventoryPage from '@/pages/InventoryPage'
import PurchasesPage from '@/pages/PurchasesPage'
import ReportsPage from '@/pages/ReportsPage'
import AdminPage from '@/pages/admin/AdminPage'

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// Public Route Component (redirects to dashboard if already logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
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

        {/* Protected Routes */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={
            <ProtectedRoute allowedRoles={['Owner', 'Accountant', 'Manager']}>
              <DashboardPage />
            </ProtectedRoute>
          } />
          <Route path="sales" element={
            <ProtectedRoute allowedRoles={['Owner', 'Attendant', 'Manager']}>
              <SalesPage />
            </ProtectedRoute>
          } />
          <Route path="inventory" element={
            <ProtectedRoute allowedRoles={['Owner', 'Manager', 'Accountant']}>
              <InventoryPage />
            </ProtectedRoute>
          } />
          <Route path="purchases" element={
            <ProtectedRoute allowedRoles={['Owner', 'Manager', 'Accountant']}>
              <PurchasesPage />
            </ProtectedRoute>
          } />
          <Route path="reports" element={
            <ProtectedRoute allowedRoles={['Owner', 'Accountant']}>
              <ReportsPage />
            </ProtectedRoute>
          } />
          <Route path="admin" element={
            <ProtectedRoute allowedRoles={['SaaS Admin']}>
              <AdminPage />
            </ProtectedRoute>
          } />
        </Route>

        {/* Catch all - redirect to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
