export function tenancyOccupiesRentPeriod(tenancy, period) {
  const [year, month] = String(period).split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return false
  const startDate = new Date(tenancy.startDate)
  if (!Number.isFinite(startDate.getTime())) return false
  const startPeriod = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`
  if (String(period) < startPeriod) return false
  if (tenancy.status !== 'ended') return true
  if (!tenancy.endDate) return false
  const endDate = new Date(tenancy.endDate)
  const endPeriod = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}`
  return Number.isFinite(endDate.getTime()) && String(period) <= endPeriod
}

export function proratedStartingMonthRent(monthlyRent, startDateValue, period) {
  const startDate = new Date(startDateValue)
  const startPeriod = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`
  const rent = Math.max(0, Number(monthlyRent) || 0)
  if (!Number.isFinite(startDate.getTime()) || String(period) !== startPeriod || startDate.getUTCDate() === 1) return Math.round(rent * 100) / 100
  const daysInMonth = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0)).getUTCDate()
  const chargeableDays = daysInMonth - startDate.getUTCDate() + 1
  return Math.round((rent * chargeableDays / daysInMonth) * 100) / 100
}

export function countUnpaidRentMonths(charges, startPeriod, endPeriod) {
  return charges.filter(charge => charge.period >= startPeriod && charge.period <= endPeriod
    && Number(charge.amount) - Number(charge.amountPaid) > 0.01).length
}
