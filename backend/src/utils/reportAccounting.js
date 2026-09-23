const money = (value) => Math.round(Number(value || 0) * 100) / 100;

export async function loadLedgerBalances(client, scope, asOf = null) {
  const cutoff = asOf ? new Date(asOf) : null;
  const accounts = await client.account.findMany({
    where: { tenantId: scope.tenantId, ...(cutoff ? { createdAt: { lte: cutoff } } : {}),
      ...(scope.branchId ? { OR: [{ branchId: scope.branchId }, { branchId: null }] } : {}) },
    orderBy: { code: 'asc' },
  });
  const lines = accounts.length ? await client.journalLine.findMany({
    where: { accountId: { in: accounts.map((account) => account.id) },
      entry: { tenantId: scope.tenantId, ...postedJournalWhere } },
    include: { entry: { select: { id: true, entryNo: true, date: true, reference: true, description: true, status: true } } },
    orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
  }) : [];
  const byAccount = new Map();
  for (const line of lines) {
    if (!byAccount.has(line.accountId)) byAccount.set(line.accountId, []);
    byAccount.get(line.accountId).push(line);
  }
  const linkedIds = accounts.map((account) => String(account.description || '').match(/cashAccount:([^\s]+)/)?.[1]).filter(Boolean);
  const cashAccounts = linkedIds.length ? await client.cashAccount.findMany({
    where: { tenantId: scope.tenantId, id: { in: linkedIds } },
  }) : [];
  const laterCash = cutoff && linkedIds.length ? await client.cashTransaction.groupBy({
    by: ['accountId', 'type'],
    where: { tenantId: scope.tenantId, accountId: { in: linkedIds }, createdAt: { gt: cutoff } },
    _sum: { amount: true },
  }) : [];
  const cashBalances = accountCashBalances(cashAccounts, [], laterCash);
  return accounts.map((account) => {
    const debitNormal = ['asset', 'expense', 'expenses'].includes(account.type);
    const accountLines = byAccount.get(account.id) || [];
    const sign = debitNormal ? 1 : -1;
    const later = accountLines.filter((line) => cutoff && new Date(line.entry.date) > cutoff);
    const linkedId = String(account.description || '').match(/cashAccount:([^\s]+)/)?.[1];
    const balance = cashBalances.get(linkedId)?.closing ?? money(Number(account.balance || 0) - sign * later.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0));
    const signedBalance = balance * sign;
    const details = accountLines.filter((line) => !cutoff || new Date(line.entry.date) <= cutoff).map((line) => ({
      id: line.id, date: line.entry.date, reference: line.entry.reference || line.entry.entryNo,
      type: 'Journal', account: account.name, description: line.description || line.entry.description || '',
      debit: Number(line.debit), credit: Number(line.credit), amount: money(Number(line.debit) - Number(line.credit)),
    }));
    const unjournaledBalance = money(signedBalance - details.reduce((sum, line) => sum + line.debit - line.credit, 0));
    if (unjournaledBalance) details.unshift({
      id: 'opening-' + account.id, date: account.createdAt, type: 'Opening / Non-journal Balance',
      account: account.name, description: 'Account balance not represented by journal entries',
      debit: Math.max(0, unjournaledBalance), credit: Math.max(0, -unjournaledBalance), amount: unjournaledBalance,
    });
    return { ...account, key: account.id, account: account.code + ' - ' + account.name, balance,
      debit: Math.max(0, signedBalance), credit: Math.max(0, -signedBalance), details, unjournaledBalance };
  });
}

export function ledgerBalanceSheet(accounts) {
  const sum = (rows) => money(rows.reduce((total, row) => total + row.balance, 0));
  const assets = accounts.filter((row) => row.type === 'asset');
  const liabilities = accounts.filter((row) => row.type === 'liability');
  const equity = accounts.filter((row) => row.type === 'equity');
  const revenue = accounts.filter((row) => ['revenue', 'income'].includes(row.type));
  const expenses = accounts.filter((row) => ['expense', 'expenses'].includes(row.type));
  const retainedEarnings = money(sum(revenue) - sum(expenses));
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = money(sum(equity) + retainedEarnings);
  const difference = money(totalAssets - totalLiabilities - totalEquity);
  return { assets, liabilities, equity, revenue, expenses, retainedEarnings, totalAssets, totalLiabilities,
    totalEquity, difference, isBalanced: Math.abs(difference) < 0.01 };
}

export function expenseDateWhere(range) {
  return range && Object.keys(range).length ? { date: range } : {};
}

export function cashMovementDirection(type) {
  const value = String(type || '').toLowerCase().replace(/-/g, '_');
  if (value.includes('transfer_in') || value.includes('handover_in')) return 'transfer-in';
  if (value.includes('transfer') || value.includes('handover')) return 'transfer-out';
  if (['expense', 'payment', 'withdrawal', 'purchase', 'refund', 'sale_return'].includes(value) || value.includes('out')) return 'out';
  return 'in';
}

export function accountCashBalances(accounts, movements, laterMovements = []) {
  const sumByAccount = (rows) => {
    const totals = new Map();
    for (const row of rows) {
      const incoming = ['in', 'transfer-in'].includes(cashMovementDirection(row.type));
      const amount = Number(row._sum?.amount ?? row.amount ?? 0);
      totals.set(row.accountId, (totals.get(row.accountId) || 0) + (incoming ? amount : -amount));
    }
    return totals;
  };
  const period = sumByAccount(movements);
  const later = sumByAccount(laterMovements);
  return new Map(accounts.map((account) => {
    const closing = money(Number(account.balance || 0) - (later.get(account.id) || 0));
    return [account.id, { closing, opening: money(closing - (period.get(account.id) || 0)) }];
  }));
}

// Reversed originals remain in their posting period; their reversing entries
// contribute the opposite sign on the reversal date.
export const postedJournalWhere = {
  OR: [{ status: 'posted' }, { status: 'reversed', reversalJournalId: { not: null } }],
};

const isExpense = (account) => ['expense', 'expenses'].includes(account?.type?.toLowerCase());
const isTransaction = (account) => String(account?.subType || '').startsWith('transaction_') || String(account?.description || '').includes('cashAccount:');

export async function loadJournalExpenseRows(client, scope, dateRange, { userId = null } = {}) {
  const entries = await client.journalEntry.findMany({
    where: {
      tenantId: scope.tenantId,
      ...(dateRange && Object.keys(dateRange).length ? { date: dateRange } : {}),
      ...(userId ? { userId } : {}),
      AND: [postedJournalWhere, ...(scope.branchId ? [{ OR: [{ branchId: scope.branchId }, { branchId: null }] }] : [])],
      lines: { some: { account: { type: { in: ['expense', 'expenses'] } } } },
    },
    include: {
      user: { select: { id: true, fname: true, lname: true, email: true } },
      branch: { select: { id: true, name: true } },
      lines: { include: { account: { select: { id: true, name: true, type: true, subType: true, description: true } } } },
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  const references = [...new Set(entries.flatMap((entry) => [entry.id, entry.reference, entry.sourceId].filter(Boolean)))];
  const directExpenses = references.length ? await client.expense.findMany({
    where: { tenantId: scope.tenantId, OR: [{ id: { in: references } }, { reference: { in: references } }] },
    select: { id: true, reference: true },
  }) : [];
  const directReferences = new Set(directExpenses.flatMap((expense) => [expense.id, expense.reference].filter(Boolean)));
  return entries.flatMap((entry) => {
    if ([entry.id, entry.reference, entry.sourceId].some((ref) => ref && directReferences.has(ref))) return [];
    const payment = entry.lines.find((line) => isTransaction(line.account) && (Number(line.credit) || Number(line.debit)));
    const method = payment ? String(payment.account.subType || 'transaction_cash').replace('transaction_', '') : 'accrual';
    return entry.lines.filter((line) => isExpense(line.account)).map((line) => ({
      id: `journal-expense-${entry.id}-${line.id}`,
      journalEntryId: entry.id,
      source: 'journal',
      date: entry.date || entry.createdAt,
      createdAt: entry.createdAt,
      reference: entry.reference || entry.entryNo,
      category: line.account.name,
      description: line.description || entry.description || line.account.name,
      paymentMethod: method,
      cashAccount: { name: payment?.account.name || 'Accrued / Payable', type: method },
      cashImpact: Boolean(payment),
      branch: entry.branch,
      User: entry.user,
      amount: money(Number(line.debit || 0) - Number(line.credit || 0)),
    })).filter((row) => row.amount !== 0);
  });
}

export function summarizeCashMovements(movements, openingCash = 0, { saleReferences = new Set(), collectionReferences = new Set(), expenseReferences = new Set() } = {}) {
  const totals = { openingCash: money(openingCash), cashSales: 0, cashCollections: 0, cashExpenses: 0,
    otherCashIn: 0, otherCashOut: 0, cashTransfersIn: 0, cashTransfersOut: 0,
    cashToSafe: 0, cashToBank: 0, cashToMobileMoney: 0 };
  const cashOutReferences = new Set(movements.filter((row) => row.account?.type === 'cash'
    && ['out', 'transfer-out'].includes(cashMovementDirection(row.type))).map((row) => row.reference).filter(Boolean));
  for (const row of movements) {
    const direction = cashMovementDirection(row.type);
    const amount = Number(row.amount || 0);
    const accountType = row.account?.type;
    if (accountType !== 'cash') {
      if (cashOutReferences.has(row.reference) && ['in', 'transfer-in'].includes(direction)) {
        const key = { safe: 'cashToSafe', bank: 'cashToBank', mobile_money: 'cashToMobileMoney' }[accountType];
        if (key) totals[key] += amount;
      }
      continue;
    }
    if (direction === 'transfer-in') totals.cashTransfersIn += amount;
    else if (direction === 'transfer-out') totals.cashTransfersOut += amount;
    else if (direction === 'in') {
      if (saleReferences.has(row.reference) || row.type === 'sale') totals.cashSales += amount;
      else if (collectionReferences.has(row.reference) || ['receipt', 'collection'].includes(row.type)) totals.cashCollections += amount;
      else totals.otherCashIn += amount;
    } else if (row.type === 'expense' || expenseReferences.has(row.reference)) totals.cashExpenses += amount;
    else totals.otherCashOut += amount;
  }
  for (const key of Object.keys(totals)) totals[key] = money(totals[key]);
  const cashReceived = money(totals.cashSales + totals.cashCollections + totals.otherCashIn + totals.cashTransfersIn);
  const cashPaidOut = money(totals.cashExpenses + totals.otherCashOut + totals.cashTransfersOut);
  const netCashMovement = money(cashReceived - cashPaidOut);
  const cashAtHand = money(totals.openingCash + netCashMovement);
  return { ...totals, cashReceived, cashPaidOut, netCashMovement, cashAtHand, expectedCash: cashAtHand,
    otherPhysicalCashIn: totals.otherCashIn, otherPhysicalCashOut: totals.otherCashOut,
    cashRetained: cashAtHand, cashHandedOver: totals.cashTransfersOut };
}
