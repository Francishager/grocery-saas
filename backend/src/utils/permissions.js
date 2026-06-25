// Role-based permission resolution. Merges with UserPermission table rows elsewhere.
export function permissionsForUser(user) {
  if (user.role === "saas_admin") return ["*"];

  const ALL_PERMS = [
    "canViewDashboard",
    "canCreateSale", "canViewSale", "canEditSale", "canDeleteSale", "canRefundSale",
    "canCreateProduct", "canViewProduct", "canEditProduct", "canDeleteProduct", "canAdjustStock", "canTransferStock",
    "canCreatePurchase", "canViewPurchase", "canEditPurchase", "canDeletePurchase",
    "canCreateExpense", "canViewExpense", "canEditExpense", "canDeleteExpense",
    "canCreateCustomer", "canViewCustomer", "canEditCustomer", "canDeleteCustomer",
    "canCreateSupplier", "canViewSupplier", "canEditSupplier", "canDeleteSupplier",
    "canCreateStaff", "canViewStaff", "canEditStaff", "canDeleteStaff",
    "canCreateBranch", "canViewBranch", "canEditBranch", "canDeleteBranch",
    "canViewSalesReport", "canViewInventoryReport", "canViewFinancialReport", "canViewCustomerReport", "canViewSupplierReport", "canViewReceivablesReport", "canViewPayablesReport", "canViewPerformanceReport", "canViewAuditReport", "canExportReport",
    "canViewSettings", "canEditSettings",
    "canViewReceipt", "canCreateReceipt",
    "canGiveDiscount",
    "canViewTax", "canManageTax",
  ];

  if (user.role === "owner") return [...ALL_PERMS];

  const byRole = {
    manager: [
      "canViewDashboard",
      "canCreateSale", "canViewSale", "canEditSale", "canRefundSale",
      "canCreateProduct", "canViewProduct", "canEditProduct", "canAdjustStock", "canTransferStock",
      "canCreatePurchase", "canViewPurchase", "canEditPurchase",
      "canCreateExpense", "canViewExpense", "canEditExpense",
      "canCreateCustomer", "canViewCustomer", "canEditCustomer",
      "canCreateSupplier", "canViewSupplier", "canEditSupplier",
      "canViewStaff",
      "canViewBranch",
      "canViewSalesReport", "canViewInventoryReport", "canViewFinancialReport", "canViewCustomerReport", "canViewSupplierReport", "canViewReceivablesReport", "canViewPayablesReport", "canViewPerformanceReport", "canViewAuditReport", "canExportReport",
      "canViewSettings",
      "canViewReceipt", "canCreateReceipt",
      "canGiveDiscount",
      "canViewTax",
    ],
    accountant: [
      "canViewDashboard",
      "canViewSale",
      "canViewProduct",
      "canCreatePurchase", "canViewPurchase", "canEditPurchase",
      "canCreateExpense", "canViewExpense", "canEditExpense",
      "canCreateCustomer", "canViewCustomer", "canEditCustomer",
      "canCreateSupplier", "canViewSupplier", "canEditSupplier",
      "canViewStaff",
      "canViewBranch",
      "canViewSalesReport", "canViewInventoryReport", "canViewFinancialReport", "canViewCustomerReport", "canViewSupplierReport", "canViewReceivablesReport", "canViewPayablesReport", "canViewPerformanceReport", "canViewAuditReport", "canExportReport",
      "canViewSettings",
      "canViewReceipt",
      "canViewTax", "canManageTax",
    ],
    attendant: [
      "canViewDashboard",
      "canCreateSale", "canViewSale",
      "canViewProduct",
      "canViewCustomer",
      "canViewReceipt",
    ],
  };

  return [...(byRole[user.role] || byRole.attendant)];
}
