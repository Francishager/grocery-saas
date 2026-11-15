export function isCustomerWalletDeposit(payment) {
  return (payment?.allocations || []).some((allocation) => allocation?.targetType === 'customer_wallet')
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
