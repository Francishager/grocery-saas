function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function addMonths(period, count) {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + count, 1))
  return monthKey(date)
}

export function propertyRentPeriods(payment) {
  const periods = new Set((payment.allocations || [])
    .map(allocation => allocation.charge?.period)
    .filter(period => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))))

  const selectedMonths = Number(payment.rentMonths)
  if (payment.paymentType === 'rent' && Number.isInteger(selectedMonths) && selectedMonths > 0) {
    const recordedAt = payment.createdAt ? new Date(payment.createdAt) : new Date(payment.paymentDate)
    const advanceAmount = Number(payment.advanceAmount || 0)
    const monthlyRent = Number(payment.monthlyRent ?? payment.tenancy?.rentAmount)
    if (Number.isFinite(recordedAt.getTime())) {
      const recordedPeriod = monthKey(recordedAt)
      const includesRecordedMonth = periods.has(recordedPeriod)
      if (!periods.size && advanceAmount <= 0.01) {
        for (let offset = 0; offset < selectedMonths; offset++) periods.add(addMonths(recordedPeriod, offset))
      } else if (advanceAmount > 0.01 && monthlyRent > 0) {
        const availableFutureMonths = Math.floor((advanceAmount + 0.01) / monthlyRent)
        const monthsToShow = Math.min(availableFutureMonths, includesRecordedMonth ? selectedMonths - 1 : selectedMonths)
        for (let offset = 0; offset < monthsToShow; offset++) periods.add(addMonths(addMonths(recordedPeriod, 1), offset))
      }
    }
  }

  return [...periods].sort()
}
