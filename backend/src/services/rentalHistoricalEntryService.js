const cents = value => Math.round((Number(value) || 0) * 100)
const fromCents = value => value / 100

export function allocateHistoricalPaymentBalances(totalAmount, depositAmount, payments) {
  let chargeBalance = cents(totalAmount)
  let heldDeposit = 0
  let rentalPaid = 0
  let depositCollected = 0
  let depositRefunded = 0
  const rows = payments.map(payment => {
    const amount = cents(payment.amount)
    if (amount <= 0) throw Object.assign(new Error('Historical payment amounts must be greater than zero.'), { statusCode: 400 })
    if (payment.kind === 'rental_payment') {
      rentalPaid += amount
      chargeBalance = Math.max(0, chargeBalance - amount)
      return { ...payment, balanceAfter: fromCents(chargeBalance) }
    }
    if (payment.kind === 'deposit') {
      depositCollected += amount
      heldDeposit += amount
      return { ...payment, balanceAfter: fromCents(heldDeposit) }
    }
    if (payment.kind !== 'deposit_refund') throw Object.assign(new Error('Historical payment type is invalid.'), { statusCode: 400 })
    depositRefunded += amount
    heldDeposit = Math.max(0, heldDeposit - amount)
    return { ...payment, balanceAfter: fromCents(heldDeposit) }
  })
  if (rentalPaid > cents(totalAmount)) throw Object.assign(new Error('Historical rental payments cannot exceed the booking total.'), { statusCode: 400 })
  if (depositCollected > cents(depositAmount)) throw Object.assign(new Error('Historical deposits received cannot exceed the agreed deposit.'), { statusCode: 400 })
  if (depositRefunded > depositCollected) throw Object.assign(new Error('Historical deposit refunds cannot exceed deposits recorded as received.'), { statusCode: 400 })
  return {
    payments: rows,
    amountPaid: fromCents(rentalPaid),
    balance: fromCents(Math.max(0, cents(totalAmount) - rentalPaid)),
    depositPaid: fromCents(depositCollected),
    depositRefunded: fromCents(depositRefunded),
    heldDeposit: fromCents(Math.max(0, depositCollected - depositRefunded)),
  }
}
