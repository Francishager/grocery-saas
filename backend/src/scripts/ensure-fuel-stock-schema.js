import prisma from '../db.js';
import { readFile } from 'node:fs/promises';
import { ensureFuelAccountingAccounts, fuelOpeningLines, postFuelJournal } from '../services/fuelAccountingService.js';

try {
  const sql = await readFile(new URL('../../prisma/migrations/20261021140000_fuel_stock_ledger_and_reconciliation/migration.sql', import.meta.url), 'utf8');
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
  }, { timeout: 30000 });
  const tanks = await prisma.fuelTank.findMany({ where: { currentStock: { gt: 0 } }, select: { id: true, tenantId: true, branchId: true, name: true, currentStock: true, unitCost: true } });
  let openingEntries = 0;
  for (const tank of tanks) {
    const user = await prisma.user.findFirst({ where: { tenantId: tank.tenantId, isActive: true }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
    if (!user) continue;
    const created = await prisma.$transaction(async tx => {
      const accounts = await ensureFuelAccountingAccounts(tx, tank.tenantId);
      const result = await postFuelJournal(tx, {
        tenantId: tank.tenantId, userId: user.id, branchId: tank.branchId,
        sourceType: 'FUEL_TANK_OPENING', sourceId: `${tank.tenantId}:${tank.id}`,
        reference: tank.name, description: `Fuel stock snapshot at accounting activation: ${tank.name}`,
        lines: fuelOpeningLines(accounts, Number(tank.currentStock) * Number(tank.unitCost)),
      });
      return !result.alreadyPosted;
    }, { timeout: 30000, isolationLevel: 'Serializable' });
    if (created) openingEntries++;
  }
  console.log(`Fuel stock ledger ready; ${openingEntries} opening accounting snapshot(s) posted.`);
} catch (error) {
  console.error('Unable to prepare fuel stock ledger schema.', error.code || '');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
