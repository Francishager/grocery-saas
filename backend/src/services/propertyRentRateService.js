const monthKey = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
const shiftMonth = (period, offset = 1) => {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, 1, 12))
  return monthKey(date)
}
const amount = value => Math.round((Number(value) || 0) * 100) / 100

export async function nextUnchargedRentPeriod(tx, tenancyId, now = new Date()) {
  const currentPeriod = monthKey(now)
  const tenancy = await tx.propertyTenancy.findUnique({ where: { id: tenancyId }, select: { startDate: true } })
  const latestCharge = await tx.rentCharge.findFirst({
    where: { tenancyId, period: { gte: currentPeriod } },
    orderBy: { period: 'desc' },
    select: { period: true },
  })
  const unchargedPeriod = latestCharge ? shiftMonth(latestCharge.period) : currentPeriod
  const startPeriod = tenancy?.startDate ? monthKey(tenancy.startDate) : currentPeriod
  return unchargedPeriod > startPeriod ? unchargedPeriod : startPeriod
}

export async function recordTenancyRentRate(tx, { tenancy, newAmount, changedById, effectivePeriod, changeSource, note }) {
  const nextAmount = amount(newAmount)
  const latest = await tx.propertyRentRateHistory.findFirst({
    where: { tenancyId: tenancy.id },
    orderBy: [{ effectivePeriod: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, newAmount: true, effectivePeriod: true },
  })

  if (!latest) {
    const startingAmount = amount(tenancy.rentAmount)
    await tx.propertyRentRateHistory.create({ data: {
      tenantId: tenancy.tenantId,
      unitId: tenancy.unitId,
      tenancyId: tenancy.id,
      previousAmount: startingAmount,
      newAmount: startingAmount,
      effectivePeriod: monthKey(tenancy.startDate),
      changedById,
      changeSource: 'legacy_baseline',
      note: 'Baseline captured when rent-rate history tracking began.',
    } })
  }

  const previousAmount = latest ? amount(latest.newAmount) : amount(tenancy.rentAmount)
  if (previousAmount === nextAmount) return null

  return tx.propertyRentRateHistory.create({ data: {
    tenantId: tenancy.tenantId,
    unitId: tenancy.unitId,
    tenancyId: tenancy.id,
    previousAmount,
    newAmount: nextAmount,
    effectivePeriod,
    changedById,
    changeSource,
    note: note || null,
  } })
}

export async function rentAmountForPeriod(tx, tenancy, period) {
  const rate = await tx.propertyRentRateHistory.findFirst({
    where: { tenantId: tenancy.tenantId, tenancyId: tenancy.id, effectivePeriod: { lte: period } },
    orderBy: [{ effectivePeriod: 'desc' }, { createdAt: 'desc' }],
    select: { newAmount: true },
  })
  return rate ? amount(rate.newAmount) : amount(tenancy.rentAmount)
}

export async function recordUnitRentRate(tx, { tenantId, unitId, previousAmount, newAmount, changedById, effectivePeriod }) {
  const before = amount(previousAmount)
  const after = amount(newAmount)
  if (before === after) return null
  return tx.propertyRentRateHistory.create({ data: {
    tenantId,
    unitId,
    previousAmount: before,
    newAmount: after,
    effectivePeriod,
    changedById,
    changeSource: 'unit_edit',
    note: 'Default unit rent changed; active tenancy rates are recorded separately.',
  } })
}

export { monthKey, shiftMonth }
