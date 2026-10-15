const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const BUCKETS = ['notDue', 'current', '1-30', '31-60', '61-90', '90+'];

function utcDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function agingBucket(dueDate, asOfDate = new Date()) {
  const due = utcDay(dueDate);
  const asOf = utcDay(asOfDate);
  if (due === null || asOf === null) return { bucket: 'current', daysPastDue: 0, daysUntilDue: 0 };
  const difference = Math.floor((asOf - due) / DAY_MS);
  if (difference < 0) return { bucket: 'notDue', daysPastDue: 0, daysUntilDue: Math.abs(difference) };
  if (difference === 0) return { bucket: 'current', daysPastDue: 0, daysUntilDue: 0 };
  if (difference <= 30) return { bucket: '1-30', daysPastDue: difference, daysUntilDue: 0 };
  if (difference <= 60) return { bucket: '31-60', daysPastDue: difference, daysUntilDue: 0 };
  if (difference <= 90) return { bucket: '61-90', daysPastDue: difference, daysUntilDue: 0 };
  return { bucket: '90+', daysPastDue: difference, daysUntilDue: 0 };
}

export function buildAgingReport(rows, { entityKey, entityIdKey, asOfDate = new Date(), title }) {
  const buckets = Object.fromEntries(BUCKETS.map((key) => [key, 0]));
  const entities = new Map();
  const transactions = (Array.isArray(rows) ? rows : []).map((row) => {
    const balance = money(row.balance);
    const aging = agingBucket(row.dueDate || row.date, asOfDate);
    buckets[aging.bucket] = money(buckets[aging.bucket] + balance);
    const entityName = row[entityKey] || 'Unknown';
    const groupKey = row[entityIdKey] || entityName;
    const group = entities.get(groupKey) || {
      [entityKey]: entityName,
      [entityIdKey]: row[entityIdKey] || null,
      totalBalance: 0,
      documentCount: 0,
      oldestDaysPastDue: 0,
      aging: Object.fromEntries(BUCKETS.map((key) => [key, 0])),
    };
    group.totalBalance = money(group.totalBalance + balance);
    group.documentCount += 1;
    group.oldestDaysPastDue = Math.max(group.oldestDaysPastDue, aging.daysPastDue);
    group.aging[aging.bucket] = money(group.aging[aging.bucket] + balance);
    entities.set(groupKey, group);
    return {
      ...row,
      [entityKey]: entityName,
      balance,
      agingBasis: row.agingBasis || (row.dueDate ? 'Due date' : 'Document date (no due date set)'),
      daysPastDue: aging.daysPastDue,
      daysUntilDue: aging.daysUntilDue,
      agingBucket: aging.bucket,
    };
  }).sort((a, b) => b.daysPastDue - a.daysPastDue || new Date(a.dueDate || a.date) - new Date(b.dueDate || b.date));

  const data = [...entities.values()].sort((a, b) => b.totalBalance - a.totalBalance);
  return {
    title,
    asOfDate: new Date(asOfDate).toISOString(),
    data,
    transactions,
    buckets,
    currentBalance: money(transactions.reduce((sum, row) => sum + row.balance, 0)),
    summary: {
      totalOutstanding: money(transactions.reduce((sum, row) => sum + row.balance, 0)),
      entityCount: data.length,
      documentCount: transactions.length,
      notYetDue: buckets.notDue,
      dueToday: buckets.current,
      days1To30: buckets['1-30'],
      days31To60: buckets['31-60'],
      days61To90: buckets['61-90'],
      daysOver90: buckets['90+'],
    },
    generatedAt: new Date().toISOString(),
  };
}
