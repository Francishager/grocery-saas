// Enriched Report Transform Helper
// Converts standard report data into enriched statement-style format

/**
 * Transform sales data (daily/weekly/monthly) into enriched statement format
 */
export function transformSalesData(data) {
  const salesArray = Array.isArray(data) ? data : data?.data ? Array.isArray(data.data) ? data.data : [data.data] : data ? [data] : [];
  
  let totalRevenue = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let totalSales = 0;
  
  const transactions = salesArray.map((sale) => {
    totalRevenue += Number(sale.revenue || sale.total || 0);
    totalDiscount += Number(sale.discount || 0);
    totalTax += Number(sale.tax || 0);
    totalSales += 1;
    
    return {
      id: sale.id || sale.receiptNo,
      date: sale.date || sale.createdAt,
      type: 'Sale',
      description: `Sale Invoice ${sale.receiptNo || sale.id?.substring(0, 8) || ''}`,
      details: `Items: ${sale.items || sale.itemCount || 1}, Status: ${sale.status || 'Completed'}`,
      debit: Number(sale.revenue || sale.total || 0),
      credit: 0,
      reference: sale.receiptNo || sale.id?.substring(0, 8) || '',
      status: sale.status || 'Completed',
    };
  });
  
  // Sort by date
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Calculate running balance
  let running = 0;
  transactions.forEach((t) => {
    running += (t.debit || 0) - (t.credit || 0);
    t.balance = running;
  });
  
  return {
    title: 'Sales Report',
    currentBalance: totalRevenue,
    summary: {
      totalSales,
      totalRevenue,
      totalDiscount,
      totalTax,
      avgSale: totalSales > 0 ? totalRevenue / totalSales : 0,
    },
    transactions,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Transform expense data into enriched statement format
 */
export function transformExpenseData(data) {
  const expensesArray = Array.isArray(data) ? data : data?.data ? Array.isArray(data.data) ? data.data : [data.data] : data ? [data] : [];
  
  let totalExpense = 0;
  const categories = {};
  
  const transactions = expensesArray.map((expense) => {
    const amount = Number(expense.amount || expense.total || 0);
    totalExpense += amount;
    const category = expense.category || 'Uncategorized';
    categories[category] = (categories[category] || 0) + amount;
    
    return {
      id: expense.id,
      date: expense.date || expense.createdAt,
      type: 'Expense',
      description: `${expense.category || 'Expense'} - ${expense.description || 'Expense Transaction'}`,
      details: `By: ${expense.user?.fname || expense.user?.name || 'System'}, Status: ${expense.status || 'Active'}`,
      debit: amount,
      credit: 0,
      reference: expense.reference || expense.id?.substring(0, 8) || '',
      status: expense.status || 'Active',
    };
  });
  
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  let running = 0;
  transactions.forEach((t) => {
    running += (t.debit || 0) - (t.credit || 0);
    t.balance = running;
  });
  
  return {
    title: 'Expense Report',
    currentBalance: totalExpense,
    summary: {
      totalExpense,
      expenseCount: expensesArray.length,
      byCategory: categories,
    },
    transactions,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Transform inventory movement data into enriched statement format
 */
export function transformInventoryMovementData(data) {
  const movementsArray = Array.isArray(data) ? data : data?.data ? Array.isArray(data.data) ? data.data : [data.data] : data ? [data] : [];
  
  let totalIn = 0;
  let totalOut = 0;
  let currentStock = 0;
  
  const transactions = movementsArray.map((move) => {
    const isInbound = move.type === 'Purchase' || move.type === 'Transfer In' || move.type === 'Stock In' || move.type === 'Return';
    const amount = Number(move.quantity || 0);
    
    if (isInbound) {
      totalIn += amount;
      currentStock += amount;
    } else {
      totalOut += amount;
      currentStock -= amount;
    }
    
    return {
      id: move.id,
      date: move.date || move.createdAt,
      type: move.type || 'Movement',
      description: `${move.product?.name || move.productName || 'Product'} ${move.type}`,
      details: `Qty: ${amount}, Ref: ${move.reference || move.receiptNo || ''}`,
      debit: isInbound ? amount : 0,
      credit: !isInbound ? amount : 0,
      reference: move.reference || move.receiptNo || move.id?.substring(0, 8) || '',
      status: move.status || 'Completed',
    };
  });
  
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  let running = 0;
  transactions.forEach((t) => {
    running += (t.debit || 0) - (t.credit || 0);
    t.balance = running;
  });
  
  return {
    title: 'Inventory Movement Report',
    currentBalance: currentStock,
    summary: {
      totalInbound: totalIn,
      totalOutbound: totalOut,
      currentStock,
      netChange: totalIn - totalOut,
    },
    transactions,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Transform receivables/payables aging data into enriched statement format
 */
export function transformAgingData(data, isPayables = false) {
  const recordsArray = Array.isArray(data) ? data : data?.data ? Array.isArray(data.data) ? data.data : [data.data] : data ? [data] : [];
  
  let totalOutstanding = 0;
  const ageGroups = {
    'Current': 0,
    '30+ Days': 0,
    '60+ Days': 0,
    '90+ Days': 0,
  };
  
  const transactions = recordsArray.map((record) => {
    const balance = Number(record.balance || record.outstanding || 0);
    const paid = Number(record.paid || record.amountPaid || 0);
    totalOutstanding += balance;
    
    const daysOverdue = Math.floor((new Date().getTime() - new Date(record.dueDate || record.date).getTime()) / (1000 * 60 * 60 * 24));
    let ageGroup = 'Current';
    if (daysOverdue > 90) ageGroup = '90+ Days';
    else if (daysOverdue > 60) ageGroup = '60+ Days';
    else if (daysOverdue > 30) ageGroup = '30+ Days';
    ageGroups[ageGroup] = (ageGroups[ageGroup] || 0) + balance;
    const entityName = record.supplier?.name || record.customer?.name || record.supplier || record.customer || record.name || 'N/A';
    
    return {
      id: record.id,
      date: record.dueDate || record.date || record.createdAt,
      type: record.type || (isPayables ? 'Bill' : 'Invoice'),
      description: record.description || `${isPayables ? 'Supplier' : 'Customer'}: ${entityName}`,
      details: record.details || `Status: ${record.status || 'Open'}, Days Overdue: ${Math.max(0, daysOverdue)}`,
      debit: record.debit !== undefined ? Number(record.debit || 0) : (isPayables ? 0 : balance),
      credit: record.credit !== undefined ? Number(record.credit || 0) : (isPayables ? balance : paid),
      balance,
      reference: record.invoiceNo || record.billNo || record.receiptNo || record.id?.substring(0, 8) || '',
      status: record.status || (balance > 0 ? 'Open' : 'Paid'),
    };
  });
  
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return {
    title: isPayables ? 'Payables Aging Report' : 'Receivables Aging Report',
    currentBalance: totalOutstanding,
    summary: {
      totalOutstanding,
      ageGroups,
      invoiceCount: recordsArray.length,
    },
    transactions,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Transform bank/cash transaction data into enriched statement format
 */
export function transformCashFlowData(data) {
  const transactionsArray = Array.isArray(data) ? data : data?.data ? Array.isArray(data.data) ? data.data : [data.data] : data ? [data] : [];
  
  let openingBalance = Number(data?.openingBalance || 0);
  let totalIn = 0;
  let totalOut = 0;
  
  const transactions = transactionsArray.map((txn) => {
    const amount = Number(txn.amount || 0);
    const isInflow = txn.type === 'Credit' || txn.type === 'Inflow' || txn.type === 'Deposit' || txn.type === 'Payment Received';
    
    if (isInflow) {
      totalIn += amount;
    } else {
      totalOut += amount;
    }
    
    return {
      id: txn.id,
      date: txn.date || txn.createdAt,
      type: isInflow ? 'Inflow' : 'Outflow',
      description: `${isInflow ? 'Deposit' : 'Withdrawal'} - ${txn.description || txn.paymentMethod || ''}`,
      details: `Ref: ${txn.reference || txn.id?.substring(0, 8) || ''}, Method: ${txn.paymentMethod || 'Cash'}`,
      debit: isInflow ? amount : 0,
      credit: !isInflow ? amount : 0,
      reference: txn.reference || txn.id?.substring(0, 8) || '',
      status: 'Cleared',
    };
  });
  
  // Sort by date
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Calculate running balance
  let running = openingBalance;
  transactions.forEach((t) => {
    running += (t.debit || 0) - (t.credit || 0);
    t.balance = running;
  });
  
  const closingBalance = running;
  
  return {
    title: 'Cash Flow Report',
    currentBalance: closingBalance,
    summary: {
      openingBalance,
      totalInflow: totalIn,
      totalOutflow: totalOut,
      closingBalance,
      netCashFlow: totalIn - totalOut,
    },
    transactions,
    generatedAt: new Date().toISOString(),
  };
}
