export function tenancyOccupiesRentPeriod(tenancy, period) {
  const [year, month] = String(period).split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return false
  const dueDate = new Date(Date.UTC(year, month - 1, 1, 12))
  if (new Date(tenancy.startDate) > dueDate) return false
  return tenancy.status !== 'ended' || Boolean(tenancy.endDate && new Date(tenancy.endDate) >= dueDate)
}
