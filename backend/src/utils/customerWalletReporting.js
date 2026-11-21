export function isCustomerWalletDeposit(payment) {
  return (payment?.allocations || []).some((allocation) => allocation?.targetType === 'customer_wallet')
}

export function summarizeCustomerWalletMovements(groups = []) {
  const summary = {
    deposits: 0,
    openingFunds: 0,
    withdrawals: 0,
    appliedToSales: 0,
    otherCredits: 0,
    otherDebits: 0,
    totalCredits: 0,
    totalDebits: 0,
    balance: 0,
  }
  for (const group of Array.isArray(groups) ? groups : []) {
    const amount = Math.round((Number(group?._sum?.amount) || 0) * 100) / 100
    if (group?.direction === 'in') {
      summary.totalCredits += amount
      if (group.kind === 'deposit') summary.deposits += amount
      else if (['opening_balance', 'legacy_opening'].includes(group.kind)) summary.openingFunds += amount
      else summary.otherCredits += amount
    } else if (group?.direction === 'out') {
      summary.totalDebits += amount
      if (group.kind === 'withdrawal') summary.withdrawals += amount
      else if (group.kind === 'sale_application') summary.appliedToSales += amount
      else summary.otherDebits += amount
    }
  }
  for (const key of Object.keys(summary)) summary[key] = Math.round(summary[key] * 100) / 100
  summary.balance = Math.round((summary.totalCredits - summary.totalDebits) * 100) / 100
  return summary
}

export function customerWalletDepositReferenceKeys(payments = []) {
  return new Set((Array.isArray(payments) ? payments : [])
    .filter(isCustomerWalletDeposit)
    .flatMap((payment) => [payment.id, payment.reference, payment.transactionId].filter(Boolean).map(String)))
}

export function isCustomerWalletDepositMovement(movement, referenceKeys) {
  return Boolean(movement && referenceKeys && (
    referenceKeys.has(String(movement.id || '')) || referenceKeys.has(String(movement.reference || ''))
  ))
}

export function customerWalletWithdrawalReferenceKeys(withdrawals = []) {
  return new Set((Array.isArray(withdrawals) ? withdrawals : [])
    .flatMap((withdrawal) => [withdrawal.id, withdrawal.reference].filter(Boolean).map(String)))
}

export function isCustomerWalletWithdrawalMovement(movement, referenceKeys) {
  return Boolean(movement && referenceKeys && (
    referenceKeys.has(String(movement.id || '')) || referenceKeys.has(String(movement.reference || ''))
  ))
}

export function customerWalletReclassificationStatementRow(customer, wallet) {
  const amount = Number(wallet?.migratedLegacyAmount || 0)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const roundedAmount = Math.round(amount * 100) / 100
  if (roundedAmount <= 0) return null
  return {
    id: `wallet-reclassification-${customer.id}`,
    date: wallet.createdAt || customer.openingBalanceDate || customer.createdAt,
    type: 'Customer Funds Reclassification',
    description: 'Existing customer credit reclassified to customer funds; no cash was received.',
    debit: roundedAmount,
    credit: 0,
    amount: roundedAmount,
    reference: 'Customer funds reclassification',
    details: 'Non-cash opening balance reclassification',
    paymentMethod: '-',
  }
}

export function customerWalletTransactionsWithBalances(transactions = [], currentBalance = 0) {
  let balanceAfter = Number(currentBalance || 0)
  balanceAfter = Number.isFinite(balanceAfter) ? Math.round(balanceAfter * 100) / 100 : 0
  return (Array.isArray(transactions) ? transactions : []).map((transaction) => {
    const amount = Number(transaction?.amount || 0)
    const movement = Number.isFinite(amount) ? amount : 0
    const row = { ...transaction, balanceAfter }
    balanceAfter = Math.round((balanceAfter - (transaction?.direction === 'in' ? movement : -movement)) * 100) / 100
    return row
  })
}
