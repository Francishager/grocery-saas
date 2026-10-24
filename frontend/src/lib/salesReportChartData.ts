type TrendRow = { label: string; sales: number; netRevenue: number; collections: number; returns: number; expenses: number };

const dateParts = (date: Date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]),
);

const mondayKey = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

export function buildDailySalesTrend(transactions: any[] = []): TrendRow[] {
  const valid = transactions.map((row) => ({ row, date: new Date(row.date) })).filter(({ date }) => Number.isFinite(date.getTime()));
  const calendarDays = new Set(valid.map(({ date }) => {
    const parts = dateParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }));
  const granularity = calendarDays.size <= 1 ? 'hour' : calendarDays.size <= 31 ? 'day' : 'week';
  const groups = new Map<string, TrendRow>();

  for (const { row, date } of valid) {
    const parts = dateParts(date);
    const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
    const key = granularity === 'hour' ? `${dayKey}T${parts.hour}` : granularity === 'week' ? mondayKey(dayKey) : dayKey;
    const label = granularity === 'hour'
      ? `${parts.hour}:00`
      : granularity === 'week'
        ? `Week of ${key.slice(8, 10)}/${key.slice(5, 7)}`
        : `${parts.day}/${parts.month}`;
    const current = groups.get(key) || { label, sales: 0, netRevenue: 0, collections: 0, returns: 0, expenses: 0 };
    const amount = Number(row.amount || 0);
    if (row.kind === 'sale' || row.kind === 'credit-sale') {
      current.sales += amount;
      current.netRevenue += Number(row.revenue ?? amount);
    } else if (row.kind === 'sales-adjustment') {
      current.returns -= Math.abs(Number(row.revenue ?? amount));
      current.netRevenue += Number(row.revenue ?? -amount);
    } else if (row.kind === 'collection') {
      current.collections += amount;
    } else if (row.kind === 'expense') {
      current.expenses -= amount;
    }
    groups.set(key, current);
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? Math.round((value + Number.EPSILON) * 100) / 100 : value]),
  ) as TrendRow);
}
