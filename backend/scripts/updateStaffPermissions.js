import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function updateStaffPermissions() {
  console.log('Updating staff permissions...');

  // Get all staff members with their roles
  const staff = await prisma.user.findMany({
    where: {
      role: { in: ['manager', 'accountant', 'attendant'] }
    },
    include: {
      permissions: true
    }
  });

  console.log(`Found ${staff.length} staff members to update`);

  for (const user of staff) {
    const userPerm = user.permissions;
    if (!userPerm) {
      console.log(`Creating UserPermission for user ${user.id} (${user.email})`);
      // Create UserPermission with role defaults
      const defaults = getRoleDefaults(user.role);
      await prisma.userPermission.create({
        data: {
          userId: user.id,
          ...defaults
        }
      });
    } else {
      console.log(`Updating UserPermission for user ${user.id} (${user.email})`);
      // Update existing UserPermission with new fields
      const updates = getRoleUpdates(user.role);
      try {
        await prisma.userPermission.update({
          where: { userId: user.id },
          data: updates
        });
      } catch (err) {
        if (err.code === 'P2025') {
          console.log(`UserPermission not found for ${user.id}, creating instead`);
          const defaults = getRoleDefaults(user.role);
          await prisma.userPermission.create({
            data: {
              userId: user.id,
              ...defaults
            }
          });
        } else {
          throw err;
        }
      }
    }
  }

  console.log('Staff permissions updated successfully');
}

function getRoleDefaults(role) {
  const defaults = {
    canViewDashboard: true,
    canCreateSale: false, canViewSale: false, canEditSale: false, canDeleteSale: false, canRefundSale: false,
    canCreateProduct: false, canViewProduct: true, canEditProduct: false, canDeleteProduct: false, canAdjustStock: false, canTransferStock: false,
    canCreatePurchase: false, canViewPurchase: true, canEditPurchase: false, canDeletePurchase: false,
    canCreateExpense: false, canViewExpense: false, canEditExpense: false, canDeleteExpense: false,
    canCreatePayable: false, canViewPayable: false, canEditPayable: false, canDeletePayable: false,
    canCreateReceivable: false, canViewReceivable: false, canEditReceivable: false, canDeleteReceivable: false,
    canCreateCustomer: false, canViewCustomer: true, canEditCustomer: false, canDeleteCustomer: false,
    canCreateSupplier: false, canViewSupplier: true, canEditSupplier: false, canDeleteSupplier: false,
    canCreateStaff: false, canViewStaff: true, canEditStaff: false, canDeleteStaff: false,
    canCreateBranch: false, canViewBranch: true, canEditBranch: false, canDeleteBranch: false,
    canViewSalesReport: false, canViewInventoryReport: false, canViewFinancialReport: false, canViewCustomerReport: false, canViewSupplierReport: false, canViewReceivablesReport: false, canViewPayablesReport: false, canViewPerformanceReport: false, canViewAuditReport: false, canExportReport: false,
    canViewSettings: true, canEditSettings: false,
    canViewReceipt: true, canCreateReceipt: false,
    canGiveDiscount: false,
    canViewTax: false, canManageTax: false,
  };

  if (role === 'manager') {
    return {
      ...defaults,
      canCreateSale: true, canViewSale: true, canEditSale: true, canRefundSale: true,
      canCreateProduct: true, canViewProduct: true, canEditProduct: true, canAdjustStock: true, canTransferStock: true,
      canCreatePurchase: true, canViewPurchase: true, canEditPurchase: true,
      canCreateExpense: true, canViewExpense: true, canEditExpense: true,
      canCreatePayable: true, canViewPayable: true, canEditPayable: true,
      canCreateReceivable: true, canViewReceivable: true, canEditReceivable: true,
      canCreateCustomer: true, canViewCustomer: true, canEditCustomer: true,
      canCreateSupplier: true, canViewSupplier: true, canEditSupplier: true,
      canViewSalesReport: true, canViewInventoryReport: true, canViewFinancialReport: true, canViewCustomerReport: true, canViewSupplierReport: true, canViewReceivablesReport: true, canViewPayablesReport: true, canViewPerformanceReport: true, canViewAuditReport: true, canExportReport: true,
      canCreateReceipt: true,
      canGiveDiscount: true,
      canViewTax: true,
    };
  }

  if (role === 'accountant') {
    return {
      ...defaults,
      canViewSale: true,
      canViewProduct: true,
      canCreatePurchase: true, canViewPurchase: true, canEditPurchase: true,
      canCreateExpense: true, canViewExpense: true, canEditExpense: true,
      canCreatePayable: true, canViewPayable: true, canEditPayable: true,
      canCreateReceivable: true, canViewReceivable: true, canEditReceivable: true,
      canCreateCustomer: true, canViewCustomer: true, canEditCustomer: true,
      canCreateSupplier: true, canViewSupplier: true, canEditSupplier: true,
      canViewSalesReport: true, canViewInventoryReport: true, canViewFinancialReport: true, canViewCustomerReport: true, canViewSupplierReport: true, canViewReceivablesReport: true, canViewPayablesReport: true, canViewPerformanceReport: true, canViewAuditReport: true, canExportReport: true,
      canViewTax: true, canManageTax: true,
    };
  }

  if (role === 'attendant') {
    return {
      ...defaults,
      canViewDashboard: true,
      canCreateSale: true, canViewSale: true,
      canViewProduct: true,
      canViewCustomer: true,
      canViewReceipt: true,
    };
  }

  return defaults;
}

function getRoleUpdates(role) {
  const updates = {};

  if (role === 'manager') {
    updates.canCreatePayable = true;
    updates.canViewPayable = true;
    updates.canEditPayable = true;
    updates.canCreateReceivable = true;
    updates.canViewReceivable = true;
    updates.canEditReceivable = true;
  }

  if (role === 'accountant') {
    updates.canCreatePayable = true;
    updates.canViewPayable = true;
    updates.canEditPayable = true;
    updates.canCreateReceivable = true;
    updates.canViewReceivable = true;
    updates.canEditReceivable = true;
  }

  // Attendant gets no Payables/Receivables permissions

  return updates;
}

updateStaffPermissions()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
