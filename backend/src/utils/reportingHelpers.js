export function buildSupplierStatementData(supplier, purchases = [], payments = []) {
  const normalizedPurchases = Array.isArray(purchases) ? purchases : [];
  const normalizedPayments = Array.isArray(payments) ? payments : [];

  const totalPurchases = normalizedPurchases.reduce((sum, purchase) => sum + Number(purchase?.total || 0), 0);
  const totalPayments = normalizedPayments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);
  const openBalance = normalizedPurchases.reduce((sum, purchase) => sum + Math.max(0, Number(purchase?.balance || 0)), 0);
  const openPurchases = normalizedPurchases.filter((purchase) => Number(purchase?.balance || 0) > 0);

  return {
    supplier: {
      id: supplier?.id || null,
      name: supplier?.name || 'Unknown supplier',
    },
    summary: {
      totalPurchases,
      totalPayments,
      openBalance,
      purchaseCount: normalizedPurchases.length,
      paymentCount: normalizedPayments.length,
    },
    purchases: normalizedPurchases.map((purchase) => ({
      id: purchase?.id,
      refNo: purchase?.refNo || 'N/A',
      total: Number(purchase?.total || 0),
      balance: Number(purchase?.balance || 0),
      createdAt: purchase?.createdAt,
    })),
    payments: normalizedPayments.map((payment) => ({
      id: payment?.id,
      amount: Number(payment?.amount || 0),
      createdAt: payment?.createdAt,
    })),
    openPurchases,
  };
}

export function buildDecisionSupportSummary({ sales = [], purchases = [], products = [], expenses = [], suppliers = [], cogs = null }) {
  const salesTotal = Array.isArray(sales) ? sales.reduce((sum, item) => sum + Number(item?.total || 0), 0) : 0;
  const purchasesTotal = Array.isArray(purchases) ? purchases.reduce((sum, item) => sum + Number(item?.total || 0), 0) : 0;
  const expensesTotal = Array.isArray(expenses) ? expenses.reduce((sum, item) => sum + Number(item?.amount || 0), 0) : 0;
  const supplierBalanceTotal = Array.isArray(suppliers) ? suppliers.reduce((sum, item) => sum + Number(item?.balance || 0), 0) : 0;
  const actualCogs = cogs != null ? cogs : purchasesTotal;

  const now = new Date();
  const expiringSoonProducts = (Array.isArray(products) ? products : []).filter((product) => {
    const expiryDate = product?.expiryDate ? new Date(product.expiryDate) : null;
    if (!expiryDate || Number.isNaN(expiryDate.getTime())) return false;
    const diffDays = Math.floor((expiryDate.getTime() - now.getTime()) / 86400000);
    return diffDays <= 60;
  }).length;

  const lowStockProducts = (Array.isArray(products) ? products : []).filter((product) => {
    const quantity = Number(product?.quantity || 0);
    const minStock = Number(product?.minStock || 0);
    return quantity <= minStock;
  }).length;

  return {
    grossProfit: salesTotal - actualCogs,
    netProfit: salesTotal - actualCogs - expensesTotal,
    cogs: actualCogs,
    lowStockProducts,
    expiringSoonProducts,
    supplierBalanceTotal,
    salesTotal,
    purchasesTotal,
    expensesTotal,
  };
}
