const money = value => Math.round((Number(value) || 0) * 100) / 100

export function calculateRentAging(charges, asOf = new Date()) {
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  const aging = { notDue: 0, days1To30: 0, days31To60: 0, days61To90: 0, over90Days: 0 }
  for (const charge of charges) {
    const remaining = Math.max(0, Number(charge.amount || 0) - Number(charge.amountPaid || 0))
    if (!remaining) continue
    const due = new Date(charge.dueDate)
    const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
    const age = Math.floor((today - dueDay) / 86400000)
    if (age <= 0) aging.notDue += remaining
    else if (age <= 30) aging.days1To30 += remaining
    else if (age <= 60) aging.days31To60 += remaining
    else if (age <= 90) aging.days61To90 += remaining
    else aging.over90Days += remaining
  }
  for (const key of Object.keys(aging)) aging[key] = money(aging[key])
  aging.overdueTotal = money(aging.days1To30 + aging.days31To60 + aging.days61To90 + aging.over90Days)
  return aging
}
