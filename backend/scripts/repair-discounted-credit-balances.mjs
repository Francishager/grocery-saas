import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { calculateCustomerReceivableBalance } from '../src/utils/customerBalance.js';
import { applyDiscountCreditRepair, planDiscountCreditRepair } from '../src/utils/discountCreditRepair.js';

const args = process.argv.slice(2);
const tenantId = args.find((arg) => arg.startsWith('--tenant='))?.slice(9);
const customerId = args.find((arg) => arg.startsWith('--customer='))?.slice(11);
const allTenants = args.includes('--all-tenants');
const apply = args.includes('--apply');
const details = args.includes('--details');

async function main() {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/repair-discounted-credit-balances.mjs --tenant=ID [--customer=ID] [--apply]\n'
      + '       node scripts/repair-discounted-credit-balances.mjs --all-tenants [--apply]\n'
      + 'Default: read-only dry run. --apply repairs confirmed discount overcredits with an audit record.\n'
      + 'Payments, cancelled sales and unexplained differences are reported for review.\n'
      + 'Add --details to include unchanged customer balances in the output.');
    return;
  }
  const unknown = args.filter((arg) => !['--all-tenants', '--apply', '--dry-run', '--details'].includes(arg)
    && !arg.startsWith('--tenant=') && !arg.startsWith('--customer='));
  if (unknown.length || Boolean(tenantId) === allTenants || (customerId && !tenantId)
    || (apply && args.includes('--dry-run'))) {
    throw new Error('Specify --tenant=ID or --all-tenants. --customer requires --tenant. Do not combine --apply and --dry-run.');
  }
  const prisma = new PrismaClient();
  const summary = { mode: apply ? 'apply' : 'dry-run', scanned: 0, repairs: 0, review: 0, unchanged: 0 };
  try {
    let cursor;
    while (true) {
      const customers = await prisma.customer.findMany({
        where: { ...(tenantId ? { tenantId } : {}), ...(customerId ? { id: customerId } : {}),
          creditNotes: { some: { status: { not: 'cancelled' }, sale: { is: {
            OR: [{ discount: { gt: 0 } }, { cashDiscount: { gt: 0 } }],
          } } } } },
        select: { id: true, tenantId: true }, orderBy: { id: 'asc' }, take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!customers.length) break;
      for (const ref of customers) {
        const plan = await prisma.$transaction(async (tx) => {
          const customer = await tx.customer.findFirst({ where: ref });
          if (!customer) throw new Error('Customer disappeared during reconciliation');
          const notes = await tx.creditNote.findMany({
            where: { tenantId: ref.tenantId, customerId: ref.id, status: { not: 'cancelled' } },
            include: { sale: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });
          const calculated = await calculateCustomerReceivableBalance(tx, { tenantId: ref.tenantId }, ref.id);
          const proposed = planDiscountCreditRepair(customer, notes, calculated.balance);
          if (apply) await applyDiscountCreditRepair(tx, proposed);
          return proposed;
        }, { isolationLevel: 'Serializable', timeout: 30000 });
        summary.scanned++;
        if (plan.status === 'repair') summary.repairs++;
        else summary[plan.status]++;
        if (details || plan.status !== 'unchanged') console.log(JSON.stringify({ ...plan, applied: apply && plan.status === 'repair' }));
      }
      cursor = customers.at(-1).id;
    }
    console.log(JSON.stringify(summary));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Connection errors can contain the connection string; never print database credentials.
  console.error(error.code ? `Reconciliation failed (${error.code}); no partial customer repair was committed.`
    : String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[database URL]'));
  process.exitCode = 1;
});
