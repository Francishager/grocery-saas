const money = value => Math.round((Number(value) || 0) * 100) / 100

export function allocateRentPaymentToPeriods({ amount, charges, advanceCapacity = 0 }) {
  const payment = money(amount)
  const ordered = [...(charges || [])].sort((a, b) => String(a.period).localeCompare(String(b.period)))
  const selectedDue = money(ordered.reduce((sum, charge) => sum + Math.max(0, Number(charge.amount) - Number(charge.amountPaid)), 0))
  const maxAllowed = money(selectedDue + advanceCapacity)
  if (payment > maxAllowed + 0.01) {
    return { error: `Payment exceeds selected rent periods and the stated advance allowance of ${money(advanceCapacity).toLocaleString()}.`, selectedDue, maxAllowed }
  }

  let remaining = payment
  const allocations = []
  for (const charge of ordered) {
    if (remaining <= 0.001) break
    const due = money(Math.max(0, Number(charge.amount) - Number(charge.amountPaid)))
    const applied = money(Math.min(remaining, due))
    if (applied <= 0) continue
    allocations.push({ chargeId: charge.id, period: charge.period, amount: applied })
    remaining = money(remaining - applied)
  }
  return { allocations, appliedAmount: money(payment - remaining), advanceAmount: remaining, selectedDue, maxAllowed }
}
