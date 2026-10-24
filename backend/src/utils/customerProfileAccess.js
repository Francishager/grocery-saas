const money = (value) => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

export function customerProfileAccess(permissions = []) {
  const granted = new Set(Array.isArray(permissions) ? permissions : [])
  const has = (permission) => granted.has('*') || granted.has(permission)
  return {
    phone: has('canViewCustomerPhone'),
    email: has('canViewCustomerEmail'),
    address: has('canViewCustomerAddress'),
    balance: has('canViewCustomerBalance') || has('canViewReceivable'),
    sales: has('canViewCustomerSalesHistory'),
    payments: has('canViewCustomerPaymentsHistory'),
    returns: has('canViewCustomerReturnsHistory'),
    creditNotes: has('canViewCustomerCreditNotesHistory'),
    withdrawals: has('canViewCustomerWithdrawalsHistory'),
    businessActivity: has('canViewCustomerBusinessActivity'),
  }
}

export function customerProfilePayload(customer, access) {
  return {
    id: customer.id,
    name: customer.name,
    ...(access.phone && { phone: customer.phone }),
    ...(access.email && { email: customer.email }),
    ...(access.address && { address: customer.address }),
    status: customer.status,
    ...(access.balance && {
      creditLimit: money(customer.creditLimit),
      balance: money(customer.balance),
      openingBalance: money(customer.openingBalance),
      openingBalanceDate: customer.openingBalanceDate,
      openingBalanceNote: customer.openingBalanceNote,
      trustScore: customer.trustScore,
    }),
  }
}

export function filterCustomerHistoryRows(rows, access) {
  return rows.filter((row) => {
    if (['receivable_sale', 'sale_payment_adjustment', 'customer_credit_application', 'pos_sale', 'customer_invoice'].includes(row.source)) return access.sales
    if (row.source === 'customer_payment') return access.payments
    if (row.source === 'customer_withdrawal') return access.withdrawals
    if (row.source === 'credit_note') return access.creditNotes
    if (row.source === 'sale_return') return access.returns
    if (row.source === 'opening_balance') return access.balance
    if (row.source === 'customer_activity') return access.businessActivity
    return false
  })
}
