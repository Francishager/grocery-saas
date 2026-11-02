import { attachCustomerReceivableBalances, rentalModuleEnabled } from './customerBalance.js';
import { scopedWhere } from './branchAccess.js';

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

export function buildOutstandingReceivableRows(customers, sales, rentalReceivables = []) {
  const result = [];
  for (const customer of customers) {
    const rows = [];
    if (Number(customer.openingBalance) > 0) rows.push({ id: `opening-${customer.id}`,
      reference: 'Opening Balance', date: customer.openingBalanceDate || customer.createdAt,
      dueDate: customer.openingBalanceDate || customer.createdAt, type: 'Opening Balance',
      agingBasis: customer.openingBalanceDate ? 'Opening balance date' : 'Customer record date (no opening date set)',
      status: 'opening_balance', total: money(customer.openingBalance), amountPaid: 0,
      balance: money(customer.openingBalance) });
    rows.push(...sales.filter((sale) => sale.customerId === customer.id && sale.balance > 0)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((sale) => ({ id: sale.id, reference: sale.receiptNo, date: sale.createdAt,
        dueDate: sale.dueDate || sale.createdAt,
        agingBasis: sale.dueDate ? 'Due date' : 'Invoice date (no due date set)', type: 'Invoice', status: sale.paymentStatus,
        total: sale.total, amountPaid: sale.amountPaid, balance: sale.balance })));
    rows.push(...rentalReceivables.filter((rental) => rental.customerId === customer.id && Number(rental.balance) > 0)
      .map((rental) => {
        const historical = rental.isHistoricalReceivable === true || Number(rental.historicalReceivableAmount) > 0
        const total = money(historical ? rental.historicalReceivableAmount : rental.totalAmount)
        return {
          id: rental.id,
          reference: rental.historicalReference || rental.rentalNo,
          date: rental.hireDate,
          dueDate: rental.expectedReturnDate || rental.hireDate,
          agingBasis: rental.expectedReturnDate ? 'Expected rental return date' : 'Rental booking date',
          type: historical ? 'Historical Rental Receivable' : 'Rental Receivable',
          status: Number(rental.balance) < total ? 'partial' : 'unpaid',
          total,
          amountPaid: money(Math.max(0, total - Number(rental.balance))),
          balance: money(rental.balance),
        }
      }));
    // Apply existing customer credit to the oldest debt for the aging view only.
    let availableCredit = money(Math.max(0, rows.reduce((sum, row) => sum + row.balance, 0) - Math.max(0, customer.balance)));
    for (const row of rows) {
      const creditApplied = money(Math.min(availableCredit, row.balance));
      availableCredit = money(availableCredit - creditApplied);
      const balance = money(row.balance - creditApplied);
      if (balance <= 0) continue;
      result.push({ ...row, customer: customer.name, customerId: customer.id,
        description: `${row.type} - ${customer.name}`, debit: row.total,
        credit: money(Number(row.amountPaid || 0) + creditApplied), creditApplied, balance });
    }
  }
  return result;
}

export async function loadOutstandingReceivableRows(client, salesView, scope, saleWhere = {}) {
  const [rawCustomers, sales] = await Promise.all([
    client.customer.findMany({ where: scopedWhere(scope), select: { id: true, name: true,
      openingBalance: true, openingBalanceDate: true, createdAt: true } }),
    salesView.findMany({ where: scopedWhere(scope, saleWhere), orderBy: { createdAt: 'asc' } }),
  ]);
  const customers = await attachCustomerReceivableBalances(client, scope, rawCustomers);
  const rentalReceivables = client.rental?.findMany && await rentalModuleEnabled(scope.tenantId)
    ? client.rental.findMany({
      where: scopedWhere(scope, { customerId: { in: rawCustomers.map(customer => customer.id) }, status: { not: 'cancelled' }, balance: { gt: 0 }, OR: [{ isHistoricalReceivable: true }, { isHistoricalRecord: false, bookingState: { in: ['checked_out', 'returned'] } }] }),
      select: { id: true, customerId: true, rentalNo: true, historicalReference: true, isHistoricalReceivable: true, historicalReceivableAmount: true, totalAmount: true, hireDate: true, expectedReturnDate: true, balance: true },
      orderBy: { hireDate: 'asc' },
    })
    : [];
  return buildOutstandingReceivableRows(customers, sales, rentalReceivables);
}
