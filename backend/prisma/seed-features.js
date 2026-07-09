import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function seedFeatures() {
  console.log('🌱 Seeding features...')

  const allFeatures = [
    // ===== Dashboard =====
    { name: 'dashboard', displayName: 'Dashboard', module: 'dashboard', category: 'core', description: 'Main dashboard and business overview' },
    { name: 'dashboard.analytics', displayName: 'Analytics Widgets', module: 'dashboard', category: 'advanced', description: 'Advanced analytics widgets on dashboard' },

    // ===== Sales =====
    { name: 'sales', displayName: 'Sales / POS', module: 'sales', category: 'core', description: 'Point of sale and sales management' },
    { name: 'sales.pos', displayName: 'POS', module: 'sales', category: 'core', description: 'Point of sale interface' },
    { name: 'sales.quotes', displayName: 'Quotes', module: 'sales', category: 'advanced', description: 'Create and manage sales quotes' },
    { name: 'sales.returns', displayName: 'Returns & Refunds', module: 'sales', category: 'advanced', description: 'Process returns and refunds' },
    { name: 'sales.discounts', displayName: 'Discounts', module: 'sales', category: 'advanced', description: 'Apply discounts to sales' },
    { name: 'sales.suspended', displayName: 'Suspended Sales', module: 'sales', category: 'advanced', description: 'Suspend and resume sales transactions' },

    // ===== Inventory =====
    { name: 'inventory', displayName: 'Inventory Management', module: 'inventory', category: 'core', description: 'Product and stock management' },
    { name: 'inventory.products', displayName: 'Products', module: 'inventory', category: 'core', description: 'Manage products' },
    { name: 'inventory.services', displayName: 'Services', module: 'inventory', category: 'core', description: 'Manage service items' },
    { name: 'inventory.rentals', displayName: 'Rental Items', module: 'inventory', category: 'advanced', description: 'Manage rental items' },
    { name: 'inventory.categories', displayName: 'Categories', module: 'inventory', category: 'core', description: 'Manage product categories' },
    { name: 'inventory.brands', displayName: 'Brands', module: 'inventory', category: 'advanced', description: 'Manage product brands' },
    { name: 'inventory.adjustments', displayName: 'Stock Adjustments', module: 'inventory', category: 'advanced', description: 'Adjust stock levels' },
    { name: 'inventory.transfers', displayName: 'Stock Transfers', module: 'inventory', category: 'advanced', description: 'Transfer stock between branches' },
    { name: 'inventory.counts', displayName: 'Stock Counts', module: 'inventory', category: 'advanced', description: 'Stock count / stock take' },
    { name: 'inventory.multi_unit', displayName: 'Multi Units of Measure', module: 'inventory', category: 'advanced', description: 'Multiple selling units per product' },
    { name: 'inventory.batch_numbers', displayName: 'Batch Numbers', module: 'inventory', category: 'advanced', description: 'Track batch numbers' },
    { name: 'inventory.expiry_tracking', displayName: 'Expiry Tracking', module: 'inventory', category: 'advanced', description: 'Track product expiry dates' },
    { name: 'inventory.barcode_printing', displayName: 'Barcode Printing', module: 'inventory', category: 'advanced', description: 'Print product barcodes' },

    // ===== Customers =====
    { name: 'customers', displayName: 'Customer Management', module: 'customers', category: 'core', description: 'Customer profiles and history' },
    { name: 'customers.groups', displayName: 'Customer Groups', module: 'customers', category: 'advanced', description: 'Organize customers into groups' },
    { name: 'customers.loyalty', displayName: 'Loyalty Program', module: 'customers', category: 'advanced', description: 'Customer loyalty points and rewards' },
    { name: 'customers.wallet', displayName: 'Customer Wallet', module: 'customers', category: 'advanced', description: 'Customer digital wallet' },
    { name: 'customers.statements', displayName: 'Customer Statements', module: 'customers', category: 'advanced', description: 'Generate customer statements' },

    // ===== Suppliers =====
    { name: 'suppliers', displayName: 'Supplier Management', module: 'suppliers', category: 'advanced', description: 'Manage suppliers and purchase orders' },
    { name: 'suppliers.purchase_orders', displayName: 'Purchase Orders', module: 'suppliers', category: 'advanced', description: 'Create and manage purchase orders' },
    { name: 'suppliers.grn', displayName: 'Goods Received Notes', module: 'suppliers', category: 'advanced', description: 'Record goods received' },
    { name: 'suppliers.statements', displayName: 'Supplier Statements', module: 'suppliers', category: 'advanced', description: 'Generate supplier statements' },

    // ===== Financial =====
    { name: 'expenses', displayName: 'Expense Tracking', module: 'financial', category: 'advanced', description: 'Track business expenses' },
    { name: 'financial.income', displayName: 'Income Tracking', module: 'financial', category: 'advanced', description: 'Track income sources' },
    { name: 'financial.cashbook', displayName: 'Cashbook', module: 'financial', category: 'advanced', description: 'Cash transaction management' },
    { name: 'financial.bank_accounts', displayName: 'Bank Accounts', module: 'financial', category: 'advanced', description: 'Manage bank accounts' },
    { name: 'financial.petty_cash', displayName: 'Petty Cash', module: 'financial', category: 'advanced', description: 'Petty cash management' },

    // ===== Receivables =====
    { name: 'receivables', displayName: 'Receivables', module: 'receivables', category: 'advanced', description: 'Customer credit and receivables' },
    { name: 'receivables.payments', displayName: 'Customer Payments', module: 'receivables', category: 'advanced', description: 'Record customer payments' },
    { name: 'receivables.aging', displayName: 'Aging Report', module: 'receivables', category: 'advanced', description: 'Receivables aging analysis' },

    // ===== Payables =====
    { name: 'payables', displayName: 'Payables', module: 'payables', category: 'advanced', description: 'Supplier bills and payables' },
    { name: 'payables.payments', displayName: 'Supplier Payments', module: 'payables', category: 'advanced', description: 'Record supplier payments' },
    { name: 'payables.aging', displayName: 'Payables Aging', module: 'payables', category: 'advanced', description: 'Payables aging analysis' },

    // ===== Accounting =====
    { name: 'accounting', displayName: 'Accounting', module: 'accounting', category: 'advanced', description: 'Full accounting module' },
    { name: 'accounting.chart_of_accounts', displayName: 'Chart of Accounts', module: 'accounting', category: 'advanced', description: 'Manage chart of accounts' },
    { name: 'accounting.journal_entries', displayName: 'Journal Entries', module: 'accounting', category: 'advanced', description: 'Create journal entries' },
    { name: 'accounting.general_ledger', displayName: 'General Ledger', module: 'accounting', category: 'advanced', description: 'General ledger reports' },
    { name: 'accounting.trial_balance', displayName: 'Trial Balance', module: 'accounting', category: 'advanced', description: 'Trial balance report' },
    { name: 'accounting.profit_loss', displayName: 'Profit & Loss', module: 'accounting', category: 'advanced', description: 'P&L statement' },
    { name: 'accounting.balance_sheet', displayName: 'Balance Sheet', module: 'accounting', category: 'advanced', description: 'Balance sheet statement' },

    // ===== Reports =====
    { name: 'reports', displayName: 'Reports', module: 'reports', category: 'core', description: 'Basic business reports' },
    { name: 'reports.sales', displayName: 'Sales Reports', module: 'reports', category: 'core', description: 'Sales report categories' },
    { name: 'reports.inventory', displayName: 'Inventory Reports', module: 'reports', category: 'core', description: 'Inventory report categories' },
    { name: 'reports.customers', displayName: 'Customer Reports', module: 'reports', category: 'advanced', description: 'Customer report categories' },
    { name: 'reports.suppliers', displayName: 'Supplier Reports', module: 'reports', category: 'advanced', description: 'Supplier report categories' },
    { name: 'reports.financial', displayName: 'Financial Reports', module: 'reports', category: 'advanced', description: 'Financial report categories' },
    { name: 'reports.audit', displayName: 'Audit Reports', module: 'reports', category: 'advanced', description: 'Audit log reports' },
    { name: 'reports.services', displayName: 'Service Reports', module: 'reports', category: 'advanced', description: 'Service report categories' },
    { name: 'reports.rentals', displayName: 'Rental Reports', module: 'reports', category: 'advanced', description: 'Rental report categories' },
    { name: 'reports.performance', displayName: 'Performance Reports', module: 'reports', category: 'advanced', description: 'Business performance reports' },

    // ===== HR =====
    { name: 'hr', displayName: 'HR Management', module: 'hr', category: 'advanced', description: 'Human resources module' },
    { name: 'hr.employees', displayName: 'Employees', module: 'hr', category: 'advanced', description: 'Manage employees' },
    { name: 'hr.attendance', displayName: 'Attendance', module: 'hr', category: 'advanced', description: 'Track employee attendance' },
    { name: 'hr.payroll', displayName: 'Payroll', module: 'hr', category: 'advanced', description: 'Process payroll' },
    { name: 'hr.leave', displayName: 'Leave Management', module: 'hr', category: 'advanced', description: 'Manage employee leave' },

    // ===== Service Business =====
    { name: 'service', displayName: 'Service Business', module: 'service', category: 'advanced', description: 'Service business module' },
    { name: 'service.appointments', displayName: 'Appointments', module: 'service', category: 'advanced', description: 'Manage service appointments' },
    { name: 'service.work_orders', displayName: 'Work Orders', module: 'service', category: 'advanced', description: 'Create and track work orders' },
    { name: 'service.job_cards', displayName: 'Job Cards', module: 'service', category: 'advanced', description: 'Job card management' },
    { name: 'service.technicians', displayName: 'Technician Assignment', module: 'service', category: 'advanced', description: 'Assign technicians to jobs' },
    { name: 'service.contracts', displayName: 'Service Contracts', module: 'service', category: 'advanced', description: 'Manage service contracts' },
    { name: 'service.reports', displayName: 'Service Reports', module: 'service', category: 'advanced', description: 'Service business reports' },

    // ===== Multi Branch =====
    { name: 'multi_branch', displayName: 'Multi-Branch', module: 'multi_branch', category: 'advanced', description: 'Manage multiple branches' },
    { name: 'multi_branch.transfers', displayName: 'Branch Transfers', module: 'multi_branch', category: 'advanced', description: 'Transfer stock between branches' },
    { name: 'multi_branch.reports', displayName: 'Branch Reports', module: 'multi_branch', category: 'advanced', description: 'Per-branch reporting' },

    // ===== Communication =====
    { name: 'communication', displayName: 'Communication', module: 'communication', category: 'integration', description: 'Notifications and messaging' },
    { name: 'communication.sms', displayName: 'SMS Notifications', module: 'communication', category: 'integration', description: 'Send SMS reminders and alerts' },
    { name: 'communication.email', displayName: 'Email Notifications', module: 'communication', category: 'integration', description: 'Send email notifications' },
    { name: 'communication.whatsapp', displayName: 'WhatsApp Integration', module: 'communication', category: 'integration', description: 'Send notifications via WhatsApp' },
    { name: 'communication.notifications', displayName: 'In-App Notifications', module: 'communication', category: 'integration', description: 'In-app notification system' },

    // ===== Integrations =====
    { name: 'integrations', displayName: 'Integrations', module: 'integrations', category: 'integration', description: 'Third-party integrations and payment providers' },
    { name: 'integrations.mobile_money', displayName: 'Mobile Money', module: 'integrations', category: 'integration', description: 'Mobile money payment integration' },
    { name: 'integrations.stripe', displayName: 'Stripe', module: 'integrations', category: 'integration', description: 'Stripe payment integration' },
    { name: 'integrations.flutterwave', displayName: 'Flutterwave', module: 'integrations', category: 'integration', description: 'Flutterwave payment integration' },
    { name: 'integrations.qr_payments', displayName: 'QR Payments', module: 'integrations', category: 'integration', description: 'QR code payment support' },
    { name: 'integrations.api_access', displayName: 'API Access', module: 'integrations', category: 'integration', description: 'External API access' },

    // ===== Settings =====
    { name: 'settings', displayName: 'Business Settings', module: 'settings', category: 'core', description: 'Business configuration' },
    { name: 'settings.taxes', displayName: 'Taxes', module: 'settings', category: 'core', description: 'Tax management' },
    { name: 'settings.currencies', displayName: 'Currencies', module: 'settings', category: 'advanced', description: 'Multi-currency support' },
    { name: 'settings.units', displayName: 'Units', module: 'settings', category: 'core', description: 'Units of measure management' },
    { name: 'settings.roles', displayName: 'Roles & Permissions', module: 'settings', category: 'core', description: 'Manage user roles and permissions' },
    { name: 'settings.users', displayName: 'Users', module: 'settings', category: 'core', description: 'Manage system users' },

    // ===== Audit =====
    { name: 'audit', displayName: 'Audit Log', module: 'audit', category: 'advanced', description: 'Activity audit logging' },

    // ===== Rentals =====
    { name: 'rentals', displayName: 'Rental Bookings', module: 'rentals', category: 'advanced', description: 'Rental booking management' },

    // ===== Restaurant =====
    { name: 'restaurant', displayName: 'Restaurant Module', module: 'restaurant', category: 'advanced', description: 'Restaurant and bar management' },
    { name: 'restaurant.tables', displayName: 'Table Management', module: 'restaurant', category: 'advanced', description: 'Manage restaurant tables' },
    { name: 'restaurant.orders', displayName: 'Orders', module: 'restaurant', category: 'advanced', description: 'Create and manage restaurant orders' },
    { name: 'restaurant.kitchen', displayName: 'Kitchen Display', module: 'restaurant', category: 'advanced', description: 'Kitchen order tickets and display' },
    { name: 'restaurant.bar', displayName: 'Bar Display', module: 'restaurant', category: 'advanced', description: 'Bar order tickets and display' },
    { name: 'restaurant.waiters', displayName: 'Waiters', module: 'restaurant', category: 'advanced', description: 'Manage waiters and assignments' },
    { name: 'restaurant.reservations', displayName: 'Reservations', module: 'restaurant', category: 'advanced', description: 'Table reservations' },
    { name: 'restaurant.recipes', displayName: 'Recipes / Bill of Materials', module: 'restaurant', category: 'advanced', description: 'Recipe-based inventory deduction' },
    { name: 'restaurant.happy_hour', displayName: 'Happy Hour Pricing', module: 'restaurant', category: 'advanced', description: 'Time-based promotional pricing' },
    { name: 'restaurant.combos', displayName: 'Combo Meals', module: 'restaurant', category: 'advanced', description: 'Combo meal bundles' },
    { name: 'restaurant.split_bills', displayName: 'Split Bills', module: 'restaurant', category: 'advanced', description: 'Split bills across customers' },
    { name: 'restaurant.merge_tables', displayName: 'Merge Tables', module: 'restaurant', category: 'advanced', description: 'Merge multiple tables' },
    { name: 'restaurant.delivery', displayName: 'Delivery', module: 'restaurant', category: 'advanced', description: 'Delivery orders and tracking' },
    { name: 'restaurant.tips', displayName: 'Tips', module: 'restaurant', category: 'advanced', description: 'Tips management for waiters' },
    { name: 'restaurant.reports', displayName: 'Restaurant Reports', module: 'restaurant', category: 'advanced', description: 'Restaurant-specific reports' },

    // ===== Fuel Station =====
    { name: 'fuel_station', displayName: 'Fuel Station', module: 'fuel_station', category: 'advanced', description: 'Fuel station management' },
    { name: 'fuel_station.pumps', displayName: 'Pumps & Tanks', module: 'fuel_station', category: 'advanced', description: 'Manage fuel pumps and tanks' },
    { name: 'fuel_station.deliveries', displayName: 'Fuel Deliveries', module: 'fuel_station', category: 'advanced', description: 'Record fuel deliveries' },
    { name: 'fuel_station.meter_readings', displayName: 'Meter Readings', module: 'fuel_station', category: 'advanced', description: 'Pump meter readings' },
    { name: 'fuel_station.shift_reports', displayName: 'Shift Reports', module: 'fuel_station', category: 'advanced', description: 'Fuel shift reconciliation' },
    { name: 'fuel_station.lubricants', displayName: 'Lubricants', module: 'fuel_station', category: 'advanced', description: 'Lubricant sales tracking' },
    { name: 'fuel_station.car_wash', displayName: 'Car Wash', module: 'fuel_station', category: 'advanced', description: 'Car wash service tracking' },
    { name: 'fuel_station.reports', displayName: 'Fuel Station Reports', module: 'fuel_station', category: 'advanced', description: 'Fuel station-specific reports' },
    { name: 'fuel_station.dipstick', displayName: 'Dipstick Readings', module: 'fuel_station', category: 'advanced', description: 'Tank dipstick readings and variance' },
    { name: 'fuel_station.pricing', displayName: 'Fuel Pricing', module: 'fuel_station', category: 'advanced', description: 'Fuel price management' },
    { name: 'fuel_station.compliance', displayName: 'Compliance', module: 'fuel_station', category: 'advanced', description: 'Environmental compliance tracking' },

    // ===== Manufacturing =====
    { name: 'manufacturing', displayName: 'Manufacturing', module: 'manufacturing', category: 'advanced', description: 'Manufacturing module' },
    { name: 'manufacturing.production_orders', displayName: 'Production Orders', module: 'manufacturing', category: 'advanced', description: 'Create and manage production orders' },
    { name: 'manufacturing.bom', displayName: 'Bill of Materials', module: 'manufacturing', category: 'advanced', description: 'BOM / Recipe management' },
    { name: 'manufacturing.waste', displayName: 'Waste Tracking', module: 'manufacturing', category: 'advanced', description: 'Track production waste' },
    { name: 'manufacturing.costing', displayName: 'Production Costing', module: 'manufacturing', category: 'advanced', description: 'Track production costs' },
    { name: 'manufacturing.reports', displayName: 'Manufacturing Reports', module: 'manufacturing', category: 'advanced', description: 'Manufacturing-specific reports' },

    // ===== Agriculture =====
    { name: 'agriculture', displayName: 'Agriculture', module: 'agriculture', category: 'advanced', description: 'Agriculture module' },
    { name: 'agriculture.fields', displayName: 'Field Management', module: 'agriculture', category: 'advanced', description: 'Manage farm fields' },
    { name: 'agriculture.livestock', displayName: 'Livestock', module: 'agriculture', category: 'advanced', description: 'Manage livestock' },
    { name: 'agriculture.harvests', displayName: 'Harvest Records', module: 'agriculture', category: 'advanced', description: 'Record harvests and yields' },
    { name: 'agriculture.expenses', displayName: 'Farm Expenses', module: 'agriculture', category: 'advanced', description: 'Track farm expenses' },
    { name: 'agriculture.reports', displayName: 'Agriculture Reports', module: 'agriculture', category: 'advanced', description: 'Agriculture-specific reports' },

    // ===== Assets & Resources =====
    { name: 'assets', displayName: 'Assets & Resources', module: 'assets', category: 'advanced', description: 'Manage machines, vehicles, equipment' },

    // ===== Developer / Data Tools =====
    { name: 'developer.data_importer', displayName: 'Data Importer', module: 'developer', category: 'core', description: 'Bulk import products, customers, and inventory data via CSV/Excel' },
  ]

  for (const feature of allFeatures) {
    await prisma.feature.upsert({
      where: { name: feature.name },
      update: feature,
      create: feature,
    })
  }

  console.log(`✅ Created ${allFeatures.length} features`)
}

async function seedPlanFeatures() {
  console.log('🌱 Seeding plan features...')

  const plans = await prisma.plan.findMany()
  const features = await prisma.feature.findMany()
  const featureIdsByName = new Map(features.map(f => [f.name, f.id]))
  const allFeatureIds = new Set(features.map(f => f.id))

  for (const plan of plans) {
    // Determine features based on plan slug
    let planFeatureNames = []

    switch (plan.slug) {
      case 'freemium':
        // Freemium: same baseline as starter/default, but explicitly includes
        // core financial controls for small businesses: Expenses and Returns & Refunds.
        planFeatureNames = [
          'dashboard', 'sales', 'sales.pos', 'sales.returns',
          'customers',
          'inventory', 'inventory.products', 'inventory.services', 'inventory.categories',
          'expenses',
          'reports', 'reports.sales', 'reports.inventory',
          'settings', 'settings.taxes', 'settings.units', 'settings.roles', 'settings.users',
          'developer.data_importer',
        ]
        break
      case 'starter':
        planFeatureNames = [
          'dashboard', 'sales', 'sales.pos',
          'customers',
          'inventory', 'inventory.products', 'inventory.services', 'inventory.categories',
          'reports', 'reports.sales', 'reports.inventory',
          'settings', 'settings.taxes', 'settings.units', 'settings.roles', 'settings.users',
          'developer.data_importer',
        ]
        break
      case 'growth':
        planFeatureNames = [
          'dashboard', 'dashboard.analytics',
          'sales', 'sales.pos', 'sales.returns', 'sales.discounts', 'sales.suspended',
          'customers', 'customers.statements',
          'inventory', 'inventory.products', 'inventory.services', 'inventory.categories',
          'inventory.adjustments', 'inventory.multi_unit', 'inventory.expiry_tracking',
          'suppliers', 'suppliers.purchase_orders', 'suppliers.grn',
          'expenses', 'financial.income',
          'receivables', 'receivables.payments', 'receivables.aging',
          'payables', 'payables.payments', 'payables.aging',
          'reports', 'reports.sales', 'reports.inventory', 'reports.customers',
          'reports.suppliers', 'reports.financial',
          'settings', 'settings.taxes', 'settings.units', 'settings.roles', 'settings.users',
          'developer.data_importer',
        ]
        break
      case 'professional':
        planFeatureNames = [
          'dashboard', 'dashboard.analytics',
          'sales', 'sales.pos', 'sales.returns', 'sales.discounts', 'sales.suspended',
          'customers', 'customers.statements',
          'inventory', 'inventory.products', 'inventory.services', 'inventory.categories',
          'inventory.adjustments', 'inventory.multi_unit', 'inventory.expiry_tracking',
          'inventory.transfers',
          'suppliers', 'suppliers.purchase_orders', 'suppliers.grn',
          'expenses', 'financial.income',
          'receivables', 'receivables.payments', 'receivables.aging',
          'payables', 'payables.payments', 'payables.aging',
          'reports', 'reports.sales', 'reports.inventory', 'reports.customers',
          'reports.suppliers', 'reports.financial', 'reports.performance',
          'settings', 'settings.taxes', 'settings.units', 'settings.roles', 'settings.users',
          'developer.data_importer',
          'multi_branch',
          'audit',
          'rentals',
          'communication', 'communication.sms', 'communication.email', 'communication.whatsapp', 'communication.notifications',
          'integrations',
          'restaurant', 'restaurant.tables', 'restaurant.orders', 'restaurant.kitchen',
          'restaurant.reservations', 'restaurant.recipes', 'restaurant.happy_hour',
          'restaurant.combos', 'restaurant.delivery', 'restaurant.tips',
          'restaurant.waiters', 'restaurant.reports',
          'fuel_station', 'fuel_station.pumps', 'fuel_station.deliveries', 'fuel_station.meter_readings', 'fuel_station.shift_reports', 'fuel_station.lubricants', 'fuel_station.car_wash', 'fuel_station.reports', 'fuel_station.dipstick', 'fuel_station.pricing', 'fuel_station.compliance',
          'manufacturing', 'manufacturing.production_orders', 'manufacturing.bom', 'manufacturing.waste', 'manufacturing.costing', 'manufacturing.reports',
          'agriculture', 'agriculture.fields', 'agriculture.livestock', 'agriculture.harvests', 'agriculture.expenses', 'agriculture.reports',
          'service', 'service.appointments', 'service.work_orders', 'service.job_cards', 'service.technicians', 'service.contracts', 'service.reports',
          'assets',
        ]
        break
      case 'enterprise':
        planFeatureNames = features.map(f => f.name)
        break
      default:
        planFeatureNames = [
          'dashboard', 'sales', 'sales.pos',
          'customers',
          'inventory', 'inventory.products', 'inventory.services', 'inventory.categories',
          'reports', 'reports.sales', 'reports.inventory',
          'settings', 'settings.taxes', 'settings.units', 'settings.roles', 'settings.users',
          'developer.data_importer',
        ]
    }

    // Resolve feature names to IDs
    const planFeatureIds = new Set(
      planFeatureNames
        .map(name => featureIdsByName.get(name))
        .filter(Boolean)
    )

    // 1. Disable all PlanFeature rows for this plan that are NOT in the plan's list
    await prisma.planFeature.updateMany({
      where: {
        planId: plan.id,
        featureId: { notIn: [...planFeatureIds] },
        enabled: true,
      },
      data: { enabled: false },
    })

    // 2. Upsert enabled features for this plan
    for (const featureId of planFeatureIds) {
      await prisma.planFeature.upsert({
        where: {
          planId_featureId: {
            planId: plan.id,
            featureId,
          },
        },
        update: { enabled: true },
        create: {
          planId: plan.id,
          featureId,
          enabled: true,
        },
      })
    }

    const enabledCount = planFeatureIds.size
    const disabledCount = allFeatureIds.size - enabledCount
    console.log(`  📋 ${plan.name}: ${enabledCount} enabled, ${disabledCount} disabled`)
  }

  console.log(`✅ Seeded features for ${plans.length} plans`)
}

async function seedUsageLimits() {
  console.log('🌱 Seeding usage limits...')

  const tenants = await prisma.tenant.findMany()

  for (const tenant of tenants) {
    // Get tenant's plan
    const plan = await prisma.plan.findUnique({
      where: { id: tenant.planId || '' },
    })

    let limits = {
      maxProducts: 100,
      maxUsers: 5,
      maxBranches: 1,
      maxCustomers: 100,
      maxSuppliers: 50,
    }

    // Adjust limits based on plan
    switch (plan?.slug) {
      case 'starter':
        limits = { maxProducts: 50, maxUsers: 2, maxBranches: 1, maxCustomers: 50, maxSuppliers: 20 }
        break
      case 'professional':
        limits = { maxProducts: 500, maxUsers: 20, maxBranches: 3, maxCustomers: 500, maxSuppliers: 100 }
        break
      case 'enterprise':
        limits = { maxProducts: 999999, maxUsers: 999999, maxBranches: 999999, maxCustomers: 999999, maxSuppliers: 999999 }
        break
    }

    await prisma.usageLimit.upsert({
      where: { tenantId: tenant.id },
      update: limits,
      create: {
        tenantId: tenant.id,
        ...limits,
      },
    })
  }

  console.log(`✅ Seeded usage limits for ${tenants.length} tenants`)
}

async function main() {
  console.log('🌱 Seeding features and plan configurations...')

  await seedFeatures()
  await seedPlanFeatures()
  await seedUsageLimits()

  console.log('🎉 Feature seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
