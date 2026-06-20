// Menu categories for dashboard navigation

export interface MenuCategory {
  id: string
  label: string
  icon?: React.ReactNode
  items: MenuItem[]
}

export interface MenuItem {
  id: string
  label: string
  path?: string
  icon?: React.ReactNode
  badge?: string | number
  badgeColor?: 'primary' | 'success' | 'warning' | 'error' | 'info'
  children?: MenuItem[]
  permission?: string
  roles?: string[]
  external?: boolean
  disabled?: boolean
}

// Dashboard menu categories
export const dashboardMenuCategories: MenuCategory[] = [
  {
    id: 'main',
    label: 'Main',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        path: '/dashboard',
        icon: 'Home',
      },
      {
        id: 'analytics',
        label: 'Analytics',
        path: '/analytics',
        icon: 'BarChart',
      },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      {
        id: 'sales',
        label: 'Sales',
        path: '/sales',
        icon: 'ShoppingCart',
        badge: 5,
        badgeColor: 'success',
      },
      {
        id: 'pos',
        label: 'POS',
        path: '/pos',
        icon: 'Calculator',
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    items: [
      {
        id: 'products',
        label: 'Products',
        path: '/products',
        icon: 'Box',
      },
      {
        id: 'categories',
        label: 'Categories',
        path: '/categories',
        icon: 'Folder',
      },
      {
        id: 'stock',
        label: 'Stock Management',
        path: '/stock',
        icon: 'Warehouse',
        children: [
          {
            id: 'stock-levels',
            label: 'Stock Levels',
            path: '/stock/levels',
          },
          {
            id: 'stock-adjustments',
            label: 'Adjustments',
            path: '/stock/adjustments',
          },
          {
            id: 'stock-transfers',
            label: 'Transfers',
            path: '/stock/transfers',
          },
        ],
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      {
        id: 'sales-reports',
        label: 'Sales Reports',
        path: '/reports/sales',
        icon: 'TrendingUp',
      },
      {
        id: 'inventory-reports',
        label: 'Inventory Reports',
        path: '/reports/inventory',
        icon: 'FileText',
      },
      {
        id: 'financial-reports',
        label: 'Financial Reports',
        path: '/reports/financial',
        icon: 'DollarSign',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      {
        id: 'business-settings',
        label: 'Business Settings',
        path: '/settings/business',
        icon: 'Settings',
      },
      {
        id: 'users',
        label: 'Users & Permissions',
        path: '/settings/users',
        icon: 'Users',
        permission: 'manage_users',
      },
      {
        id: 'integrations',
        label: 'Integrations',
        path: '/settings/integrations',
        icon: 'Plug',
      },
    ],
  },
]

// Admin menu categories
export const adminMenuCategories: MenuCategory[] = [
  {
    id: 'admin',
    label: 'Admin',
    items: [
      {
        id: 'admin-dashboard',
        label: 'Admin Dashboard',
        path: '/admin',
        icon: 'Shield',
        roles: ['saas_admin'],
      },
      {
        id: 'tenants',
        label: 'Tenants',
        path: '/admin/tenants',
        icon: 'Building',
        roles: ['saas_admin'],
      },
      {
        id: 'subscriptions',
        label: 'Subscriptions',
        path: '/admin/subscriptions',
        icon: 'CreditCard',
        roles: ['saas_admin'],
      },
      {
        id: 'billing',
        label: 'Billing',
        path: '/admin/billing',
        icon: 'Receipt',
        roles: ['saas_admin'],
      },
    ],
  },
]

export default dashboardMenuCategories
