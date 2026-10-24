import { Router } from "express";
import { randomUUID } from 'node:crypto';
import prisma from "../src/db.js";
import { authenticateToken, requirePermission, loadUserPermissions, canUseTransactionAccountForPayment } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { customerProfileAccess, maskCustomerPhone } from "../src/utils/customerProfileAccess.js";
import { syncLinkedTransactionAccountBalance } from "../src/utils/accountingSync.js";
import { fuelDeliveryValuation, fuelMeterSaleValuation, fuelShiftReconciliation } from "../src/utils/fuelAccounting.js";
import { ensureFuelAccountingAccounts, ensureFuelLinkedAccount, fuelMeterSaleLines, fuelOpeningLines, fuelShiftJournalLines, postFuelJournal } from "../src/services/fuelAccountingService.js";
import { getPayablesAccountingConfig, validatePayablesAccountingConfig } from "../src/services/payablesAccountingService.js";
import { calculateCustomerReceivableBalance, reconcileCustomerReceivableBalance } from "../src/utils/customerBalance.js";
import { getReceivablesAccountingConfig, postCustomerCreditApplicationJournal, postReceivablesJournal, validateReceivablesAccountingConfig } from "../src/services/receivablesAccountingService.js";
import { applyAvailableCustomerCredit } from "../src/services/customerCreditApplicationService.js";
import { resolveBranchScope, scopedWhere } from "../src/utils/branchAccess.js";

const router = Router();
const t = (req) => req.user.tenantId || req.user.tenant_id;
const ensureBranch = async (db, tenantId, branchId) => {
  if (!branchId) return;
  const branch = await db.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
  if (!branch) throw Object.assign(new Error('Branch not found for this business'), { status: 404 });
};
const accountMethod = (type) => ({ cash: 'cash', safe: 'safe', mobile_money: 'mobile_money', bank: 'bank', card: 'card' }[String(type || '').toLowerCase()] || null);
const accountMatches = (account, expected) => expected === 'cash'
  ? ['cash', 'safe'].includes(String(account?.type || '').toLowerCase())
  : expected === 'mobile_money'
    ? String(account?.type || '').toLowerCase() === 'mobile_money'
    : Boolean(accountMethod(account?.type));

async function resolveFuelCashAccount(tx, req, tenantId, accountId, expected) {
  if (!accountId) throw Object.assign(new Error(`Select a permitted ${expected === 'cash' ? 'cash or safe' : expected === 'mobile_money' ? 'mobile money' : 'expense payment'} account.`), { statusCode: 400 });
  const account = await tx.cashAccount.findFirst({ where: { id: accountId, tenantId, isActive: true } });
  if (!account) throw Object.assign(new Error('Selected transaction account is inactive or belongs to another business.'), { statusCode: 400 });
  const method = expected === 'any' ? accountMethod(account.type) : expected;
  if (!accountMatches(account, expected) || !method || !canUseTransactionAccountForPayment(req, account, method)) {
    throw Object.assign(new Error(`You do not have permission to use ${account.name} for this fuel transaction.`), { statusCode: 403 });
  }
  return account;
}

async function recordFuelCashMovement(tx, { req, account, amount, direction, tenantId, branchId, reference, description }) {
  const value = Math.round(Number(amount) * 100) / 100;
  if (value <= 0) return null;
  await tx.$queryRaw`SELECT "id" FROM "cash_accounts" WHERE "id" = ${account.id} AND "tenantId" = ${tenantId} FOR UPDATE`;
  const current = await tx.cashAccount.findFirst({ where: { id: account.id, tenantId, isActive: true } });
  if (!current) throw Object.assign(new Error('Selected transaction account became unavailable. Reload and try again.'), { statusCode: 409 });
  if (direction === 'expense' && Number(current.balance) + 0.001 < value) throw Object.assign(new Error(`Insufficient balance in ${current.name}. Available: ${Number(current.balance).toLocaleString()}, required: ${value.toLocaleString()}.`), { statusCode: 400 });
  const updated = await tx.cashAccount.update({ where: { id: current.id }, data: { balance: { [direction === 'receipt' ? 'increment' : 'decrement']: value } } });
  await tx.cashTransaction.create({ data: { tenantId, accountId: current.id, type: direction, amount: value, balanceAfter: updated.balance, reference, description, userId: req.user.id } });
  await syncLinkedTransactionAccountBalance(tx, tenantId, current.id);
  const linkedAccount = await ensureFuelLinkedAccount(tx, tenantId, updated);
  return { cashAccount: updated, linkedAccount };
}

router.get('/payment-accounts', authenticateToken, loadUserPermissions, requirePermission('canViewFuelStation'), requireFeature('fuel_station.shift_reports'), async (req, res) => {
  try {
    const accounts = await prisma.cashAccount.findMany({ where: { tenantId: t(req), isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, type: true, balance: true, currency: true } });
    res.json(accounts.filter((account) => canUseTransactionAccountForPayment(req, account, accountMethod(account.type))));
  } catch (error) { res.status(500).json({ error: 'Could not load permitted transaction accounts.' }); }
});

router.get('/customers', authenticateToken, loadUserPermissions, requirePermission('canCreateReceivable'), requireFeature('fuel_station.shift_reports'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true });
    const customers = await prisma.customer.findMany({
      where: scopedWhere(scope, { status: 'active' }),
      select: { id: true, name: true, phone: true, balance: true, creditLimit: true },
      orderBy: { name: 'asc' },
    });
    const access = customerProfileAccess(req.user?.permissions);
    res.json(customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      ...(access.phone ? { phone: customer.phone } : { maskedPhone: maskCustomerPhone(customer.phone) }),
      ...(access.balance && { balance: customer.balance, creditLimit: customer.creditLimit }),
    })));
  } catch (e) { res.status(500).json({ error: 'Could not load customers for fuel credit invoices.' }); }
});

router.post('/sales', authenticateToken, loadUserPermissions, requirePermission('canCreateFuelStation'), requirePermission('canCreateReceivable'), requireFeature('fuel_station.shift_reports'), async (req, res) => {
  try {
    const tenantId = t(req);
    const scope = await resolveBranchScope(prisma, req, { source: 'body', requireBranch: true, allowOwnerAll: false });
    const customerId = String(req.body?.customerId || '');
    const shiftId = String(req.body?.shiftId || '');
    const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim();
    const litres = Number(req.body?.litres);
    const unitPrice = Number(req.body?.unitPrice);
    if (!customerId || !shiftId) return res.status(400).json({ error: 'Select a customer and open fuel shift.' });
    if (idempotencyKey.length > 120) return res.status(400).json({ error: 'Sale request key is invalid.' });
    if (!Number.isFinite(litres) || litres <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) return res.status(400).json({ error: 'Litres and unit price must be greater than zero.' });
    if (req.body?.dueDate && Number.isNaN(new Date(req.body.dueDate).getTime())) return res.status(400).json({ error: 'Customer invoice due date is invalid.' });
    const sale = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${idempotencyKey}))`;
      const priorRequest = await tx.fuelSale.findUnique({ where: { idempotencyKey }, include: { sale: { include: { customer: true, creditApplications: true, fuelSale: { include: { tank: true, shift: true } } } } } });
      if (priorRequest?.tenantId === tenantId) return { ...priorRequest.sale, creditApplied: (priorRequest.sale.creditApplications || []).reduce((sum, application) => sum + Number(application.amount || 0), 0) };
      if (priorRequest) throw Object.assign(new Error('Sale request key has already been used.'), { statusCode: 409 });
      await tx.$queryRaw`SELECT "id" FROM "fuel_shift_reports" WHERE "id" = ${shiftId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const shift = await tx.fuelShiftReport.findFirst({ where: { tenantId, id: shiftId, status: 'open', OR: [{ branchId: scope.branchId }, { branchId: null }] }, include: { pump: { include: { tank: true } } } });
      if (!shift?.pump?.tank) throw Object.assign(new Error('An open shift with an assigned fuel tank is required.'), { statusCode: 409 });
      if (shift.salesMode !== 'ticketed') throw Object.assign(new Error('Individual customer invoices are available on shifts opened after the fuel subledger update. Finish this legacy aggregate shift first.'), { statusCode: 409 });
      const customer = await tx.customer.findFirst({ where: scopedWhere(scope, { id: customerId, status: 'active' }) });
      if (!customer) throw Object.assign(new Error('Active customer not found for this business.'), { statusCode: 404 });
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      if (customer.branchId && customer.branchId !== scope.branchId) throw Object.assign(new Error('Customer is assigned to a different branch.'), { statusCode: 400 });
      const measured = await tx.fuelMeterReading.aggregate({ where: { tenantId, shiftId }, _sum: { litresSold: true } });
      const alreadyInvoiced = await tx.fuelSale.aggregate({ where: { tenantId, shiftId }, _sum: { litres: true } });
      const availableLitres = Number(measured._sum.litresSold || 0) - Number(alreadyInvoiced._sum.litres || 0);
      if (litres > availableLitres + 0.001) throw Object.assign(new Error(`Only ${Math.max(0, availableLitres).toFixed(2)} measured litres remain available to invoice for this shift.`), { statusCode: 409 });
      const amount = Math.round(litres * unitPrice * 100) / 100;
      const balanceSnapshot = await calculateCustomerReceivableBalance(tx, scope, customerId);
      const currentBalance = Number(balanceSnapshot?.balance ?? customer.balance ?? 0);
      if (!(Number(customer.creditLimit) > 0)) throw Object.assign(new Error('Set a credit limit for this customer before recording a fuel credit sale.'), { statusCode: 400 });
      if (currentBalance + amount > Number(customer.creditLimit) + 0.01) throw Object.assign(new Error(`This sale exceeds the customer's available credit limit of ${(Number(customer.creditLimit) - currentBalance).toLocaleString()}.`), { statusCode: 400 });
      const arConfig = await getReceivablesAccountingConfig(tx, tenantId);
      const arValidation = await validateReceivablesAccountingConfig(tx, tenantId, arConfig, { requireEnabled: true });
      if (!arValidation.valid) throw Object.assign(new Error('Enable and complete Receivables accounting mappings before posting fuel credit invoices.'), { statusCode: 409 });
      const fuelAccounts = await ensureFuelAccountingAccounts(tx, tenantId);
      if (arConfig.receivableAccountId === fuelAccounts.salesClearing.id) throw Object.assign(new Error('Receivables control account cannot be the Fuel Sales Clearing account. Correct the receivables mapping before posting.'), { statusCode: 409 });
      const receiptNo = `FUEL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const created = await tx.saleRecord.create({ data: {
        receiptNo, tenantId, branchId: scope.branchId, customerId, userId: req.user.id,
        subtotal: amount, total: amount, amountPaid: 0, legacyPaidAmountAtCutover: 0, balance: amount,
        paymentMethod: 'credit', paymentStatus: 'unpaid', status: 'completed',
        dueDate: req.body?.dueDate ? new Date(req.body.dueDate) : new Date(Date.now() + 30 * 86400000),
        notes: `Fuel credit invoice: ${litres} L ${shift.pump.tank.fuelType} from ${shift.pump.tank.name}`,
      } });
      await tx.fuelSale.create({ data: { tenantId, branchId: scope.branchId, tankId: shift.pump.tank.id, shiftId, saleId: created.id, litres, unitPrice, idempotencyKey } });
      await postReceivablesJournal(tx, {
        tenantId, branchId: scope.branchId, userId: req.user.id,
        sourceType: 'FUEL_CUSTOMER_INVOICE', sourceId: created.id, date: created.createdAt,
        reference: receiptNo, description: `Fuel credit invoice ${receiptNo}`,
        lines: [
          { accountId: arConfig.receivableAccountId, debit: amount, credit: 0, description: `Customer receivable ${receiptNo}` },
          { accountId: fuelAccounts.salesClearing.id, debit: 0, credit: amount, description: `Fuel sale allocated to customer ${customer.name}` },
        ],
      });
      const application = await applyAvailableCustomerCredit(tx, {
        scope, customerId, saleId: created.id, amountDue: amount,
        availableCredit: Math.max(0, -currentBalance), userId: req.user.id, branchId: scope.branchId,
      });
      for (const creditApplication of application.applications.filter((row) => row.sourceType === 'payment')) {
        await postCustomerCreditApplicationJournal(tx, {
          tenantId, branchId: scope.branchId, userId: req.user.id,
          application: creditApplication, reference: receiptNo,
        });
      }
      await reconcileCustomerReceivableBalance(tx, scope, customerId);
      const updatedSale = await tx.saleRecord.findUnique({ where: { id: created.id }, include: { customer: true, creditApplications: true, fuelSale: { include: { tank: true, shift: true } } } });
      return { ...updatedSale, creditApplied: application.amount };
    }, { isolationLevel: 'Serializable' });
    res.status(201).json(sale);
  } catch (e) { res.status(e.statusCode || (e.code === 'P2034' ? 409 : 500)).json({ error: e.code === 'P2034' ? 'Fuel shift or customer balance changed. Reload and try again.' : e.message }); }
});

// ===== PUMPS =====
router.get("/pumps", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const pumps = await prisma.fuelPump.findMany({ where: { tenantId: t(req) }, include: { tank: true }, orderBy: { name: "asc" } });
    res.json(pumps);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post("/pumps", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const { name, tankId, nozzleCount, branchId, isActive } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Pump name is required' });
    if (!tankId) return res.status(400).json({ error: 'Tank is required' });
    const tank = await prisma.fuelTank.findFirst({ where: { id: tankId, tenantId: t(req) } });
    if (!tank) return res.status(404).json({ error: 'Tank not found for this business' });
    await ensureBranch(prisma, t(req), branchId || tank.branchId);
    const count = Number(nozzleCount ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 12) return res.status(400).json({ error: 'Nozzle count must be between 1 and 12' });
    const pump = await prisma.fuelPump.create({ data: { name: name.trim(), tankId, nozzleCount: count, branchId: branchId || tank.branchId, isActive: isActive !== false, tenantId: t(req) } });
    res.status(201).json(pump);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.put("/pumps/:id", authenticateToken, requirePermission("canEditFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const { name, tankId, nozzleCount, branchId, isActive } = req.body;
    const existing = await prisma.fuelPump.findFirst({ where: { id: req.params.id, tenantId: t(req) } });
    if (!existing) return res.status(404).json({ error: 'Pump not found' });
    if (tankId) {
      const tank = await prisma.fuelTank.findFirst({ where: { id: tankId, tenantId: t(req) } });
      if (!tank) return res.status(404).json({ error: 'Tank not found for this business' });
      await ensureBranch(prisma, t(req), branchId || tank.branchId);
    } else if (branchId) {
      await ensureBranch(prisma, t(req), branchId);
    }
    const count = Number(nozzleCount ?? existing.nozzleCount);
    if (!Number.isInteger(count) || count < 1 || count > 12) return res.status(400).json({ error: 'Nozzle count must be between 1 and 12' });
    const pump = await prisma.fuelPump.update({ where: { id: existing.id }, data: { name: name?.trim() || existing.name, tankId: tankId ?? existing.tankId, nozzleCount: count, branchId: branchId ?? existing.branchId, isActive } });
    res.json(pump);
  } catch (e) { res.status(e.status || (e.code === 'P2034' ? 409 : 500)).json({ error: e.code === 'P2034' ? 'The tank changed concurrently. Reload and try again.' : e.message }); }
});

router.delete("/pumps/:id", authenticateToken, requirePermission("canDeleteFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const pump = await prisma.fuelPump.findFirst({ where: { id: req.params.id, tenantId: t(req) } });
    if (!pump) return res.status(404).json({ error: 'Pump not found' });
    const [readingCount, shiftCount] = await Promise.all([
      prisma.fuelMeterReading.count({ where: { tenantId: t(req), pumpId: pump.id } }),
      prisma.fuelShiftReport.count({ where: { tenantId: t(req), pumpId: pump.id } }),
    ]);
    if (readingCount || shiftCount) {
      await prisma.fuelPump.update({ where: { id: pump.id }, data: { isActive: false } });
      return res.json({ message: 'Pump deactivated to preserve its operational history' });
    }
    await prisma.fuelPump.delete({ where: { id: pump.id } });
    res.json({ message: "Pump deleted" });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ===== TANKS =====
router.get("/tanks", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const tanks = await prisma.fuelTank.findMany({ where: { tenantId: t(req) }, include: { pumps: true }, orderBy: { name: "asc" } });
    res.json(tanks);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/tanks", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const { name, fuelType, capacity, currentStock, unitCost, branchId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tank name is required' });
    const capacityValue = Number(capacity);
    const stockValue = Number(currentStock ?? 0);
    const costValue = Number(unitCost ?? 0);
    if (!Number.isFinite(capacityValue) || capacityValue <= 0) return res.status(400).json({ error: 'Capacity must be greater than 0' });
    if (!Number.isFinite(stockValue) || stockValue < 0 || stockValue > capacityValue) return res.status(400).json({ error: 'Opening stock must be between 0 and tank capacity' });
    if (!Number.isFinite(costValue) || costValue < 0) return res.status(400).json({ error: 'Unit cost cannot be negative' });
    await ensureBranch(prisma, t(req), branchId);
    const tank = await prisma.$transaction(async tx => {
      const created = await tx.fuelTank.create({ data: { name: name.trim(), fuelType, capacity: capacityValue, currentStock: stockValue, unitCost: costValue, branchId, tenantId: t(req) } });
      const openingValue = stockValue * costValue;
      await tx.fuelStockMovement.create({ data: { tenantId: t(req), tankId: created.id, branchId, movementType: 'opening_balance', litresDelta: stockValue, balanceAfter: stockValue, unitCost: costValue, stockValueDelta: openingValue, stockValueAfter: openingValue, sourceType: 'opening_balance', sourceId: created.id, reason: 'Opening stock entered during tank setup', actorId: req.user.id } });
      if (openingValue > 0) {
        const accounts = await ensureFuelAccountingAccounts(tx, t(req));
        await postFuelJournal(tx, { tenantId: t(req), userId: req.user.id, branchId, sourceType: 'FUEL_TANK_OPENING', sourceId: created.id, reference: created.name, description: `Fuel opening stock: ${created.name}`, lines: fuelOpeningLines(accounts, openingValue) });
      }
      return created;
    });
    res.status(201).json(tank);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/tanks/:id", authenticateToken, requirePermission("canEditFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const { name, fuelType, capacity, unitCost, isActive } = req.body;
    const existing = await prisma.fuelTank.findFirst({ where: { id: req.params.id, tenantId: t(req) } });
    if (!existing) return res.status(404).json({ error: 'Tank not found' });
    if (req.body.currentStock !== undefined) return res.status(400).json({ error: 'Stock cannot be edited directly. Record an audited stock movement instead.' });
    const capacityValue = capacity === undefined ? existing.capacity : Number(capacity);
    const costValue = unitCost === undefined ? existing.unitCost : Number(unitCost);
    if (!Number.isFinite(capacityValue) || capacityValue < existing.currentStock) return res.status(400).json({ error: 'Tank capacity cannot be below current book stock' });
    if (!Number.isFinite(costValue) || costValue < 0) return res.status(400).json({ error: 'Unit cost cannot be negative' });
    if (existing.currentStock > 0 && Math.abs(costValue - existing.unitCost) > 0.000001) return res.status(400).json({ error: 'Unit cost cannot be edited while stock remains. Record a delivery or use the approved stock adjustment workflow so inventory valuation stays auditable.' });
    const tank = await prisma.fuelTank.update({ where: { id: existing.id }, data: { name: name?.trim() || existing.name, fuelType: fuelType || existing.fuelType, capacity: capacityValue, unitCost: costValue, isActive } });
    res.json(tank);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/tanks/:id", authenticateToken, requirePermission("canDeleteFuelStation"), requireFeature("fuel_station.pumps"), async (req, res) => {
  try {
    const tank = await prisma.fuelTank.findFirst({ where: { id: req.params.id, tenantId: t(req) } });
    if (!tank) return res.status(404).json({ error: 'Tank not found' });
    const [pumpCount, movementCount] = await Promise.all([
      prisma.fuelPump.count({ where: { tenantId: t(req), tankId: tank.id } }),
      prisma.fuelStockMovement.count({ where: { tenantId: t(req), tankId: tank.id } }),
    ]);
    if (pumpCount || movementCount || tank.currentStock !== 0) {
      await prisma.fuelTank.update({ where: { id: tank.id }, data: { isActive: false } });
      return res.json({ message: 'Tank deactivated to preserve its stock and operational history' });
    }
    await prisma.fuelTank.delete({ where: { id: tank.id } });
    res.json({ message: "Tank deleted" });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ===== DELIVERIES =====
router.get("/suppliers", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.deliveries"), async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId: t(req), status: 'active' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(suppliers);
  } catch (e) { res.status(500).json({ error: 'Could not load suppliers for fuel invoices.' }); }
});

router.get("/deliveries", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.deliveries"), async (req, res) => {
  try {
    const deliveries = await prisma.fuelDelivery.findMany({ where: { tenantId: t(req) }, include: { tank: true, supplier: { select: { id: true, name: true } }, supplierPurchase: { select: { id: true, refNo: true, total: true, balance: true, paymentStatus: true } } }, orderBy: { deliveryDate: "desc" } });
    res.json(deliveries);
  } catch (e) { res.status(e.status || (e.code === 'P2034' ? 409 : 500)).json({ error: e.code === 'P2034' ? 'The tank changed concurrently. Reload and try again.' : e.message }); }
});

router.post("/deliveries", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.deliveries"), async (req, res) => {
  try {
    const { tankId, supplierId, invoiceNo, litres, unitCost, branchId, deliveryDate, dueDate, notes } = req.body;
    if (!tankId) return res.status(400).json({ error: 'Tank is required' });
    if (!supplierId) return res.status(400).json({ error: 'Select a supplier so the delivery is recorded in their payable subledger.' });
    if (!invoiceNo?.trim()) return res.status(400).json({ error: 'Supplier invoice number is required to prevent duplicate bills.' });
    const litresValue = Number(litres);
    const costValue = Number(unitCost);
    if (!Number.isFinite(litresValue) || litresValue <= 0) return res.status(400).json({ error: 'Litres must be greater than 0' });
    if (!Number.isFinite(costValue) || costValue < 0) return res.status(400).json({ error: 'Unit cost must be zero or greater' });
    const totalCost = Math.round(litresValue * costValue * 100) / 100;
    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) return res.status(400).json({ error: 'Supplier invoice due date is invalid.' });
    const delivery = await prisma.$transaction(async tx => {
      const normalizedInvoice = invoiceNo?.trim() || '';
      if (normalizedInvoice) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${t(req)}), hashtext(${supplierId} || ':' || ${normalizedInvoice}))`;
        if (await tx.fuelDelivery.findFirst({ where: { tenantId: t(req), supplierId, invoiceNo: normalizedInvoice } })) throw Object.assign(new Error('This supplier invoice number is already recorded for this supplier.'), { status: 409 });
      }
      await tx.$queryRaw`SELECT "id" FROM "fuel_tanks" WHERE "id" = ${tankId} AND "tenantId" = ${t(req)} FOR UPDATE`;
      const tank = await tx.fuelTank.findFirst({ where: { id: tankId, tenantId: t(req) } });
      if (!tank) throw Object.assign(new Error('Tank not found for this business'), { status: 404 });
      await ensureBranch(tx, t(req), branchId || tank.branchId);
      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId: t(req), status: 'active' } });
      if (!supplier) throw Object.assign(new Error('Active supplier not found for this business.'), { status: 404 });
      if (supplier.branchId && supplier.branchId !== (branchId || tank.branchId)) throw Object.assign(new Error('The selected supplier is assigned to a different branch.'), { status: 400 });
      if (await tx.supplierPurchase.findFirst({ where: { tenantId: t(req), supplierId, refNo: normalizedInvoice } })) throw Object.assign(new Error('A supplier purchase already uses this invoice number. Open that payable instead of recording the invoice twice.'), { status: 409 });
      const payableConfig = await getPayablesAccountingConfig(tx, t(req));
      const payableValidation = await validatePayablesAccountingConfig(tx, t(req), payableConfig, { requireEnabled: true });
      if (!payableValidation.valid) throw Object.assign(new Error('Enable and complete Payables accounting mappings before recording fuel supplier invoices.'), { statusCode: 409 });
      const valuation = fuelDeliveryValuation({ stockLitres: tank.currentStock, unitCost: tank.unitCost, deliveryLitres: litresValue, deliveryUnitCost: costValue });
      if (valuation.stockAfter > tank.capacity + 0.001) throw Object.assign(new Error(`Delivery exceeds tank capacity by ${(valuation.stockAfter - tank.capacity).toFixed(1)} L`), { status: 409 });
      const purchase = await tx.supplierPurchase.create({ data: {
        refNo: normalizedInvoice, tenantId: t(req), branchId: branchId || tank.branchId,
        supplierId, userId: req.user.id, total: totalCost, amountPaid: 0, balance: totalCost,
        paymentStatus: 'unpaid', dueDate: dueDate ? new Date(dueDate) : undefined,
        notes: `Fuel delivery invoice; ${litresValue} L ${tank.fuelType}. ${notes || ''}`.trim(),
      } });
      const row = await tx.fuelDelivery.create({ data: { tankId, supplierId, supplierName: supplier.name, supplierPurchaseId: purchase.id, invoiceNo: normalizedInvoice, litres: litresValue, unitCost: costValue, totalCost, branchId: branchId || tank.branchId, deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined, notes, tenantId: t(req) } });
      await tx.supplier.update({ where: { id: supplierId }, data: { balance: { increment: totalCost } } });
      await tx.fuelTank.update({ where: { id: tank.id }, data: { currentStock: valuation.stockAfter, unitCost: valuation.averageUnitCost } });
      await tx.fuelStockMovement.create({ data: { tenantId: t(req), tankId: tank.id, branchId: branchId || tank.branchId, movementType: 'delivery', litresDelta: litresValue, balanceAfter: valuation.stockAfter, unitCost: costValue, stockValueDelta: valuation.deliveryValue, stockValueAfter: valuation.stockValueAfter, sourceType: 'delivery', sourceId: row.id, reason: notes || `Supplier delivery ${invoiceNo || ''}`.trim(), actorId: req.user.id } });
      const accounts = await ensureFuelAccountingAccounts(tx, t(req));
      if (payableConfig.payableAccountId === accounts.inventory.id) throw Object.assign(new Error('Accounts Payable cannot be the Fuel Inventory account. Correct the payables mapping before recording this invoice.'), { statusCode: 409 });
      await postFuelJournal(tx, { tenantId: t(req), userId: req.user.id, branchId: branchId || tank.branchId, sourceType: 'FUEL_DELIVERY', sourceId: row.id, date: row.deliveryDate, reference: row.invoiceNo, description: `Fuel delivery from ${row.supplierName}`, lines: [
        { accountId: accounts.inventory.id, debit: totalCost, credit: 0, description: `Fuel inventory received: ${row.litres} L` },
        { accountId: payableConfig.payableAccountId, debit: 0, credit: totalCost, description: `Supplier payable ${row.invoiceNo}` },
      ] });
      await tx.supplierPurchase.update({ where: { id: purchase.id }, data: { notes: `${purchase.notes}\nFuel delivery ID: ${row.id}` } });
      row.supplierPurchaseId = purchase.id;
      return row;
    }, { isolationLevel: 'Serializable' });
    res.status(201).json(delivery);
  } catch (e) { res.status(e.status || (e.code === 'P2034' ? 409 : 500)).json({ error: e.code === 'P2034' ? 'The tank changed concurrently. Reload and try again.' : e.message }); }
});

// ===== METER READINGS =====
router.get("/meter-readings", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.meter_readings"), async (req, res) => {
  try {
    const readings = await prisma.fuelMeterReading.findMany({ where: { tenantId: t(req) }, include: { pump: true }, orderBy: { readingDate: "desc" } });
    res.json(readings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/meter-readings", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.meter_readings"), async (req, res) => {
  try {
    const { pumpId, openingReading, closingReading, litresSold, amount, shiftId, priceOverrideReason } = req.body;
    if (!pumpId || !shiftId) return res.status(400).json({ error: 'Select a pump and an open shift before recording its meter reading' });
    const open = Number(openingReading), close = Number(closingReading), litres = Number(litresSold), value = Number(amount);
    const readingDate = req.body.readingDate ? new Date(req.body.readingDate) : new Date();
    if (Number.isNaN(readingDate.getTime())) return res.status(400).json({ error: 'Meter reading date is invalid' });
    if (![open, close, litres, value].every(Number.isFinite) || open < 0 || close < open || litres <= 0 || value < 0) return res.status(400).json({ error: 'Enter valid non-negative readings and sale amount' });
    if (Math.abs((close - open) - litres) > 0.01) return res.status(400).json({ error: 'Litres sold must equal closing meter minus opening meter' });
    const reading = await prisma.$transaction(async tx => {
      const pump = await tx.fuelPump.findFirst({ where: { id: pumpId, tenantId: t(req), isActive: true }, include: { tank: true } });
      if (!pump?.tank) throw Object.assign(new Error('Active pump and assigned tank not found for this business'), { status: 404 });
      const price = await tx.fuelPricing.findFirst({ where: { tenantId: t(req), fuelType: { equals: pump.tank.fuelType, mode: 'insensitive' }, effectiveDate: { lte: readingDate } }, orderBy: { effectiveDate: 'desc' } });
      const expectedAmount = price ? Math.round(litres * price.pumpPrice * 100) / 100 : null;
      const overrideReason = String(priceOverrideReason || '').trim();
      if (expectedAmount !== null && Math.abs(value - expectedAmount) > 0.05 && overrideReason.length < 8) throw Object.assign(new Error(`Sale amount differs from effective pump price (${expectedAmount.toFixed(2)}). Add an override reason if an approved discount or exception applies.`), { status: 400 });
      const shift = await tx.fuelShiftReport.findFirst({ where: { id: shiftId, tenantId: t(req), pumpId, status: 'open' } });
      if (!shift) throw Object.assign(new Error('Open shift for this pump was not found'), { status: 409 });
      await tx.$queryRaw`SELECT "id" FROM "fuel_shift_reports" WHERE "id" = ${shift.id} AND "tenantId" = ${t(req)} FOR UPDATE`;
      const lockedShift = await tx.fuelShiftReport.findFirst({ where: { id: shift.id, tenantId: t(req), status: 'open' } });
      if (!lockedShift) throw Object.assign(new Error('Shift was closed while recording this meter reading'), { status: 409 });
      if (Math.abs(open - lockedShift.openingReading) > 0.01) throw Object.assign(new Error('Opening meter reading does not match the shift opening reading'), { status: 409 });
      if (await tx.fuelMeterReading.findFirst({ where: { tenantId: t(req), shiftId, pumpId } })) throw Object.assign(new Error('A meter reading is already recorded for this pump and shift'), { status: 409 });
      await tx.$queryRaw`SELECT "id" FROM "fuel_tanks" WHERE "id" = ${pump.tank.id} AND "tenantId" = ${t(req)} FOR UPDATE`;
      const tank = await tx.fuelTank.findFirst({ where: { id: pump.tank.id, tenantId: t(req) } });
      if (!tank) throw Object.assign(new Error('Assigned tank not found for this business'), { status: 404 });
      let valuation;
      try { valuation = fuelMeterSaleValuation({ stockLitres: tank.currentStock, unitCost: tank.unitCost, openingReading: open, closingReading: close }); }
      catch (error) { throw Object.assign(new Error(error.message === 'Fuel sale cannot exceed available book stock' ? 'Insufficient book stock in the assigned tank for this meter sale' : error.message), { status: 409 }); }
      const row = await tx.fuelMeterReading.create({ data: { pumpId, openingReading: open, closingReading: close, litresSold: litres, amount: value, priceOverrideReason: expectedAmount !== null && Math.abs(value - expectedAmount) > 0.05 ? overrideReason : null, shiftId, readingDate, tenantId: t(req) } });
      await tx.fuelTank.update({ where: { id: tank.id }, data: { currentStock: valuation.stockAfter } });
      await tx.fuelStockMovement.create({ data: { tenantId: t(req), tankId: tank.id, branchId: tank.branchId, movementType: 'meter_sale', litresDelta: -valuation.litresSold, balanceAfter: valuation.stockAfter, unitCost: tank.unitCost, stockValueDelta: -valuation.costOfSales, stockValueAfter: valuation.stockValueAfter, sourceType: 'meter_reading', sourceId: row.id, reason: `Pump ${pump.name} shift ${shift.shiftNo}`, actorId: req.user.id } });
      const accounts = await ensureFuelAccountingAccounts(tx, t(req));
      await postFuelJournal(tx, { tenantId: t(req), userId: req.user.id, branchId: tank.branchId, sourceType: 'FUEL_METER_SALE', sourceId: row.id, date: row.readingDate, reference: shift.shiftNo, description: `Fuel sales and cost of sales: ${pump.name}, shift ${shift.shiftNo}`, lines: fuelMeterSaleLines(accounts, { revenue: value, cogs: valuation.costOfSales }) });
      return row;
    }, { isolationLevel: 'Serializable' });
    res.status(201).json(reading);
  } catch (e) { res.status(e.status || (e.code === 'P2034' ? 409 : 500)).json({ error: e.code === 'P2034' ? 'The tank or shift changed concurrently. Reload and try again.' : e.message }); }
});

// ===== SHIFT REPORTS =====
router.get("/shifts", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.shift_reports"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: 'query', allowOwnerAll: true });
    const shifts = await prisma.fuelShiftReport.findMany({ where: scopedWhere(scope), include: { pump: { include: { tank: true } }, user: true, fuelSales: { include: { sale: { select: { id: true, receiptNo: true, total: true, status: true, customer: { select: { id: true, name: true } } } } } } }, orderBy: { createdAt: "desc" } });
    res.json(shifts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/shifts", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.shift_reports"), async (req, res) => {
  try {
    const { shiftNo, pumpId, openingReading, startDate, branchId } = req.body;
    if (!pumpId) return res.status(400).json({ error: 'Pump is required' });
    if (!startDate) return res.status(400).json({ error: 'Start date is required' });
    const pump = await prisma.fuelPump.findFirst({ where: { id: pumpId, tenantId: t(req), isActive: true } });
    if (!pump) return res.status(404).json({ error: 'Active pump not found for this business' });
    await ensureBranch(prisma, t(req), branchId || pump.branchId);
    if (!shiftNo?.trim()) return res.status(400).json({ error: 'Shift number is required' });
    const opening = Number(openingReading);
    if (!Number.isFinite(opening) || opening < 0) return res.status(400).json({ error: 'Opening reading must be non-negative' });
    const shift = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${t(req)}), hashtext(${pumpId}))`;
      if (await tx.fuelShiftReport.findFirst({ where: { tenantId: t(req), pumpId, status: 'open' } })) throw Object.assign(new Error('This pump already has an open shift'), { status: 409 });
      const previous = await tx.fuelMeterReading.findFirst({ where: { tenantId: t(req), pumpId }, orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }] });
      if (previous && Math.abs(opening - previous.closingReading) > 0.01) throw Object.assign(new Error(`Opening meter must match the previous closing reading (${previous.closingReading})`), { status: 409 });
      return tx.fuelShiftReport.create({ data: { shiftNo: shiftNo.trim(), pumpId, openingReading: opening, startDate: new Date(startDate), branchId: branchId || pump.branchId, userId: req.user.id, tenantId: t(req), salesMode: 'ticketed' } });
    }, { isolationLevel: 'Serializable' });
    res.status(201).json(shift);
  } catch (e) { res.status(e.status || (e.code === 'P2034' ? 409 : 500)).json({ error: e.code === 'P2034' ? 'A shift for this pump was opened concurrently. Reload and try again.' : e.message }); }
});

router.put("/shifts/:id/close", authenticateToken, loadUserPermissions, requirePermission("canEditFuelStation"), requireFeature("fuel_station.shift_reports"), async (req, res) => {
  try {
    const { closingReading, litresSold, cashSales, mobileSales, creditSales, lubricantSales, carWashIncome, expenses, notes } = req.body;
    const amounts = [cashSales, mobileSales, creditSales, lubricantSales, carWashIncome, expenses].map(v => Number(v ?? 0));
    if (!amounts.every(v => Number.isFinite(v) && v >= 0)) return res.status(400).json({ error: 'Tender, other sales, and expense amounts must be non-negative numbers' });
    const shift = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "fuel_shift_reports" WHERE "id" = ${req.params.id} AND "tenantId" = ${t(req)} FOR UPDATE`;
      const current = await tx.fuelShiftReport.findFirst({ where: { id: req.params.id, tenantId: t(req) } });
      if (!current) throw Object.assign(new Error('Shift not found'), { status: 404 });
      if (current.status !== 'open') throw Object.assign(new Error('Only an open shift can be closed'), { status: 409 });
      const readings = await tx.fuelMeterReading.findMany({ where: { tenantId: t(req), shiftId: current.id } });
      if (!readings.length) throw Object.assign(new Error('Record the pump meter reading before closing this shift'), { status: 409 });
      const expectedFuelSales = readings.reduce((sum, row) => sum + row.amount, 0);
      const expectedLitres = readings.reduce((sum, row) => sum + row.litresSold, 0);
      const fuelSales = await tx.fuelSale.findMany({ where: { tenantId: t(req), shiftId: current.id }, include: { sale: { select: { total: true, status: true } } } });
      const ticketedCredit = fuelSales.filter((row) => row.sale?.status === 'completed').reduce((sum, row) => sum + Number(row.sale.total || 0), 0);
      const reconciliation = fuelShiftReconciliation({ fuelSales: expectedFuelSales, cashSales: amounts[0], mobileSales: amounts[1], creditSales: amounts[2] + ticketedCredit, lubricantSales: amounts[3], carWashIncome: amounts[4], expenses: amounts[5] });
      const { actualTenderTotal, reportedSalesTotal, totalSales, variance } = reconciliation;
      const reason = String(req.body.varianceReason || '').trim();
      if (Math.abs(variance) > 0.01 && reason.length < 8) throw Object.assign(new Error('Explain the tender variance before closing this shift'), { status: 400 });
      const latestReading = readings.reduce((latest, row) => row.closingReading > latest ? row.closingReading : latest, current.openingReading);
      if (closingReading !== undefined && Math.abs(Number(closingReading) - latestReading) > 0.01) throw Object.assign(new Error('Closing meter must match the recorded meter reading'), { status: 409 });
      if (litresSold !== undefined && Math.abs(Number(litresSold) - expectedLitres) > 0.01) throw Object.assign(new Error('Shift litres are calculated from meter readings and cannot be overridden'), { status: 409 });
      const tenantId = t(req);
      const cashAccount = amounts[0] > 0 ? await resolveFuelCashAccount(tx, req, tenantId, req.body.cashAccountId, 'cash') : null;
      const mobileAccount = amounts[1] > 0 ? await resolveFuelCashAccount(tx, req, tenantId, req.body.mobileAccountId, 'mobile_money') : null;
      const expenseAccount = amounts[5] > 0 ? await resolveFuelCashAccount(tx, req, tenantId, req.body.expenseAccountId, 'any') : null;
      const ref = `Fuel shift ${current.shiftNo}`;
      const cashMove = cashAccount ? await recordFuelCashMovement(tx, { req, account: cashAccount, amount: amounts[0], direction: 'receipt', tenantId, branchId: current.branchId, reference: ref, description: `Fuel sales cash collected - ${current.shiftNo}` }) : null;
      const mobileMove = mobileAccount ? await recordFuelCashMovement(tx, { req, account: mobileAccount, amount: amounts[1], direction: 'receipt', tenantId, branchId: current.branchId, reference: ref, description: `Fuel sales mobile money collected - ${current.shiftNo}` }) : null;
      const expenseMove = expenseAccount ? await recordFuelCashMovement(tx, { req, account: expenseAccount, amount: amounts[5], direction: 'expense', tenantId, branchId: current.branchId, reference: ref, description: `Fuel station shift expenses - ${current.shiftNo}` }) : null;
      if (expenseAccount) await tx.expense.create({ data: {
        tenantId, branchId: current.branchId, category: 'Fuel Station', description: `Shift expenses - ${current.shiftNo}`,
        amount: amounts[5], paymentMethod: accountMethod(expenseAccount.type), cashAccountId: expenseAccount.id,
        reference: current.shiftNo, notes: notes || 'Recorded during fuel shift reconciliation', userId: req.user.id, date: new Date(),
      } });
      const accounting = await ensureFuelAccountingAccounts(tx, tenantId);
      const lines = fuelShiftJournalLines(accounting, {
        cashAccountId: cashMove?.linkedAccount.id, mobileAccountId: mobileMove?.linkedAccount.id,
        expenseAccountId: expenseMove?.linkedAccount.id, expectedFuelSales: Math.max(0, expectedFuelSales - ticketedCredit), cashSales: amounts[0], mobileSales: amounts[1],
        creditSales: amounts[2], lubricantSales: amounts[3], carWashIncome: amounts[4], expenses: amounts[5], variance,
      });
      await postFuelJournal(tx, { tenantId, userId: req.user.id, branchId: current.branchId, sourceType: 'FUEL_SHIFT_CLOSE', sourceId: current.id, date: new Date(), reference: current.shiftNo, description: `Fuel shift sales, collections and expenses - ${current.shiftNo}`, lines });
      return tx.fuelShiftReport.update({ where: { id: current.id }, data: {
        closingReading: latestReading, litresSold: expectedLitres,
        cashSales: amounts[0], mobileSales: amounts[1], creditSales: amounts[2] + ticketedCredit,
        totalSales, lubricantSales: amounts[3], carWashIncome: amounts[4], expenses: amounts[5],
        netAmount: reconciliation.netAmount, expectedFuelSales, actualTenderTotal, reportedSalesTotal,
        cashAccountId: cashAccount?.id || null, mobileAccountId: mobileAccount?.id || null, expenseAccountId: expenseAccount?.id || null,
        reconciliationVariance: variance, varianceReason: Math.abs(variance) > 0.01 ? reason : null,
        status: Math.abs(variance) > 0.01 ? 'review_required' : 'closed', endDate: new Date(), notes,
      } });
    }, { isolationLevel: 'Serializable' });
    res.json(shift);
  } catch (e) { res.status(e.status || (e.code === 'P2034' ? 409 : 500)).json({ error: e.code === 'P2034' ? 'The shift changed concurrently. Reload and try again.' : e.message }); }
});

router.put('/shifts/:id/reconcile', authenticateToken, requirePermission('canEditFuelStation'), requireFeature('fuel_station.shift_reports'), async (req, res) => {
  try {
    const note = String(req.body?.reviewNote || '').trim();
    if (note.length < 8) return res.status(400).json({ error: 'A review note of at least 8 characters is required' });
    const shift = await prisma.fuelShiftReport.findFirst({ where: { id: req.params.id, tenantId: t(req), status: 'review_required' } });
    if (!shift) return res.status(404).json({ error: 'Shift is not awaiting reconciliation review' });
    if (shift.userId === req.user.id) return res.status(403).json({ error: 'A different authorized user must review a shift variance' });
    const result = await prisma.fuelShiftReport.updateMany({ where: { id: shift.id, tenantId: t(req), status: 'review_required' }, data: { status: 'reconciled', reviewedById: req.user.id, reviewNote: note } });
    if (!result.count) return res.status(409).json({ error: 'Shift review was completed by another user. Reload the page.' });
    const updated = await prisma.fuelShiftReport.findFirst({ where: { id: shift.id, tenantId: t(req) } });
    res.json(updated);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/tanks/:id/movements', authenticateToken, requirePermission('canViewFuelStation'), requireFeature('fuel_station.pumps'), async (req, res) => {
  try {
    const tank = await prisma.fuelTank.findFirst({ where: { id: req.params.id, tenantId: t(req) }, select: { id: true } });
    if (!tank) return res.status(404).json({ error: 'Tank not found' });
    const movements = await prisma.fuelStockMovement.findMany({ where: { tenantId: t(req), tankId: tank.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 500 });
    res.json(movements);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stock-adjustments', authenticateToken, requirePermission('canViewFuelStation'), requireFeature('fuel_station.pumps'), async (req, res) => {
  try {
    const adjustments = await prisma.fuelStockAdjustment.findMany({ where: { tenantId: t(req) }, include: { tank: { select: { name: true, fuelType: true } } }, orderBy: { requestedAt: 'desc' }, take: 300 });
    res.json(adjustments);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tanks/:id/adjustments', authenticateToken, requirePermission('canEditFuelStation'), requireFeature('fuel_station.pumps'), async (req, res) => {
  try {
    const delta = Number(req.body?.litresDelta);
    const reason = String(req.body?.reason || '').trim();
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'A non-zero litres adjustment is required' });
    if (reason.length < 8) return res.status(400).json({ error: 'Explain the stock adjustment (at least 8 characters)' });
    const tank = await prisma.fuelTank.findFirst({ where: { id: req.params.id, tenantId: t(req) }, select: { id: true, branchId: true } });
    if (!tank) return res.status(404).json({ error: 'Tank not found' });
    const adjustment = await prisma.fuelStockAdjustment.create({ data: { tenantId: t(req), tankId: tank.id, branchId: tank.branchId, litresDelta: delta, reason, requestedById: req.user.id } });
    res.status(201).json(adjustment);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/stock-adjustments/:id/approve', authenticateToken, requirePermission('canEditFuelStation'), requireFeature('fuel_station.pumps'), async (req, res) => {
  try {
    const reviewNote = String(req.body?.reviewNote || '').trim();
    if (reviewNote.length < 8) return res.status(400).json({ error: 'A review note of at least 8 characters is required' });
    const approved = await prisma.$transaction(async tx => {
      const existing = await tx.fuelStockAdjustment.findFirst({ where: { id: req.params.id, tenantId: t(req), status: 'pending' } });
      if (!existing) throw Object.assign(new Error('Pending adjustment not found'), { status: 404 });
      if (existing.requestedById === req.user.id) throw Object.assign(new Error('A different authorized user must approve the stock adjustment'), { status: 403 });
      await tx.$queryRaw`SELECT "id" FROM "fuel_tanks" WHERE "id" = ${existing.tankId} AND "tenantId" = ${t(req)} FOR UPDATE`;
      const tank = await tx.fuelTank.findFirst({ where: { id: existing.tankId, tenantId: t(req) } });
      if (!tank) throw Object.assign(new Error('Tank not found'), { status: 404 });
      const balance = tank.currentStock + existing.litresDelta;
      if (balance < 0 || balance > tank.capacity) throw Object.assign(new Error('Adjustment would put stock outside zero and tank capacity'), { status: 400 });
      await tx.fuelTank.update({ where: { id: tank.id }, data: { currentStock: balance } });
      const valueDelta = existing.litresDelta * tank.unitCost;
      await tx.fuelStockMovement.create({ data: { tenantId: t(req), tankId: tank.id, branchId: tank.branchId, movementType: 'adjustment', litresDelta: existing.litresDelta, balanceAfter: balance, unitCost: tank.unitCost, stockValueDelta: valueDelta, stockValueAfter: Math.max(0, tank.currentStock * tank.unitCost + valueDelta), sourceType: 'adjustment', sourceId: existing.id, reason: existing.reason, actorId: req.user.id } });
      const accounts = await ensureFuelAccountingAccounts(tx, t(req));
      const value = Math.abs(valueDelta);
      await postFuelJournal(tx, { tenantId: t(req), userId: req.user.id, branchId: tank.branchId, sourceType: 'FUEL_STOCK_ADJUSTMENT', sourceId: existing.id, reference: existing.id, description: `Approved fuel stock adjustment: ${existing.reason}`, lines: existing.litresDelta > 0
        ? [{ accountId: accounts.inventory.id, debit: value, credit: 0 }, { accountId: accounts.stockGain.id, debit: 0, credit: value }]
        : [{ accountId: accounts.stockLoss.id, debit: value, credit: 0 }, { accountId: accounts.inventory.id, debit: 0, credit: value }] });
      return tx.fuelStockAdjustment.update({ where: { id: existing.id }, data: { status: 'approved', approvedById: req.user.id, reviewNote, reviewedAt: new Date() } });
    }, { isolationLevel: 'Serializable' });
    res.json(approved);
  } catch (e) { res.status(e.status || (e.code === 'P2034' ? 409 : 500)).json({ error: e.message }); }
});

router.put('/stock-adjustments/:id/reject', authenticateToken, requirePermission('canEditFuelStation'), requireFeature('fuel_station.pumps'), async (req, res) => {
  try {
    const reviewNote = String(req.body?.reviewNote || '').trim();
    if (reviewNote.length < 8) return res.status(400).json({ error: 'A review note of at least 8 characters is required' });
    const adjustment = await prisma.fuelStockAdjustment.findFirst({ where: { id: req.params.id, tenantId: t(req), status: 'pending' } });
    if (!adjustment) return res.status(404).json({ error: 'Pending adjustment not found' });
    if (adjustment.requestedById === req.user.id) return res.status(403).json({ error: 'A different authorized user must review the stock adjustment' });
    const rejected = await prisma.fuelStockAdjustment.update({ where: { id: adjustment.id }, data: { status: 'rejected', approvedById: req.user.id, reviewNote, reviewedAt: new Date() } });
    res.json(rejected);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== DIPSTICK READINGS =====
// Gated on the dipstick sub-feature (plan/override), with staff access still
// controlled by the owner-granted fuel station permission.
router.get("/dipstick", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.dipstick"), async (req, res) => {
  try {
    const rows = await prisma.fuelDipstickReading.findMany({ where: { tenantId: t(req) }, include: { tank: true }, orderBy: { readingDate: "desc" } });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/dipstick", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.dipstick"), async (req, res) => {
  try {
    const { tankId, readingDate, dipstickLevel, bookStock, attendant, notes } = req.body;
    if (!tankId) return res.status(400).json({ error: 'Tank is required' });
    const physicalLevel = Number(dipstickLevel);
    if (!Number.isFinite(physicalLevel) || physicalLevel < 0) return res.status(400).json({ error: 'Physical tank level must be a non-negative number' });
    const tank = await prisma.fuelTank.findFirst({ where: { id: tankId, tenantId: t(req) } });
    if (!tank) return res.status(404).json({ error: 'Tank not found for this business' });
    const variance = physicalLevel - tank.currentStock;
    const row = await prisma.fuelDipstickReading.create({ data: { tankId, readingDate: readingDate ? new Date(readingDate) : undefined, dipstickLevel: physicalLevel, bookStock: tank.currentStock, variance, attendant, notes, tenantId: t(req) } });
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PRICING =====
router.get("/pricing", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.pricing"), async (req, res) => {
  try {
    const rows = await prisma.fuelPricing.findMany({ where: { tenantId: t(req) }, orderBy: { effectiveDate: "desc" } });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/pricing", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.pricing"), async (req, res) => {
  try {
    const { fuelType, pumpPrice, costPrice, effectiveDate, notes } = req.body;
    if (!fuelType?.trim()) return res.status(400).json({ error: 'Fuel type is required' });
    const margin = (Number(pumpPrice) || 0) - (Number(costPrice) || 0);
    const row = await prisma.fuelPricing.create({ data: { fuelType, pumpPrice: Number(pumpPrice) || 0, costPrice: Number(costPrice) || 0, margin, effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined, notes, tenantId: t(req) } });
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== COMPLIANCE =====
router.get("/compliance", authenticateToken, requirePermission("canViewFuelStation"), requireFeature("fuel_station.compliance"), async (req, res) => {
  try {
    const rows = await prisma.fuelCompliance.findMany({ where: { tenantId: t(req) }, orderBy: { inspectionDate: "desc" } });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/compliance", authenticateToken, requirePermission("canCreateFuelStation"), requireFeature("fuel_station.compliance"), async (req, res) => {
  try {
    const { inspectionDate, type, result, nextDue, notes } = req.body;
    if (!type?.trim()) return res.status(400).json({ error: 'Inspection type is required' });
    if (!result?.trim()) return res.status(400).json({ error: 'Result is required' });
    const row = await prisma.fuelCompliance.create({ data: { inspectionDate: inspectionDate ? new Date(inspectionDate) : undefined, type, result, nextDue: nextDue ? new Date(nextDue) : undefined, notes, tenantId: t(req) } });
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
