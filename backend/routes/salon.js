import { Router } from 'express';
import prisma from '../src/db.js';
import { authenticateToken, requirePermission, requireAnyPermission, requireTenant, loadUserPermissions, canUseTransactionAccountForPayment } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureCheck.js';
import hrAccountingService from '../src/services/hrAccountingService.js';
import { cashAccountMarker, linkedCashAccountId } from '../src/utils/accountingSync.js';

const router = Router();
const tenantId = req => req.user.tenantId || req.user.tenant_id || req.user.business_id;

router.use(authenticateToken, requireTenant, requireFeature('salon_spa'));

router.get('/stylists', requireAnyPermission(['canViewSalonStylist', 'canAssignSalonStylist']), async (req, res) => {
  try {
    const stylists = await prisma.serviceTechnician.findMany({
      where: { tenantId: tenantId(req) },
      select: { id: true, name: true, employeeId: true, userId: true, email: true, phone: true, role: true, skills: true, specializations: true, branchId: true, isActive: true, commissionType: true, commissionValue: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    res.json(stylists);
  } catch { res.status(500).json({ error: 'Could not load salon stylists.' }); }
});

router.post('/stylists', requirePermission('canCreateSalonStylist'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Stylist name is required.' });
    const employeeId = String(req.body.employeeId || '').trim() || null;
    const userId = String(req.body.userId || '').trim() || null;
    const employee = employeeId ? await prisma.employee.findFirst({ where: { id: employeeId, tenantId: tenantId(req), status: { not: 'terminated' } } }) : null;
    if (employeeId && !employee) return res.status(400).json({ error: 'Choose an active employee belonging to this business.' });
    if (employeeId && await prisma.serviceTechnician.findFirst({ where: { tenantId: tenantId(req), employeeId } })) return res.status(409).json({ error: 'That employee is already linked to a stylist profile.' });
    if (userId && !await prisma.user.findFirst({ where: { id: userId, tenantId: tenantId(req), isActive: true }, select: { id: true } })) return res.status(400).json({ error: 'Choose an active business user, or leave the login link empty.' });
    if (userId && await prisma.serviceTechnician.findFirst({ where: { tenantId: tenantId(req), userId } })) return res.status(409).json({ error: 'That login is already linked to a service or stylist profile.' });
    const branchId = String(req.body.branchId || employee?.branchId || '').trim() || null;
    if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenantId(req) }, select: { id: true } })) return res.status(400).json({ error: 'Choose a branch belonging to this business.' });
    const stylist = await prisma.serviceTechnician.create({ data: {
      tenantId: tenantId(req), employeeId, userId, branchId,
      name: employee ? [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ') : name,
      email: String(req.body.email || employee?.email || '').trim() || null,
      phone: String(req.body.phone || employee?.phone || '').trim() || null,
      role: String(req.body.role || 'stylist').trim(),
      skills: Array.isArray(req.body.skills) ? req.body.skills : [],
      specializations: Array.isArray(req.body.specializations) ? req.body.specializations : [],
      hireDate: employee?.hireDate || undefined,
    } });
    res.status(201).json(stylist);
  } catch { res.status(500).json({ error: 'Could not create stylist.' }); }
});

router.put('/stylists/:id', requirePermission('canEditSalonStylist'), async (req, res) => {
  try {
    const existing = await prisma.serviceTechnician.findFirst({ where: { id: req.params.id, tenantId: tenantId(req) } });
    if (!existing) return res.status(404).json({ error: 'Stylist not found.' });
    const employeeId = req.body.employeeId === undefined ? existing.employeeId : String(req.body.employeeId || '').trim() || null;
    const userId = req.body.userId === undefined ? existing.userId : String(req.body.userId || '').trim() || null;
    const employee = employeeId ? await prisma.employee.findFirst({ where: { id: employeeId, tenantId: tenantId(req), status: { not: 'terminated' } } }) : null;
    if (employeeId && !employee) return res.status(400).json({ error: 'Choose an active employee belonging to this business.' });
    if (employeeId && employeeId !== existing.employeeId && await prisma.serviceTechnician.findFirst({ where: { tenantId: tenantId(req), employeeId, id: { not: existing.id } } })) return res.status(409).json({ error: 'That employee is already linked to another stylist profile.' });
    if (userId && !await prisma.user.findFirst({ where: { id: userId, tenantId: tenantId(req), isActive: true }, select: { id: true } })) return res.status(400).json({ error: 'Choose an active business user, or leave the login link empty.' });
    if (userId && userId !== existing.userId && await prisma.serviceTechnician.findFirst({ where: { tenantId: tenantId(req), userId, id: { not: existing.id } } })) return res.status(409).json({ error: 'That login is already linked to another service or stylist profile.' });
    const branchId = req.body.branchId === undefined ? existing.branchId : String(req.body.branchId || '').trim() || null;
    if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenantId(req) }, select: { id: true } })) return res.status(400).json({ error: 'Choose a branch belonging to this business.' });
    const stylist = await prisma.serviceTechnician.update({ where: { id: existing.id }, data: {
      ...(req.body.name !== undefined && { name: String(req.body.name).trim() }),
      ...(req.body.email !== undefined && { email: String(req.body.email || '').trim() || null }),
      ...(req.body.phone !== undefined && { phone: String(req.body.phone || '').trim() || null }),
      ...(req.body.role !== undefined && { role: String(req.body.role || 'stylist').trim() }),
      ...(req.body.skills !== undefined && { skills: Array.isArray(req.body.skills) ? req.body.skills : [] }),
      ...(req.body.specializations !== undefined && { specializations: Array.isArray(req.body.specializations) ? req.body.specializations : [] }),
      employeeId, userId, branchId,
    } });
    res.json(stylist);
  } catch { res.status(500).json({ error: 'Could not update stylist.' }); }
});

router.post('/stylists/:id/deactivate', requirePermission('canDeactivateSalonStylist'), async (req, res) => {
  try {
    const result = await prisma.serviceTechnician.updateMany({ where: { id: req.params.id, tenantId: tenantId(req) }, data: { isActive: false } });
    if (!result.count) return res.status(404).json({ error: 'Stylist not found.' });
    res.json({ message: 'Stylist deactivated. Appointment history is preserved.' });
  } catch { res.status(500).json({ error: 'Could not deactivate stylist.' }); }
});

router.get('/chairs', requireAnyPermission(['canViewSalonChair', 'canAssignSalonChair']), requireFeature('salon.chair_scheduling'), async (req, res) => {
  try {
    const chairs = await prisma.salonChair.findMany({
      where: { tenantId: tenantId(req) },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    res.json(chairs);
  } catch (error) {
    res.status(500).json({ error: 'Could not load salon chairs.' });
  }
});

router.post('/chairs', requirePermission('canCreateSalonChair'), requireFeature('salon.chair_scheduling'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const code = String(req.body.code || '').trim() || null;
    const branchId = String(req.body.branchId || '').trim() || null;
    if (!name) return res.status(400).json({ error: 'Chair or station name is required.' });
    if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenantId(req) }, select: { id: true } })) {
      return res.status(400).json({ error: 'Choose a branch belonging to this business.' });
    }
    const chair = await prisma.salonChair.create({ data: {
      tenantId: tenantId(req), name, code, branchId,
      location: String(req.body.location || '').trim() || null,
      notes: String(req.body.notes || '').trim() || null,
    } });
    res.status(201).json(chair);
  } catch (error) {
    res.status(error.code === 'P2002' ? 409 : 500).json({ error: error.code === 'P2002' ? 'That chair code is already in use.' : 'Could not create chair.' });
  }
});

router.put('/chairs/:id', requirePermission('canEditSalonChair'), requireFeature('salon.chair_scheduling'), async (req, res) => {
  try {
    const existing = await prisma.salonChair.findFirst({ where: { id: req.params.id, tenantId: tenantId(req) } });
    if (!existing) return res.status(404).json({ error: 'Chair not found.' });
    const branchId = req.body.branchId === undefined ? existing.branchId : String(req.body.branchId || '').trim() || null;
    if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenantId(req) }, select: { id: true } })) {
      return res.status(400).json({ error: 'Choose a branch belonging to this business.' });
    }
    const chair = await prisma.salonChair.update({ where: { id: existing.id }, data: {
      ...(req.body.name !== undefined && { name: String(req.body.name).trim() }),
      ...(req.body.code !== undefined && { code: String(req.body.code || '').trim() || null }),
      ...(req.body.location !== undefined && { location: String(req.body.location || '').trim() || null }),
      ...(req.body.notes !== undefined && { notes: String(req.body.notes || '').trim() || null }),
      branchId,
    } });
    res.json(chair);
  } catch (error) {
    res.status(error.code === 'P2002' ? 409 : 500).json({ error: error.code === 'P2002' ? 'That chair code is already in use.' : 'Could not update chair.' });
  }
});

router.post('/chairs/:id/deactivate', requirePermission('canDeactivateSalonChair'), requireFeature('salon.chair_scheduling'), async (req, res) => {
  try {
    const updated = await prisma.salonChair.updateMany({ where: { id: req.params.id, tenantId: tenantId(req) }, data: { isActive: false } });
    if (!updated.count) return res.status(404).json({ error: 'Chair not found.' });
    res.json({ message: 'Chair deactivated. Existing appointments are preserved.' });
  } catch {
    res.status(500).json({ error: 'Could not deactivate chair.' });
  }
});

router.put('/technicians/:id/commission', requirePermission('canConfigureSalonCommission'), requireFeature('salon.stylist_commissions'), async (req, res) => {
  try {
    const commissionType = req.body.commissionType === 'fixed' ? 'fixed' : 'percent';
    const commissionValue = Number(req.body.commissionValue);
    if (!Number.isFinite(commissionValue) || commissionValue < 0 || (commissionType === 'percent' && commissionValue > 100)) {
      return res.status(400).json({ error: 'Enter a valid commission rate. Percentage must be between 0 and 100.' });
    }
    const updated = await prisma.serviceTechnician.updateMany({
      where: { id: req.params.id, tenantId: tenantId(req), isActive: true },
      data: { commissionType, commissionValue },
    });
    if (!updated.count) return res.status(404).json({ error: 'Active stylist not found.' });
    res.json({ id: req.params.id, commissionType, commissionValue });
  } catch {
    res.status(500).json({ error: 'Could not save commission rule.' });
  }
});

router.get('/commissions', requirePermission('canViewSalonCommission'), requireFeature('salon.stylist_commissions'), async (req, res) => {
  try {
    const where = { tenantId: tenantId(req) };
    if (req.query.status && ['pending', 'approved', 'voided', 'included_in_payroll'].includes(String(req.query.status))) where.status = String(req.query.status);
    const [commissions, technicians] = await Promise.all([
      prisma.salonCommission.findMany({ where, include: { appointment: { select: { customerName: true, scheduledDate: true, scheduledTime: true, status: true, branch: { select: { name: true } } } } }, orderBy: { completedAt: 'desc' } }),
      prisma.serviceTechnician.findMany({ where: { tenantId: tenantId(req), isActive: true }, select: { id: true, name: true, employeeId: true, commissionType: true, commissionValue: true }, orderBy: { name: 'asc' } }),
    ]);
    res.json({ commissions, technicians });
  } catch {
    res.status(500).json({ error: 'Could not load commission records.' });
  }
});

router.get('/payment-accounts', loadUserPermissions, requirePermission('canPaySalonCommission'), requireFeature('salon.stylist_commissions'), async (req, res) => {
  try {
    const accounts = await prisma.cashAccount.findMany({ where: { tenantId: tenantId(req), isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, type: true, balance: true, branchId: true } });
    res.json(accounts.filter(account => canUseTransactionAccountForPayment(req, account, account.type)));
  } catch { res.status(500).json({ error: 'Could not load authorized payout accounts.' }); }
});

router.get('/commissions/eligible', requirePermission('canIncludeSalonCommissionInPayroll'), requireFeature('salon.stylist_commissions'), async (req, res) => {
  try {
    const employeeId = String(req.query.employeeId || '').trim();
    const period = String(req.query.period || '').trim();
    if (!employeeId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return res.status(400).json({ error: 'Choose an employee and payroll month.' });
    const periodStart = new Date(`${period}-01T00:00:00.000Z`);
    const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
    const commissions = await prisma.salonCommission.findMany({
      where: { tenantId: tenantId(req), status: 'approved', completedAt: { gte: periodStart, lt: periodEnd }, stylist: { employeeId } },
      select: { id: true, commissionAmount: true, serviceName: true, stylistName: true, completedAt: true },
      orderBy: { completedAt: 'asc' },
    });
    res.json({ commissions, total: commissions.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0) });
  } catch {
    res.status(500).json({ error: 'Could not load approved commissions for payroll.' });
  }
});

router.post('/commissions/:id/approve', requirePermission('canApproveSalonCommission'), requireFeature('salon.stylist_commissions'), async (req, res) => {
  try {
    const changed = await prisma.salonCommission.updateMany({ where: { id: req.params.id, tenantId: tenantId(req), status: 'pending' }, data: { status: 'approved' } });
    if (!changed.count) return res.status(409).json({ error: 'This commission is no longer pending approval.' });
    res.json(await prisma.salonCommission.findFirst({ where: { id: req.params.id, tenantId: tenantId(req) } }));
  } catch {
    res.status(500).json({ error: 'Could not approve commission.' });
  }
});

async function ensureSalonCommissionExpenseAccount(tx, tenantId) {
  const marker = 'JibuSales system accounting role: salonCommissionExpenseAccountId';
  const existing = await tx.account.findFirst({ where: { tenantId, description: { contains: marker } }, include: { _count: { select: { children: true } } } });
  if (existing) {
    if (!existing.isActive || !['expense', 'expenses'].includes(String(existing.type).toLowerCase()) || existing.parentId || existing._count.children || linkedCashAccountId(existing)) {
      throw Object.assign(new Error('The Salon commission expense account is not an active postable expense account. Ask an accounting administrator to review it.'), { statusCode: 409 });
    }
    return existing;
  }
  const rows = await tx.account.findMany({ where: { tenantId }, select: { code: true } });
  const used = new Set(rows.map(row => row.code));
  const base = 'SYS-SALON-COMMISSION-EXP';
  let code = base, suffix = 1;
  while (used.has(code)) code = `${base}-${suffix++}`;
  return tx.account.create({ data: { tenantId, code, name: 'Stylist Commission Expense (JibuSales)', type: 'expense', subType: 'operating_expense', isActive: true, isSystemManaged: true, description: marker } });
}

async function ensureSalonCashLedgerAccount(tx, tenantId, cashAccount) {
  const marker = cashAccountMarker(cashAccount.id);
  let account = await tx.account.findFirst({ where: { tenantId, description: { contains: marker } } });
  if (account && (account.type !== 'asset' || linkedCashAccountId(account) !== cashAccount.id)) {
    throw Object.assign(new Error('The selected transaction account has an invalid accounting link.'), { statusCode: 409 });
  }
  if (!account) {
    const base = `TX-${cashAccount.id.slice(-8).toUpperCase()}`;
    let code = base, suffix = 1;
    while (await tx.account.findFirst({ where: { tenantId, code }, select: { id: true } })) code = `${base}-${suffix++}`;
    account = await tx.account.create({ data: { tenantId, code, name: cashAccount.name, type: 'asset', subType: `transaction_${cashAccount.type}`, balance: cashAccount.balance, branchId: cashAccount.branchId, isSystemManaged: true, description: `Linked transaction account ${marker}` } });
  }
  return account;
}

router.post('/commissions/:id/pay', loadUserPermissions, requirePermission('canPaySalonCommission'), requireFeature('salon.stylist_commissions'), async (req, res) => {
  try {
    const id = req.params.id;
    const cashAccountId = String(req.body.cashAccountId || '').trim();
    const paymentReference = String(req.body.reference || '').trim().slice(0, 120) || `SALON-COM-${id}`;
    if (!cashAccountId) return res.status(400).json({ error: 'Select a transaction account for this commission payment.' });

    const result = await prisma.$transaction(async tx => {
      const commission = await tx.salonCommission.findFirst({ where: { id, tenantId: tenantId(req) }, include: { appointment: { select: { branchId: true } } } });
      if (!commission) throw Object.assign(new Error('Commission record not found.'), { statusCode: 404 });
      if (commission.status !== 'approved' || commission.paymentJournalEntryId) throw Object.assign(new Error('Only approved, unpaid commissions can be paid directly.'), { statusCode: 409 });
      const cashAccount = await tx.cashAccount.findFirst({ where: { id: cashAccountId, tenantId: tenantId(req), isActive: true } });
      if (!cashAccount) throw Object.assign(new Error('Select an active transaction account belonging to this business.'), { statusCode: 400 });
      if (!canUseTransactionAccountForPayment(req, cashAccount, cashAccount.type)) throw Object.assign(new Error('You do not have permission to pay from this transaction account.'), { statusCode: 403 });
      const cashLedgerAccount = await ensureSalonCashLedgerAccount(tx, tenantId(req), cashAccount);
      await hrAccountingService.requirePaymentAccountForMethod(tx, tenantId(req), cashLedgerAccount.id, cashAccount.type, 'stylist commission payment', req.user.id);
      const expenseAccount = await ensureSalonCommissionExpenseAccount(tx, tenantId(req));
      const journal = await hrAccountingService.createJournal({
        tx,
        tenantId: tenantId(req),
        branchId: commission.appointment?.branchId || cashAccount.branchId || null,
        description: `Stylist commission paid to ${commission.stylistName}`,
        reference: paymentReference,
        sourceType: 'SALON_COMMISSION_DIRECT_PAYOUT',
        sourceId: commission.id,
        userId: req.user.id,
        lines: [
          { accountId: expenseAccount.id, debit: commission.commissionAmount, credit: 0, description: `Commission for ${commission.serviceName} - ${commission.stylistName}` },
          { accountId: cashLedgerAccount.id, debit: 0, credit: commission.commissionAmount, description: `Commission payout from ${cashAccount.name}` },
        ],
      });
      const journalEntry = journal?.journalEntry;
      if (!journalEntry?.id) throw Object.assign(new Error('The commission payment could not be posted to the general ledger.'), { statusCode: 409 });
      const updated = await tx.salonCommission.updateMany({
        where: { id: commission.id, tenantId: tenantId(req), status: 'approved', paymentJournalEntryId: null },
        data: { status: 'paid_directly', paymentJournalEntryId: journalEntry.id, paidAt: new Date(), paidByUserId: req.user.id, paymentAccountId: cashAccount.id, paymentMethod: cashAccount.type, paymentReference },
      });
      if (!updated.count) throw Object.assign(new Error('This commission was paid or changed by another user. Refresh and review its status.'), { statusCode: 409 });
      return { commission: await tx.salonCommission.findUnique({ where: { id: commission.id } }), journalEntry };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Could not pay stylist commission.' });
  }
});

export default router;
