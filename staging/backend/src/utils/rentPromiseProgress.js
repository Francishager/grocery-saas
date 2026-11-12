const cents = value => Math.round((Number(value) || 0) * 100) / 100

export function calculateRentPromiseProgress(promises, now = new Date()) {
  const lineById = new Map()
  const linesByCharge = new Map()
  const paymentsByCharge = new Map()

  for (const promise of promises) {
    for (const allocation of promise.allocations || []) {
      const line = { ...allocation, fulfilledAmount: 0, promise }
      lineById.set(line.id, line)
      const chargeId = allocation.chargeId || allocation.charge?.id
      if (!linesByCharge.has(chargeId)) linesByCharge.set(chargeId, [])
      linesByCharge.get(chargeId).push(line)

      for (const paymentAllocation of allocation.charge?.allocations || []) {
        const payment = paymentAllocation.payment
        if (!payment || payment.status !== 'posted') continue
        if (!paymentsByCharge.has(chargeId)) paymentsByCharge.set(chargeId, new Map())
        paymentsByCharge.get(chargeId).set(paymentAllocation.id, {
          id: paymentAllocation.id,
          createdAt: payment.createdAt,
          amount: Number(paymentAllocation.amount) || 0,
        })
      }
    }
  }

  for (const [chargeId, lines] of linesByCharge) {
    const payments = [...(paymentsByCharge.get(chargeId)?.values() || [])]
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    lines.sort((a, b) => new Date(b.promise.createdAt) - new Date(a.promise.createdAt) || a.id.localeCompare(b.id))
    for (const payment of payments) {
      let remaining = cents(payment.amount)
      const paymentDate = new Date(payment.createdAt)
      for (const line of lines) {
        if (remaining <= 0.001) break
        const promiseDate = new Date(line.promise.createdAt)
        const deadline = new Date(line.promise.dueDate)
        if (paymentDate < promiseDate || paymentDate > deadline) continue
        const outstanding = cents(Number(line.amount) - line.fulfilledAmount)
        if (outstanding <= 0.001) continue
        const applied = cents(Math.min(remaining, outstanding))
        line.fulfilledAmount = cents(line.fulfilledAmount + applied)
        remaining = cents(remaining - applied)
      }
    }
  }

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const rows = promises.map(promise => {
    const allocations = (promise.allocations || []).map(allocation => {
      const line = lineById.get(allocation.id)
      return { ...allocation, fulfilledAmount: cents(line?.fulfilledAmount || 0), remainingAmount: cents(Math.max(0, Number(allocation.amount) - (line?.fulfilledAmount || 0))) }
    })
    const amount = cents(promise.amount)
    const fulfilledAmount = cents(allocations.reduce((sum, allocation) => sum + allocation.fulfilledAmount, 0))
    const remainingAmount = cents(Math.max(0, amount - fulfilledAmount))
    let status = 'upcoming'
    if (fulfilledAmount + 0.001 >= amount) status = 'kept'
    else if (fulfilledAmount > 0) status = new Date(promise.dueDate) < today ? 'partially_kept' : 'partially_paid'
    else if (new Date(promise.dueDate) < today) status = 'missed'
    else if (new Date(promise.dueDate).toDateString() === today.toDateString()) status = 'due_today'
    return { ...promise, allocations, fulfilledAmount, remainingAmount, status }
  })

  const counts = rows.reduce((summary, row) => {
    summary.total += 1
    summary[row.status] = (summary[row.status] || 0) + 1
    summary.promisedAmount = cents(summary.promisedAmount + Number(row.amount))
    summary.fulfilledAmount = cents(summary.fulfilledAmount + row.fulfilledAmount)
    if (!['missed', 'partially_kept'].includes(row.status)) summary.remainingAmount = cents(summary.remainingAmount + row.remainingAmount)
    return summary
  }, { total: 0, upcoming: 0, due_today: 0, kept: 0, partially_paid: 0, partially_kept: 0, missed: 0, promisedAmount: 0, fulfilledAmount: 0, remainingAmount: 0 })

  return { promises: rows, counts }
}
