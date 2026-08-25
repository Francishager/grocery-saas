// =====================================================
// SINGLE SOURCE OF TRUTH for all permission keys
// =====================================================
const PERMISSION_TO_FEATURES = {
  canViewDashboard: [],
  canCreateSale: ['sales', 'sales.pos', 'sales.orders'],
  canViewSale: ['sales', 'sales.pos', 'sales.orders'],
  canEditSale: ['sales', 'sales.pos', 'sales.orders'],
  canDeleteSale: ['sales', 'sales.pos', 'sales.orders'],
  canRefundSale: ['sales.returns', 'sales'],
  canGiveDiscount: ['sales.discounts', 'sales'],
  canViewReceipt: ['receipts', 'sales.receipts', 'sales.pos', 'sales'],
  canCreateReceipt: ['receipts', 'sales.receipts', 'sales.pos', 'sales'],
  canCreateProduct: ['inventory.products', 'inventory'],
  canViewProduct: ['inventory.products', 'inventory'],
  canEditProduct: ['inventory.products', 'inventory'],
  canDeleteProduct: ['inventory.products', 'inventory'],
  canAdjustStock: ['inventory.stock', 'inventory.adjustments', 'inventory'],
  canTransferStock: ['inventory.transfers', 'multi_branch.transfers', 'inventory'],
  canImportInventory: ['inventory.import', 'developer.data_importer', 'inventory'],
  canCreatePurchase: ['purchases', 'suppliers.purchase_orders', 'suppliers'],
  canViewPurchase: ['purchases', 'suppliers.purchase_orders', 'suppliers'],
  canEditPurchase: ['purchases', 'suppliers.purchase_orders', 'suppliers'],
  canDeletePurchase: ['purchases', 'suppliers.purchase_orders', 'suppliers'],
  canCreatePayable: ['payables', 'payables.payments'],
  canViewPayable: ['payables', 'payables.aging', 'payables.payments'],
  canEditPayable: ['payables', 'payables.payments'],
  canDeletePayable: ['payables', 'payables.payments'],
  canCreateExpense: ['expenses'],
  canViewExpense: ['expenses'],
  canEditExpense: ['expenses'],
  canDeleteExpense: ['expenses'],
  canViewStaffTillSheet: ['accounting', 'expenses'],
  canCreateCustomer: ['customers', 'crm'],
  canViewCustomer: ['customers', 'crm'],
  canEditCustomer: ['customers', 'crm'],
  canDeleteCustomer: ['customers', 'crm'],
  canCreateReceivable: ['receivables', 'receivables.payments', 'customers', 'crm'],
  canViewReceivable: ['receivables', 'receivables.aging', 'receivables.payments', 'customers', 'crm'],
  canEditReceivable: ['receivables', 'receivables.payments', 'customers', 'crm'],
  canDeleteReceivable: ['receivables', 'receivables.payments', 'customers', 'crm'],
  canCreateSupplier: ['suppliers'],
  canViewSupplier: ['suppliers'],
  canEditSupplier: ['suppliers'],
  canDeleteSupplier: ['suppliers'],
  canCreateStaff: [],
  canViewStaff: [],
  canEditStaff: [],
  canDeleteStaff: [],
  canViewHR: ['hr'],
  canCreateHREmployee: ['hr'],
  canEditHREmployee: ['hr'],
  canDeleteHREmployee: ['hr'],
  canManageHRStructure: ['hr'],
  canViewHRContracts: ['hr'],
  canManageHRContracts: ['hr'],
  canViewHRDocuments: ['hr'],
  canManageHRDocuments: ['hr'],
  canViewHRSalaries: ['hr'],
  canManageHRSalaries: ['hr'],
  canViewHRAttendance: ['hr', 'hr.attendance', 'attendance_tracking'],
  canRecordHRAttendance: ['hr', 'hr.attendance', 'attendance_tracking'],
  canManageHRAttendance: ['hr', 'hr.attendance', 'attendance_tracking'],
  canEditHRAttendance: ['hr', 'hr.attendance', 'attendance_tracking'],
  canDeleteHRAttendance: ['hr', 'hr.attendance', 'attendance_tracking'],
  canImportHRAttendance: ['hr', 'hr.attendance', 'attendance_tracking'],
  canConfigureHRAttendance: ['hr', 'hr.attendance', 'attendance_tracking'],
  canApproveHRAttendance: ['hr', 'hr.attendance', 'attendance_tracking'],
  canViewHRShifts: ['hr', 'hr.attendance', 'shift_management'],
  canManageHRShifts: ['hr', 'hr.attendance', 'shift_management'],
  canAssignHRShifts: ['hr', 'hr.attendance', 'shift_management'],
  canApproveHRShifts: ['hr', 'hr.attendance', 'shift_management'],
  canViewHRLeave: ['hr', 'hr.leave', 'leave_management'],
  canRequestHRLeave: ['hr', 'hr.leave', 'leave_management'],
  canManageHRLeaveTypes: ['hr', 'hr.leave', 'leave_management'],
  canApproveHRLeave: ['hr', 'hr.leave', 'leave_management'],
  canViewHRPayroll: ['hr', 'hr.payroll', 'payroll_processing'],
  canCreateHRPayroll: ['hr', 'hr.payroll', 'payroll_processing'],
  canApproveHRPayroll: ['hr', 'hr.payroll', 'payroll_processing'],
  canPostHRPayroll: ['hr', 'hr.payroll', 'payroll_processing'],
  canPayHRPayroll: ['hr', 'hr.payroll', 'payroll_processing'],
  canManageHRPayrollSettings: ['hr', 'hr.payroll', 'payroll_processing'],
  canManageHRPayroll: ['hr', 'hr.payroll', 'payroll_processing'],
  canCreateBranch: [],
  canViewBranch: [],
  canEditBranch: [],
  canDeleteBranch: [],
  canViewSalesReport: ['reports', 'reports.sales'],
  canViewInventoryReport: ['reports', 'reports.inventory'],
  canViewFinancialReport: ['reports', 'reports.financial'],
  canViewCustomerReport: ['reports', 'reports.customers'],
  canViewSupplierReport: ['reports', 'reports.suppliers'],
  canViewReceivablesReport: ['reports', 'reports.customers', 'receivables.aging'],
  canViewPayablesReport: ['reports', 'reports.financial', 'payables.aging'],
  canViewPerformanceReport: ['reports', 'reports.performance'],
  canViewAuditReport: ['reports', 'reports.audit', 'audit'],
  canExportReport: ['reports'],
  canViewSettings: [],
  canEditSettings: [],
  canViewTax: ['tax', 'settings.taxes', 'settings'],
  canManageTax: ['tax', 'settings.taxes', 'settings'],
  canViewService: ['services', 'inventory.services'],
  canCreateService: ['services', 'inventory.services'],
  canEditService: ['services', 'inventory.services'],
  canDeleteService: ['services', 'inventory.services'],
  canManageServiceCategory: ['services', 'inventory.services', 'inventory.categories'],
  canViewServiceReport: ['reports', 'reports.services', 'services', 'inventory.services'],
  canViewRental: ['rentals', 'inventory.rentals'],
  canCreateRental: ['rentals', 'inventory.rentals'],
  canEditRental: ['rentals', 'inventory.rentals'],
  canDeleteRental: ['rentals', 'inventory.rentals'],
  canProcessRentalReturn: ['rentals', 'inventory.rentals'],
  canViewRentalReport: ['reports', 'reports.rentals', 'rentals', 'inventory.rentals'],
  canViewRestaurant: ['restaurant', 'restaurant.orders'],
  canCreateRestaurant: ['restaurant', 'restaurant.orders'],
  canEditRestaurant: ['restaurant', 'restaurant.orders'],
  canDeleteRestaurant: ['restaurant', 'restaurant.orders'],
  canViewRestaurantReport: ['reports', 'restaurant.reports', 'restaurant', 'restaurant.orders'],
  canViewManufacturing: ['manufacturing', 'manufacturing.production_orders'],
  canCreateManufacturing: ['manufacturing', 'manufacturing.production_orders'],
  canEditManufacturing: ['manufacturing', 'manufacturing.production_orders'],
  canDeleteManufacturing: ['manufacturing', 'manufacturing.production_orders'],
  canViewManufacturingReport: ['reports', 'manufacturing.reports', 'manufacturing', 'manufacturing.production_orders'],
  canViewAgriculture: ['agriculture', 'agriculture.fields'],
  canCreateAgriculture: ['agriculture', 'agriculture.fields'],
  canEditAgriculture: ['agriculture', 'agriculture.fields'],
  canDeleteAgriculture: ['agriculture', 'agriculture.fields'],
  canViewAgricultureReport: ['reports', 'agriculture', 'agriculture.fields'],
  canViewFuelStation: ['fuel_station', 'fuel_station.pumps'],
  canCreateFuelStation: ['fuel_station', 'fuel_station.pumps'],
  canEditFuelStation: ['fuel_station', 'fuel_station.pumps'],
  canDeleteFuelStation: ['fuel_station', 'fuel_station.pumps'],
  canViewFuelStationReport: ['reports', 'fuel_station.reports', 'fuel_station', 'fuel_station.pumps'],
  canViewServiceBusiness: ['service_business', 'service', 'service.appointments'],
  canCreateServiceBusiness: ['service_business', 'service', 'service.appointments'],
  canEditServiceBusiness: ['service_business', 'service', 'service.appointments'],
  canDeleteServiceBusiness: ['service_business', 'service', 'service.appointments'],
  canViewServiceBusinessReport: ['reports', 'service_business', 'service', 'service.appointments'],
  canViewCommunication: ['communication'],
  canCreateCommunication: ['communication'],
  canEditCommunication: ['communication'],
  canDeleteCommunication: ['communication'],
  canViewAccounting: ['accounting'],
  canCreateAccounting: ['accounting'],
  canEditAccounting: ['accounting'],
  canDeleteAccounting: ['accounting'],
  canUseCash: ['sales', 'sales.pos', 'receivables', 'receivables.payments', 'accounting', 'expenses', 'payables', 'payables.payments', 'hr'],
  canUseMobileMoney: ['sales', 'sales.pos', 'receivables', 'receivables.payments', 'accounting', 'expenses', 'payables', 'payables.payments', 'hr'],
  canUseBank: ['sales', 'sales.pos', 'receivables', 'receivables.payments', 'accounting', 'expenses', 'payables', 'payables.payments', 'hr'],
  canUseCard: ['sales', 'sales.pos', 'receivables', 'receivables.payments', 'accounting', 'expenses', 'payables', 'payables.payments', 'hr'],
};

const OWNER_CORE_PERMISSIONS = new Set([
  'canViewDashboard',
  'canViewBranch',
  'canCreateBranch',
  'canEditBranch',
  'canDeleteBranch',
  'canViewStaff',
  'canCreateStaff',
  'canEditStaff',
  'canDeleteStaff',
  'canViewSettings',
  'canEditSettings',
]);

export const ALL_PERMISSION_KEYS = [
  "canViewDashboard",
  // Sales
  "canCreateSale", "canViewSale", "canEditSale", "canDeleteSale", "canRefundSale",
  // Inventory
  "canCreateProduct", "canViewProduct", "canEditProduct", "canDeleteProduct", "canAdjustStock", "canTransferStock",
  // Purchases / Payables
  "canCreatePurchase", "canViewPurchase", "canEditPurchase", "canDeletePurchase",
  "canCreatePayable", "canViewPayable", "canEditPayable", "canDeletePayable",
  // Expenses
  "canCreateExpense", "canViewExpense", "canEditExpense", "canDeleteExpense", "canViewStaffTillSheet",
  // Customers / Receivables
  "canCreateCustomer", "canViewCustomer", "canEditCustomer", "canDeleteCustomer",
  "canCreateReceivable", "canViewReceivable", "canEditReceivable", "canDeleteReceivable",
  // Suppliers
  "canCreateSupplier", "canViewSupplier", "canEditSupplier", "canDeleteSupplier",
  // Staff
  "canCreateStaff", "canViewStaff", "canEditStaff", "canDeleteStaff",
  // HR Management
  "canViewHR", "canCreateHREmployee", "canEditHREmployee", "canDeleteHREmployee",
  "canManageHRStructure", "canViewHRContracts", "canManageHRContracts",
  "canViewHRDocuments", "canManageHRDocuments", "canViewHRSalaries", "canManageHRSalaries",
  "canViewHRAttendance", "canRecordHRAttendance", "canManageHRAttendance",
  "canEditHRAttendance", "canDeleteHRAttendance", "canImportHRAttendance",
  "canConfigureHRAttendance", "canApproveHRAttendance",
  "canViewHRShifts", "canManageHRShifts", "canAssignHRShifts", "canApproveHRShifts",
  "canViewHRLeave", "canRequestHRLeave", "canManageHRLeaveTypes", "canApproveHRLeave",
  "canViewHRPayroll", "canCreateHRPayroll", "canApproveHRPayroll",
  "canPostHRPayroll", "canPayHRPayroll", "canManageHRPayrollSettings",
  "canManageHRPayroll",
  // Branches
  "canCreateBranch", "canViewBranch", "canEditBranch", "canDeleteBranch",
  // Reports
  "canViewSalesReport", "canViewInventoryReport", "canViewFinancialReport", "canViewCustomerReport",
  "canViewSupplierReport", "canViewReceivablesReport", "canViewPayablesReport",
  "canViewPerformanceReport", "canViewAuditReport", "canExportReport",
  // Settings
  "canViewSettings", "canEditSettings",
  // Receipts
  "canViewReceipt", "canCreateReceipt",
  // Discounts
  "canGiveDiscount",
  // Tax
  "canViewTax", "canManageTax",
  // Services (inventory service items)
  "canViewService", "canCreateService", "canEditService", "canDeleteService",
  "canManageServiceCategory", "canViewServiceReport",
  // Rentals
  "canViewRental", "canCreateRental", "canEditRental", "canDeleteRental",
  "canProcessRentalReturn", "canViewRentalReport",
  // Restaurant & Bar
  "canViewRestaurant", "canCreateRestaurant", "canEditRestaurant", "canDeleteRestaurant",
  "canViewRestaurantReport",
  // Fuel Station
  "canViewFuelStation", "canCreateFuelStation", "canEditFuelStation", "canDeleteFuelStation",
  "canViewFuelStationReport",
  // Manufacturing
  "canViewManufacturing", "canCreateManufacturing", "canEditManufacturing", "canDeleteManufacturing",
  "canViewManufacturingReport",
  // Agriculture
  "canViewAgriculture", "canCreateAgriculture", "canEditAgriculture", "canDeleteAgriculture",
  "canViewAgricultureReport",
  // Service Business (appointments, work orders, contracts)
  "canViewServiceBusiness", "canCreateServiceBusiness", "canEditServiceBusiness", "canDeleteServiceBusiness",
  "canViewServiceBusinessReport",
  // Communication
  "canViewCommunication", "canCreateCommunication", "canEditCommunication", "canDeleteCommunication",
  // Accounting
  "canViewAccounting", "canCreateAccounting", "canEditAccounting", "canDeleteAccounting",
  // Payment Methods (for spending — expenses, payables)
  "canUseCash", "canUseMobileMoney", "canUseBank", "canUseCard",
  // Data Import
  "canImportInventory",
];

export const PERMISSION_CATEGORIES = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'sales', name: 'Sales' },
  { id: 'inventory', name: 'Inventory' },
  { id: 'purchases', name: 'Purchases' },
  { id: 'payables', name: 'Payables' },
  { id: 'expenses', name: 'Expenses' },
  { id: 'customers', name: 'Customers & Receivables' },
  { id: 'suppliers', name: 'Suppliers' },
  { id: 'staff', name: 'Staff Access' },
  { id: 'hr', name: 'HR Dashboard' },
  { id: 'hr_employees', name: 'HR Employees' },
  { id: 'hr_structure', name: 'HR Departments & Positions' },
  { id: 'hr_contracts', name: 'HR Contracts' },
  { id: 'hr_documents', name: 'HR Documents' },
  { id: 'hr_salaries', name: 'HR Salaries & Wages' },
  { id: 'hr_attendance', name: 'HR Attendance' },
  { id: 'hr_shifts', name: 'HR Shifts' },
  { id: 'hr_leave', name: 'HR Leave' },
  { id: 'hr_payroll', name: 'HR Payroll & Accounting' },
  { id: 'branches', name: 'Branches' },
  { id: 'reports', name: 'Reports' },
  { id: 'settings', name: 'Settings' },
  { id: 'receipts', name: 'Receipts' },
  { id: 'tax', name: 'Tax' },
  { id: 'services', name: 'Services' },
  { id: 'rentals', name: 'Rentals' },
  { id: 'restaurant', name: 'Restaurant & Bar' },
  { id: 'fuel_station', name: 'Fuel Station' },
  { id: 'manufacturing', name: 'Manufacturing' },
  { id: 'agriculture', name: 'Agriculture' },
  { id: 'service_business', name: 'Service Business' },
  { id: 'communication', name: 'Communication' },
  { id: 'accounting', name: 'Accounting' },
  { id: 'payment_methods', name: 'Payment Methods' },
];

const PERMISSION_DETAIL_OVERRIDES = {
  canViewDashboard: {
    name: 'View business dashboard',
    description: 'Open the main dashboard and see business summary cards, charts, and alerts.',
  },
  canCreateSale: {
    name: 'Record sales',
    description: 'Create cash, mobile money, card, bank, or credit sales from the sales page.',
  },
  canViewSale: {
    name: 'View sales',
    description: 'Open sales lists, recent sales, receipts, and sale details.',
  },
  canEditSale: {
    name: 'Edit sales',
    description: 'Correct sale details where the system allows edits.',
  },
  canDeleteSale: {
    name: 'Delete or cancel sales',
    description: 'Remove or cancel sale records. Use carefully because it affects stock, cash, and reports.',
  },
  canRefundSale: {
    name: 'Process returns and refunds',
    description: 'Record returned goods and customer refunds.',
  },
  canGiveDiscount: {
    name: 'Apply discounts',
    description: 'Give item or invoice discounts during sales.',
  },
  canViewReceipt: {
    name: 'View and print receipts',
    description: 'Open, preview, print, and reprint sales receipts.',
  },
  canCreateReceipt: {
    name: 'Create receipts',
    description: 'Generate receipts for eligible sales and payment transactions.',
  },
  canCreateProduct: {
    name: 'Create products and services',
    description: 'Add new inventory products or service items.',
  },
  canViewProduct: {
    name: 'View inventory',
    description: 'See products, services, prices, cost, stock quantities, and inventory history.',
  },
  canEditProduct: {
    name: 'Edit product details',
    description: 'Change product names, categories, units, and other non-stock details.',
  },
  canDeleteProduct: {
    name: 'Delete products',
    description: 'Remove products or services that should no longer be used.',
  },
  canAdjustStock: {
    name: 'Adjust or restock inventory',
    description: 'Record stock increases, reductions, corrections, and restocking entries.',
  },
  canTransferStock: {
    name: 'Transfer stock',
    description: 'Move inventory between branches or stock locations.',
  },
  canImportInventory: {
    name: 'Import inventory',
    description: 'Upload product, service, or stock data in bulk.',
  },
  canCreatePurchase: {
    name: 'Record purchases',
    description: 'Create supplier purchase entries and received goods records.',
  },
  canViewPurchase: {
    name: 'View purchases',
    description: 'See purchase lists, purchase details, and supplier purchase history.',
  },
  canEditPurchase: {
    name: 'Edit purchases',
    description: 'Correct purchase entries where editing is allowed.',
  },
  canDeletePurchase: {
    name: 'Delete purchases',
    description: 'Remove purchase entries. Use carefully because it can affect stock and payables.',
  },
  canCreatePayable: {
    name: 'Record supplier bills',
    description: 'Create bills or payable balances owed to suppliers.',
  },
  canViewPayable: {
    name: 'View supplier payables',
    description: 'See unpaid supplier balances, bills, and payment history.',
  },
  canEditPayable: {
    name: 'Edit supplier payables',
    description: 'Correct supplier payable records before settlement.',
  },
  canDeletePayable: {
    name: 'Delete supplier payables',
    description: 'Remove supplier payable records where allowed.',
  },
  canCreateExpense: {
    name: 'Record expenses',
    description: 'Create business expense transactions using permitted payment methods.',
  },
  canViewExpense: {
    name: 'View expenses',
    description: 'See expense lists, details, categories, and payment status.',
  },
  canEditExpense: {
    name: 'Edit expenses',
    description: 'Correct expense records where editing is allowed.',
  },
  canDeleteExpense: {
    name: 'Delete expenses',
    description: 'Remove expense records where allowed.',
  },
  canViewStaffTillSheet: {
    name: 'View staff till sheet',
    description: 'See staff cash movements, debit/credit activity, and till balancing details.',
  },
  canCreateCustomer: {
    name: 'Create customers',
    description: 'Add new customers and customer contact details.',
  },
  canViewCustomer: {
    name: 'View customers',
    description: 'See customer profiles, balances, trust score, and contact details.',
  },
  canEditCustomer: {
    name: 'Edit customers',
    description: 'Update customer profile details and credit settings.',
  },
  canDeleteCustomer: {
    name: 'Delete customers',
    description: 'Remove customers where the system allows it.',
  },
  canCreateReceivable: {
    name: 'Record credit sales and receivables',
    description: 'Create customer credit balances and customer receivable records.',
  },
  canViewReceivable: {
    name: 'View receivables',
    description: 'See customer credit balances, aging, statements, and payment status.',
  },
  canEditReceivable: {
    name: 'Edit receivables',
    description: 'Correct receivable records where editing is allowed.',
  },
  canDeleteReceivable: {
    name: 'Delete receivables',
    description: 'Remove receivable records where allowed.',
  },
  canCreateSupplier: {
    name: 'Create suppliers',
    description: 'Add new suppliers and supplier contact details.',
  },
  canViewSupplier: {
    name: 'View suppliers',
    description: 'See supplier profiles, balances, and purchase history.',
  },
  canEditSupplier: {
    name: 'Edit suppliers',
    description: 'Update supplier profile and account details.',
  },
  canDeleteSupplier: {
    name: 'Delete suppliers',
    description: 'Remove suppliers where the system allows it.',
  },
  canCreateStaff: {
    name: 'Create staff users',
    description: 'Invite or create staff logins for this business.',
  },
  canViewStaff: {
    name: 'View staff and roles',
    description: 'Open staff lists and the Roles & Permissions page.',
  },
  canEditStaff: {
    name: 'Edit staff users and permissions',
    description: 'Update staff profiles, assign branches, assign cash accounts, and change permissions.',
  },
  canDeleteStaff: {
    name: 'Suspend or deactivate staff',
    description: 'Deactivate staff access to the business tenant.',
  },
  canViewHR: {
    name: 'View HR dashboard',
    description: 'Open HR and see workforce, attendance, leave, and payroll summaries.',
  },
  canCreateHREmployee: {
    name: 'Create employee profiles',
    description: 'Add employees, identity details, contacts, and employment information.',
  },
  canEditHREmployee: {
    name: 'Edit employee profiles',
    description: 'Update employee details, status, branch, supervisor, department, or position.',
  },
  canDeleteHREmployee: {
    name: 'Deactivate employee profiles',
    description: 'Archive or deactivate employees who should no longer appear as active staff.',
  },
  canManageHRStructure: {
    name: 'Manage departments, positions, units, and teams',
    description: 'Create and update HR organization structure used by employee forms.',
  },
  canViewHRContracts: {
    name: 'View employee contracts',
    description: 'Open employee contracts and contract history.',
  },
  canManageHRContracts: {
    name: 'Create and update employee contracts',
    description: 'Add, amend, terminate, or renew employee contracts.',
  },
  canViewHRDocuments: {
    name: 'View employee documents',
    description: 'Open employee uploaded documents such as CVs, IDs, agreements, and certificates.',
  },
  canManageHRDocuments: {
    name: 'Upload and manage employee documents',
    description: 'Upload, replace, categorize, and remove employee documents.',
  },
  canViewHRSalaries: {
    name: 'View salary records',
    description: 'See employee salary history, wages, advances, and loan balances.',
  },
  canManageHRSalaries: {
    name: 'Record salary changes',
    description: 'Create or update employee salary and wage records before payroll processing.',
  },
  canViewHRAttendance: {
    name: 'View attendance records',
    description: 'See employee attendance, check-in/check-out times, status, summaries, and audit history.',
  },
  canRecordHRAttendance: {
    name: 'Record employee check-in/check-out',
    description: 'Allow a receptionist or supervisor to check employees in and out without payroll access.',
  },
  canManageHRAttendance: {
    name: 'Full attendance management',
    description: 'Legacy broad attendance access. Prefer the separate check-in, edit, import, approve, and config permissions.',
  },
  canEditHRAttendance: {
    name: 'Edit attendance records',
    description: 'Correct attendance dates, times, method, or status after check-in/check-out.',
  },
  canDeleteHRAttendance: {
    name: 'Delete attendance records',
    description: 'Remove incorrect attendance records where deletion is allowed.',
  },
  canImportHRAttendance: {
    name: 'Import attendance records',
    description: 'Upload attendance records in bulk from manual sheets or devices.',
  },
  canConfigureHRAttendance: {
    name: 'Configure attendance rules',
    description: 'Change attendance settings such as QR, biometric, branch rules, grace periods, and overtime rules.',
  },
  canApproveHRAttendance: {
    name: 'Approve attendance',
    description: 'Approve attendance records before payroll or management reporting.',
  },
  canViewHRShifts: {
    name: 'View shifts',
    description: 'See shift templates, assignments, swaps, and schedules.',
  },
  canManageHRShifts: {
    name: 'Create and edit shift templates',
    description: 'Manage shift definitions, hours, and shift rules.',
  },
  canAssignHRShifts: {
    name: 'Assign shifts',
    description: 'Assign employees to shifts and remove assignments.',
  },
  canApproveHRShifts: {
    name: 'Approve shift changes',
    description: 'Approve shift swaps, changes, and shift execution actions.',
  },
  canViewHRLeave: {
    name: 'View leave requests',
    description: 'See employee leave requests, balances, and leave history.',
  },
  canRequestHRLeave: {
    name: 'Request leave',
    description: 'Submit leave requests for self or assigned employees where allowed.',
  },
  canManageHRLeaveTypes: {
    name: 'Manage leave types and allocations',
    description: 'Create leave types, allocate leave balances, and carry over balances.',
  },
  canApproveHRLeave: {
    name: 'Approve leave',
    description: 'Approve or reject employee leave requests.',
  },
  canViewHRPayroll: {
    name: 'View payroll',
    description: 'See payroll records, payroll summaries, salary payable amounts, and payroll history.',
  },
  canCreateHRPayroll: {
    name: 'Create payroll drafts',
    description: 'Prepare payroll records and calculate earnings, deductions, PAYE, and social security amounts.',
  },
  canApproveHRPayroll: {
    name: 'Approve payroll',
    description: 'Approve payroll drafts before posting to accounting.',
  },
  canPostHRPayroll: {
    name: 'Post payroll to accounting',
    description: 'Create accounting journal entries for payroll, deductions, payables, and advance recoveries.',
  },
  canPayHRPayroll: {
    name: 'Pay salaries',
    description: 'Record salary payments from permitted cash, bank, or mobile money accounts.',
  },
  canManageHRPayrollSettings: {
    name: 'Manage HR accounting setup',
    description: 'Configure HR payroll account mappings, salary payable accounts, PAYE accounts, and social security accounts.',
  },
  canManageHRPayroll: {
    name: 'Full payroll management',
    description: 'Legacy broad payroll access. Prefer create, approve, post, pay, and setup permissions for tighter control.',
  },
  canCreateBranch: {
    name: 'Create branches',
    description: 'Add business branches, shops, warehouses, or operating locations.',
  },
  canViewBranch: {
    name: 'View branches',
    description: 'See branch lists, branch details, and branch assignment options.',
  },
  canEditBranch: {
    name: 'Edit branches',
    description: 'Update branch names, contact details, status, and operating settings.',
  },
  canDeleteBranch: {
    name: 'Delete or deactivate branches',
    description: 'Remove or deactivate branch records where the system allows it.',
  },
  canViewSalesReport: {
    name: 'View sales reports',
    description: 'Open sales summaries, daily sales analysis, cash versus credit totals, and sales trends.',
  },
  canViewInventoryReport: {
    name: 'View inventory reports',
    description: 'See stock movement, sold inventory, restock activity, valuation, and low-stock reports.',
  },
  canViewFinancialReport: {
    name: 'View financial reports',
    description: 'Open profit, loss, cash status, trial balance, balance sheet, and financial summaries.',
  },
  canViewCustomerReport: {
    name: 'View customer reports',
    description: 'See customer activity, balances, repayment behavior, and customer performance reports.',
  },
  canViewSupplierReport: {
    name: 'View supplier reports',
    description: 'See supplier balances, purchase activity, payable history, and supplier performance reports.',
  },
  canViewReceivablesReport: {
    name: 'View receivables reports',
    description: 'Open customer credit, aging, collections, and outstanding receivable reports.',
  },
  canViewPayablesReport: {
    name: 'View payables reports',
    description: 'Open supplier bills, aging, unpaid balances, and supplier payment reports.',
  },
  canViewPerformanceReport: {
    name: 'View performance reports',
    description: 'See business performance, product performance, staff performance, and trend reports.',
  },
  canViewAuditReport: {
    name: 'View audit log',
    description: 'Review system activity, user actions, permission changes, and sensitive transaction history.',
  },
  canExportReport: {
    name: 'Export and download reports',
    description: 'Print, download, or export reports and statements from permitted report pages.',
  },
  canViewSettings: {
    name: 'View business settings',
    description: 'Open business configuration, receipt settings, currency, dates, and setup pages.',
  },
  canEditSettings: {
    name: 'Edit business settings',
    description: 'Change business profile, receipt settings, currency, dates, tax setup, and system configuration.',
  },
  canViewTax: {
    name: 'View tax settings',
    description: 'See configured taxes, tax rates, and tax reporting setup.',
  },
  canManageTax: {
    name: 'Manage tax settings',
    description: 'Create, edit, activate, or deactivate taxes and tax rates used by transactions.',
  },
  canViewService: {
    name: 'View service items',
    description: 'See service catalog items, prices, categories, and service history.',
  },
  canCreateService: {
    name: 'Create service items',
    description: 'Add new services that can be sold or invoiced.',
  },
  canEditService: {
    name: 'Edit service items',
    description: 'Update service names, categories, prices, and active status.',
  },
  canDeleteService: {
    name: 'Delete service items',
    description: 'Remove service items that should no longer be sold.',
  },
  canManageServiceCategory: {
    name: 'Manage service categories',
    description: 'Create and organize categories used for service items.',
  },
  canViewServiceReport: {
    name: 'View service reports',
    description: 'See service sales, service performance, and service revenue reports.',
  },
  canViewRental: {
    name: 'View rentals',
    description: 'See rental items, rental orders, availability, and rental history.',
  },
  canCreateRental: {
    name: 'Create rental orders',
    description: 'Record new rental transactions and reserve rental items.',
  },
  canEditRental: {
    name: 'Edit rental orders',
    description: 'Update rental dates, items, customer details, and rental status.',
  },
  canDeleteRental: {
    name: 'Cancel rental orders',
    description: 'Cancel or remove rental records where allowed.',
  },
  canProcessRentalReturn: {
    name: 'Process rental returns',
    description: 'Receive returned rental items, update availability, and record charges or balances.',
  },
  canViewRentalReport: {
    name: 'View rental reports',
    description: 'See rental revenue, item usage, overdue rentals, and rental performance reports.',
  },
  canViewRestaurant: {
    name: 'View restaurant operations',
    description: 'Open restaurant orders, tables, kitchen activity, and restaurant summaries.',
  },
  canCreateRestaurant: {
    name: 'Create restaurant orders',
    description: 'Record dine-in, takeaway, or delivery restaurant orders.',
  },
  canEditRestaurant: {
    name: 'Edit restaurant orders',
    description: 'Update restaurant order items, table details, status, or service information.',
  },
  canDeleteRestaurant: {
    name: 'Cancel restaurant orders',
    description: 'Cancel or remove restaurant orders where allowed.',
  },
  canViewRestaurantReport: {
    name: 'View restaurant reports',
    description: 'See restaurant sales, item performance, table activity, and kitchen reports.',
  },
  canViewFuelStation: {
    name: 'View fuel station operations',
    description: 'Open fuel station pumps, fuel sales, meter readings, and fuel inventory summaries.',
  },
  canCreateFuelStation: {
    name: 'Record fuel station transactions',
    description: 'Create fuel sales, meter readings, deliveries, or pump transactions.',
  },
  canEditFuelStation: {
    name: 'Edit fuel station transactions',
    description: 'Correct fuel station records, readings, and transaction details where allowed.',
  },
  canDeleteFuelStation: {
    name: 'Delete fuel station transactions',
    description: 'Remove fuel station records where allowed.',
  },
  canViewFuelStationReport: {
    name: 'View fuel station reports',
    description: 'See fuel sales, pump performance, deliveries, variance, and station reports.',
  },
  canViewManufacturing: {
    name: 'View manufacturing',
    description: 'Open production orders, raw materials, finished goods, and manufacturing summaries.',
  },
  canCreateManufacturing: {
    name: 'Create manufacturing records',
    description: 'Create production orders, material usage records, and finished goods entries.',
  },
  canEditManufacturing: {
    name: 'Edit manufacturing records',
    description: 'Update production orders, batches, quantities, and material usage where allowed.',
  },
  canDeleteManufacturing: {
    name: 'Delete manufacturing records',
    description: 'Remove production or manufacturing records where allowed.',
  },
  canViewManufacturingReport: {
    name: 'View manufacturing reports',
    description: 'See production cost, material usage, output, variance, and manufacturing performance reports.',
  },
  canViewAgriculture: {
    name: 'View agriculture operations',
    description: 'Open farm activities, fields, produce, inputs, and agriculture summaries.',
  },
  canCreateAgriculture: {
    name: 'Create agriculture records',
    description: 'Record farm activities, input usage, harvests, produce, or field operations.',
  },
  canEditAgriculture: {
    name: 'Edit agriculture records',
    description: 'Update agriculture records, field activity, produce details, and input usage where allowed.',
  },
  canDeleteAgriculture: {
    name: 'Delete agriculture records',
    description: 'Remove agriculture records where allowed.',
  },
  canViewAgricultureReport: {
    name: 'View agriculture reports',
    description: 'See harvest, input cost, field performance, stock, and agriculture reports.',
  },
  canViewServiceBusiness: {
    name: 'View service business operations',
    description: 'Open appointments, work orders, contracts, service customers, and service delivery summaries.',
  },
  canCreateServiceBusiness: {
    name: 'Create service business records',
    description: 'Create appointments, work orders, contracts, or service delivery records.',
  },
  canEditServiceBusiness: {
    name: 'Edit service business records',
    description: 'Update appointments, work orders, contract status, and service details where allowed.',
  },
  canDeleteServiceBusiness: {
    name: 'Delete service business records',
    description: 'Remove service business records where allowed.',
  },
  canViewServiceBusinessReport: {
    name: 'View service business reports',
    description: 'See appointment, work order, contract, service revenue, and customer service reports.',
  },
  canViewCommunication: {
    name: 'View communication',
    description: 'Read customer, supplier, employee, and business communication records where available.',
  },
  canCreateCommunication: {
    name: 'Create communication',
    description: 'Send or record business communication such as messages, notes, and notifications.',
  },
  canEditCommunication: {
    name: 'Edit communication',
    description: 'Update communication records, templates, or message details where allowed.',
  },
  canDeleteCommunication: {
    name: 'Delete communication',
    description: 'Remove communication records where allowed.',
  },
  canViewAccounting: {
    name: 'View accounting',
    description: 'Open accounting pages, ledgers, chart of accounts, and accounting summaries.',
  },
  canCreateAccounting: {
    name: 'Create accounting entries',
    description: 'Create manual journal entries and accounting transactions.',
  },
  canEditAccounting: {
    name: 'Edit accounting entries',
    description: 'Correct accounting records where editing is allowed.',
  },
  canDeleteAccounting: {
    name: 'Delete accounting entries',
    description: 'Remove accounting records where allowed.',
  },
  canUseCash: {
    name: 'Use cash payment method',
    description: 'Select cash when recording sales, expenses, payables, receivables, or salary payments.',
  },
  canUseMobileMoney: {
    name: 'Use mobile money payment method',
    description: 'Select mobile money when recording sales, expenses, payables, receivables, or salary payments.',
  },
  canUseBank: {
    name: 'Use bank payment method',
    description: 'Select bank or bank transfer when recording sales, expenses, payables, receivables, or salary payments.',
  },
  canUseCard: {
    name: 'Use card payment method',
    description: 'Select card payments in supported payment screens.',
  },
};

function permissionCategoryForKey(key) {
  if (key === 'canViewDashboard') return 'dashboard';
  if (key.startsWith('canUse')) return 'payment_methods';
  if (key.includes('Report') || key === 'canExportReport') return 'reports';
  if (key.includes('Receipt')) return 'receipts';
  if (key.includes('Sale') || key === 'canGiveDiscount') return 'sales';
  if (key.includes('Product') || key.includes('Stock') || key === 'canImportInventory') return 'inventory';
  if (key.includes('Purchase')) return 'purchases';
  if (key.includes('Payable')) return 'payables';
  if (key.includes('Expense') || key === 'canViewStaffTillSheet') return 'expenses';
  if (key.includes('Customer') || key.includes('Receivable')) return 'customers';
  if (key.includes('Supplier')) return 'suppliers';
  if (key.includes('Staff')) return 'staff';
  if (key === 'canViewHR') return 'hr';
  if (key.includes('HREmployee')) return 'hr_employees';
  if (key === 'canManageHRStructure') return 'hr_structure';
  if (key.includes('HRContracts')) return 'hr_contracts';
  if (key.includes('HRDocuments')) return 'hr_documents';
  if (key.includes('HRSalaries')) return 'hr_salaries';
  if (key.includes('HRAttendance')) return 'hr_attendance';
  if (key.includes('HRShifts')) return 'hr_shifts';
  if (key.includes('HRLeave')) return 'hr_leave';
  if (key.includes('HRPayroll')) return 'hr_payroll';
  if (key.includes('HR')) return 'hr';
  if (key.includes('Branch')) return 'branches';
  if (key.includes('Settings')) return 'settings';
  if (key.includes('Tax')) return 'tax';
  if (key.includes('ServiceBusiness')) return 'service_business';
  if (key.includes('Service')) return 'services';
  if (key.includes('Rental')) return 'rentals';
  if (key.includes('Restaurant')) return 'restaurant';
  if (key.includes('FuelStation')) return 'fuel_station';
  if (key.includes('Manufacturing')) return 'manufacturing';
  if (key.includes('Agriculture')) return 'agriculture';
  if (key.includes('Communication')) return 'communication';
  if (key.includes('Accounting')) return 'accounting';
  return 'settings';
}

function permissionNameForKey(key) {
  if (PERMISSION_DETAIL_OVERRIDES[key]?.name) return PERMISSION_DETAIL_OVERRIDES[key].name;
  return String(key)
    .replace(/^can/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/\bH R\b/g, 'HR')
    .replace(/\bI D\b/g, 'ID')
    .replace(/\bC O G S\b/g, 'COGS');
}

export const PERMISSION_METADATA = Object.fromEntries(
  ALL_PERMISSION_KEYS.map((key) => [
    key,
    {
      id: key,
      name: permissionNameForKey(key),
      description: PERMISSION_DETAIL_OVERRIDES[key]?.description || `Allow this user to ${permissionNameForKey(key).toLowerCase()}.`,
      category: permissionCategoryForKey(key),
    },
  ])
);

// =====================================================
// Role defaults — ALL false for every role.
// No role gets auto-permissions. The business owner must
// explicitly assign permissions to every user including
// themselves via the Roles & Permissions page.
// Only saas_admin bypasses all checks (platform-level).
// =====================================================
export const ROLE_DEFAULTS = {
  owner: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, true])),
  manager: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
  accountant: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
  attendant: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
};

// =====================================================
// Normalize a permission record to the canonical permission-key shape.
// =====================================================
export function normalizePermissionRecord(permissionRecord = {}) {
  const normalized = {};
  for (const key of ALL_PERMISSION_KEYS) {
    normalized[key] = Boolean(permissionRecord?.[key] ?? false);
  }
  return normalized;
}

function hasFeatureAccessForTenant(tenantFeatures, featureNames = []) {
  if (!tenantFeatures || !Array.isArray(featureNames) || featureNames.length === 0) {
    return true;
  }

  const features = tenantFeatures instanceof Set ? tenantFeatures : new Set(tenantFeatures || []);
  const names = featureNames.filter(Boolean);

  const aliasesFor = (featureName) => {
    const value = String(featureName);
    const aliases = new Set([
      value,
      value.replace(/_/g, '-'),
      value.replace(/-/g, '_'),
    ]);

    const equivalentFeatures = {
      'fuel_station.tanks': ['fuel_station.pumps'],
      'fuel_station.pumps': ['fuel_station.tanks'],
      'service.car_wash': ['fuel_station.car_wash'],
      'fuel_station.car_wash': ['service.car_wash'],
      'service.garage': ['fuel_station.garage'],
      'fuel_station.garage': ['service.garage'],
      'service': ['service_business'],
      'service_business': ['service'],
    };

    for (const equivalent of equivalentFeatures[value] || []) {
      aliases.add(equivalent);
      aliases.add(equivalent.replace(/_/g, '-'));
      aliases.add(equivalent.replace(/-/g, '_'));
    }

    return aliases;
  };

  return names.some((featureName) => {
    if (!featureName) return true;
    return [...aliasesFor(featureName)].some((alias) => features.has(alias));
  });
}

export function permissionAllowedForTenant(permissionKey, tenantFeatures) {
  if (OWNER_CORE_PERMISSIONS.has(permissionKey)) return true;
  const mappedFeatures = PERMISSION_TO_FEATURES[permissionKey];
  return hasFeatureAccessForTenant(tenantFeatures, mappedFeatures);
}

// =====================================================
// Resolve the effective permissions for a user.
// The effective set is the union of any inherited/base permissions
// (for example from a plan template or a future override layer) plus
// the explicit user-permission record.
// =====================================================
export function resolveEffectivePermissions(user, permissionRecord = null, inheritedPermissions = [], tenantFeatures = null) {
  if (!user) return [];
  if (user.role === "saas_admin") return ["*"];
  if (user.role === "owner") {
    const granted = new Set();
    for (const permissionKey of ALL_PERMISSION_KEYS) {
      if (OWNER_CORE_PERMISSIONS.has(permissionKey)) {
        granted.add(permissionKey);
        continue;
      }

      if (permissionAllowedForTenant(permissionKey, tenantFeatures)) {
        granted.add(permissionKey);
      }
    }
    return [...granted];
  }

  const granted = new Set();

  if (Array.isArray(inheritedPermissions)) {
    inheritedPermissions
      .filter((permission) => permission && permissionAllowedForTenant(permission, tenantFeatures))
      .forEach((permission) => granted.add(permission));
  }

  const normalized = normalizePermissionRecord(permissionRecord || {});
  for (const [key, enabled] of Object.entries(normalized)) {
    if (enabled && key.startsWith("can") && permissionAllowedForTenant(key, tenantFeatures)) {
      granted.add(key);
    }
  }

  return [...granted];
}

// =====================================================
// Resolve permissions for a user.
// - saas_admin: wildcard "*" (platform-level, bypasses all checks)
// - owner: ALL permissions (business owner has full access)
// - Other roles: permissions come ONLY from the UserPermission table
// =====================================================
export function permissionsForUser(user, tenantFeatures = null) {
  if (user.role === "saas_admin") return ["*"];
  if (user.role === "owner") return resolveEffectivePermissions(user, null, [], tenantFeatures);
  // No role gets hardcoded permissions — must be explicitly assigned
  return [];
}
