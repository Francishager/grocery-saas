// Role-based permission resolution. Merges with UserPermission table rows elsewhere.
export function permissionsForUser(user) {
  if (user.role === "saas_admin") return ["*"];

  const ALL_PERMS = [
    "canViewDashboard",
    "canCreateSale", "canViewSale", "canEditSale", "canDeleteSale", "canRefundSale",
    "canCreateProduct", "canViewProduct", "canEditProduct", "canDeleteProduct", "canAdjustStock", "canTransferStock",
    "canCreatePurchase", "canViewPurchase", "canEditPurchase", "canDeletePurchase",
    "canCreateExpense", "canViewExpense", "canEditExpense", "canDeleteExpense",
    "canCreatePayable", "canViewPayable", "canEditPayable", "canDeletePayable",
    "canCreateReceivable", "canViewReceivable", "canEditReceivable", "canDeleteReceivable",
    "canCreateCustomer", "canViewCustomer", "canEditCustomer", "canDeleteCustomer",
    "canCreateSupplier", "canViewSupplier", "canEditSupplier", "canDeleteSupplier",
    "canCreateStaff", "canViewStaff", "canEditStaff", "canDeleteStaff",
    "canCreateBranch", "canViewBranch", "canEditBranch", "canDeleteBranch",
    "canViewSalesReport", "canViewInventoryReport", "canViewFinancialReport", "canViewCustomerReport", "canViewSupplierReport", "canViewReceivablesReport", "canViewPayablesReport", "canViewPerformanceReport", "canViewAuditReport", "canExportReport",
    "canViewSettings", "canEditSettings",
    "canViewReceipt", "canCreateReceipt",
    "canGiveDiscount",
    "canViewTax", "canManageTax",
    // Services
    "canViewService", "canCreateService", "canEditService", "canDeleteService", "canManageServiceCategory", "canViewServiceReport",
    // Rentals
    "canViewRental", "canCreateRental", "canEditRental", "canDeleteRental", "canProcessRentalReturn", "canViewRentalReport",
  ];

  if (user.role === "owner") return [...ALL_PERMS];

  const byRole = {
    manager: [
      "canViewDashboard",
      "canCreateSale", "canViewSale", "canEditSale", "canRefundSale",
      "canCreateProduct", "canViewProduct", "canEditProduct", "canAdjustStock", "canTransferStock",
      "canCreatePurchase", "canViewPurchase", "canEditPurchase",
      "canCreateExpense", "canViewExpense", "canEditExpense",
      "canCreatePayable", "canViewPayable", "canEditPayable",
      "canCreateReceivable", "canViewReceivable", "canEditReceivable",
      "canCreateCustomer", "canViewCustomer", "canEditCustomer",
      "canCreateSupplier", "canViewSupplier", "canEditSupplier",
      "canViewStaff",
      "canViewBranch",
      "canViewSalesReport", "canViewInventoryReport", "canViewFinancialReport", "canViewCustomerReport", "canViewSupplierReport", "canViewReceivablesReport", "canViewPayablesReport", "canViewPerformanceReport", "canViewAuditReport", "canExportReport",
      "canViewSettings",
      "canViewReceipt", "canCreateReceipt",
      "canGiveDiscount",
      "canViewTax",
      // Services
      "canViewService", "canCreateService", "canEditService", "canManageServiceCategory", "canViewServiceReport",
      // Rentals
      "canViewRental", "canCreateRental", "canEditRental", "canProcessRentalReturn", "canViewRentalReport",
    ],
    accountant: [
      "canViewDashboard",
      "canViewSale",
      "canViewProduct",
      "canCreatePurchase", "canViewPurchase", "canEditPurchase",
      "canCreateExpense", "canViewExpense", "canEditExpense",
      "canCreatePayable", "canViewPayable", "canEditPayable",
      "canCreateReceivable", "canViewReceivable", "canEditReceivable",
      "canCreateCustomer", "canViewCustomer", "canEditCustomer",
      "canCreateSupplier", "canViewSupplier", "canEditSupplier",
      "canViewStaff",
      "canViewBranch",
      "canViewSalesReport", "canViewInventoryReport", "canViewFinancialReport", "canViewCustomerReport", "canViewSupplierReport", "canViewReceivablesReport", "canViewPayablesReport", "canViewPerformanceReport", "canViewAuditReport", "canExportReport",
      "canViewSettings",
      "canViewReceipt",
      "canViewTax", "canManageTax",
      // Services
      "canViewService", "canCreateService", "canEditService", "canViewServiceReport",
      // Rentals
      "canViewRental", "canViewRentalReport",
    ],
    attendant: [
      "canViewDashboard",
      "canCreateSale", "canViewSale",
      "canViewProduct",
      "canViewCustomer",
      "canViewReceipt",
      // Services
      "canViewService",
      // Rentals
      "canViewRental", "canCreateRental", "canProcessRentalReturn",
    ],
  };

  return [...(byRole[user.role] || byRole.attendant)];
}
