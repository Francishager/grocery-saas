const amount = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function currentWeekRange(today) {
  const date = new Date(`${today}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: date.toISOString().slice(0, 10) };
}

export function buildWeeklySalesTrend(sales, { from, to, timeZone = 'Africa/Kampala' }) {
  const buckets = new Map();
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const labelFormatter = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: 'short' });
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    buckets.set(date, { date, label: labelFormatter.format(cursor), salesCount: 0, grossSales: 0, revenue: 0, tax: 0, discount: 0 });
  }

  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const sale of sales || []) {
    const key = dateFormatter.format(new Date(sale.createdAt));
    const row = buckets.get(key);
    if (!row) continue;
    const total = amount(sale.total);
    const tax = amount(sale.tax);
    row.salesCount += 1;
    row.grossSales += total;
    row.revenue += Math.max(0, total - tax);
    row.tax += tax;
    row.discount += amount(sale.discount) + amount(sale.cashDiscount);
  }

  return [...buckets.values()].map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? Math.round((value + Number.EPSILON) * 100) / 100 : value]),
  ));
}

export function percentageChange(current, previous) {
  const before = amount(previous);
  const now = amount(current);
  if (before === 0) return { amount: now, percent: null, direction: now > 0 ? 'new' : 'unchanged' };
  const difference = Math.round((now - before + Number.EPSILON) * 100) / 100;
  return { amount: difference, percent: Math.round((difference / before) * 10000) / 100, direction: difference > 0 ? 'up' : difference < 0 ? 'down' : 'unchanged' };
}
