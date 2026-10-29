import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import prisma from '../db.js'
import { authenticateToken, requirePermission, requireAnyPermission, loadUserPermissions, canUseTransactionAccountForPayment } from '../../middleware/auth.js'
import { requireAnyFeature, getTenantFeatures, hasFeatureAccess } from '../../middleware/featureCheck.js'
import { ensurePropertyAccounting, ensurePropertyCashLedgerAccount, recordPropertyCashMovement, postPropertyJournal, reversePropertyJournal, propertyRentChargeLines, propertyRentReceiptLines, rentAdvanceApplicationLines, propertyRentPlanReclassificationLines, propertyRentPlanReceiptLines, propertyRentPlanCancellationLines, propertyDepositReceiptLines, propertyOwnerPayoutLines, propertySaleOwnerPayoutLines, propertyDepositRefundLines, propertyDepositRentApplicationLines, propertyOpeningDepositLines, propertySaleRecognitionLines, propertySalePaymentLines, propertyLandAcquisitionLines, propertyLandPurchaseLines, propertyLandPurchasePaymentLines } from '../services/propertyAccountingService.js'
import { getPayablesAccountingConfig, validatePayablesAccountingConfig } from '../services/payablesAccountingService.js'
import { safeCloudinaryId, uploadBufferToCloudinary } from '../utils/cloudinaryUpload.js'
import { calculateRentAging } from '../utils/rentAging.js'
import { countUnpaidRentMonths, tenancyOccupiesRentPeriod } from '../utils/propertyTenancy.js'
import { correctedRentChargeValues, recordTenancyRentRate, recordUnitRentRate, rentAmountForPeriod, monthKey as rentRateMonthKey } from '../services/propertyRentRateService.js'

const router = Router()
const identityUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 3 } })
const money = value => Math.round((Number(value) || 0) * 100) / 100
const tenantIdOf = req => req.user?.tenantId
const monthKey = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
const isMonthKey = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''))
const monthStart = value => {
  if (!isMonthKey(value)) return null
  const [year, month] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1, 12))
}
const dueDateFor = period => {
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1, 12))
}

async function applyRentAdvancesToCharge(tx, { tenantId, userId, charge }) {
  await tx.$queryRaw`SELECT "id" FROM "rent_charges" WHERE "id" = ${charge.id} AND "tenantId" = ${tenantId} FOR UPDATE`
  charge = await tx.rentCharge.findFirst({ where: { id: charge.id, tenantId } })
  if (!charge) return null
  const planned = await tx.rentPaymentPlanChargeAllocation.findFirst({ where: { chargeId: charge.id, plan: { status: 'active' } }, select: { id: true } })
  if (planned) return charge
  let remaining = money(Math.max(0, Number(charge.amount) - Number(charge.amountPaid)))
  if (!remaining) return charge
  const payments = await tx.propertyRentPayment.findMany({
    where: { tenantId, tenancyId: charge.tenancyId, status: 'posted', paymentType: 'rent', advanceAmount: { gt: 0 } },
    orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
  })
  for (const payment of payments) {
    if (remaining <= 0.001) break
    const applied = money(Math.min(remaining, Number(payment.advanceAmount || 0)))
    if (!applied) continue
    const updatedPayment = await tx.propertyRentPayment.updateMany({
      where: { id: payment.id, tenantId, status: 'posted', advanceAmount: { gte: applied } },
      data: { advanceAmount: { decrement: applied } },
    })
    if (updatedPayment.count !== 1) continue
    await tx.rentPaymentAllocation.create({ data: { paymentId: payment.id, chargeId: charge.id, amount: applied, advanceAppliedAmount: applied } })
    const nextPaid = money(Number(charge.amountPaid || 0) + applied)
    charge = await tx.rentCharge.update({
      where: { id: charge.id },
      data: { amountPaid: nextPaid, status: nextPaid + 0.001 >= Number(charge.amount) ? 'paid' : 'partial' },
    })
    const config = await ensurePropertyAccounting(tx, tenantId)
    const reference = `${charge.period}-${payment.receiptNo}`
    await postPropertyJournal(tx, {
      tenantId, userId, sourceType: 'PROPERTY_RENT_ADVANCE_APPLICATION', sourceId: `${payment.id}-${charge.id}`,
      date: charge.dueDate, reference, description: `Apply advance rent payment ${payment.receiptNo} to ${charge.period}`,
      lines: rentAdvanceApplicationLines(config, { amount: applied, reference }),
    })
    remaining = money(remaining - applied)
  }
  return charge
}
async function ensureRentChargeForPeriod(tx, { tenancy, period, userId }) {
  const dueDate = dueDateFor(period)
  if (!tenancyOccupiesRentPeriod(tenancy, period)) return null
  const rentAmount = await rentAmountForPeriod(tx, tenancy, period)
  const charge = await tx.rentCharge.upsert({
    where: { tenancyId_period: { tenancyId: tenancy.id, period } },
    update: {},
    create: { tenantId: tenancy.tenantId, tenancyId: tenancy.id, period, dueDate, amount: rentAmount, status: dueDate < new Date() ? 'overdue' : 'unpaid', description: `Rent for ${period}` },
  })
  const config = await ensurePropertyAccounting(tx, tenancy.tenantId)
  await postPropertyJournal(tx, {
    tenantId: tenancy.tenantId, userId, sourceType: 'PROPERTY_RENT_CHARGE', sourceId: charge.id,
    date: charge.dueDate, reference: `RENT-${tenancy.id}-${period}`,
    description: `Rent charge for ${tenancy.tenantName}, ${tenancy.unit.property.name} / ${tenancy.unit.unitCode}`,
    lines: propertyRentChargeLines(config, { amount: charge.amount, managed: Boolean(tenancy.unit.property.ownerId), description: `Rent ${period}` }),
  })
  return applyRentAdvancesToCharge(tx, { tenantId: tenancy.tenantId, userId, charge })
}
async function repriceRentChargesForRate(tx, { tenantId, tenancy, newAmount, effectivePeriod, userId }) {
  const charges = await tx.rentCharge.findMany({
    where: { tenantId, tenancyId: tenancy.id, period: { gte: effectivePeriod } },
    include: { planAllocations: { include: { plan: { select: { status: true } } } } },
    orderBy: { period: 'asc' },
  })
  let updatedCount = 0
  for (const charge of charges) {
    if (Math.abs(money(charge.amount) - money(newAmount)) < 0.01) continue
    if (charge.planAllocations.some(allocation => allocation.plan.status === 'active')) {
      throw Object.assign(new Error(`Rent period ${charge.period} is locked by an active repayment plan. Update or complete the plan before changing the unit rent.`), { statusCode: 409 })
    }
    if (Number(charge.amountPaid) > money(newAmount) + 0.01) {
      throw Object.assign(new Error(`Rent period ${charge.period} already has payments above the new unit rent. Reconcile that overpayment as tenant advance before lowering this rate.`), { statusCode: 409 })
    }

    const sourceTypes = ['PROPERTY_RENT_CHARGE', 'PROPERTY_RENT_CHARGE_PERIOD_CORRECTION', 'PROPERTY_RENT_CHARGE_RATE_CORRECTION']
    const journalHistory = await tx.journalEntry.findMany({
      where: { tenantId, OR: sourceTypes.map(type => type === 'PROPERTY_RENT_CHARGE'
        ? { sourceType: type, sourceId: charge.id }
        : { sourceType: type, sourceId: { startsWith: `${charge.id}-` } }) },
      select: { sourceType: true, sourceId: true, reversalJournalId: true, status: true },
    })
    for (const journal of journalHistory.filter(entry => entry.status === 'posted' && !entry.reversalJournalId)) {
      await reversePropertyJournal(tx, {
        tenantId,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        userId,
        reason: `Rent rate changed to ${money(newAmount)} from ${effectivePeriod}`,
      })
    }

    const dueDate = charge.dueDate
    const nextStatus = Number(charge.amountPaid) + 0.001 >= money(newAmount) ? 'paid'
      : Number(charge.amountPaid) > 0 ? 'partial'
        : dueDate < new Date() ? 'overdue' : 'unpaid'
    await tx.rentCharge.update({ where: { id: charge.id }, data: { amount: money(newAmount), status: nextStatus } })
    const config = await ensurePropertyAccounting(tx, tenantId)
    const hasPriorJournal = journalHistory.length > 0
    await postPropertyJournal(tx, {
      tenantId,
      userId,
      sourceType: hasPriorJournal ? 'PROPERTY_RENT_CHARGE_RATE_CORRECTION' : 'PROPERTY_RENT_CHARGE',
      sourceId: hasPriorJournal ? `${charge.id}-${randomUUID()}` : charge.id,
      date: dueDate,
      reference: `RENT-${tenancy.id}-${charge.period}`,
      description: `${hasPriorJournal ? 'Corrected' : 'Rent charge'} for ${tenancy.tenantName}, ${tenancy.unit.property.name} / ${tenancy.unit.unitCode} · ${charge.period}`,
      lines: propertyRentChargeLines(config, {
        amount: newAmount,
        managed: Boolean(tenancy.unit.property.ownerId),
        description: `Rent ${charge.period}`,
      }),
    })
    updatedCount += 1
  }
  return updatedCount
}
async function ensureTenancyRentSchedule(tx, { tenancy, arrearsMonths = 0, userId }) {
  const currentPeriod = monthKey(new Date())
  const startPeriod = monthKey(tenancy.startDate)
  const lastEligiblePeriod = tenancy.status === 'ended' && tenancy.endDate ? monthKey(tenancy.endDate) : currentPeriod
  if (tenancy.status === 'active' && tenancyOccupiesRentPeriod(tenancy, currentPeriod)) {
    await ensureRentChargeForPeriod(tx, { tenancy, period: currentPeriod, userId })
  }
  const existing = await tx.rentCharge.findMany({ where: { tenantId: tenancy.tenantId, tenancyId: tenancy.id }, select: { period: true, amount: true, amountPaid: true } })
  const byPeriod = new Map(existing.map(charge => [charge.period, charge]))
  let openArrears = countUnpaidRentMonths([...byPeriod.values()], startPeriod, lastEligiblePeriod)
  let candidate = lastEligiblePeriod
  for (let guard = 0; openArrears < arrearsMonths && candidate >= startPeriod && guard < 1200; guard += 1) {
    if (byPeriod.has(candidate)) {
      candidate = monthKey(new Date(Date.UTC(Number(candidate.slice(0, 4)), Number(candidate.slice(5, 7)) - 2, 1)))
      continue
    }
    const created = await ensureRentChargeForPeriod(tx, { tenancy, period: candidate, userId })
    if (created && Number(created.amount) - Number(created.amountPaid) > 0.01) {
      byPeriod.set(candidate, created)
      openArrears += 1
    }
    candidate = monthKey(new Date(Date.UTC(Number(candidate.slice(0, 4)), Number(candidate.slice(5, 7)) - 2, 1)))
  }
  if (openArrears < arrearsMonths) throw Object.assign(new Error('There are not enough eligible months from the tenancy start through the current or move-out month to record the selected number of unpaid months.'), { statusCode: 400 })
}
const planDueDate = (startDate, sequence, frequency) => {
  const date = new Date(startDate)
  if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + sequence * 7)
  else if (frequency === 'biweekly') date.setUTCDate(date.getUTCDate() + sequence * 14)
  else {
    const day = date.getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() + sequence)
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()))
  }
  return date
}
const pageSize = value => Math.min(Math.max(Number.parseInt(value, 10) || 100, 1), 500)
const badRequest = (res, message) => res.status(400).json({ error: message })
const canViewCustomerIdentity = req => (req.user?.permissions || []).includes('*') || (req.user?.permissions || []).includes('canViewCustomerIdentity')
const canViewTenantPersonalDetails = req => ['*', 'canViewTenantPersonalDetails', 'canManageTenantPersonalDetails'].some(permission => req.user?.permissions?.includes(permission))
const canManageTenantPersonalDetails = req => ['*', 'canManageTenantPersonalDetails'].some(permission => req.user?.permissions?.includes(permission))
const TENANT_PERSONAL_FIELDS = ['maritalStatus', 'spouseNames', 'childrenCount', 'householdSize', 'placeOfOrigin']
function tenantPersonalDetails(input) {
  const result = {}
  if (input.maritalStatus !== undefined) {
    const maritalStatus = String(input.maritalStatus || '').trim()
    if (maritalStatus && !['single', 'married', 'separated', 'divorced', 'widowed', 'prefer_not_to_say'].includes(maritalStatus)) throw Object.assign(new Error('Choose a valid marital status.'), { statusCode: 400 })
    result.maritalStatus = maritalStatus || null
  }
  if (input.spouseNames !== undefined) {
    const spouseNames = String(input.spouseNames || '').trim()
    if (spouseNames.length > 500) throw Object.assign(new Error('Spouse name details must be 500 characters or fewer.'), { statusCode: 400 })
    result.spouseNames = spouseNames || null
  }
  for (const field of ['childrenCount', 'householdSize']) {
    if (input[field] === undefined) continue
    const raw = String(input[field] ?? '').trim()
    if (!raw) { result[field] = null; continue }
    const value = Number(raw)
    if (!Number.isInteger(value) || value < (field === 'householdSize' ? 1 : 0) || value > 100) throw Object.assign(new Error(field === 'childrenCount' ? 'Children count must be between 0 and 100.' : 'Household size must be between 1 and 100.'), { statusCode: 400 })
    result[field] = value
  }
  if (input.placeOfOrigin !== undefined) {
    const placeOfOrigin = String(input.placeOfOrigin || '').trim()
    if (placeOfOrigin.length > 200) throw Object.assign(new Error('Place of origin must be 200 characters or fewer.'), { statusCode: 400 })
    result.placeOfOrigin = placeOfOrigin || null
  }
  return result
}
const PROPERTY_MANAGEMENT_FEATURES = ['property_management.landlord', 'property_management.agent']
router.use(authenticateToken, loadUserPermissions, requireAnyFeature(PROPERTY_MANAGEMENT_FEATURES))

const paymentMethodsByAccount = { cash: 'cash', safe: 'safe', mobile_money: 'mobile_money', bank: 'bank_transfer', card: 'card' }
const paymentMethodToAccount = { cash: 'cash', safe: 'safe', mobile_money: 'mobile_money', bank: 'bank', bank_transfer: 'bank', cheque: 'bank', card: 'card' }

async function uploadRenterIdentity(req) {
  const files = req.files || {}
  const fields = ['profilePhoto', 'nationalIdFront', 'nationalIdBack']
  for (const field of fields) {
    const file = files[field]?.[0]
    if (file && !String(file.mimetype || '').startsWith('image/')) throw Object.assign(new Error('Upload valid image files for the profile photo and National ID sides.'), { statusCode: 400 })
  }
  const tenantId = tenantIdOf(req)
  const entries = await Promise.all(fields.map(async field => {
    const file = files[field]?.[0]
    if (!file) return [field, null]
    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: `jibusales/property-tenants/${tenantId}`,
      publicId: `${Date.now()}-${field}-${safeCloudinaryId(file.originalname)}`,
      resourceType: 'image',
      transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
    })
    return [field, result.secure_url]
  }))
  return Object.fromEntries(entries)
}

async function findOrCreateRenterCustomer(tx, tenantId, input) {
  const name = String(input.tenantName || '').trim()
  const phone = String(input.phone || '').trim() || null
  const email = String(input.email || '').trim() || null
  const sameName = { name: { equals: name, mode: 'insensitive' } }
  let customer = phone
    ? await tx.customer.findFirst({ where: { tenantId, phone, ...sameName } })
    : null
  if (!customer && email) customer = await tx.customer.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' }, ...sameName } })
  if (customer) {
    return tx.customer.update({ where: { id: customer.id }, data: {
      ...(email && !customer.email ? { email } : {}),
      ...(phone && !customer.phone ? { phone } : {}),
      ...(input.nationalId ? { nin: String(input.nationalId).trim() } : {}),
      ...(input.address ? { address: String(input.address).trim() } : {}),
    } })
  }
  return tx.customer.create({ data: {
    tenantId,
    name: String(input.tenantName).trim(),
    phone,
    email,
    nin: String(input.nationalId || '').trim() || null,
    address: String(input.address || '').trim() || null,
    creditLimit: 0,
    balance: 0,
    openingBalance: 0,
  } })
}

router.get('/payment-accounts', requireAnyPermission(['canRecordRentPayment', 'canRecordTenantDeposit', 'canRefundTenantDeposit', 'canRecordOwnerPayout', 'canManageRentPayment', 'canRecordPropertySalePayment', 'canCreatePropertyLandPurchase', 'canRecordPropertyLandPurchasePayment']), async (req, res) => {
  try {
    const accounts = await prisma.cashAccount.findMany({ where: { tenantId: tenantIdOf(req), isActive: true }, orderBy: { name: 'asc' } })
    const permitted = accounts.flatMap(account => {
      const paymentMethod = paymentMethodsByAccount[String(account.type).toLowerCase()]
      const hasAction = ['canRecordRentPayment', 'canRecordTenantDeposit', 'canRefundTenantDeposit', 'canRecordOwnerPayout', 'canManageRentPayment', 'canRecordPropertySalePayment', 'canCreatePropertyLandPurchase', 'canRecordPropertyLandPurchasePayment'].some(key => req.user?.permissions?.includes(key))
      return hasAction && paymentMethod && canUseTransactionAccountForPayment(req, account, paymentMethod) ? [{ id: account.id, name: account.name, type: account.type, balance: account.balance, currency: account.currency, paymentMethod }] : []
    })
    res.json({ accounts: permitted, defaultCashAccountId: req.userCashAccountId || req.user?.cashAccountId || null })
  } catch (error) { console.error('Load property payment accounts failed:', error); res.status(500).json({ error: 'Could not load permitted payment accounts.' }) }
})

router.get('/overview', requireAnyPermission(['canViewPropertyPortfolio', 'canViewPropertyManagement']), async (req, res) => {
  try {
    const tenantId = tenantIdOf(req)
    const now = new Date()
    const canViewCollections = ['*', 'canViewPropertyCollections', 'canViewPropertyReports'].some(permission => req.user?.permissions?.includes(permission))
    const [propertyCount, managedPropertyCount, ownerCount, unitCounts, tenancies, monthPayments] = await Promise.all([
      prisma.managedProperty.count({ where: { tenantId, status: 'active' } }),
      prisma.managedProperty.count({ where: { tenantId, status: 'active', ownerId: { not: null } } }),
      prisma.propertyOwner.count({ where: { tenantId, isActive: true } }),
      prisma.propertyUnit.groupBy({ by: ['status'], where: { property: { tenantId } }, _count: { _all: true } }),
      prisma.propertyTenancy.findMany({ where: { tenantId, status: 'active' }, select: { id: true, rentAmount: true, charges: { where: { status: { in: ['unpaid', 'partial', 'overdue'] } }, select: { amount: true, amountPaid: true, dueDate: true } } } }),
      canViewCollections ? prisma.propertyRentPayment.aggregate({ where: { tenantId, status: 'posted', paymentType: 'rent', paymentDate: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) } }, _sum: { amount: true }, _count: true }) : Promise.resolve(null),
    ])
    const units = Object.fromEntries(unitCounts.map(row => [row.status, row._count._all]))
    const openCharges = tenancies.flatMap(row => row.charges)
    res.json({
      properties: propertyCount, managedProperties: managedPropertyCount, landlordClients: ownerCount, units: units.total || Object.values(units).reduce((a, b) => a + b, 0), occupied: units.occupied || 0, vacant: units.vacant || 0,
      activeTenancies: tenancies.length, monthlyRentRoll: money(tenancies.reduce((sum, row) => sum + Number(row.rentAmount || 0), 0)),
      outstandingRent: money(openCharges.reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Number(row.amountPaid)), 0)),
      arrears: money(openCharges.filter(row => row.dueDate < now).reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Number(row.amountPaid)), 0)),
      collectedThisMonth: monthPayments ? money(monthPayments._sum.amount) : null, paymentCount: monthPayments?._count ?? null,
    })
  } catch (error) { console.error('Property management overview failed:', error); res.status(500).json({ error: 'Could not load property portfolio.' }) }
})

function paymentSummary(payment) {
  return { id: payment.id, receiptNo: payment.receiptNo, amount: payment.amount, paymentDate: payment.paymentDate, paymentMethod: payment.paymentMethod, paymentType: payment.paymentType, tenantName: payment.tenancy?.tenantName, unitCode: payment.tenancy?.unit?.unitCode, propertyName: payment.tenancy?.unit?.property?.name }
}

router.get('/owners', requireAnyPermission(['canViewPropertyPortfolio', 'canViewPropertyManagement']), async (req, res) => {
  try {
    const owners = await prisma.propertyOwner.findMany({ where: { tenantId: tenantIdOf(req) }, orderBy: { name: 'asc' }, include: { _count: { select: { properties: true } } } })
    res.json(owners)
  } catch (error) { console.error('List property owners failed:', error); res.status(500).json({ error: 'Could not load owners.' }) }
})

router.get('/payables/owners', requirePermission('canViewPayable'), async (req, res) => {
  try {
    const tenantId = tenantIdOf(req)
    const [owners, rentTotals, payoutTotals] = await Promise.all([
      prisma.propertyOwner.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, phone: true, isActive: true, _count: { select: { properties: true } } } }),
      prisma.$queryRaw`SELECT property."ownerId" AS "ownerId", COALESCE(SUM(charge."amount"), 0)::double precision AS "rentAccrued"
        FROM "rent_charges" charge
        JOIN "property_tenancies" tenancy ON tenancy."id" = charge."tenancyId"
        JOIN "property_units" unit ON unit."id" = tenancy."unitId"
        JOIN "managed_properties" property ON property."id" = unit."propertyId"
        WHERE charge."tenantId" = ${tenantId} AND property."tenantId" = ${tenantId}
          AND property."ownerId" IS NOT NULL AND charge."status" IN ('unpaid', 'partial', 'overdue', 'paid')
        GROUP BY property."ownerId"`,
      prisma.propertyOwnerPayout.groupBy({ by: ['ownerId'], where: { tenantId, payoutType: 'rent', status: 'posted' }, _sum: { amount: true } }),
    ])
    const rentByOwner = new Map(rentTotals.map(row => [row.ownerId, Number(row.rentAccrued || 0)]))
    const paidByOwner = new Map(payoutTotals.map(row => [row.ownerId, Number(row._sum.amount || 0)]))
    res.json(owners.map(owner => {
      const rentAccrued = rentByOwner.get(owner.id) || 0
      const paid = paidByOwner.get(owner.id) || 0
      return { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone, isActive: owner.isActive, propertyCount: owner._count.properties, rentAccrued: money(rentAccrued), paid: money(paid), balance: money(rentAccrued - paid) }
    }).filter(owner => owner.isActive || Math.abs(owner.balance) >= 0.01))
  } catch (error) { console.error('Load property payables failed:', error); res.status(500).json({ error: 'Could not load landlord payables.' }) }
})

router.get('/sale-payables/owners', requireAnyPermission(['canRecordOwnerPayout', 'canViewPropertySales']), async (req, res) => {
  try {
    const tenantId = tenantIdOf(req)
    const owners = await prisma.propertyOwner.findMany({ where: { tenantId, propertySales: { some: { status: 'active', saleMode: 'brokered' } } }, orderBy: { name: 'asc' }, include: { propertySales: { where: { status: 'active', saleMode: 'brokered' }, select: { salePrice: true, commissionAmount: true } } } })
    const payouts = await prisma.propertyOwnerPayout.groupBy({ by: ['ownerId'], where: { tenantId, payoutType: 'plot_sale', status: 'posted' }, _sum: { amount: true } })
    const paid = new Map(payouts.map(row => [row.ownerId, Number(row._sum.amount || 0)]))
    res.json(owners.map(owner => {
      const earned = owner.propertySales.reduce((sum, sale) => sum + Number(sale.salePrice) - Number(sale.commissionAmount), 0)
      const settled = paid.get(owner.id) || 0
      return { id: owner.id, name: owner.name, payable: money(earned), paid: money(settled), balance: money(earned - settled) }
    }).filter(row => row.balance > 0.01))
  } catch (error) { console.error('Load plot sale owner payables failed:', error); res.status(500).json({ error: 'Could not load landlord plot sale payables.' }) }
})

router.post('/owners', requirePermission('canManagePropertyOwners'), async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return badRequest(res, 'Owner name is required.')
  try {
    const owner = await prisma.propertyOwner.create({ data: { tenantId: tenantIdOf(req), name, email: req.body.email?.trim() || null, phone: req.body.phone?.trim() || null, address: req.body.address?.trim() || null, notes: req.body.notes?.trim() || null } })
    res.status(201).json(owner)
  } catch (error) { console.error('Create property owner failed:', error); res.status(500).json({ error: 'Could not save owner.' }) }
})

router.put('/owners/:id', requirePermission('canManagePropertyOwners'), async (req, res) => {
  try {
    const exists = await prisma.propertyOwner.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) } })
    if (!exists) return res.status(404).json({ error: 'Owner not found.' })
    const owner = await prisma.propertyOwner.update({ where: { id: exists.id }, data: { name: String(req.body?.name || exists.name).trim(), email: req.body.email?.trim() || null, phone: req.body.phone?.trim() || null, address: req.body.address?.trim() || null, notes: req.body.notes?.trim() || null, isActive: req.body.isActive !== false } })
    res.json(owner)
  } catch (error) { console.error('Update property owner failed:', error); res.status(500).json({ error: 'Could not update owner.' }) }
})

router.get('/properties', requireAnyPermission(['canViewPropertyPortfolio', 'canViewPropertyManagement', 'canViewPropertySales', 'canViewPropertyLandPurchases', 'canCreatePropertyLandPurchase']), async (req, res) => {
  try {
    const properties = await prisma.managedProperty.findMany({ where: { tenantId: tenantIdOf(req), ...(req.query.ownerId ? { ownerId: String(req.query.ownerId) } : {}), ...(req.query.status ? { status: String(req.query.status) } : {}) }, take: pageSize(req.query.limit), orderBy: { name: 'asc' }, include: { owner: true, units: { orderBy: { unitCode: 'asc' }, include: { _count: { select: { tenancies: true } }, tenancies: { where: { status: 'active' }, take: 1, include: { charges: { where: { status: { in: ['unpaid', 'partial', 'overdue'] } }, select: { amount: true, amountPaid: true } } } } } } } })
    res.json(properties.map(property => ({ ...property, units: property.units.map(unit => ({ ...unit, currentBalance: money(unit.tenancies[0]?.charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0) || 0), tenancies: undefined })) })))
  } catch (error) { console.error('List properties failed:', error); res.status(500).json({ error: 'Could not load properties.' }) }
})

router.post('/properties', requirePermission('canManageProperties'), async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const address = String(req.body?.address || '').trim()
  if (!name || !address) return badRequest(res, 'Property name and address are required.')
  try {
    const tenantId = tenantIdOf(req)
    if (req.body.ownerId && !await prisma.propertyOwner.findFirst({ where: { id: req.body.ownerId, tenantId } })) return badRequest(res, 'Select an owner in this business.')
    const property = await prisma.managedProperty.create({ data: { tenantId, ownerId: req.body.ownerId || null, name, address, city: req.body.city?.trim() || null, propertyType: req.body.propertyType || 'residential', notes: req.body.notes?.trim() || null }, include: { owner: true, units: true } })
    res.status(201).json(property)
  } catch (error) { console.error('Create property failed:', error); res.status(500).json({ error: 'Could not save property.' }) }
})

router.put('/properties/:id', requirePermission('canManageProperties'), async (req, res) => {
  try {
    const property = await prisma.managedProperty.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) } })
    if (!property) return res.status(404).json({ error: 'Property not found.' })
    const name = req.body.name === undefined ? property.name : String(req.body.name).trim()
    const address = req.body.address === undefined ? property.address : String(req.body.address).trim()
    const city = req.body.city === undefined ? property.city : String(req.body.city).trim() || null
    const propertyType = req.body.propertyType || property.propertyType
    const ownerId = req.body.ownerId === undefined ? property.ownerId : req.body.ownerId || null
    const validPropertyTypes = ['residential', 'commercial', 'mixed_use', 'industrial', 'land', 'other']
    if (!name || !address) return badRequest(res, 'Property name and address are required.')
    if (!validPropertyTypes.includes(propertyType)) return badRequest(res, 'Choose a valid property type.')
    if (ownerId && !await prisma.propertyOwner.findFirst({ where: { id: ownerId, tenantId: tenantIdOf(req) } })) return badRequest(res, 'Select an owner in this business.')
    if (propertyType !== property.propertyType || ownerId !== property.ownerId) {
      const linkedUnits = await prisma.propertyUnit.count({ where: { propertyId: property.id } })
      if (linkedUnits > 0) return res.status(409).json({ error: 'Property type and ownership cannot be changed after units or plots have been added, because they are linked to inventory and accounting history.' })
    }
    const updated = await prisma.managedProperty.update({ where: { id: property.id }, data: { name, address, city, propertyType, ownerId, notes: req.body.notes === undefined ? property.notes : String(req.body.notes).trim() || null } })
    res.json(updated)
  } catch (error) { console.error('Update property failed:', error); res.status(500).json({ error: 'Could not update property.' }) }
})

router.post('/properties/:id/units', requirePermission('canManagePropertyUnits'), async (req, res) => {
  const unitCode = String(req.body?.unitCode || '').trim()
  const rentAmount = Number(req.body?.rentAmount)
  if (!unitCode || !Number.isFinite(rentAmount) || rentAmount < 0) return badRequest(res, 'Unit code and a non-negative monthly rent are required.')
  try {
    const property = await prisma.managedProperty.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) }, include: { tenant: { select: { currency: true } } } })
    if (!property) return res.status(404).json({ error: 'Property not found.' })
    const acquisitionCost = money(req.body?.acquisitionCost)
    if (acquisitionCost < 0 || !Number.isFinite(acquisitionCost)) return badRequest(res, 'Enter a valid non-negative acquisition cost.')
    const isLand = String(property.propertyType).toLowerCase() === 'land'
    const areaSize = req.body?.areaSize === '' || req.body?.areaSize == null ? null : Number(req.body.areaSize)
    const frontage = req.body?.frontage === '' || req.body?.frontage == null ? null : Number(req.body.frontage)
    const depth = req.body?.depth === '' || req.body?.depth == null ? null : Number(req.body.depth)
    const areaUnit = String(req.body?.areaUnit || '').trim().toLowerCase() || null
    const dimensionUnit = String(req.body?.dimensionUnit || '').trim().toLowerCase() || null
    const validAreaUnits = ['sqm', 'sqft', 'acre', 'hectare']
    const validDimensionUnits = ['m', 'ft']
    if (isLand && (!Number.isFinite(areaSize) || areaSize <= 0 || !validAreaUnits.includes(areaUnit))) return badRequest(res, 'Enter the plot area and select sqm, sqft, acres, or hectares.')
    if ([frontage, depth].some(value => value != null && (!Number.isFinite(value) || value <= 0)) || ((frontage != null || depth != null) && !validDimensionUnits.includes(dimensionUnit))) return badRequest(res, 'Enter valid positive dimensions and select metres or feet.')
    if (acquisitionCost > 0 && !req.user?.permissions?.includes('*') && !req.user?.permissions?.includes('canManagePropertyLandInventory')) return res.status(403).json({ error: 'You need permission to record owned plot inventory and its cost.' })
    if (acquisitionCost > 0 && String(property.propertyType).toLowerCase() !== 'land') return badRequest(res, 'Acquisition cost is only supported for a land/plot property. Keep rent units separate from land inventory.')
    const unit = await prisma.$transaction(async tx => {
      const created = await tx.propertyUnit.create({ data: { propertyId: property.id, unitCode, unitType: req.body.unitType?.trim() || null, areaSize, areaUnit, frontage, depth, dimensionUnit, plotNumber: String(req.body?.plotNumber || '').trim() || null, blockNumber: String(req.body?.blockNumber || '').trim() || null, titleReference: String(req.body?.titleReference || '').trim() || null, landTenure: String(req.body?.landTenure || '').trim() || null, bedrooms: req.body.bedrooms == null ? null : Number(req.body.bedrooms), bathrooms: req.body.bathrooms == null ? null : Number(req.body.bathrooms), rentAmount: money(rentAmount), acquisitionCost, currency: property.tenant.currency || 'UGX', notes: req.body.notes?.trim() || null } })
      if (acquisitionCost > 0) {
        const config = await ensurePropertyAccounting(tx, tenantIdOf(req))
        await postPropertyJournal(tx, { tenantId: tenantIdOf(req), userId: req.user.id, sourceType: 'PROPERTY_LAND_ACQUISITION', sourceId: created.id, reference: `LAND-${created.unitCode}`, description: `Initial owned plot inventory recorded: ${property.name} / ${created.unitCode}`, lines: propertyLandAcquisitionLines(config, { amount: acquisitionCost, reference: created.unitCode }) })
      }
      return created
    })
    res.status(201).json(unit)
  } catch (error) { if (error.code === 'P2002') return res.status(409).json({ error: 'That unit code already exists in this property.' }); console.error('Create property unit failed:', error); res.status(500).json({ error: 'Could not save unit.' }) }
})

router.put('/units/:id/acquisition-cost', requirePermission('canManagePropertyLandInventory'), async (req, res) => {
  const acquisitionCost = money(req.body?.acquisitionCost)
  if (!(acquisitionCost > 0) || !Number.isFinite(acquisitionCost)) return badRequest(res, 'Enter an acquisition cost greater than zero.')
  try {
    const result = await prisma.$transaction(async tx => {
      const unit = await tx.propertyUnit.findFirst({ where: { id: req.params.id, property: { tenantId: tenantIdOf(req), propertyType: 'land', ownerId: null } }, include: { property: true } })
      if (!unit) throw Object.assign(new Error('Owned land plot not found.'), { statusCode: 404 })
      const saleCount = await tx.propertySale.count({ where: { unitId: unit.id } })
      if (unit.status === 'sold' || saleCount) throw Object.assign(new Error('The plot has a sale history; its acquisition cost is locked to protect the posted books.'), { statusCode: 409 })
      if (unit.acquisitionCost > 0) throw Object.assign(new Error('Acquisition cost is already recorded. Use an accounting adjustment with approval; do not overwrite the cost basis.'), { statusCode: 409 })
      const config = await ensurePropertyAccounting(tx, tenantIdOf(req))
      await postPropertyJournal(tx, { tenantId: tenantIdOf(req), userId: req.user.id, sourceType: 'PROPERTY_LAND_ACQUISITION', sourceId: unit.id, reference: `LAND-${unit.unitCode}`, description: `Initial owned plot inventory recorded: ${unit.property.name} / ${unit.unitCode}`, lines: propertyLandAcquisitionLines(config, { amount: acquisitionCost, reference: unit.unitCode }) })
      return tx.propertyUnit.update({ where: { id: unit.id }, data: { acquisitionCost } })
    })
    res.json(result)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Record plot acquisition cost failed:', error); res.status(status).json({ error: status === 500 ? 'Could not record plot cost.' : error.message }) }
})

router.put('/units/:id', requirePermission('canManagePropertyUnits'), async (req, res) => {
  try {
    const unit = await prisma.propertyUnit.findFirst({ where: { id: req.params.id, property: { tenantId: tenantIdOf(req) } }, include: { property: { select: { propertyType: true } } } })
    if (!unit) return res.status(404).json({ error: 'Unit not found.' })
    if (String(unit.property.propertyType).toLowerCase() === 'land') {
      const areaSize = req.body.areaSize == null ? unit.areaSize : Number(req.body.areaSize)
      const areaUnit = String(req.body.areaUnit ?? unit.areaUnit ?? '').toLowerCase()
      const frontage = req.body.frontage == null || req.body.frontage === '' ? null : Number(req.body.frontage)
      const depth = req.body.depth == null || req.body.depth === '' ? null : Number(req.body.depth)
      const dimensionUnit = String(req.body.dimensionUnit ?? unit.dimensionUnit ?? '').toLowerCase()
      if (areaSize != null && (!Number.isFinite(areaSize) || areaSize <= 0 || !['sqm', 'sqft', 'acre', 'hectare'].includes(areaUnit))) return badRequest(res, 'Enter a positive plot area and a supported area unit.')
      if ([frontage, depth].some(value => value != null && (!Number.isFinite(value) || value <= 0)) || ((frontage != null || depth != null) && !['m', 'ft'].includes(dimensionUnit))) return badRequest(res, 'Enter valid positive dimensions and select metres or feet.')
    } else if (req.body.rentAmount != null) {
      const rentAmount = Number(req.body.rentAmount)
      if (!Number.isFinite(rentAmount) || rentAmount < 0) return badRequest(res, 'Enter a valid non-negative default rent amount.')
    }
    const active = await prisma.propertyTenancy.count({ where: { unitId: unit.id, status: 'active' } })
    if (active && req.body.status === 'vacant') return res.status(409).json({ error: 'End the active tenancy before marking this unit vacant.' })
    const nextRentAmount = req.body.rentAmount == null ? unit.rentAmount : money(req.body.rentAmount)
    const rentChanged = String(unit.property.propertyType).toLowerCase() !== 'land' && money(unit.rentAmount) !== nextRentAmount
    const result = await prisma.$transaction(async tx => {
      const rateChanges = []
      if (rentChanged) {
        const currentPeriod = rentRateMonthKey(new Date())
        await recordUnitRentRate(tx, { tenantId: tenantIdOf(req), unitId: unit.id, previousAmount: unit.rentAmount, newAmount: nextRentAmount, changedById: req.user.id, effectivePeriod: currentPeriod })
        const activeTenancies = await tx.propertyTenancy.findMany({ where: { tenantId: tenantIdOf(req), unitId: unit.id, status: 'active' }, include: { unit: { include: { property: { select: { name: true, ownerId: true } } } } } })
        for (const tenancy of activeTenancies) {
          const effectivePeriod = rentRateMonthKey(new Date())
          const repricedPeriods = await repriceRentChargesForRate(tx, { tenantId: tenantIdOf(req), tenancy, newAmount: nextRentAmount, effectivePeriod, userId: req.user.id })
          const history = await recordTenancyRentRate(tx, { tenancy, newAmount: nextRentAmount, changedById: req.user.id, effectivePeriod, changeSource: 'unit_edit', note: `Unit default rent changed from ${money(tenancy.rentAmount)} to ${nextRentAmount}. Open charges from ${effectivePeriod} were recalculated; prior periods and receipts remain recorded.` })
          if (history || money(tenancy.rentAmount) !== nextRentAmount) {
            await tx.propertyTenancy.update({ where: { id: tenancy.id }, data: { rentAmount: nextRentAmount } })
            rateChanges.push({ tenancyId: tenancy.id, tenantName: tenancy.tenantName, effectivePeriod, repricedPeriods })
          }
        }
      }
      const updatedUnit = await tx.propertyUnit.update({ where: { id: unit.id }, data: {
      unitCode: req.body.unitCode === undefined ? unit.unitCode : String(req.body.unitCode).trim() || unit.unitCode,
      unitType: req.body.unitType === undefined ? unit.unitType : String(req.body.unitType).trim() || null,
      areaSize: req.body.areaSize == null ? unit.areaSize : Number(req.body.areaSize),
      areaUnit: req.body.areaUnit || unit.areaUnit,
      frontage: req.body.frontage === undefined ? unit.frontage : req.body.frontage == null || req.body.frontage === '' ? null : Number(req.body.frontage),
      depth: req.body.depth === undefined ? unit.depth : req.body.depth == null || req.body.depth === '' ? null : Number(req.body.depth),
      dimensionUnit: req.body.dimensionUnit || unit.dimensionUnit,
      plotNumber: req.body.plotNumber === undefined ? unit.plotNumber : String(req.body.plotNumber).trim() || null,
      blockNumber: req.body.blockNumber === undefined ? unit.blockNumber : String(req.body.blockNumber).trim() || null,
      titleReference: req.body.titleReference === undefined ? unit.titleReference : String(req.body.titleReference).trim() || null,
      landTenure: req.body.landTenure === undefined ? unit.landTenure : String(req.body.landTenure).trim() || null,
      rentAmount: nextRentAmount,
      status: req.body.status || unit.status,
      notes: req.body.notes === undefined ? unit.notes : String(req.body.notes).trim() || null,
      } })
      return { unit: updatedUnit, rateChanges }
    })
    res.json(result)
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'That unit code already exists in this property.' })
    const status = error.statusCode || 500
    if (status === 500) console.error('Update property unit failed:', error)
    res.status(status).json({ error: status === 500 ? 'Could not update unit.' : error.message })
  }
})

router.get('/units/:id/rent-history', requireAnyPermission(['canViewPropertyPortfolio', 'canManagePropertyUnits']), async (req, res) => {
  try {
    const unit = await prisma.propertyUnit.findFirst({ where: { id: req.params.id, property: { tenantId: tenantIdOf(req) } }, select: { id: true } })
    if (!unit) return res.status(404).json({ error: 'Unit not found.' })
    const history = await prisma.propertyRentRateHistory.findMany({
      where: { tenantId: tenantIdOf(req), unitId: unit.id },
      orderBy: [{ effectivePeriod: 'desc' }, { createdAt: 'desc' }],
      include: { tenancy: { select: { id: true, tenantName: true, agreementRef: true } } },
      take: 200,
    })
    res.json(history)
  } catch (error) { console.error('Load unit rent history failed:', error); res.status(500).json({ error: 'Could not load rent history.' }) }
})

router.get('/tenancies', requireAnyPermission(['canViewPropertyPortfolio', 'canViewPropertyManagement', 'canViewPropertyStatements', 'canManageTenancies', 'canEditRentPeriods']), async (req, res) => {
  try {
    const where = { tenantId: tenantIdOf(req), ...(req.query.status && req.query.status !== 'all' ? { status: String(req.query.status) } : {}), ...(req.query.ownerId ? { unit: { property: { ownerId: String(req.query.ownerId) } } } : {}) }
    const rows = await prisma.propertyTenancy.findMany({ where, take: pageSize(req.query.limit), orderBy: [{ status: 'asc' }, { tenantName: 'asc' }], include: { unit: { include: { property: { include: { owner: true } } } }, charges: { where: { status: { in: ['unpaid', 'partial', 'overdue'] }, planAllocations: { none: { plan: { status: 'active' } } } }, orderBy: { dueDate: 'asc' } }, payments: { where: { status: 'posted', paymentType: 'rent' }, select: { advanceAmount: true } } } })
    res.json(rows.map(row => {
      const { nationalId, maritalStatus, spouseNames, childrenCount, householdSize, placeOfOrigin, ...details } = row
      const aging = calculateRentAging(row.charges)
      const currentPeriod = monthKey(new Date())
      const currentRentBalance = money(row.charges.filter(charge => charge.period === currentPeriod).reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0))
      const balance = money(row.charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0))
      const arrearsMonths = row.charges.filter(charge => charge.period < currentPeriod && charge.amount - charge.amountPaid > 0.01).length
      const unpaidRentMonths = row.charges.filter(charge => charge.period <= currentPeriod && charge.amount - charge.amountPaid > 0.01).length
      return { ...details, payments: undefined, ...(canViewCustomerIdentity(req) ? { nationalId } : {}), ...(canViewTenantPersonalDetails(req) ? { maritalStatus, spouseNames, childrenCount, householdSize, placeOfOrigin } : {}), balance, currentRentBalance, arrearsBalance: money(Math.max(0, balance - currentRentBalance)), arrearsMonths, unpaidRentMonths, rentAdvanceBalance: money(row.payments.reduce((sum, payment) => sum + Number(payment.advanceAmount || 0), 0)), overdueBalance: aging.overdueTotal, arrearsAging: aging }
    }))
  } catch (error) { console.error('List property tenancies failed:', error); res.status(500).json({ error: 'Could not load tenancies.' }) }
})

router.post('/tenancies', identityUpload.fields([{ name: 'profilePhoto', maxCount: 1 }, { name: 'nationalIdFront', maxCount: 1 }, { name: 'nationalIdBack', maxCount: 1 }]), requireAnyPermission(['canCreateTenancies', 'canManageTenancies']), async (req, res) => {
  const requestedTenantName = String(req.body?.tenantName || '').trim()
  const existingCustomerId = String(req.body?.customerId || '').trim()
  const startMonth = req.body?.startMonth ? String(req.body.startMonth).trim() : null
  const startDate = startMonth ? (isMonthKey(startMonth) ? monthStart(startMonth) : new Date(NaN)) : new Date(req.body?.startDate)
  const rentAmount = Number(req.body?.rentAmount)
  const arrearsMonths = req.body?.arrearsMonths == null || req.body?.arrearsMonths === '' ? 0 : Number(req.body.arrearsMonths)
  const depositRequired = Number(req.body?.depositRequired || 0)
  const depositHeld = Number(req.body?.depositHeld || 0)
  if ((!requestedTenantName && !existingCustomerId) || !req.body?.unitId || !Number.isFinite(startDate.getTime()) || (startMonth && !isMonthKey(startMonth)) || !Number.isInteger(arrearsMonths) || arrearsMonths < 0 || arrearsMonths > 120 || !Number.isFinite(rentAmount) || rentAmount <= 0 || !Number.isFinite(depositRequired) || depositRequired < 0 || !Number.isFinite(depositHeld) || depositHeld < 0 || depositHeld - depositRequired > 0.01) return badRequest(res, 'Enter a tenant, valid tenancy start month, total unpaid rent months including the current month from 0 to 120, positive monthly rent, and valid deposit amounts.')
  if (TENANT_PERSONAL_FIELDS.some(field => req.body[field] !== undefined && req.body[field] !== '') && !canManageTenantPersonalDetails(req)) return res.status(403).json({ error: 'You do not have permission to manage renter household details.' })
  try {
    const personalDetails = canManageTenantPersonalDetails(req) ? tenantPersonalDetails(req.body) : {}
    const identity = await uploadRenterIdentity(req)
    const unit = await prisma.propertyUnit.findFirst({ where: { id: req.body.unitId, property: { tenantId: tenantIdOf(req), status: 'active' } } })
    if (!unit) return res.status(404).json({ error: 'Unit not found in this business.' })
    if (unit.status !== 'vacant') return res.status(409).json({ error: 'This unit is not vacant.' })
    const result = await prisma.$transaction(async tx => {
      const claim = await tx.propertyUnit.updateMany({ where: { id: unit.id, status: 'vacant' }, data: { status: 'occupied' } })
      if (claim.count !== 1) throw Object.assign(new Error('This unit has just been assigned. Refresh and choose another vacant unit.'), { statusCode: 409 })
      const customer = existingCustomerId
        ? await tx.customer.findFirst({ where: { id: existingCustomerId, tenantId: tenantIdOf(req) } })
        : await findOrCreateRenterCustomer(tx, tenantIdOf(req), req.body)
      if (!customer) throw Object.assign(new Error('Select a tenant from this business, or create a new tenant.'), { statusCode: 400 })
      const renterName = customer.name
      const tenancy = await tx.propertyTenancy.create({ data: { tenantId: tenantIdOf(req), customerId: customer.id, unitId: unit.id, tenantName: renterName, email: customer.email || req.body.email?.trim() || null, phone: customer.phone || req.body.phone?.trim() || null, nationalId: req.body.nationalId?.trim() || customer.nin || null, ...personalDetails, agreementRef: req.body.agreementRef?.trim() || null, startDate, endDate: null, dueDay: 1, rentAmount: money(rentAmount), currency: req.body.currency || unit.currency || 'UGX', depositRequired: money(depositRequired), depositHeld: money(depositHeld), agreementNotes: req.body.agreementNotes?.trim() || null }, include: { customer: { select: { id: true, name: true } }, unit: { include: { property: { include: { owner: true } } } } } })
      await recordTenancyRentRate(tx, { tenancy, newAmount: rentAmount, changedById: req.user.id, effectivePeriod: monthKey(startDate), changeSource: 'tenancy_start', note: 'Initial rent rate from the tenancy agreement.' })
      if (Object.values(identity).some(Boolean)) await tx.propertyTenantIdentity.create({ data: { tenantId: tenantIdOf(req), tenancyId: tenancy.id, profilePhotoUrl: identity.profilePhoto, nationalIdFrontUrl: identity.nationalIdFront, nationalIdBackUrl: identity.nationalIdBack } })
      if (depositHeld > 0) {
        const config = await ensurePropertyAccounting(tx, tenantIdOf(req))
        await postPropertyJournal(tx, { tenantId: tenantIdOf(req), userId: req.user.id, sourceType: 'PROPERTY_DEPOSIT_OPENING', sourceId: tenancy.id, date: startDate, reference: tenancy.agreementRef || tenancy.id, description: `Opening tenant security deposit for ${renterName}`, lines: propertyOpeningDepositLines(config, { amount: depositHeld, reference: tenancy.agreementRef || tenancy.id }) })
      }
      await ensureTenancyRentSchedule(tx, { tenancy, arrearsMonths, userId: req.user.id })
      return tenancy
    })
    res.status(201).json(result)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Create tenancy failed:', error); res.status(status).json({ error: status === 500 ? 'Could not create tenancy.' : error.message }) }
})

router.put('/tenancies/:id/profile', identityUpload.fields([{ name: 'profilePhoto', maxCount: 1 }, { name: 'nationalIdFront', maxCount: 1 }, { name: 'nationalIdBack', maxCount: 1 }]), requirePermission('canManageTenancies'), async (req, res) => {
  try {
    const tenancy = await prisma.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) }, include: { unit: { include: { property: { select: { name: true, ownerId: true } } } } } })
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found.' })
    const identity = await uploadRenterIdentity(req)
    const updated = await prisma.$transaction(async tx => {
      const customer = tenancy.customerId
        ? await tx.customer.update({ where: { id: tenancy.customerId }, data: { ...(req.body.nationalId ? { nin: String(req.body.nationalId).trim() } : {}) } })
        : await findOrCreateRenterCustomer(tx, tenancy.tenantId, tenancy)
      if (Object.values(identity).some(Boolean)) await tx.propertyTenantIdentity.upsert({
        where: { tenancyId: tenancy.id },
        create: { tenantId: tenancy.tenantId, tenancyId: tenancy.id, profilePhotoUrl: identity.profilePhoto, nationalIdFrontUrl: identity.nationalIdFront, nationalIdBackUrl: identity.nationalIdBack },
        update: {
          ...(identity.profilePhoto ? { profilePhotoUrl: identity.profilePhoto } : {}),
          ...(identity.nationalIdFront ? { nationalIdFrontUrl: identity.nationalIdFront } : {}),
          ...(identity.nationalIdBack ? { nationalIdBackUrl: identity.nationalIdBack } : {}),
        },
      })
      return tx.propertyTenancy.update({ where: { id: tenancy.id }, data: {
        customerId: customer.id,
        ...(req.body.nationalId ? { nationalId: String(req.body.nationalId).trim() } : {}),
      }, select: { id: true, customerId: true, nationalId: true } })
    })
    res.json(updated)
  } catch (error) { console.error('Update renter profile failed:', error); res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Could not update tenant profile.' }) }
})

router.put('/tenancies/:id', requireAnyPermission(['canManageTenancies', 'canManageTenantPersonalDetails']), async (req, res) => {
  try {
    const tenancy = await prisma.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) }, include: { unit: { include: { property: { select: { name: true, ownerId: true } } } } } })
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found.' })
    const canManageTenancy = ['*', 'canManageTenancies'].some(permission => req.user?.permissions?.includes(permission))
    if (!canManageTenancy && Object.keys(req.body).some(field => !TENANT_PERSONAL_FIELDS.includes(field))) return res.status(403).json({ error: 'You may update renter household details only.' })
    if (TENANT_PERSONAL_FIELDS.some(field => req.body[field] !== undefined) && !canManageTenantPersonalDetails(req)) return res.status(403).json({ error: 'You do not have permission to manage renter household details.' })
    const personalDetails = canManageTenantPersonalDetails(req) ? tenantPersonalDetails(req.body) : {}

    const tenantName = req.body.tenantName === undefined ? undefined : String(req.body.tenantName).trim()
    const phone = req.body.phone === undefined ? undefined : String(req.body.phone).trim() || null
    const email = req.body.email === undefined ? undefined : String(req.body.email).trim() || null
    const startMonth = req.body.startMonth === undefined ? undefined : String(req.body.startMonth).trim()
  const arrearsMonths = req.body.arrearsMonths === undefined ? 0 : Number(req.body.arrearsMonths)
    const rentAmount = req.body.rentAmount === undefined ? undefined : Number(req.body.rentAmount)
    const depositRequired = req.body.depositRequired === undefined ? undefined : Number(req.body.depositRequired)
    if (tenantName !== undefined && !tenantName) return badRequest(res, 'Tenant name is required.')
    if (startMonth !== undefined && !isMonthKey(startMonth)) return badRequest(res, 'Choose a valid starting rent month.')
    if (!Number.isInteger(arrearsMonths) || arrearsMonths < 0 || arrearsMonths > 120) return badRequest(res, 'Enter the total unpaid rent months, including the current month, as a whole number from 0 to 120.')
    if (rentAmount !== undefined && (!Number.isFinite(rentAmount) || rentAmount <= 0)) return badRequest(res, 'Monthly rent must be greater than zero.')
    if (depositRequired !== undefined && (!Number.isFinite(depositRequired) || depositRequired < 0)) return badRequest(res, 'Required deposit cannot be negative.')

    const nextStartDate = startMonth === undefined ? tenancy.startDate : monthStart(startMonth)
    const effectiveEndMonth = tenancy.status === 'ended' && tenancy.endDate ? monthKey(tenancy.endDate) : null
    const rangeChanged = startMonth !== undefined && monthKey(nextStartDate) !== monthKey(tenancy.startDate)

    const data = {
      ...(tenantName !== undefined ? { tenantName } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(req.body.agreementRef !== undefined ? { agreementRef: String(req.body.agreementRef).trim() || null } : {}),
      ...(req.body.agreementNotes !== undefined ? { agreementNotes: String(req.body.agreementNotes).trim() || null } : {}),
      ...personalDetails,
      ...(startMonth !== undefined ? { startDate: nextStartDate } : {}),
      ...(rentAmount !== undefined ? { rentAmount: money(rentAmount) } : {}),
      ...(depositRequired !== undefined ? { depositRequired: money(depositRequired) } : {}),
    }
    const updated = await prisma.$transaction(async tx => {
      if (rangeChanged) {
        const periodStart = monthKey(nextStartDate)
        const existingCharges = await tx.rentCharge.findMany({ where: { tenantId: tenantIdOf(req), tenancyId: tenancy.id }, select: { period: true } })
        const outOfRange = existingCharges.some(charge => charge.period < periodStart || (effectiveEndMonth && charge.period > effectiveEndMonth))
        if (outOfRange) throw Object.assign(new Error('Existing rent charges fall outside the selected months. Correct those rent periods first; posted rent charges and receipts cannot be removed by changing tenancy dates.'), { statusCode: 409 })
      }
      if (tenancy.customerId && (tenantName !== undefined || phone !== undefined || email !== undefined)) {
        await tx.customer.updateMany({ where: { id: tenancy.customerId, tenantId: tenantIdOf(req) }, data: {
          ...(tenantName !== undefined ? { name: tenantName } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(email !== undefined ? { email } : {}),
        } })
        await tx.propertyTenancy.updateMany({ where: { tenantId: tenantIdOf(req), customerId: tenancy.customerId }, data: {
          ...(tenantName !== undefined ? { tenantName } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(email !== undefined ? { email } : {}),
        } })
      }
      const result = await tx.propertyTenancy.update({ where: { id: tenancy.id }, data, include: { unit: { include: { property: true } } } })
      if (rentAmount !== undefined && tenancy.status === 'active' && money(tenancy.rentAmount) !== money(rentAmount)) {
        const effectivePeriod = rentRateMonthKey(new Date())
        await repriceRentChargesForRate(tx, { tenantId: tenantIdOf(req), tenancy, newAmount: rentAmount, effectivePeriod, userId: req.user.id })
        await recordTenancyRentRate(tx, { tenancy, newAmount: rentAmount, changedById: req.user.id, effectivePeriod, changeSource: 'tenancy_edit', note: 'Rent changed on the tenancy agreement; open charges were recalculated and prior periods and receipts remain recorded.' })
      }
      await ensureTenancyRentSchedule(tx, { tenancy: result, arrearsMonths, userId: req.user.id })
      return result
    })
    res.json(updated)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Update tenancy failed:', error); res.status(status).json({ error: status === 500 ? 'Could not update tenancy details.' : error.message }) }
})

router.get('/customers/:customerId/rent-ledger', requirePermission('canViewPropertyStatements'), async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({ where: { id: req.params.customerId, tenantId: tenantIdOf(req) } })
    if (!customer) return res.status(404).json({ error: 'Customer not found.' })
    const tenancies = await prisma.propertyTenancy.findMany({
      where: { tenantId: tenantIdOf(req), customerId: customer.id },
      orderBy: { startDate: 'desc' },
      include: {
        unit: { include: { property: { include: { owner: { select: { id: true, name: true } } } } } },
        charges: {
          orderBy: { dueDate: 'asc' },
          include: {
            allocations: {
              include: {
                payment: { select: { id: true, receiptNo: true, paymentDate: true, paymentMethod: true, status: true } },
              },
            },
          },
        },
        payments: { where: { status: 'posted', paymentType: { in: ['rent', 'rent_plan', 'deposit_application'] } }, orderBy: { paymentDate: 'asc' }, include: { cashAccount: { select: { name: true } }, rentPaymentPlan: { select: { planNo: true } } } },
        identity: true,
      },
    })
    const includeIdentity = canViewCustomerIdentity(req)
    const includePersonalDetails = canViewTenantPersonalDetails(req)
    const allCharges = tenancies.flatMap(row => row.charges)
    const entries = tenancies.flatMap(tenancy => [
      ...tenancy.charges.map(charge => ({ id: charge.id, tenancyId: tenancy.id, date: charge.dueDate, type: 'rent_due', reference: charge.period, description: `${charge.description} · ${tenancy.unit.property.name} / ${tenancy.unit.unitCode}`, debit: charge.amount, credit: 0, status: charge.status })),
      ...tenancy.payments.map(payment => ({ id: payment.id, tenancyId: tenancy.id, date: payment.paymentDate, type: payment.paymentType === 'rent_plan' ? 'rent_plan_payment' : payment.paymentType === 'deposit_application' ? 'deposit_application' : 'rent_payment', reference: payment.receiptNo, description: `${payment.paymentType === 'deposit_application' ? 'Security deposit applied to rent' : payment.paymentType === 'rent_plan' ? 'Rent payment plan receipt' : `Rent payment${payment.rentMonths ? ` · ${payment.rentMonths} month(s)` : ''}${payment.arrearsMonths ? ` · ${payment.arrearsMonths} arrears month(s)` : ''}`} · ${tenancy.unit.property.name} / ${tenancy.unit.unitCode}`, propertyName: tenancy.unit.property.name, unitCode: tenancy.unit.unitCode, currency: tenancy.currency, rentMonths: payment.rentMonths, arrearsMonths: payment.arrearsMonths, planNo: payment.rentPaymentPlan?.planNo, cashAccountName: payment.cashAccount?.name, transactionRef: payment.transactionRef, debit: 0, credit: payment.amount, paymentMethod: payment.paymentMethod, status: payment.status })),
    ]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    let balance = 0
    for (const entry of entries) { balance = money(balance + entry.debit - entry.credit); entry.runningBalance = balance }
    const identity = tenancies.find(row => row.identity)?.identity
    res.json({
      customer: { id: customer.id, name: customer.name, ...(includeIdentity ? { profilePhotoUrl: identity?.profilePhotoUrl, nationalId: customer.nin, nationalIdFrontUrl: identity?.nationalIdFrontUrl, nationalIdBackUrl: identity?.nationalIdBackUrl } : {}) },
      tenancies: tenancies.map(({ charges, payments, identity: _identity, ...tenancy }) => {
        const { nationalId, maritalStatus, spouseNames, childrenCount, householdSize, placeOfOrigin, ...details } = tenancy
        return { ...details, ...(includeIdentity ? { nationalId } : {}), ...(includePersonalDetails ? { maritalStatus, spouseNames, childrenCount, householdSize, placeOfOrigin } : {}), balance: money(charges.reduce((sum, charge) => sum + charge.amount - charge.amountPaid, 0)), rentAdvanceBalance: money(payments.filter(payment => payment.paymentType === 'rent').reduce((sum, payment) => sum + Number(payment.advanceAmount || 0), 0)), arrearsAging: calculateRentAging(charges) }
      }),
      entries,
      closingBalance: balance,
      arrearsAging: calculateRentAging(allCharges),
      access: { identity: includeIdentity, personalDetails: includePersonalDetails, managePersonalDetails: canManageTenantPersonalDetails(req) },
    })
  } catch (error) { console.error('Load renter ledger failed:', error); res.status(500).json({ error: 'Could not load rental history.' }) }
})

router.get('/customers/:customerId/household', requireAnyPermission(['canViewTenantPersonalDetails', 'canManageTenantPersonalDetails']), async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({ where: { id: req.params.customerId, tenantId: tenantIdOf(req) }, select: { id: true } })
    if (!customer) return res.status(404).json({ error: 'Customer not found.' })
    const tenancies = await prisma.propertyTenancy.findMany({
      where: { tenantId: tenantIdOf(req), customerId: customer.id },
      orderBy: { startDate: 'desc' },
      select: {
        id: true, maritalStatus: true, spouseNames: true, childrenCount: true, householdSize: true, placeOfOrigin: true,
        status: true, startDate: true, endDate: true, agreementRef: true,
        unit: { select: { unitCode: true, property: { select: { name: true } } } },
      },
    })
    res.json({ tenancies })
  } catch (error) { console.error('Load renter household details failed:', error); res.status(500).json({ error: 'Could not load renter household details.' }) }
})

router.get('/customers/:customerId/payment-plans', requireAnyPermission(['canViewRentPaymentPlans', 'canManageRentPaymentPlans']), async (req, res) => {
  try {
    const tenantId = tenantIdOf(req)
    const customer = await prisma.customer.findFirst({ where: { id: req.params.customerId, tenantId }, select: { id: true } })
    if (!customer) return res.status(404).json({ error: 'Renter profile not found.' })
    const [plans, overdueCharges] = await Promise.all([
      prisma.propertyRentPaymentPlan.findMany({
        where: { tenantId, tenancy: { customerId: customer.id } },
        orderBy: { createdAt: 'desc' },
        include: {
          tenancy: { include: { unit: { include: { property: true } } } },
          installments: { orderBy: { sequence: 'asc' } },
          chargeAllocations: { include: { charge: { select: { id: true, period: true, dueDate: true, description: true, amount: true } } } },
          payments: { where: { status: 'posted' }, orderBy: { paymentDate: 'desc' }, select: { id: true, receiptNo: true, amount: true, paymentDate: true, paymentMethod: true, status: true, transactionRef: true, cashAccount: { select: { name: true } }, planInstallmentAllocations: { select: { amount: true, installment: { select: { sequence: true } } } } } },
        },
      }),
      prisma.rentCharge.findMany({
        where: { tenantId, tenancy: { customerId: customer.id }, dueDate: { lt: new Date() }, status: { in: ['unpaid', 'partial', 'overdue'] }, planAllocations: { none: { plan: { status: 'active' } } } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        include: { tenancy: { include: { unit: { include: { property: true } } } } },
      }),
    ])
    const eligibleCharges = overdueCharges.filter(charge => money(charge.amount - charge.amountPaid) > 0.01).map(charge => ({
      id: charge.id, tenancyId: charge.tenancyId, tenancyName: charge.tenancy.tenantName,
      propertyName: charge.tenancy.unit.property.name, unitCode: charge.tenancy.unit.unitCode,
      currency: charge.tenancy.currency, period: charge.period, dueDate: charge.dueDate,
      description: charge.description, amount: money(charge.amount), amountPaid: money(charge.amountPaid),
      balance: money(charge.amount - charge.amountPaid),
    }))
    res.json({ plans, eligibleCharges })
  } catch (error) { console.error('List renter payment plans failed:', error); res.status(500).json({ error: 'Could not load renter payment plans.' }) }
})

router.post('/customers/:customerId/payment-plans', requirePermission('canManageRentPaymentPlans'), async (req, res) => {
  const tenancyId = String(req.body?.tenancyId || '').trim()
  const installmentCount = Number(req.body?.installmentCount)
  const frequency = String(req.body?.frequency || 'monthly').toLowerCase()
  const startDateValue = String(req.body?.startDate || '').trim()
  const startDate = startDateValue ? new Date(`${startDateValue}T12:00:00.000Z`) : new Date()
  const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim()
  const notes = String(req.body?.notes || '').trim()
  if (!tenancyId) return badRequest(res, 'Choose the tenancy covered by this payment plan.')
  if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 36) return badRequest(res, 'Choose between 1 and 36 installments.')
  if (!['weekly', 'biweekly', 'monthly'].includes(frequency)) return badRequest(res, 'Choose weekly, biweekly, or monthly installments.')
  if (!Number.isFinite(startDate.getTime())) return badRequest(res, 'Enter a valid first installment date.')
  if (idempotencyKey.length > 120 || notes.length > 1000) return badRequest(res, 'The request key or notes are too long.')
  try {
    const tenantId = tenantIdOf(req)
    const plan = await prisma.$transaction(async tx => {
      const existing = await tx.propertyRentPaymentPlan.findFirst({ where: { tenantId, idempotencyKey } })
      if (existing) return existing
      await tx.$queryRaw`SELECT "id" FROM "property_tenancies" WHERE "id" = ${tenancyId} AND "tenantId" = ${tenantId} FOR UPDATE`
      const tenancy = await tx.propertyTenancy.findFirst({ where: { id: tenancyId, tenantId, customerId: req.params.customerId, status: { in: ['active', 'ended'] } }, include: { unit: { include: { property: true } } } })
      if (!tenancy) throw Object.assign(new Error('Renter tenancy not found.'), { statusCode: 404 })
      const charges = await tx.rentCharge.findMany({
        where: { tenantId, tenancyId, dueDate: { lt: new Date() }, status: { in: ['unpaid', 'partial', 'overdue'] }, planAllocations: { none: { plan: { status: 'active' } } } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      })
      const arrears = charges.map(charge => ({ charge, amount: money(charge.amount - charge.amountPaid) })).filter(item => item.amount > 0.01)
      const totalAmount = money(arrears.reduce((sum, item) => sum + item.amount, 0))
      if (!totalAmount) throw Object.assign(new Error('This tenancy has no unplanned overdue rent to schedule.'), { statusCode: 409 })
      const planNo = `RPL-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`
      const base = money(totalAmount / installmentCount)
      const installments = Array.from({ length: installmentCount }, (_, index) => ({
        sequence: index + 1,
        dueDate: planDueDate(startDate, index, frequency),
        amount: index === installmentCount - 1 ? money(totalAmount - base * (installmentCount - 1)) : base,
        status: 'unpaid',
      }))
      const created = await tx.propertyRentPaymentPlan.create({ data: {
        tenantId, tenancyId, createdById: req.user.id, planNo, idempotencyKey,
        totalAmount, installmentCount, frequency, startDate, notes: notes || null,
        chargeAllocations: { create: arrears.map(item => ({ chargeId: item.charge.id, amount: item.amount })) },
        installments: { create: installments },
      } })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, {
        tenantId, userId: req.user.id, sourceType: 'PROPERTY_RENT_PLAN_RECLASS', sourceId: created.id,
        date: new Date(), reference: created.planNo,
        description: `Reclassify overdue rent for ${tenancy.tenantName}, ${tenancy.unit.property.name} / ${tenancy.unit.unitCode} to an agreed payment plan`,
        lines: propertyRentPlanReclassificationLines(config, { amount: totalAmount, reference: created.planNo }),
      })
      return tx.propertyRentPaymentPlan.findUnique({ where: { id: created.id }, include: { tenancy: { include: { unit: { include: { property: true } } } }, installments: { orderBy: { sequence: 'asc' } }, chargeAllocations: { include: { charge: true } } } })
    })
    res.status(201).json(plan)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Create renter payment plan failed:', error); res.status(status).json({ error: status === 500 ? 'Could not create renter payment plan.' : error.message }) }
})

router.post('/payment-plans/:id/cancel', requirePermission('canManageRentPaymentPlans'), async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 5 || reason.length > 500) return badRequest(res, 'Enter a cancellation reason between 5 and 500 characters.')
  try {
    const tenantId = tenantIdOf(req)
    const plan = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "property_rent_payment_plans" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const current = await tx.propertyRentPaymentPlan.findFirst({ where: { id: req.params.id, tenantId }, include: { tenancy: { include: { unit: { include: { property: true } } } } } })
      if (!current) throw Object.assign(new Error('Rent payment plan not found.'), { statusCode: 404 })
      if (current.status !== 'active') throw Object.assign(new Error('Only an active payment plan can be cancelled.'), { statusCode: 409 })
      const remaining = money(current.totalAmount - current.amountPaid)
      if (remaining > 0.01) {
        const config = await ensurePropertyAccounting(tx, tenantId)
        await postPropertyJournal(tx, {
          tenantId, userId: req.user.id, sourceType: 'PROPERTY_RENT_PLAN_CANCEL_RECLASS', sourceId: current.id,
          date: new Date(), reference: current.planNo,
          description: `Release unpaid balance from cancelled rent payment plan ${current.planNo}: ${reason}`,
          lines: propertyRentPlanCancellationLines(config, { amount: remaining, reference: current.planNo }),
        })
      }
      return tx.propertyRentPaymentPlan.update({ where: { id: current.id }, data: { status: 'cancelled', notes: [current.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') } })
    })
    res.json(plan)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Cancel renter payment plan failed:', error); res.status(status).json({ error: status === 500 ? 'Could not cancel renter payment plan.' : error.message }) }
})

router.post('/payment-plans/:id/payments', requirePermission('canRecordRentPayment'), async (req, res) => {
  const amount = money(req.body?.amount)
  const paymentMethod = String(req.body?.paymentMethod || 'cash').toLowerCase()
  const cashAccountId = String(req.body?.cashAccountId || '')
  const paymentDate = req.body?.paymentDate ? new Date(req.body.paymentDate) : new Date()
  const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim()
  if (!(amount > 0)) return badRequest(res, 'Enter a payment amount greater than zero.')
  if (!Object.hasOwn(paymentMethodToAccount, paymentMethod)) return badRequest(res, 'Select a valid payment method.')
  if (!cashAccountId) return badRequest(res, 'Select a permitted transaction account for this payment.')
  if (!Number.isFinite(paymentDate.getTime())) return badRequest(res, 'Enter a valid payment date.')
  if (!idempotencyKey || idempotencyKey.length > 120) return badRequest(res, 'Payment request key is invalid.')
  try {
    const tenantId = tenantIdOf(req)
    const expectedType = paymentMethodToAccount[paymentMethod]
    const permittedAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
    if (!permittedAccount || permittedAccount.type !== expectedType) return badRequest(res, 'The selected transaction account does not match the payment method or is inactive.')
    if (!canUseTransactionAccountForPayment(req, permittedAccount, paymentMethod)) return res.status(403).json({ error: `You do not have permission to use ${permittedAccount.name} for rent plan payments.` })
    const payment = await prisma.$transaction(async tx => {
      const prior = await tx.propertyRentPayment.findFirst({ where: { tenantId, idempotencyKey }, include: { planInstallmentAllocations: { include: { installment: true } } } })
      if (prior) return prior
      await tx.$queryRaw`SELECT "id" FROM "property_rent_payment_plans" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const plan = await tx.propertyRentPaymentPlan.findFirst({
        where: { id: req.params.id, tenantId, status: 'active' },
        include: {
          tenancy: { include: { unit: { include: { property: true } } } },
          installments: { where: { status: { in: ['unpaid', 'partial', 'overdue'] } }, orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }] },
          chargeAllocations: {
            orderBy: { charge: { dueDate: 'asc' } },
            include: {
              charge: {
                include: {
                  allocations: {
                    where: { payment: { rentPaymentPlanId: req.params.id, status: 'posted' } },
                    select: { amount: true },
                  },
                },
              },
            },
          },
        },
      })
      if (!plan) throw Object.assign(new Error('Active rent payment plan not found.'), { statusCode: 404 })
      const remainingPlan = money(plan.totalAmount - plan.amountPaid)
      if (amount - remainingPlan > 0.01) throw Object.assign(new Error(`Payment exceeds this plan's remaining balance of ${plan.tenancy.currency} ${remainingPlan.toLocaleString()}.`), { statusCode: 400 })
      const account = await tx.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
      if (!account || account.type !== expectedType) throw Object.assign(new Error('Selected transaction account is no longer available; reload and retry.'), { statusCode: 409 })
      const receiptNo = `RENT-PLAN-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`
      const record = await tx.propertyRentPayment.create({ data: {
        tenantId, tenancyId: plan.tenancyId, rentPaymentPlanId: plan.id, cashAccountId: account.id,
        receiptNo, idempotencyKey, amount, paymentDate, paymentMethod, transactionRef: req.body?.transactionRef?.trim() || null,
        notes: req.body?.notes?.trim() || null, paymentType: 'rent_plan',
      } })
      const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: account, amount, direction: 'receipt', reference: receiptNo, description: `Rent repayment plan ${plan.planNo} payment from ${plan.tenancy.tenantName}` })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_RENT_PLAN_PAYMENT', sourceId: record.id, date: paymentDate, reference: receiptNo, description: `Rent repayment plan receipt from ${plan.tenancy.tenantName}`, lines: propertyRentPlanReceiptLines(config, { amount, cashAccountLedgerId: movement.ledgerAccount.id, reference: receiptNo }) })
      let chargeRemaining = amount
      for (const allocation of plan.chargeAllocations) {
        if (chargeRemaining <= 0.001) break
        const paidInPlan = allocation.charge.allocations.reduce((sum, row) => sum + Number(row.amount), 0)
        const balanceInPlan = money(allocation.amount - paidInPlan)
        const applied = money(Math.min(chargeRemaining, balanceInPlan))
        if (!applied) continue
        const charge = allocation.charge
        const nextPaid = money(charge.amountPaid + applied)
        await tx.rentPaymentAllocation.create({ data: { paymentId: record.id, chargeId: charge.id, amount: applied } })
        await tx.rentCharge.update({ where: { id: charge.id }, data: { amountPaid: nextPaid, status: nextPaid + 0.001 >= charge.amount ? 'paid' : 'partial' } })
        chargeRemaining = money(chargeRemaining - applied)
      }
      let installmentRemaining = amount
      for (const installment of plan.installments) {
        if (installmentRemaining <= 0.001) break
        const applied = money(Math.min(installmentRemaining, Math.max(0, installment.amount - installment.amountPaid)))
        if (!applied) continue
        const nextPaid = money(installment.amountPaid + applied)
        await tx.rentPlanInstallmentPaymentAllocation.create({ data: { paymentId: record.id, installmentId: installment.id, amount: applied } })
        await tx.rentPaymentPlanInstallment.update({ where: { id: installment.id }, data: { amountPaid: nextPaid, status: nextPaid + 0.001 >= installment.amount ? 'paid' : 'partial' } })
        installmentRemaining = money(installmentRemaining - applied)
      }
      const nextPlanPaid = money(plan.amountPaid + amount)
      await tx.propertyRentPaymentPlan.update({ where: { id: plan.id }, data: { amountPaid: nextPlanPaid, status: nextPlanPaid + 0.001 >= plan.totalAmount ? 'completed' : 'active' } })
      return tx.propertyRentPayment.findUnique({ where: { id: record.id }, include: { tenancy: { include: { unit: { include: { property: true } } } }, cashAccount: { select: { id: true, name: true, type: true } }, allocations: { include: { charge: true } }, planInstallmentAllocations: { include: { installment: true } } } })
    })
    res.status(201).json(payment)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Record rent plan payment failed:', error); res.status(status).json({ error: status === 500 ? 'Could not record rent plan payment.' : error.message }) }
})

router.post('/tenancies/:id/end', requireAnyPermission(['canEndTenancies', 'canManageTenancies']), async (req, res) => {
  try {
    const tenancy = await prisma.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req), status: 'active' }, include: { charges: { where: { status: { in: ['unpaid', 'partial', 'overdue'] } } } } })
    if (!tenancy) return res.status(404).json({ error: 'Active tenancy not found.' })
    const outstanding = tenancy.charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0)
    if (outstanding > 0.01 && req.body?.confirmOutstanding !== true) return res.status(409).json({ error: 'There is rent outstanding. Review the statement and confirm before ending this tenancy.', outstanding: money(outstanding) })
    const result = await prisma.$transaction(async tx => {
      const ended = await tx.propertyTenancy.update({ where: { id: tenancy.id }, data: { status: 'ended', endDate: req.body?.endDate ? new Date(req.body.endDate) : new Date() } })
      await tx.propertyUnit.update({ where: { id: tenancy.unitId }, data: { status: 'vacant' } })
      return ended
    })
    res.json(result)
  } catch (error) { console.error('End tenancy failed:', error); res.status(500).json({ error: 'Could not end tenancy.' }) }
})

router.post('/tenancies/:id/reactivate', requireAnyPermission(['canReactivateTenancies', 'canManageTenancies']), async (req, res) => {
  try {
    const tenantId = tenantIdOf(req)
    const result = await prisma.$transaction(async tx => {
      const tenancy = await tx.propertyTenancy.findFirst({
        where: { id: req.params.id, tenantId, status: { in: ['active', 'ended'] } },
        include: { unit: { include: { property: true } } },
      })
      if (!tenancy || (tenancy.status === 'active' && !tenancy.endDate)) throw Object.assign(new Error('This tenancy is already active and has no legacy end date to clear.'), { statusCode: 409 })
      const occupyingTenancy = await tx.propertyTenancy.findFirst({
        where: { tenantId, unitId: tenancy.unitId, status: 'active', id: { not: tenancy.id } },
        select: { id: true, tenantName: true },
      })
      if (occupyingTenancy) throw Object.assign(new Error(`This unit is already assigned to ${occupyingTenancy.tenantName}.`), { statusCode: 409 })

      const reactivated = await tx.propertyTenancy.update({
        where: { id: tenancy.id },
        data: { status: 'active', endDate: null },
        include: { unit: { include: { property: true } } },
      })
      await tx.propertyUnit.update({ where: { id: tenancy.unitId }, data: { status: 'occupied' } })

      const currentPeriod = monthKey(new Date())
      const firstAfterRecordedEnd = tenancy.endDate
        ? monthKey(new Date(Date.UTC(tenancy.endDate.getUTCFullYear(), tenancy.endDate.getUTCMonth() + 1, 1)))
        : currentPeriod
      let period = firstAfterRecordedEnd <= currentPeriod ? firstAfterRecordedEnd : currentPeriod
      for (let guard = 0; period <= currentPeriod && guard < 1200; guard += 1) {
        await ensureRentChargeForPeriod(tx, { tenancy: reactivated, period, userId: req.user.id })
        period = monthKey(new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1)))
      }
      return reactivated
    }, { isolationLevel: 'Serializable' })
    res.json(result)
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message })
    if (error.code === 'P2034') return res.status(409).json({ error: 'The unit changed at the same time. Refresh and retry.' })
    console.error('Reactivate tenancy failed:', error)
    res.status(500).json({ error: 'Could not reactivate tenancy.' })
  }
})

router.get('/tenancies/:id/rent-periods', requirePermission('canEditRentPeriods'), async (req, res) => {
  try {
    const tenancy = await prisma.propertyTenancy.findFirst({
      where: { id: req.params.id, tenantId: tenantIdOf(req) },
      select: {
        id: true, tenantName: true, currency: true,
        unit: { select: { unitCode: true, property: { select: { name: true } } } },
        charges: {
          orderBy: [{ dueDate: 'asc' }, { period: 'asc' }],
          include: { planAllocations: { include: { plan: { select: { status: true } } } } },
        },
      },
    })
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found.' })
    res.json({
      tenancy: { id: tenancy.id, tenantName: tenancy.tenantName, currency: tenancy.currency, unit: tenancy.unit },
      periods: tenancy.charges.map(({ planAllocations, ...charge }) => ({
        ...charge,
        lockedByActivePlan: planAllocations.some(allocation => allocation.plan.status === 'active'),
      })),
    })
  } catch (error) { console.error('Rent period list failed:', error); res.status(500).json({ error: 'Could not load rent periods.' }) }
})

router.put('/rent-charges/:id/period', requirePermission('canEditRentPeriods'), async (req, res) => {
  const period = String(req.body?.period || '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return badRequest(res, 'Choose a valid rent month.')
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "rent_charges" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantIdOf(req)} FOR UPDATE`
      const charge = await tx.rentCharge.findFirst({
        where: { id: req.params.id, tenantId: tenantIdOf(req) },
        include: {
          tenancy: { include: { unit: { include: { property: { select: { name: true, ownerId: true } } } } } },
          planAllocations: { include: { plan: { select: { status: true } } } },
        },
      })
      if (!charge) throw Object.assign(new Error('Rent period not found.'), { statusCode: 404 })
      if (charge.planAllocations.some(allocation => allocation.plan.status === 'active')) {
        throw Object.assign(new Error('This rent period is part of an active repayment plan. Update or complete that plan before correcting the period.'), { statusCode: 409 })
      }
      const periodChanged = charge.period !== period
      const dueDate = dueDateFor(period)
      const dayStamp = value => {
        const date = new Date(value)
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      }
      if (dayStamp(dueDate) < dayStamp(charge.tenancy.startDate) || (charge.tenancy.status === 'ended' && charge.tenancy.endDate && dayStamp(dueDate) > dayStamp(charge.tenancy.endDate))) {
        throw Object.assign(new Error('The corrected rent month must fall within the tenancy dates.'), { statusCode: 400 })
      }
      const duplicate = await tx.rentCharge.findFirst({ where: { tenantId: tenantIdOf(req), tenancyId: charge.tenancyId, period, NOT: { id: charge.id } }, select: { id: true } })
      if (duplicate) throw Object.assign(new Error('A rent charge already exists for that month. Choose another period.'), { statusCode: 409 })

      const periodAmount = await rentAmountForPeriod(tx, charge.tenancy, period)
      const correctedValues = correctedRentChargeValues({ ...charge, dueDate }, periodAmount)
      const amountChanged = Math.abs(Number(charge.amount) - correctedValues.amount) >= 0.01
      if (!periodChanged && !amountChanged) return charge

      const journalCandidates = await tx.journalEntry.findMany({
        where: {
          tenantId: tenantIdOf(req), status: 'posted', reversalJournalId: null,
          OR: [
            { sourceType: 'PROPERTY_RENT_CHARGE', sourceId: charge.id },
            { sourceType: 'PROPERTY_RENT_CHARGE_PERIOD_CORRECTION', sourceId: { startsWith: `${charge.id}-` } },
            { sourceType: 'PROPERTY_RENT_CHARGE_RATE_CORRECTION', sourceId: { startsWith: `${charge.id}-` } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { sourceType: true, sourceId: true },
      })
      for (const journal of journalCandidates) {
        await reversePropertyJournal(tx, {
          tenantId: tenantIdOf(req), sourceType: journal.sourceType, sourceId: journal.sourceId,
          userId: req.user.id, reason: `Rent period corrected from ${charge.period} to ${period}`,
        })
      }

      const updated = await tx.rentCharge.update({
        where: { id: charge.id },
        data: {
          period, dueDate, description: `Rent for ${period}`,
          amount: correctedValues.amount,
          status: correctedValues.status,
        },
      })
      const config = await ensurePropertyAccounting(tx, tenantIdOf(req))
      await postPropertyJournal(tx, {
        tenantId: tenantIdOf(req), userId: req.user.id,
        sourceType: 'PROPERTY_RENT_CHARGE_PERIOD_CORRECTION', sourceId: `${charge.id}-${randomUUID()}`,
        date: dueDate, reference: `RENT-${charge.tenancyId}-${period}`,
        description: `Corrected rent charge for ${charge.tenancy.tenantName}, ${charge.tenancy.unit.property.name} / ${charge.tenancy.unit.unitCode} · ${period}`,
        lines: propertyRentChargeLines(config, {
          amount: correctedValues.amount, managed: Boolean(charge.tenancy.unit.property.ownerId), description: `Rent ${period}`,
        }),
      })
      return updated
    }, { maxWait: 10000, timeout: 30000 })
    res.json(result)
  } catch (error) {
    const status = error.statusCode || (error.code === 'P2002' ? 409 : 500)
    if (status === 500) console.error('Rent period correction failed:', error)
    res.status(status).json({ error: status === 500 ? 'Could not correct rent period.' : error.message })
  }
})

router.get('/tenancies/:id/statement', requirePermission('canViewPropertyStatements'), async (req, res) => {
  try {
    const tenancy = await prisma.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) }, include: { unit: { include: { property: { select: { name: true, owner: { select: { name: true } } } } } }, charges: { orderBy: { dueDate: 'asc' }, include: { allocations: { include: { payment: true } } } }, payments: { where: { status: 'posted', paymentType: { in: ['rent', 'rent_plan', 'deposit_application'] } }, orderBy: { paymentDate: 'asc' }, include: { allocations: { include: { charge: true } } } } } })
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found.' })
    const entries = [
      ...tenancy.charges.map(charge => ({ id: charge.id, date: charge.dueDate, type: 'rent_due', reference: charge.period, description: charge.description, debit: charge.amount, credit: 0, paid: charge.amountPaid, balance: money(charge.amount - charge.amountPaid), status: charge.status })),
      ...tenancy.payments.map(payment => ({ id: payment.id, date: payment.paymentDate, type: payment.paymentType === 'rent_plan' ? 'payment_plan_receipt' : payment.paymentType === 'deposit_application' ? 'deposit_application' : 'payment', reference: payment.receiptNo, description: payment.paymentType === 'deposit_application' ? 'Security deposit applied to rent arrears' : `${payment.paymentType === 'rent_plan' ? 'Rent payment plan' : 'Rent'} payment (${payment.paymentMethod})`, debit: 0, credit: payment.amount, amount: payment.amount, status: payment.status })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    let balance = 0
    for (const entry of entries) { balance = money(balance + entry.debit - entry.credit); entry.runningBalance = balance }
    res.json({ tenancy: { id: tenancy.id, tenantName: tenancy.tenantName, currency: tenancy.currency, agreementRef: tenancy.agreementRef, unit: tenancy.unit }, entries, closingBalance: balance })
  } catch (error) { console.error('Property tenancy statement failed:', error); res.status(500).json({ error: 'Could not load statement.' }) }
})

router.get('/reports/tenancies', requirePermission('canViewPropertyStatements'), async (req, res) => {
  try {
    const rows = await prisma.propertyTenancy.findMany({
      where: { tenantId: tenantIdOf(req) },
      take: 500,
      orderBy: [{ status: 'asc' }, { tenantName: 'asc' }],
      select: { id: true, tenantName: true, status: true, unit: { select: { unitCode: true, property: { select: { name: true } } } } },
    })
    res.json(rows)
  } catch (error) { console.error('Property statement renter list failed:', error); res.status(500).json({ error: 'Could not load renter list.' }) }
})

router.post('/tenancies/:id/payments', requirePermission('canRecordRentPayment'), async (req, res) => {
  const amount = money(req.body?.amount)
  const rentMonths = req.body?.rentMonths == null || req.body?.rentMonths === '' ? null : Number(req.body.rentMonths)
  const arrearsMonths = req.body?.arrearsMonths == null || req.body?.arrearsMonths === '' ? 0 : Number(req.body.arrearsMonths)
  if (rentMonths !== null && (!Number.isInteger(rentMonths) || rentMonths < 1 || rentMonths > 36)) return badRequest(res, 'Choose between 1 and 36 months of rent.')
  if (!Number.isInteger(arrearsMonths) || arrearsMonths < 0 || arrearsMonths > 120) return badRequest(res, 'Choose between 0 and 120 missing prior rent months.')
  if (!Number.isFinite(amount) || amount <= 0) return badRequest(res, 'Enter a payment amount greater than zero.')
  const allowedMethods = new Set(['cash', 'safe', 'mobile_money', 'bank_transfer', 'bank', 'card', 'cheque'])
  const method = String(req.body?.paymentMethod || 'cash').toLowerCase()
  if (!allowedMethods.has(method)) return badRequest(res, 'Select a valid payment method.')
  const cashAccountId = String(req.body?.cashAccountId || '')
  if (!cashAccountId) return badRequest(res, 'Select a permitted transaction account for this payment.')
  const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date()
  if (!Number.isFinite(paymentDate.getTime())) return badRequest(res, 'Enter a valid payment date.')
  const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim()
  if (!idempotencyKey || idempotencyKey.length > 120) return badRequest(res, 'Payment request key is invalid.')
  try {
    const tenantId = tenantIdOf(req)
    const expectedType = paymentMethodToAccount[method]
    const permittedAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
    if (!permittedAccount || permittedAccount.type !== expectedType) return badRequest(res, 'The selected transaction account does not match the payment method or is inactive.')
    if (!canUseTransactionAccountForPayment(req, permittedAccount, method)) return res.status(403).json({ error: `You do not have permission to use ${permittedAccount.name} for ${method} rent payments.` })
    const payment = await prisma.$transaction(async tx => {
      const prior = await tx.propertyRentPayment.findFirst({ where: { tenantId, idempotencyKey }, include: { tenancy: { include: { unit: { include: { property: true } } } }, allocations: { include: { charge: true } } } })
      if (prior) return prior
      await tx.$queryRaw`SELECT "id" FROM "property_tenancies" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const tenancy = await tx.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId, status: { in: ['active', 'ended'] } }, include: { unit: { include: { property: { select: { name: true, ownerId: true } } } }, charges: { where: { status: { in: ['unpaid', 'partial', 'overdue'] }, planAllocations: { none: { plan: { status: 'active' } } } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] } } })
      if (!tenancy) throw Object.assign(new Error('Tenancy not found.'), { statusCode: 404 })
      const now = new Date()
      const currentPeriod = monthKey(now)
      const existingPeriods = new Set((await tx.rentCharge.findMany({ where: { tenantId, tenancyId: tenancy.id }, select: { period: true } })).map(charge => charge.period))
      const arrearsPeriods = []
      for (let offset = 1; offset <= 1200 && arrearsPeriods.length < arrearsMonths; offset++) {
        const periodDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
        const priorPeriod = monthKey(periodDate)
        const priorDueDate = dueDateFor(priorPeriod)
        if (new Date(tenancy.startDate) > priorDueDate) break
        if (tenancy.status === 'ended' && tenancy.endDate && new Date(tenancy.endDate) < priorDueDate) continue
        if (!existingPeriods.has(priorPeriod)) arrearsPeriods.push(priorPeriod)
      }
      if (arrearsPeriods.length < arrearsMonths) throw Object.assign(new Error('There are not enough missing rent months within this tenancy to add the selected arrears.'), { statusCode: 400 })
      for (const priorPeriod of arrearsPeriods.reverse()) await ensureRentChargeForPeriod(tx, { tenancy, period: priorPeriod, userId: req.user.id })
      if (tenancy.status === 'active') await ensureRentChargeForPeriod(tx, { tenancy, period: currentPeriod, userId: req.user.id })
      const charges = await tx.rentCharge.findMany({
        where: { tenantId, tenancyId: tenancy.id, status: { in: ['unpaid', 'partial', 'overdue'] }, planAllocations: { none: { plan: { status: 'active' } } } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      })
      const open = charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0)
      const currentOpen = charges.filter(charge => charge.period === currentPeriod).reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0)
      if (rentMonths === null && amount - open > 0.01) throw Object.assign(new Error(`Payment exceeds outstanding rent of ${tenancy.currency} ${money(open).toLocaleString()}. Choose a rent period in months to record rent paid ahead.`), { statusCode: 400 })
      const additionalMonths = rentMonths === null || tenancy.status !== 'active' ? 0 : Math.max(0, rentMonths - (currentOpen > 0.01 ? 1 : 0))
      const maximumPeriodAmount = money(open + Number(tenancy.rentAmount) * additionalMonths)
      if (rentMonths !== null && amount - maximumPeriodAmount > 0.01) throw Object.assign(new Error(`The amount exceeds recorded arrears/current rent plus the selected ${rentMonths} month(s) at the agreed rate.`), { statusCode: 400 })
      const appliedAtReceipt = money(Math.min(amount, open))
      const advanceAmount = money(amount - appliedAtReceipt)
      const receiptNo = `RENT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const account = await tx.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
      if (!account || account.type !== expectedType) throw Object.assign(new Error('Selected transaction account is no longer available; reload and retry.'), { statusCode: 409 })
      const record = await tx.propertyRentPayment.create({ data: { tenantId, tenancyId: tenancy.id, cashAccountId: account.id, receiptNo, idempotencyKey, amount, advanceAmount, rentMonths, arrearsMonths, paymentDate, paymentMethod: method, transactionRef: req.body.transactionRef?.trim() || null, notes: req.body.notes?.trim() || null, paymentType: 'rent' } })
      const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: account, amount, direction: 'receipt', reference: receiptNo, description: `Property rent received from ${tenancy.tenantName}` })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_RENT_PAYMENT', sourceId: record.id, date: paymentDate, reference: receiptNo, description: `Rent payment received from ${tenancy.tenantName}`, lines: propertyRentReceiptLines(config, { amount, cashAccountLedgerId: movement.ledgerAccount.id, reference: receiptNo, appliedAmount: appliedAtReceipt, advanceAmount }) })
      let remaining = amount
      for (const charge of charges) {
        if (remaining <= 0.001) break
        const due = money(Math.max(0, charge.amount - charge.amountPaid))
        const applied = money(Math.min(remaining, due))
        if (!applied) continue
        const nextPaid = money(charge.amountPaid + applied)
        await tx.rentPaymentAllocation.create({ data: { paymentId: record.id, chargeId: charge.id, amount: applied } })
        await tx.rentCharge.update({ where: { id: charge.id }, data: { amountPaid: nextPaid, status: nextPaid + 0.001 >= charge.amount ? 'paid' : 'partial' } })
        remaining = money(remaining - applied)
      }
      return tx.propertyRentPayment.findUnique({ where: { id: record.id }, include: { tenancy: { include: { unit: { include: { property: { include: { owner: true } } } } } }, cashAccount: { select: { id: true, name: true, type: true } }, allocations: { include: { charge: true } } } })
    })
    res.status(201).json(payment)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Record rent payment failed:', error); res.status(status).json({ error: status === 500 ? 'Could not record rent payment.' : error.message }) }
})

router.get('/payments', requirePermission('canViewPropertyCollections'), async (req, res) => {
  try {
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : null
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : null
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) return badRequest(res, 'Choose a valid collection date range.')
    const dateFilter = from || to ? { paymentDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}
    const ownerId = String(req.query.ownerId || '').trim()
    const payments = await prisma.propertyRentPayment.findMany({ where: { tenantId: tenantIdOf(req), ...dateFilter, ...(ownerId ? { tenancy: { unit: { property: { ownerId } } } } : {}) }, take: pageSize(req.query.limit), orderBy: { paymentDate: 'desc' }, include: { cashAccount: { select: { id: true, name: true, type: true } }, tenancy: { include: { unit: { include: { property: { include: { owner: true } } } } } }, allocations: { include: { charge: true } } } })
    res.json(payments.map(payment => ({ ...payment, tenancy: { ...payment.tenancy, charges: undefined } })))
  } catch (error) { console.error('List rent payments failed:', error); res.status(500).json({ error: 'Could not load payment history.' }) }
})

router.get('/payments/:id/receipt', requireAnyPermission(['canViewPropertyCollections', 'canRecordRentPayment', 'canRecordTenantDeposit', 'canRefundTenantDeposit', 'canApplyTenantDepositToRent', 'canRecordOwnerPayout', 'canManageRentPayment']), async (req, res) => {
  try {
    const payment = await prisma.propertyRentPayment.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) }, include: { cashAccount: { select: { name: true, type: true } }, tenancy: { include: { unit: { include: { property: { include: { owner: true } } } } } }, allocations: { include: { charge: true } } } })
    if (!payment) return res.status(404).json({ error: 'Payment receipt not found.' })
    res.json({ receipt: payment, business: await prisma.tenant.findUnique({ where: { id: tenantIdOf(req) }, select: { name: true, address: true, phone: true, logo: true } }) })
  } catch (error) { console.error('Rent receipt failed:', error); res.status(500).json({ error: 'Could not load receipt.' }) }
})

router.post('/payments/:id/void', requireAnyPermission(['canVoidRentPayment', 'canManageRentPayment']), async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 5) return badRequest(res, 'Enter a clear reason (at least 5 characters) for voiding this payment.')
  try {
    const tenantId = tenantIdOf(req)
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "property_rent_payments" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const payment = await tx.propertyRentPayment.findFirst({ where: { id: req.params.id, tenantId, status: 'posted' }, include: { cashAccount: true, allocations: { include: { charge: true } }, planInstallmentAllocations: { include: { installment: true } } } })
      if (!payment) throw Object.assign(new Error('Posted rent payment not found.'), { statusCode: 404 })
      const isDepositApplication = payment.paymentType === 'deposit_application'
      if (!payment.cashAccount && !isDepositApplication) throw Object.assign(new Error('This legacy receipt has no saved transaction account; reconcile its original cash/bank account before voiding.'), { statusCode: 409 })
      if (payment.cashAccount && !canUseTransactionAccountForPayment(req, payment.cashAccount, payment.paymentMethod)) throw Object.assign(new Error(`You do not have permission to reverse a movement from ${payment.cashAccount.name}.`), { statusCode: 403 })
      const claim = await tx.propertyRentPayment.updateMany({ where: { id: payment.id, tenantId, status: 'posted' }, data: { status: 'void', voidReason: reason, voidedAt: new Date() } })
      if (claim.count !== 1) throw Object.assign(new Error('This payment has already been voided.'), { statusCode: 409 })
      if (!payment.rentPaymentPlanId && payment.allocations.length) {
        const plannedCharge = await tx.rentPaymentPlanChargeAllocation.findFirst({ where: { chargeId: { in: payment.allocations.map(row => row.chargeId) }, plan: { status: 'active' } }, select: { id: true } })
        if (plannedCharge) throw Object.assign(new Error('This receipt affects an active rent payment plan. Cancel that plan before voiding the earlier receipt.'), { statusCode: 409 })
      }
      const reversalRef = `VOID-${payment.receiptNo}`
      const isDepositRefund = payment.paymentType === 'deposit_refund'
      if (!isDepositApplication) await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: payment.cashAccount, amount: payment.amount, direction: isDepositRefund ? 'receipt' : 'expense', reference: reversalRef, description: `Void property receipt ${payment.receiptNo}` })
      for (const allocation of payment.allocations) {
        if (Number(allocation.advanceAppliedAmount || 0) > 0) {
          await reversePropertyJournal(tx, { tenantId, sourceType: 'PROPERTY_RENT_ADVANCE_APPLICATION', sourceId: `${payment.id}-${allocation.chargeId}`, userId: req.user.id, reason })
        }
      }
      const journalSource = payment.rentPaymentPlanId ? 'PROPERTY_RENT_PLAN_PAYMENT' : isDepositApplication ? 'PROPERTY_DEPOSIT_RENT_APPLICATION' : payment.paymentType === 'deposit' ? 'PROPERTY_DEPOSIT_RECEIPT' : isDepositRefund ? 'PROPERTY_DEPOSIT_REFUND' : 'PROPERTY_RENT_PAYMENT'
      await reversePropertyJournal(tx, { tenantId, sourceType: journalSource, sourceId: payment.id, userId: req.user.id, reason })
      if (isDepositApplication) {
        await tx.propertyTenancy.update({ where: { id: payment.tenancyId }, data: { depositHeld: { increment: payment.amount } } })
        for (const allocation of payment.allocations) {
          const charge = allocation.charge
          const nextPaid = money(Math.max(0, Number(charge.amountPaid) - Number(allocation.amount)))
          const status = nextPaid >= Number(charge.amount) ? 'paid' : nextPaid > 0 ? 'partial' : new Date(charge.dueDate) < new Date() ? 'overdue' : 'unpaid'
          await tx.rentCharge.update({ where: { id: charge.id }, data: { amountPaid: nextPaid, status } })
        }
        return tx.propertyRentPayment.findUnique({ where: { id: payment.id }, include: { tenancy: { include: { unit: { include: { property: true } } } } } })
      }
      if (payment.paymentType === 'deposit' || isDepositRefund) {
        await tx.propertyTenancy.update({ where: { id: payment.tenancyId }, data: { depositHeld: { [isDepositRefund ? 'increment' : 'decrement']: payment.amount } } })
        return tx.propertyRentPayment.findUnique({ where: { id: payment.id }, include: { tenancy: { include: { unit: { include: { property: true } } } } } })
      }
      for (const allocation of payment.allocations) {
        const charge = allocation.charge
        const nextPaid = money(Math.max(0, Number(charge.amountPaid) - Number(allocation.amount)))
        const status = nextPaid >= Number(charge.amount) ? 'paid' : nextPaid > 0 ? 'partial' : new Date(charge.dueDate) < new Date() ? 'overdue' : 'unpaid'
        await tx.rentCharge.update({ where: { id: charge.id }, data: { amountPaid: nextPaid, status } })
      }
      if (payment.rentPaymentPlanId) {
        for (const allocation of payment.planInstallmentAllocations) {
          const installment = allocation.installment
          const nextPaid = money(Math.max(0, installment.amountPaid - allocation.amount))
          const status = nextPaid + 0.001 >= installment.amount ? 'paid' : nextPaid > 0 ? 'partial' : new Date(installment.dueDate) < new Date() ? 'overdue' : 'unpaid'
          await tx.rentPaymentPlanInstallment.update({ where: { id: installment.id }, data: { amountPaid: nextPaid, status } })
        }
        const plan = await tx.propertyRentPaymentPlan.findFirst({ where: { id: payment.rentPaymentPlanId, tenantId } })
        if (plan) {
          const nextPaid = money(Math.max(0, plan.amountPaid - payment.amount))
          if (plan.status === 'cancelled') {
            const config = await ensurePropertyAccounting(tx, tenantId)
            await postPropertyJournal(tx, {
              tenantId, userId: req.user.id, sourceType: 'PROPERTY_RENT_PLAN_CANCEL_VOID_RECLASS', sourceId: payment.id,
              date: new Date(), reference: reversalRef,
              description: `Return voided rent plan receipt ${payment.receiptNo} to ordinary rent receivable while preserving the cancelled plan`,
              lines: propertyRentPlanCancellationLines(config, { amount: payment.amount, reference: reversalRef }),
            })
            await tx.propertyRentPaymentPlan.update({ where: { id: plan.id }, data: { amountPaid: nextPaid } })
          } else {
            await tx.propertyRentPaymentPlan.update({ where: { id: plan.id }, data: { amountPaid: nextPaid, status: 'active' } })
          }
        }
      }
      return tx.propertyRentPayment.findUnique({ where: { id: payment.id }, include: { tenancy: { include: { unit: { include: { property: true } } } } } })
    })
    res.json(result)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Void rent payment failed:', error); res.status(status).json({ error: status === 500 ? 'Could not void rent payment.' : error.message }) }
})

router.get('/reports', requirePermission('canViewPropertyReports'), async (req, res) => {
  try {
    const tenantId = tenantIdOf(req)
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : new Date()
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return badRequest(res, 'Choose a valid report date range.')
    const ownerId = String(req.query.ownerId || '').trim()
    const propertyScope = ownerId ? { unit: { property: { ownerId } } } : {}
    const permissions = req.user?.permissions || []
    const canViewPlotSales = ['*', 'canViewPropertySales'].some(permission => permissions.includes(permission))
    const canViewPlotPurchases = ['*', 'canViewPropertyLandPurchases'].some(permission => permissions.includes(permission))
    const canViewOwnerPayables = ['*', 'canViewPayable'].some(permission => permissions.includes(permission))
    const [charges, payments, tenancies, payouts, units, plotSales, plotPurchases, paymentPlans, ownerRentTotals, lifetimePayoutTotals] = await Promise.all([
      prisma.rentCharge.findMany({ where: { tenantId, dueDate: { gte: from, lte: to }, tenancy: propertyScope }, include: { tenancy: { include: { unit: { include: { property: { include: { owner: true } } } } } }, allocations: true }, orderBy: { dueDate: 'asc' } }),
      prisma.propertyRentPayment.findMany({ where: { tenantId, status: 'posted', paymentType: { in: ['rent', 'rent_plan'] }, paymentDate: { gte: from, lte: to }, tenancy: propertyScope }, include: { tenancy: { include: { unit: { include: { property: { include: { owner: true } } } } } } }, orderBy: { paymentDate: 'asc' } }),
      prisma.propertyTenancy.findMany({ where: { tenantId, status: 'active', ...(ownerId ? { unit: { property: { ownerId } } } : {}) }, include: { unit: { include: { property: { include: { owner: true } } } }, charges: { where: { status: { in: ['unpaid', 'partial', 'overdue'] } } } } }),
      prisma.propertyOwnerPayout.findMany({ where: { tenantId, payoutType: 'rent', status: 'posted', payoutDate: { gte: from, lte: to }, ...(ownerId ? { ownerId } : {}) }, include: { owner: true, cashAccount: { select: { name: true } } }, orderBy: { payoutDate: 'asc' } }),
      prisma.propertyUnit.findMany({ where: { property: { tenantId, ...(ownerId ? { ownerId } : {}) } }, select: { status: true } }),
      canViewPlotSales ? prisma.propertySale.findMany({ where: { tenantId, saleDate: { gte: from, lte: to }, ...(ownerId ? { ownerId } : {}) }, include: { property: { select: { name: true } }, unit: { select: { unitCode: true, currency: true } }, buyer: { select: { name: true } }, owner: { select: { name: true } }, payments: { where: { status: 'posted' }, select: { amount: true } } }, orderBy: { saleDate: 'asc' } }) : Promise.resolve([]),
      canViewPlotPurchases ? prisma.propertyLandPurchase.findMany({ where: { tenantId, purchaseDate: { gte: from, lte: to }, ...(ownerId ? { property: { ownerId } } : {}) }, include: { property: { select: { name: true } }, unit: { select: { unitCode: true, currency: true } }, supplier: { select: { name: true } } }, orderBy: { purchaseDate: 'asc' } }) : Promise.resolve([]),
      prisma.propertyRentPaymentPlan.findMany({
        where: { tenantId, createdAt: { gte: from, lte: to }, ...(ownerId ? { tenancy: { unit: { property: { ownerId } } } } : {}) },
        include: {
          tenancy: {
            include: {
              unit: {
                include: {
                  property: { include: { owner: { select: { name: true } } } },
                },
              },
            },
          },
          installments: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      canViewOwnerPayables ? prisma.$queryRaw`SELECT property."ownerId" AS "ownerId", COALESCE(SUM(charge."amount"), 0)::double precision AS "rentAccrued"
        FROM "rent_charges" charge
        JOIN "property_tenancies" tenancy ON tenancy."id" = charge."tenancyId"
        JOIN "property_units" unit ON unit."id" = tenancy."unitId"
        JOIN "managed_properties" property ON property."id" = unit."propertyId"
        WHERE charge."tenantId" = ${tenantId} AND property."tenantId" = ${tenantId} AND property."ownerId" IS NOT NULL
          AND charge."status" IN ('unpaid', 'partial', 'overdue', 'paid')
        GROUP BY property."ownerId"` : Promise.resolve([]),
      canViewOwnerPayables ? prisma.propertyOwnerPayout.groupBy({ by: ['ownerId'], where: { tenantId, payoutType: 'rent', status: 'posted' }, _sum: { amount: true } }) : Promise.resolve([]),
    ])
    const arrears = tenancies.map(tenancy => {
      const due = tenancy.charges.filter(charge => charge.dueDate < new Date())
      const aging = calculateRentAging(tenancy.charges)
      const overdueBalance = aging.overdueTotal
      return { tenancyId: tenancy.id, tenantName: tenancy.tenantName, ownerName: tenancy.unit.property.owner?.name || 'Own portfolio', propertyName: tenancy.unit.property.name, unitCode: tenancy.unit.unitCode, currency: tenancy.currency, rentAmount: money(tenancy.rentAmount), balance: money(tenancy.charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0)), overdueBalance, overduePeriods: due.length, persistentArrears: due.length >= 3, ...aging }
    }).filter(row => row.balance > 0).sort((a, b) => b.overdueBalance - a.overdueBalance)
    const rentRoll = tenancies.map(tenancy => ({ tenancyId: tenancy.id, tenantName: tenancy.tenantName, propertyName: tenancy.unit.property.name, unitCode: tenancy.unit.unitCode, ownerName: tenancy.unit.property.owner?.name || 'Own portfolio', agreementRef: tenancy.agreementRef, startDate: tenancy.startDate, rentAmount: money(tenancy.rentAmount), currency: tenancy.currency, openBalance: money(tenancy.charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0)), overdueBalance: money(calculateRentAging(tenancy.charges).overdueTotal) }))
    const agingSummary = ['notDue', 'days1To30', 'days31To60', 'days61To90', 'over90Days'].map(key => ({ bucket: ({ notDue: 'Not yet due', days1To30: '1-30 days', days31To60: '31-60 days', days61To90: '61-90 days', over90Days: 'Over 90 days' })[key], amount: money(arrears.reduce((sum, row) => sum + Number(row[key] || 0), 0)) }))
    const occupancySummary = [
      { status: 'Occupied', units: units.filter(unit => unit.status === 'occupied').length },
      { status: 'Vacant', units: units.filter(unit => unit.status === 'vacant').length },
      { status: 'Other status', units: units.filter(unit => !['occupied', 'vacant'].includes(unit.status)).length },
    ]
    const outstanding = money(charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0))
    const collections = payments.map(payment => ({ date: payment.paymentDate, receiptNo: payment.receiptNo, tenantName: payment.tenancy.tenantName, property: payment.tenancy.unit.property.name, unit: payment.tenancy.unit.unitCode, owner: payment.tenancy.unit.property.owner?.name || 'Own portfolio', paymentMethod: payment.paymentMethod, amount: payment.amount }))
    const collectionsByDate = [...collections.reduce((groups, row) => {
      const day = new Date(row.date).toISOString().slice(0, 10)
      groups.set(day, money((groups.get(day) || 0) + Number(row.amount || 0)))
      return groups
    }, new Map())].map(([date, amount]) => ({ date, amount }))
    const ownerPayoutRows = payouts.map(payout => ({ date: payout.payoutDate, reference: payout.reference, owner: payout.owner.name, account: payout.cashAccount.name, amount: payout.amount }))
    const paidByOwner = new Map(lifetimePayoutTotals.map(row => [row.ownerId, Number(row._sum.amount || 0)]))
    const accruedByOwner = new Map(ownerRentTotals.map(row => [row.ownerId, Number(row.rentAccrued || 0)]))
    const ownerPayables = canViewOwnerPayables ? (await prisma.propertyOwner.findMany({ where: { tenantId }, select: { id: true, name: true, isActive: true } }))
      .map(owner => ({ owner: owner.name, rentAccrued: money(accruedByOwner.get(owner.id) || 0), paid: money(paidByOwner.get(owner.id) || 0), balance: money((accruedByOwner.get(owner.id) || 0) - (paidByOwner.get(owner.id) || 0)) }))
      .filter(row => row.rentAccrued !== 0 || row.paid !== 0) : []
    const plotSaleRows = canViewPlotSales ? plotSales.map(sale => {
      const amountPaid = money(sale.payments.reduce((sum, payment) => sum + payment.amount, 0))
      return { date: sale.saleDate, saleNo: sale.saleNo, buyer: sale.buyer.name, property: sale.property.name, unit: sale.unit.unitCode, currency: sale.unit.currency, mode: sale.saleMode, owner: sale.owner?.name || 'Business-owned', salePrice: money(sale.salePrice), amountPaid, balance: money(sale.salePrice - amountPaid), costBasis: money(sale.costBasis), commission: money(sale.commissionAmount), status: sale.status }
    }) : []
    const plotPurchaseRows = canViewPlotPurchases ? plotPurchases.map(purchase => ({ date: purchase.purchaseDate, purchaseNo: purchase.purchaseNo, supplier: purchase.supplier.name, property: purchase.property.name, unit: purchase.unit.unitCode, currency: purchase.unit.currency, purchasePrice: money(purchase.purchasePrice), capitalizedCosts: money(purchase.capitalizedCosts), recoverableTax: money(purchase.recoverableTax), total: money(purchase.total), amountPaid: money(purchase.amountPaid), balance: money(purchase.balance), paymentStatus: purchase.paymentStatus, dueDate: purchase.dueDate })) : []
    const paymentPlanRows = paymentPlans.map(plan => ({ createdAt: plan.createdAt, planNo: plan.planNo, tenantName: plan.tenancy.tenantName, property: plan.tenancy.unit.property.name, unit: plan.tenancy.unit.unitCode, owner: plan.tenancy.unit.property.owner?.name || 'Own portfolio', totalAmount: money(plan.totalAmount), amountPaid: money(plan.amountPaid), balance: money(plan.totalAmount - plan.amountPaid), installmentCount: plan.installmentCount, paidInstallments: plan.installments.filter(row => row.status === 'paid').length, overdueInstallments: plan.installments.filter(row => row.status !== 'paid' && row.dueDate < new Date()).length, nextDueDate: plan.installments.filter(row => row.status !== 'paid').sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]?.dueDate || null, status: plan.status }))
    res.json({
      period: { from, to },
      summary: {
        rentCharged: money(charges.reduce((sum, charge) => sum + charge.amount, 0)),
        collected: money(payments.reduce((sum, payment) => sum + payment.amount, 0)),
        ownerPayouts: money(payouts.reduce((sum, payout) => sum + payout.amount, 0)),
        ownerPayableBalance: money(ownerPayables.reduce((sum, row) => sum + row.balance, 0)),
        periodOutstanding: outstanding,
        arrears: money(arrears.reduce((sum, row) => sum + row.overdueBalance, 0)),
        persistentArrearsCount: arrears.filter(row => row.persistentArrears).length,
        activeTenancies: tenancies.length,
        occupiedUnits: occupancySummary.find(row => row.status === 'Occupied').units,
        vacantUnits: occupancySummary.find(row => row.status === 'Vacant').units,
        days1To30: agingSummary.find(row => row.bucket === '1-30 days').amount,
        days31To60: agingSummary.find(row => row.bucket === '31-60 days').amount,
        days61To90: agingSummary.find(row => row.bucket === '61-90 days').amount,
        over90Days: agingSummary.find(row => row.bucket === 'Over 90 days').amount,
        plotSaleValue: money(plotSaleRows.reduce((sum, row) => sum + row.salePrice, 0)),
        plotSalesCollected: money(plotSaleRows.reduce((sum, row) => sum + row.amountPaid, 0)),
        plotSaleBalance: money(plotSaleRows.reduce((sum, row) => sum + row.balance, 0)),
        plotPurchaseValue: money(plotPurchaseRows.reduce((sum, row) => sum + row.total, 0)),
        plotPurchaseBalance: money(plotPurchaseRows.reduce((sum, row) => sum + row.balance, 0)),
        paymentPlanValue: money(paymentPlanRows.reduce((sum, row) => sum + row.totalAmount, 0)),
        paymentPlanCollected: money(paymentPlanRows.reduce((sum, row) => sum + row.amountPaid, 0)),
        paymentPlanBalance: money(paymentPlanRows.reduce((sum, row) => sum + row.balance, 0)),
      },
      rentRoll, arrears, agingSummary, occupancySummary, collections, collectionsByDate,
      ownerPayouts: ownerPayoutRows, ownerPayables, plotSales: plotSaleRows, plotPurchases: plotPurchaseRows, paymentPlans: paymentPlanRows,
    })
  } catch (error) { console.error('Property reports failed:', error); res.status(500).json({ error: 'Could not generate property reports.' }) }
})

export async function runPropertyRentAutomation(now = new Date()) {
  const period = monthKey(now)
  const active = await prisma.propertyTenancy.findMany({ where: { status: 'active', tenant: { status: 'active' } }, select: { id: true, tenantId: true, tenantName: true, rentAmount: true, currency: true, startDate: true, endDate: true, unit: { select: { unitCode: true, property: { select: { name: true, ownerId: true } } } } } })
  const enabledTenants = new Set()
  for (const tenantId of new Set(active.map(row => row.tenantId))) {
    const features = await getTenantFeatures(tenantId)
    if (PROPERTY_MANAGEMENT_FEATURES.some(feature => hasFeatureAccess(features, feature))) enabledTenants.add(tenantId)
  }
  await prisma.rentCharge.updateMany({ where: { dueDate: { lt: now }, status: { in: ['unpaid', 'partial'] }, tenantId: { in: [...enabledTenants] } }, data: { status: 'overdue' } })
  for (const tenancy of active.filter(row => enabledTenants.has(row.tenantId))) {
    const dueDate = dueDateFor(period)
      if (tenancyOccupiesRentPeriod(tenancy, period)) {
      await prisma.$transaction(async tx => {
        const user = await tx.user.findFirst({ where: { tenantId: tenancy.tenantId, isActive: true }, select: { id: true } })
        if (!user) throw new Error(`Cannot post property rent charge for tenant ${tenancy.tenantId}: no active user is available for the system journal.`)
        await ensureRentChargeForPeriod(tx, { tenancy, period, userId: user.id })
      })
    }
  }
  const candidates = enabledTenants.size
    ? await prisma.rentCharge.findMany({ where: { tenantId: { in: [...enabledTenants] }, status: { in: ['unpaid', 'partial', 'overdue'] }, dueDate: { lte: new Date(now.getTime() + 3 * 86400000) }, tenancy: { status: 'active' } }, include: { tenancy: { include: { unit: { include: { property: true } } } } } })
    : []
  for (const charge of candidates) {
    const remaining = money(Math.max(0, charge.amount - charge.amountPaid))
    if (!remaining) continue
    const daysUntilDue = Math.ceil((new Date(charge.dueDate).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000)
    const reminderType = daysUntilDue > 0 ? 'upcoming' : daysUntilDue === 0 ? 'due' : 'overdue'
    if (reminderType === 'overdue' && Math.abs(daysUntilDue) % 7 !== 0) continue
    const scheduledFor = new Date(now); scheduledFor.setUTCHours(0, 0, 0, 0)
    const inserted = await prisma.propertyRentReminder.createMany({ data: [{ tenantId: charge.tenantId, tenancyId: charge.tenancyId, period: charge.period, reminderType, scheduledFor, sentAt: now, status: 'sent' }], skipDuplicates: true })
    if (!inserted.count) continue
    const label = `${charge.tenancy.unit.property.name} · ${charge.tenancy.unit.unitCode}`
    await prisma.notification.create({ data: { tenantId: charge.tenantId, title: reminderType === 'upcoming' ? 'Rent due soon' : reminderType === 'due' ? 'Rent due today' : 'Rent payment overdue', message: `${charge.tenancy.tenantName}: ${charge.tenancy.currency} ${remaining.toLocaleString()} for ${charge.period} at ${label}.`, type: reminderType === 'overdue' ? 'warning' : 'info', metadata: { link: '/tenant/property-management?tab=tenancies', tenancyId: charge.tenancyId, period: charge.period } } })
  }
}

router.post('/tenancies/:id/deposits', requireAnyPermission(['canRecordTenantDeposit']), async (req, res) => {
  const amount = money(req.body?.amount)
  const method = String(req.body?.paymentMethod || 'cash').toLowerCase()
  const cashAccountId = String(req.body?.cashAccountId || '')
  if (!(amount > 0) || !cashAccountId || !Object.hasOwn(paymentMethodToAccount, method)) return badRequest(res, 'Enter a positive deposit and select a permitted payment account.')
  const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date()
  if (!Number.isFinite(paymentDate.getTime())) return badRequest(res, 'Enter a valid payment date.')
  const idempotencyKey = String(req.body.idempotencyKey || randomUUID()).trim()
  try {
    const tenantId = tenantIdOf(req)
    const account = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
    if (!account || account.type !== paymentMethodToAccount[method]) return badRequest(res, 'The selected account does not match this payment method.')
    if (!canUseTransactionAccountForPayment(req, account, method)) return res.status(403).json({ error: `You do not have permission to use ${account.name}.` })
    const payment = await prisma.$transaction(async tx => {
      const prior = await tx.propertyRentPayment.findFirst({ where: { tenantId, tenancyId: req.params.id, idempotencyKey } })
      if (prior) return prior
      await tx.$queryRaw`SELECT "id" FROM "property_tenancies" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const tenancy = await tx.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId, status: { in: ['active', 'ended'] } }, include: { unit: { include: { property: true } } } })
      if (!tenancy) throw Object.assign(new Error('Tenancy not found.'), { statusCode: 404 })
      const remaining = money(tenancy.depositRequired - tenancy.depositHeld)
      if (amount - remaining > 0.01) throw Object.assign(new Error(`Payment exceeds remaining security deposit of ${tenancy.currency} ${remaining.toLocaleString()}.`), { statusCode: 400 })
      const ref = `DEP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const record = await tx.propertyRentPayment.create({ data: { tenantId, tenancyId: tenancy.id, cashAccountId: account.id, receiptNo: ref, idempotencyKey, amount, paymentDate, paymentMethod: method, transactionRef: req.body.transactionRef?.trim() || null, notes: req.body.notes?.trim() || null, paymentType: 'deposit' } })
      const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: account, amount, direction: 'receipt', reference: ref, description: `Tenant security deposit received from ${tenancy.tenantName}` })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_DEPOSIT_RECEIPT', sourceId: record.id, date: paymentDate, reference: ref, description: `Tenant security deposit received from ${tenancy.tenantName}`, lines: propertyDepositReceiptLines(config, { amount, cashAccountLedgerId: movement.ledgerAccount.id, reference: ref }) })
      await tx.propertyTenancy.update({ where: { id: tenancy.id }, data: { depositHeld: { increment: amount } } })
      return record
    })
    res.status(201).json(payment)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Record security deposit failed:', error); res.status(status).json({ error: status === 500 ? 'Could not record security deposit.' : error.message }) }
})

router.post('/tenancies/:id/deposits/apply-to-rent', requirePermission('canApplyTenantDepositToRent'), async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim()
  if (reason.length < 5) return badRequest(res, 'Enter a clear reason (at least 5 characters) for applying the deposit.')
  try {
    const tenantId = tenantIdOf(req)
    const result = await prisma.$transaction(async tx => {
      const prior = await tx.propertyRentPayment.findFirst({ where: { tenantId, tenancyId: req.params.id, idempotencyKey } })
      if (prior) return prior
      await tx.$queryRaw`SELECT "id" FROM "property_tenancies" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const tenancy = await tx.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId, status: { in: ['active', 'ended'] } }, include: { unit: { include: { property: true } } } })
      if (!tenancy) throw Object.assign(new Error('Tenancy not found.'), { statusCode: 404 })
      const depositHeld = money(tenancy.depositHeld)
      if (depositHeld <= 0) throw Object.assign(new Error('There is no held security deposit available to apply.'), { statusCode: 409 })
      const currentPeriod = monthKey(new Date())
      const arrears = await tx.rentCharge.findMany({
        where: { tenantId, tenancyId: tenancy.id, period: { lt: currentPeriod }, status: { in: ['unpaid', 'partial', 'overdue'] }, planAllocations: { none: { plan: { status: 'active' } } } },
        orderBy: [{ period: 'asc' }, { dueDate: 'asc' }],
      })
      const eligibleCharges = arrears.map(charge => ({ ...charge, outstanding: money(Math.max(0, Number(charge.amount) - Number(charge.amountPaid))) })).filter(charge => charge.outstanding > 0.01)
      if (eligibleCharges.length < 2) throw Object.assign(new Error('A security deposit can be applied only after at least two distinct prior rent months remain unpaid.'), { statusCode: 409 })
      const arrearsTotal = money(eligibleCharges.reduce((sum, charge) => sum + charge.outstanding, 0))
      const amount = money(Math.min(depositHeld, arrearsTotal))
      if (amount <= 0) throw Object.assign(new Error('No eligible rent arrears are available to settle.'), { statusCode: 409 })
      const receiptNo = `DAPP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const paymentDate = new Date()
      const record = await tx.propertyRentPayment.create({ data: { tenantId, tenancyId: tenancy.id, receiptNo, idempotencyKey, amount, paymentDate, paymentMethod: 'security_deposit', notes: reason, paymentType: 'deposit_application', arrearsMonths: eligibleCharges.length } })
      let remaining = amount
      for (const charge of eligibleCharges) {
        if (remaining <= 0.001) break
        const applied = money(Math.min(remaining, charge.outstanding))
        if (!applied) continue
        await tx.rentPaymentAllocation.create({ data: { paymentId: record.id, chargeId: charge.id, amount: applied } })
        const nextPaid = money(Number(charge.amountPaid) + applied)
        const status = nextPaid + 0.001 >= Number(charge.amount) ? 'paid' : 'partial'
        await tx.rentCharge.update({ where: { id: charge.id }, data: { amountPaid: nextPaid, status } })
        remaining = money(remaining - applied)
      }
      const heldUpdate = await tx.propertyTenancy.updateMany({ where: { id: tenancy.id, tenantId, depositHeld: { gte: amount } }, data: { depositHeld: { decrement: amount } } })
      if (heldUpdate.count !== 1) throw Object.assign(new Error('The held deposit changed during settlement. Refresh and try again.'), { statusCode: 409 })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_DEPOSIT_RENT_APPLICATION', sourceId: record.id, date: paymentDate, reference: receiptNo, description: `Apply tenant deposit to rent arrears for ${tenancy.tenantName}`, lines: propertyDepositRentApplicationLines(config, { amount, reference: receiptNo }) })
      return tx.propertyRentPayment.findUnique({ where: { id: record.id }, include: { allocations: { include: { charge: true } }, tenancy: { include: { unit: { include: { property: true } } } } } })
    })
    res.status(201).json(result)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Apply tenant deposit to rent failed:', error); res.status(status).json({ error: status === 500 ? 'Could not apply tenant deposit to rent.' : error.message }) }
})

router.post('/tenancies/:id/deposits/refund', requireAnyPermission(['canRefundTenantDeposit', 'canManageRentPayment']), async (req, res) => {
  const amount = money(req.body?.amount), reason = String(req.body?.reason || '').trim(), cashAccountId = String(req.body?.cashAccountId || ''), method = String(req.body?.paymentMethod || 'cash').toLowerCase(), idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim()
  if (!(amount > 0) || reason.length < 5 || !cashAccountId || !Object.hasOwn(paymentMethodToAccount, method)) return badRequest(res, 'Enter a positive refund, reason, and permitted payment account.')
  try {
    const tenantId = tenantIdOf(req), account = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
    if (!account || account.type !== paymentMethodToAccount[method]) return badRequest(res, 'The selected account does not match this payment method.')
    if (!canUseTransactionAccountForPayment(req, account, method)) return res.status(403).json({ error: `You do not have permission to use ${account.name}.` })
    const result = await prisma.$transaction(async tx => {
      const prior = await tx.propertyRentPayment.findFirst({ where: { tenantId, idempotencyKey } })
      if (prior) return prior
      await tx.$queryRaw`SELECT "id" FROM "property_tenancies" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const tenancy = await tx.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId } })
      if (!tenancy || amount - Number(tenancy.depositHeld) > 0.01) throw Object.assign(new Error('Refund exceeds the tenant deposit held.'), { statusCode: 409 })
      const ref = `DREF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const record = await tx.propertyRentPayment.create({ data: { tenantId, tenancyId: tenancy.id, cashAccountId: account.id, receiptNo: ref, idempotencyKey, amount, paymentDate: new Date(), paymentMethod: method, notes: reason, paymentType: 'deposit_refund' } })
      const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: account, amount, direction: 'expense', reference: ref, description: `Tenant deposit refund to ${tenancy.tenantName}: ${reason}` })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_DEPOSIT_REFUND', sourceId: record.id, date: record.paymentDate, reference: ref, description: `Tenant deposit refund to ${tenancy.tenantName}`, lines: propertyDepositRefundLines(config, { amount, cashAccountLedgerId: movement.ledgerAccount.id, reference: ref }) })
      await tx.propertyTenancy.update({ where: { id: tenancy.id }, data: { depositHeld: { decrement: amount } } })
      return record
    })
    res.status(201).json(result)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Refund security deposit failed:', error); res.status(status).json({ error: status === 500 ? 'Could not refund security deposit.' : error.message }) }
})

router.post('/owners/:id/payouts', requirePermission('canRecordOwnerPayout'), async (req, res) => {
  const amount = money(req.body?.amount), method = String(req.body?.paymentMethod || 'cash').toLowerCase(), cashAccountId = String(req.body?.cashAccountId || '')
  if (!(amount > 0) || !cashAccountId || !Object.hasOwn(paymentMethodToAccount, method)) return badRequest(res, 'Enter a positive payout and select a permitted payment account.')
  const payoutDate = req.body.payoutDate ? new Date(req.body.payoutDate) : new Date(), idempotencyKey = String(req.body.idempotencyKey || randomUUID()).trim()
  if (!Number.isFinite(payoutDate.getTime())) return badRequest(res, 'Enter a valid payout date.')
  try {
    const tenantId = tenantIdOf(req), account = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
    if (!account || account.type !== paymentMethodToAccount[method]) return badRequest(res, 'The selected account does not match this payment method.')
    if (!canUseTransactionAccountForPayment(req, account, method)) return res.status(403).json({ error: `You do not have permission to use ${account.name}.` })
    const payout = await prisma.$transaction(async tx => {
      const prior = await tx.propertyOwnerPayout.findFirst({ where: { tenantId, idempotencyKey } })
      if (prior) return prior
      await tx.$queryRaw`SELECT "id" FROM "property_owners" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const owner = await tx.propertyOwner.findFirst({ where: { id: req.params.id, tenantId } })
      if (!owner) throw Object.assign(new Error('Property owner not found.'), { statusCode: 404 })
      const [received, accrued, paid, config] = await Promise.all([
        tx.propertyRentPayment.aggregate({ where: { tenantId, status: 'posted', paymentType: 'rent', tenancy: { unit: { property: { ownerId: owner.id } } } }, _sum: { amount: true } }),
        tx.rentCharge.aggregate({ where: { tenantId, tenancy: { unit: { property: { ownerId: owner.id } } } }, _sum: { amount: true } }),
        tx.propertyOwnerPayout.aggregate({ where: { tenantId, ownerId: owner.id, payoutType: 'rent', status: 'posted' }, _sum: { amount: true } }),
        ensurePropertyAccounting(tx, tenantId),
      ])
      const collected = Number(received._sum.amount || 0)
      const accruedRent = Number(accrued._sum.amount || 0)
      const available = money(Math.max(0, Math.min(collected, accruedRent) - Number(paid._sum.amount || 0)))
      if (amount - available > 0.01) throw Object.assign(new Error(`Payout exceeds collected, unpaid owner funds of ${available.toLocaleString()}.`), { statusCode: 409 })
      const ref = `OWN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const record = await tx.propertyOwnerPayout.create({ data: { tenantId, ownerId: owner.id, cashAccountId: account.id, amount, payoutDate, reference: req.body.reference?.trim() || ref, notes: req.body.notes?.trim() || null, idempotencyKey, createdById: req.user.id } })
      const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: account, amount, direction: 'expense', reference: ref, description: `Rent remittance to property owner ${owner.name}` })
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_OWNER_PAYOUT', sourceId: record.id, date: payoutDate, reference: ref, description: `Rent remittance to property owner ${owner.name}`, lines: propertyOwnerPayoutLines(config, { amount, cashAccountLedgerId: movement.ledgerAccount.id, reference: ref }) })
      return record
    })
    res.status(201).json(payout)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Record owner payout failed:', error); res.status(status).json({ error: status === 500 ? 'Could not record owner payout.' : error.message }) }
})

router.post('/owners/:id/sale-payouts', requirePermission('canRecordOwnerPayout'), async (req, res) => {
  const amount = money(req.body?.amount), method = String(req.body?.paymentMethod || 'cash').toLowerCase(), cashAccountId = String(req.body?.cashAccountId || '')
  if (!(amount > 0) || !cashAccountId || !Object.hasOwn(paymentMethodToAccount, method)) return badRequest(res, 'Enter a positive payout and select a permitted payment account.')
  const payoutDate = req.body?.payoutDate ? new Date(req.body.payoutDate) : new Date(), idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim()
  if (!Number.isFinite(payoutDate.getTime())) return badRequest(res, 'Enter a valid payout date.')
  try {
    const tenantId = tenantIdOf(req), account = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
    if (!account || account.type !== paymentMethodToAccount[method]) return badRequest(res, 'The selected account does not match this payment method.')
    if (!canUseTransactionAccountForPayment(req, account, method)) return res.status(403).json({ error: `You do not have permission to use ${account.name}.` })
    const payout = await prisma.$transaction(async tx => {
      const prior = await tx.propertyOwnerPayout.findFirst({ where: { tenantId, idempotencyKey } })
      if (prior) return prior
      const owner = await tx.propertyOwner.findFirst({ where: { id: req.params.id, tenantId, isActive: true }, include: { propertySales: { where: { status: 'active', saleMode: 'brokered' }, select: { salePrice: true, commissionAmount: true } } } })
      if (!owner) throw Object.assign(new Error('Active property owner not found.'), { statusCode: 404 })
      const paid = await tx.propertyOwnerPayout.aggregate({ where: { tenantId, ownerId: owner.id, payoutType: 'plot_sale', status: 'posted' }, _sum: { amount: true } })
      const earned = owner.propertySales.reduce((sum, sale) => sum + Number(sale.salePrice) - Number(sale.commissionAmount), 0)
      const available = money(earned - Number(paid._sum.amount || 0))
      if (amount - available > 0.01) throw Object.assign(new Error(`Payout exceeds unpaid plot sale proceeds of ${available.toLocaleString()}.`), { statusCode: 409 })
      const reference = `LAND-OWN-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
      const record = await tx.propertyOwnerPayout.create({ data: { tenantId, ownerId: owner.id, cashAccountId: account.id, amount, payoutDate, payoutType: 'plot_sale', reference, notes: req.body?.notes?.trim() || null, idempotencyKey, createdById: req.user.id } })
      const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: account, amount, direction: 'expense', reference, description: `Landlord plot sale proceeds paid to ${owner.name}` })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_PLOT_OWNER_PAYOUT', sourceId: record.id, date: payoutDate, reference, description: `Landlord plot sale proceeds paid to ${owner.name}`, lines: propertySaleOwnerPayoutLines(config, { amount, cashAccountLedgerId: movement.ledgerAccount.id, reference }) })
      return record
    })
    res.status(201).json(payout)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Record plot sale owner payout failed:', error); res.status(status).json({ error: status === 500 ? 'Could not record plot sale payout.' : error.message }) }
})

const propertySaleInclude = {
  property: { include: { owner: true } },
  unit: true,
  buyer: { select: { id: true, name: true, phone: true, email: true, balance: true } },
  owner: true,
  installments: { orderBy: { sequence: 'asc' } },
  payments: { where: { status: 'posted' }, orderBy: { paymentDate: 'desc' }, include: { cashAccount: { select: { id: true, name: true, type: true } }, allocations: true } },
}

const propertyLandPurchaseInclude = {
  property: { select: { id: true, name: true, address: true } },
  unit: { select: { id: true, unitCode: true, unitType: true, areaSize: true, areaUnit: true, frontage: true, depth: true, dimensionUnit: true, plotNumber: true, blockNumber: true, titleReference: true, landTenure: true, currency: true, acquisitionCost: true, status: true } },
  supplier: { select: { id: true, name: true, phone: true, email: true } },
  createdBy: { select: { id: true, fname: true, lname: true } },
  payments: { where: { status: 'posted' }, orderBy: { paymentDate: 'desc' }, include: { cashAccount: { select: { id: true, name: true, type: true } }, createdBy: { select: { id: true, fname: true, lname: true } } } },
}

router.get('/land-purchase-options', requirePermission('canCreatePropertyLandPurchase'), async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({ where: { tenantId: tenantIdOf(req), status: { in: ['active', 'inactive'] } }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, email: true, status: true } })
    res.json({ suppliers })
  } catch (error) { console.error('Load plot purchase suppliers failed:', error); res.status(500).json({ error: 'Could not load active suppliers.' }) }
})

router.get('/land-purchases', requirePermission('canViewPropertyLandPurchases'), async (req, res) => {
  try {
    const rows = await prisma.propertyLandPurchase.findMany({ where: { tenantId: tenantIdOf(req) }, take: pageSize(req.query.limit), orderBy: { purchaseDate: 'desc' }, include: propertyLandPurchaseInclude })
    res.json(rows)
  } catch (error) {
    console.error('List plot purchases failed:', { code: error?.code, message: error?.message, meta: error?.meta })
    const schemaNotReady = ['P2021', 'P2022', '42P01', '42703'].includes(error?.code)
    if (schemaNotReady) return res.status(503).json({ error: 'Plot-purchase schema is not ready on this server. Redeploy the backend and let its Prisma schema sync finish successfully, then retry.' })
    res.status(500).json({ error: 'Could not load plot purchases.' })
  }
})

router.post('/land-purchases', requirePermission('canCreatePropertyLandPurchase'), async (req, res) => {
  const purchasePrice = money(req.body?.purchasePrice)
  const capitalizedCosts = money(req.body?.capitalizedCosts)
  const recoverableTax = money(req.body?.recoverableTax)
  const costBasis = money(purchasePrice + capitalizedCosts)
  const total = money(costBasis + recoverableTax)
  const amountPaid = money(req.body?.amountPaid)
  const purchaseDate = req.body?.purchaseDate ? new Date(req.body.purchaseDate) : new Date()
  const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null
  const supplierRef = String(req.body?.supplierRef || '').trim() || null
  const sellerName = String(req.body?.sellerName || '').trim()
  const sellerPhone = String(req.body?.sellerPhone || '').trim() || null
  const sellerEmail = String(req.body?.sellerEmail || '').trim().toLowerCase() || null
  const sellerAddress = String(req.body?.sellerAddress || '').trim() || null
  const notes = String(req.body?.notes || '').trim() || null
  const idempotencyKey = String(req.body?.idempotencyKey || '').trim() || randomUUID()
  const paidBalance = money(total - amountPaid)
  if (!(purchasePrice > 0) || capitalizedCosts < 0 || recoverableTax < 0 || ![purchasePrice, capitalizedCosts, recoverableTax, total].every(Number.isFinite) || amountPaid < 0 || amountPaid > total) return badRequest(res, 'Enter a valid land price, costs, recoverable tax, and an initial payment no greater than the total.')
  if (!Number.isFinite(purchaseDate.getTime()) || (dueDate && !Number.isFinite(dueDate.getTime()))) return badRequest(res, 'Enter valid purchase and due dates.')
  if (paidBalance > 0 && !dueDate) return badRequest(res, 'Set a due date for the supplier balance.')
  if (supplierRef && supplierRef.length > 120) return badRequest(res, 'Supplier invoice/reference must be 120 characters or fewer.')
  if (notes && notes.length > 2000) return badRequest(res, 'Purchase notes must be 2,000 characters or fewer.')
  if (!req.body?.supplierId && (!sellerName || sellerName.length > 160 || (sellerPhone && sellerPhone.length > 40) || (sellerEmail && sellerEmail.length > 160) || (sellerAddress && sellerAddress.length > 500))) return badRequest(res, 'Enter the plot seller name and valid contact details, or select an existing supplier.')
  if (amountPaid > 0 && !req.user?.permissions?.includes('*') && !req.user?.permissions?.includes('canRecordPropertyLandPurchasePayment')) return res.status(403).json({ error: 'You need Pay Plot Suppliers permission to make an initial payment.' })
  const paymentMethod = String(req.body?.paymentMethod || '').toLowerCase()
  const cashAccountId = String(req.body?.cashAccountId || '')
  if (amountPaid > 0 && (!Object.hasOwn(paymentMethodToAccount, paymentMethod) || !cashAccountId)) return badRequest(res, 'Choose an allowed payment method and transaction account for the amount paid.')
  if (amountPaid > 0 && !canUseTransactionAccountForPayment(req, { id: cashAccountId }, paymentMethod)) return res.status(403).json({ error: `You do not have permission to use ${paymentMethod} for this plot purchase.` })
  try {
    const tenantId = tenantIdOf(req)
    const unitId = String(req.body?.unitId || '')
    const supplierId = String(req.body?.supplierId || '')
    const purchase = await prisma.$transaction(async tx => {
      const duplicate = await tx.propertyLandPurchase.findFirst({ where: { tenantId, idempotencyKey }, include: propertyLandPurchaseInclude })
      if (duplicate) return duplicate
      await tx.$queryRaw`SELECT "id" FROM "property_units" WHERE "id" = ${unitId} FOR UPDATE`
      const unit = await tx.propertyUnit.findFirst({ where: { id: unitId, property: { tenantId, propertyType: 'land', ownerId: null, status: 'active' } }, include: { property: true } })
      if (!unit) throw Object.assign(new Error('Select an available, business-owned land plot.'), { statusCode: 404 })
      if (!['vacant', 'available'].includes(String(unit.status).toLowerCase())) throw Object.assign(new Error('Only an unsold, available plot can be acquired.'), { statusCode: 409 })
      if (Number(unit.acquisitionCost) > 0 || await tx.propertyLandPurchase.findUnique({ where: { unitId: unit.id } })) throw Object.assign(new Error('This plot already has an acquisition cost or purchase record.'), { statusCode: 409 })
      if (await tx.propertySale.count({ where: { unitId: unit.id, status: 'active' } })) throw Object.assign(new Error('A plot with an active sale contract cannot be purchased again.'), { statusCode: 409 })

      let supplier = supplierId ? await tx.supplier.findFirst({ where: { id: supplierId, tenantId } }) : null
      if (supplierId && !supplier) throw Object.assign(new Error('The selected supplier does not belong to this business.'), { statusCode: 404 })
      if (!supplier && !supplierId) {
        if (sellerPhone) supplier = await tx.supplier.findFirst({ where: { tenantId, phone: sellerPhone }, orderBy: { createdAt: 'asc' } })
        if (!supplier && sellerEmail) supplier = await tx.supplier.findFirst({ where: { tenantId, email: { equals: sellerEmail, mode: 'insensitive' } }, orderBy: { createdAt: 'asc' } })
        if (!supplier && !sellerPhone && !sellerEmail) supplier = await tx.supplier.findFirst({ where: { tenantId, name: { equals: sellerName, mode: 'insensitive' } }, orderBy: { createdAt: 'asc' } })
        if (supplier?.status === 'blocked') throw Object.assign(new Error('This seller is blocked as a supplier. Ask an administrator to review the supplier record before recording this purchase.'), { statusCode: 409 })
        if (supplier?.status === 'inactive') supplier = await tx.supplier.update({ where: { id: supplier.id }, data: { status: 'active', ...(sellerPhone && !supplier.phone ? { phone: sellerPhone } : {}), ...(sellerEmail && !supplier.email ? { email: sellerEmail } : {}), ...(sellerAddress && !supplier.address ? { address: sellerAddress } : {}) } })
        if (!supplier) {
          try {
            supplier = await tx.supplier.create({ data: { tenantId, branchId: req.user?.branchId || null, name: sellerName, phone: sellerPhone, email: sellerEmail, address: sellerAddress, balance: 0, openingBalance: 0, status: 'active', notes: 'Created from a plot purchase.' } })
          } catch (error) {
            if (error.code !== 'P2002') throw error
            supplier = sellerPhone ? await tx.supplier.findFirst({ where: { tenantId, phone: sellerPhone } }) : sellerEmail ? await tx.supplier.findFirst({ where: { tenantId, email: { equals: sellerEmail, mode: 'insensitive' } } }) : null
            if (!supplier || supplier.status === 'blocked') throw Object.assign(new Error('A supplier with these details already exists and could not be activated. Review the supplier record.'), { statusCode: 409 })
            if (supplier.status === 'inactive') supplier = await tx.supplier.update({ where: { id: supplier.id }, data: { status: 'active' } })
          }
        }
      }
      if (!supplier) throw Object.assign(new Error('Select an existing supplier or enter the plot seller details.'), { statusCode: 400 })
      if (supplier.status === 'blocked') throw Object.assign(new Error('This supplier is blocked and cannot be used for a plot purchase.'), { statusCode: 409 })
      if (supplier.status === 'inactive') supplier = await tx.supplier.update({ where: { id: supplier.id }, data: { status: 'active' } })

      let cashAccount = null
      let cashLedgerId = null
      if (amountPaid > 0) {
        cashAccount = await tx.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
        if (!cashAccount || cashAccount.type !== paymentMethodToAccount[paymentMethod]) throw Object.assign(new Error('The selected transaction account does not match the payment method or is inactive.'), { statusCode: 400 })
        if (!canUseTransactionAccountForPayment(req, cashAccount, paymentMethod)) throw Object.assign(new Error(`You do not have permission to use ${cashAccount.name}.`), { statusCode: 403 })
      }

      let payableAccountId = null
      let inputTaxAccountId = null
      if (paidBalance > 0 || recoverableTax > 0) {
        const payableConfig = await getPayablesAccountingConfig(tx, tenantId)
        const validation = await validatePayablesAccountingConfig(tx, tenantId, payableConfig, { requireEnabled: true })
        if (!validation.valid) throw Object.assign(new Error(`Enable valid Payables accounting mappings before recording a plot purchase with a supplier balance or recoverable tax. ${validation.errors?.join(' ') || 'Complete the required payable accounts.'}`), { statusCode: 409 })
        if (paidBalance > 0) payableAccountId = payableConfig.payableAccountId
        if (recoverableTax > 0) {
          if (!payableConfig.inputTaxAccountId) throw Object.assign(new Error('Configure the input-tax asset account before recording recoverable tax on a plot purchase.'), { statusCode: 409 })
          inputTaxAccountId = payableConfig.inputTaxAccountId
        }
      }

      const config = await ensurePropertyAccounting(tx, tenantId)
      const purchaseNo = `LAND-PUR-${new Date(purchaseDate).getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`
      const created = await tx.propertyLandPurchase.create({ data: {
        tenantId, propertyId: unit.propertyId, unitId: unit.id, supplierId, createdById: req.user.id,
        purchaseNo, idempotencyKey, supplierRef, purchaseDate, total, amountPaid, balance: paidBalance,
        purchasePrice, capitalizedCosts, recoverableTax, costBasis,
        paymentStatus: paidBalance <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid', dueDate,
        notes,
      } })

      if (amountPaid > 0 && cashAccount) {
        const receiptNo = `LAND-RCPT-${new Date(purchaseDate).getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`
        const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount, amount: amountPaid, direction: 'expense', reference: receiptNo, description: `Initial plot acquisition payment to ${supplier.name} (${created.purchaseNo})` })
        await tx.propertyLandPurchasePayment.create({ data: { tenantId, purchaseId: created.id, supplierId, cashAccountId: cashAccount.id, createdById: req.user.id, receiptNo, idempotencyKey: `${idempotencyKey}:initial`, amount: amountPaid, balanceAfter: paidBalance, paymentMethod, paymentDate: purchaseDate, transactionRef: String(req.body?.transactionRef || '').trim() || null, notes } })
        cashLedgerId = movement.ledgerAccount.id
      }
      if (paidBalance > 0) await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: paidBalance } } })
      await tx.propertyUnit.update({ where: { id: unit.id }, data: { acquisitionCost: costBasis } })
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_LAND_PURCHASE', sourceId: created.id, date: purchaseDate, reference: supplierRef || created.purchaseNo, description: `Land purchase from ${supplier.name}: ${unit.property.name} / ${unit.unitCode}`, lines: propertyLandPurchaseLines(config, { costBasis, recoverableTax, total, amountPaid, payableAccountId, inputTaxAccountId, cashAccountLedgerId: cashLedgerId, reference: created.purchaseNo }) })
      return tx.propertyLandPurchase.findUnique({ where: { id: created.id }, include: propertyLandPurchaseInclude })
    })
    res.status(201).json({ id: purchase.id, purchaseNo: purchase.purchaseNo, paymentId: purchase.payments?.[0]?.id || null })
  } catch (error) {
    const status = error.statusCode || 500
    if (status === 500) console.error('Record plot purchase failed:', error)
    res.status(status).json({ error: status === 500 ? 'Could not record plot purchase.' : error.message })
  }
})

router.post('/land-purchases/:id/payments', requirePermission('canRecordPropertyLandPurchasePayment'), async (req, res) => {
  const amount = money(req.body?.amount)
  const paymentDate = req.body?.paymentDate ? new Date(req.body.paymentDate) : new Date()
  const paymentMethod = String(req.body?.paymentMethod || '').toLowerCase()
  const cashAccountId = String(req.body?.cashAccountId || '')
  const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim()
  if (!(amount > 0) || !Number.isFinite(amount)) return badRequest(res, 'Enter a payment greater than zero.')
  if (!Number.isFinite(paymentDate.getTime())) return badRequest(res, 'Enter a valid payment date.')
  if (!Object.hasOwn(paymentMethodToAccount, paymentMethod) || !cashAccountId) return badRequest(res, 'Choose a supported payment method and transaction account.')
  if (!canUseTransactionAccountForPayment(req, { id: cashAccountId }, paymentMethod)) return res.status(403).json({ error: `You do not have permission to use ${paymentMethod} for supplier payments.` })
  try {
    const tenantId = tenantIdOf(req)
    const payment = await prisma.$transaction(async tx => {
      const duplicate = await tx.propertyLandPurchasePayment.findFirst({ where: { tenantId, idempotencyKey }, include: { cashAccount: true, supplier: true, purchase: true } })
      if (duplicate) return duplicate
      await tx.$queryRaw`SELECT "id" FROM "property_land_purchases" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const purchase = await tx.propertyLandPurchase.findFirst({ where: { id: req.params.id, tenantId }, include: { supplier: true, unit: true, property: true } })
      if (!purchase) throw Object.assign(new Error('Plot purchase not found.'), { statusCode: 404 })
       if (amount > Number(purchase.balance)) throw Object.assign(new Error('Payment exceeds the outstanding supplier balance.'), { statusCode: 400 })
      const account = await tx.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
      if (!account || account.type !== paymentMethodToAccount[paymentMethod]) throw Object.assign(new Error('The selected transaction account does not match this payment method or is inactive.'), { statusCode: 400 })
      if (!canUseTransactionAccountForPayment(req, account, paymentMethod)) throw Object.assign(new Error(`You do not have permission to use ${account.name}.`), { statusCode: 403 })
      const payableConfig = await getPayablesAccountingConfig(tx, tenantId)
      const validation = await validatePayablesAccountingConfig(tx, tenantId, payableConfig, { requireEnabled: true })
      if (!validation.valid) throw Object.assign(new Error(`Valid Payables accounting mappings are required to settle this supplier balance. ${validation.errors?.join(' ') || ''}`), { statusCode: 409 })
      const receiptNo = `LAND-PAY-${new Date(paymentDate).getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`
      const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: account, amount, direction: 'expense', reference: receiptNo, description: `Plot supplier payment to ${purchase.supplier.name} (${purchase.purchaseNo})` })
      const balance = money(Number(purchase.balance) - amount)
      const paidTotal = money(Number(purchase.amountPaid) + amount)
      const createdPayment = await tx.propertyLandPurchasePayment.create({ data: { tenantId, purchaseId: purchase.id, supplierId: purchase.supplierId, cashAccountId: account.id, createdById: req.user.id, receiptNo, idempotencyKey, amount, balanceAfter: balance, paymentMethod, paymentDate, transactionRef: String(req.body?.transactionRef || '').trim() || null, notes: String(req.body?.notes || '').trim() || null } })
      await tx.$queryRaw`SELECT "id" FROM "suppliers" WHERE "id" = ${purchase.supplierId} AND "tenantId" = ${tenantId} FOR UPDATE`
      const supplier = await tx.supplier.findFirst({ where: { id: purchase.supplierId, tenantId } })
       if (!supplier || money(supplier.balance) < amount) throw Object.assign(new Error('Supplier control balance is lower than this invoice payment. Review the supplier ledger before paying.'), { statusCode: 409 })
      await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { decrement: amount } } })
       await tx.propertyLandPurchase.update({ where: { id: purchase.id }, data: { amountPaid: paidTotal, balance, paymentStatus: balance <= 0 ? 'paid' : 'partial' } })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_LAND_PURCHASE_PAYMENT', sourceId: createdPayment.id, date: paymentDate, reference: receiptNo, description: `Plot supplier payment to ${purchase.supplier.name} (${purchase.purchaseNo})`, lines: propertyLandPurchasePaymentLines({ amount, payableAccountId: payableConfig.payableAccountId, cashAccountLedgerId: movement.ledgerAccount.id, reference: receiptNo }) })
      return tx.propertyLandPurchasePayment.findUnique({ where: { id: createdPayment.id }, include: { purchase: { include: propertyLandPurchaseInclude }, cashAccount: true, supplier: true, createdBy: { select: { id: true, fname: true, lname: true } } } })
    })
    res.status(201).json({ id: payment.id, receiptNo: payment.receiptNo, purchaseId: payment.purchaseId })
  } catch (error) {
    const status = error.statusCode || 500
    if (status === 500) console.error('Record plot supplier payment failed:', error)
    res.status(status).json({ error: status === 500 ? 'Could not record plot supplier payment.' : error.message })
  }
})

router.get('/land-purchases/payments/:paymentId/receipt', requirePermission('canViewPropertyLandPurchases'), async (req, res) => {
  try {
    const [receipt, business] = await Promise.all([
      prisma.propertyLandPurchasePayment.findFirst({ where: { id: req.params.paymentId, tenantId: tenantIdOf(req), status: 'posted' }, include: { supplier: { select: { id: true, name: true, phone: true, email: true } }, cashAccount: { select: { id: true, name: true, type: true } }, purchase: { include: { property: { select: { name: true } }, unit: { select: { unitCode: true, areaSize: true, areaUnit: true, frontage: true, depth: true, dimensionUnit: true, plotNumber: true, blockNumber: true, titleReference: true, landTenure: true, currency: true } } } } } }),
      prisma.tenant.findUnique({ where: { id: tenantIdOf(req) }, select: { name: true, address: true, phone: true, logo: true } }),
    ])
    if (!receipt) return res.status(404).json({ error: 'Plot supplier receipt not found.' })
    res.json({ receipt, business })
  } catch (error) { console.error('Load plot purchase receipt failed:', error); res.status(500).json({ error: 'Could not load plot supplier receipt.' }) }
})

router.get('/sale-buyers', requirePermission('canViewPropertySales'), async (req, res) => {
  try {
    const canViewCreditLimit = req.user?.role === 'owner' || req.user?.permissions?.includes('*') || req.user?.permissions?.includes('canViewCustomerCreditLimit') || req.user?.permissions?.includes('canManageCustomerCreditLimit')
    const buyers = await prisma.customer.findMany({ where: { tenantId: tenantIdOf(req), status: 'active' }, take: 500, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, email: true, balance: true, ...(canViewCreditLimit ? { creditLimit: true } : {}) } })
    res.json(buyers)
  } catch (error) { console.error('Load plot sale buyers failed:', error); res.status(500).json({ error: 'Could not load buyer accounts.' }) }
})

router.get('/sales', requirePermission('canViewPropertySales'), async (req, res) => {
  try {
    const rows = await prisma.propertySale.findMany({ where: { tenantId: tenantIdOf(req), ...(req.query.status ? { status: String(req.query.status) } : {}) }, take: pageSize(req.query.limit), orderBy: { saleDate: 'desc' }, include: propertySaleInclude })
    res.json(rows.map(row => ({ ...row, amountPaid: money(row.payments.reduce((sum, payment) => sum + payment.amount, 0)), balance: money(row.salePrice - row.payments.reduce((sum, payment) => sum + payment.amount, 0)) })))
  } catch (error) { console.error('List plot sales failed:', error); res.status(500).json({ error: 'Could not load plot sales.' }) }
})

router.post('/sales', requirePermission('canCreatePropertySale'), async (req, res) => {
  const salePrice = money(req.body?.salePrice)
  const commissionAmount = money(req.body?.commissionAmount)
  const paymentPlan = String(req.body?.paymentPlan || 'full').toLowerCase()
  const installmentCount = paymentPlan === 'full' ? 1 : Number.parseInt(req.body?.installmentCount, 10)
  const frequency = String(req.body?.installmentFrequency || 'monthly').toLowerCase()
  const saleDate = req.body?.saleDate ? new Date(req.body.saleDate) : new Date()
  const allowedFrequency = new Set(['weekly', 'monthly', 'quarterly'])
  if (!(salePrice > 0) || !Number.isFinite(salePrice) || commissionAmount < 0 || !Number.isFinite(commissionAmount)) return badRequest(res, 'Enter a sale price greater than zero and a valid commission.')
  if (!['full', 'installments'].includes(paymentPlan) || !Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 120 || !allowedFrequency.has(frequency)) return badRequest(res, 'Choose a valid payment plan, installment count, and frequency.')
  if (paymentPlan === 'full' && installmentCount !== 1) return badRequest(res, 'A full-payment sale has one due amount.')
  if (!Number.isFinite(saleDate.getTime())) return badRequest(res, 'Enter a valid sale date.')
  try {
    const tenantId = tenantIdOf(req)
    const buyerId = String(req.body?.buyerId || '')
    const unitId = String(req.body?.unitId || '')
    let initialCashAccount = null
    const initialPaymentMethod = String(req.body?.paymentMethod || '').toLowerCase()
    if (paymentPlan === 'full') {
      if (!req.user?.permissions?.includes('*') && !req.user?.permissions?.includes('canRecordPropertySalePayment')) throw Object.assign(new Error('Full-payment sale requires permission to record the buyer’s payment. Use an installment contract if another authorized user will collect later.'), { statusCode: 403 })
      const cashAccountId = String(req.body?.cashAccountId || '')
      if (!Object.hasOwn(paymentMethodToAccount, initialPaymentMethod) || !cashAccountId) throw Object.assign(new Error('Choose the transaction account and payment method for this full-payment sale.'), { statusCode: 400 })
      initialCashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
      if (!initialCashAccount || initialCashAccount.type !== paymentMethodToAccount[initialPaymentMethod]) throw Object.assign(new Error('The selected account does not match the full-payment method.'), { statusCode: 400 })
      if (!canUseTransactionAccountForPayment(req, initialCashAccount, initialPaymentMethod)) throw Object.assign(new Error(`You do not have permission to use ${initialCashAccount.name}.`), { statusCode: 403 })
    }
    const created = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "property_units" WHERE "id" = ${unitId} FOR UPDATE`
      const [buyer, unit] = await Promise.all([
        tx.customer.findFirst({ where: { id: buyerId, tenantId } }),
        tx.propertyUnit.findFirst({ where: { id: unitId, property: { tenantId, propertyType: 'land', status: 'active' } }, include: { property: { include: { owner: true } } } }),
      ])
      if (!buyer) throw Object.assign(new Error('Select a buyer/customer belonging to this business.'), { statusCode: 400 })
      if (!unit) throw Object.assign(new Error('Select an available plot in this business.'), { statusCode: 400 })
      if (!['vacant', 'available'].includes(String(unit.status).toLowerCase())) throw Object.assign(new Error('This plot is not available; it may already be sold, reserved, or occupied.'), { statusCode: 409 })
      if (unit.property.ownerId && !unit.property.owner?.isActive) throw Object.assign(new Error('The plot owner is inactive; reactivate or replace the owner before sale.'), { statusCode: 409 })
      const saleMode = unit.property.ownerId ? 'brokered' : 'principal'
      if (saleMode === 'brokered' && commissionAmount > salePrice) throw Object.assign(new Error('Commission cannot exceed the plot sale price.'), { statusCode: 400 })
      if (saleMode === 'principal' && commissionAmount !== 0) throw Object.assign(new Error('Commission is only entered for a landlord-owned, brokered plot.'), { statusCode: 400 })
      if (saleMode === 'principal' && !(Number(unit.acquisitionCost) > 0)) throw Object.assign(new Error('This owned plot has no recorded acquisition cost. Record its cost basis before selling.'), { statusCode: 409 })
      if (paymentPlan === 'installments' && (!(Number(buyer.creditLimit) > 0) || Number(buyer.balance) + salePrice - Number(buyer.creditLimit) > 0.01)) throw Object.assign(new Error('This customer does not have enough available credit for the agreed plot sale. Set or review their credit limit first.'), { statusCode: 409 })
      const config = await ensurePropertyAccounting(tx, tenantId)
      const saleNo = `PLOT-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`
      const installments = []
      let allocated = 0
      for (let sequence = 1; sequence <= installmentCount; sequence += 1) {
        const amount = sequence === installmentCount ? money(salePrice - allocated) : money(salePrice / installmentCount)
        allocated = money(allocated + amount)
        const dueDate = new Date(saleDate)
        if (sequence > 1) {
          const offset = sequence - 1
          if (frequency === 'weekly') dueDate.setUTCDate(dueDate.getUTCDate() + offset * 7)
          else {
            const originalDay = dueDate.getUTCDate()
            dueDate.setUTCDate(1)
            dueDate.setUTCMonth(dueDate.getUTCMonth() + offset * (frequency === 'quarterly' ? 3 : 1))
            const lastDay = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1, 0)).getUTCDate()
            dueDate.setUTCDate(Math.min(originalDay, lastDay))
          }
        }
        installments.push({ tenantId, sequence, dueDate, amount, status: 'unpaid' })
      }
      const sale = await tx.propertySale.create({ data: {
        tenantId, propertyId: unit.propertyId, unitId: unit.id, buyerId, ownerId: unit.property.ownerId,
        createdById: req.user.id, saleNo, saleMode, salePrice, commissionAmount,
        costBasis: saleMode === 'principal' ? unit.acquisitionCost : 0,
        paymentPlan, installmentCount, installmentFrequency: frequency, saleDate,
        notes: String(req.body?.notes || '').trim() || null,
        installments: { create: installments },
      } })
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_PLOT_SALE', sourceId: sale.id, date: saleDate, reference: saleNo, description: `${saleMode === 'brokered' ? 'Brokered' : 'Owned'} plot sale to ${buyer.name}`, lines: propertySaleRecognitionLines(config, { amount: salePrice, commission: commissionAmount, costBasis: sale.costBasis, saleMode, buyerName: buyer.name, reference: saleNo }) })
      await tx.customer.update({ where: { id: buyer.id }, data: { balance: { increment: salePrice } } })
      let initialPaymentId = null
      if (paymentPlan === 'full' && initialCashAccount) {
        const receiptNo = `PLOT-RCPT-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
        const payment = await tx.propertySalePayment.create({ data: { tenantId, saleId: sale.id, cashAccountId: initialCashAccount.id, createdById: req.user.id, receiptNo, idempotencyKey: randomUUID(), amount: salePrice, paymentDate: saleDate, paymentMethod: initialPaymentMethod } })
        const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: initialCashAccount, amount: salePrice, direction: 'receipt', reference: receiptNo, description: `Full plot sale payment from ${buyer.name} (${saleNo})` })
        await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_PLOT_SALE_PAYMENT', sourceId: payment.id, date: saleDate, reference: receiptNo, description: `Full plot sale payment received from ${buyer.name}`, lines: propertySalePaymentLines(config, { amount: salePrice, cashAccountLedgerId: movement.ledgerAccount.id, reference: receiptNo }) })
        const installment = await tx.propertySaleInstallment.findFirst({ where: { saleId: sale.id, sequence: 1 } })
        await tx.propertySalePaymentAllocation.create({ data: { paymentId: payment.id, installmentId: installment.id, amount: salePrice } })
        await tx.propertySaleInstallment.update({ where: { id: installment.id }, data: { amountPaid: salePrice, status: 'paid' } })
        await tx.customer.update({ where: { id: buyer.id }, data: { balance: { decrement: salePrice } } })
        initialPaymentId = payment.id
      }
      await tx.propertyUnit.update({ where: { id: unit.id }, data: { status: 'sold' } })
      const result = await tx.propertySale.findUnique({ where: { id: sale.id }, include: propertySaleInclude })
      return { ...result, initialPaymentId }
    })
    res.status(201).json({ ...created, amountPaid: paymentPlan === 'full' ? salePrice : 0, balance: paymentPlan === 'full' ? 0 : salePrice })
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Create plot sale failed:', error); res.status(status).json({ error: status === 500 ? 'Could not create plot sale.' : error.message }) }
})

router.post('/sales/:id/payments', requirePermission('canRecordPropertySalePayment'), async (req, res) => {
  const amount = money(req.body?.amount)
  const method = String(req.body?.paymentMethod || 'cash').toLowerCase()
  const cashAccountId = String(req.body?.cashAccountId || '')
  const paymentDate = req.body?.paymentDate ? new Date(req.body.paymentDate) : new Date()
  if (!(amount > 0) || !Number.isFinite(amount)) return badRequest(res, 'Enter a payment greater than zero.')
  if (!Object.hasOwn(paymentMethodToAccount, method) || !cashAccountId) return badRequest(res, 'Select a supported payment method and transaction account.')
  if (!Number.isFinite(paymentDate.getTime())) return badRequest(res, 'Enter a valid payment date.')
  const idempotencyKey = String(req.body?.idempotencyKey || randomUUID()).trim()
  try {
    const tenantId = tenantIdOf(req)
    const account = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
    if (!account || account.type !== paymentMethodToAccount[method]) return badRequest(res, 'The selected transaction account does not match this payment method or is inactive.')
    if (!canUseTransactionAccountForPayment(req, account, method)) return res.status(403).json({ error: `You do not have permission to use ${account.name} for plot sale payments.` })
    const payment = await prisma.$transaction(async tx => {
      const duplicate = await tx.propertySalePayment.findFirst({ where: { tenantId, idempotencyKey }, include: { sale: { include: propertySaleInclude } } })
      if (duplicate) return duplicate
      await tx.$queryRaw`SELECT "id" FROM "property_sales" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const sale = await tx.propertySale.findFirst({ where: { id: req.params.id, tenantId, status: 'active' }, include: { installments: { where: { status: { in: ['unpaid', 'partial', 'overdue'] } }, orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }] }, buyer: true } })
      if (!sale) throw Object.assign(new Error('Active plot sale not found.'), { statusCode: 404 })
      const open = money(sale.installments.reduce((sum, row) => sum + Math.max(0, row.amount - row.amountPaid), 0))
      if (amount - open > 0.01) throw Object.assign(new Error(`Payment exceeds the remaining sale balance of ${open.toLocaleString()}.`), { statusCode: 400 })
      const cash = await tx.cashAccount.findFirst({ where: { id: account.id, tenantId, isActive: true } })
      if (!cash) throw Object.assign(new Error('Transaction account is no longer active.'), { statusCode: 409 })
      const receiptNo = `PLOT-RCPT-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
      const record = await tx.propertySalePayment.create({ data: { tenantId, saleId: sale.id, cashAccountId: cash.id, createdById: req.user.id, receiptNo, idempotencyKey, amount, paymentDate, paymentMethod: method, transactionRef: String(req.body?.transactionRef || '').trim() || null, notes: String(req.body?.notes || '').trim() || null } })
      const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: cash, amount, direction: 'receipt', reference: receiptNo, description: `Plot sale installment from ${sale.buyer.name} (${sale.saleNo})` })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_PLOT_SALE_PAYMENT', sourceId: record.id, date: paymentDate, reference: receiptNo, description: `Plot sale payment received from ${sale.buyer.name}`, lines: propertySalePaymentLines(config, { amount, cashAccountLedgerId: movement.ledgerAccount.id, reference: receiptNo }) })
      let remaining = amount
      for (const installment of sale.installments) {
        if (remaining <= 0.001) break
        const due = money(Math.max(0, installment.amount - installment.amountPaid))
        const applied = money(Math.min(remaining, due))
        if (!applied) continue
        const nextPaid = money(installment.amountPaid + applied)
        await tx.propertySalePaymentAllocation.create({ data: { paymentId: record.id, installmentId: installment.id, amount: applied } })
        await tx.propertySaleInstallment.update({ where: { id: installment.id }, data: { amountPaid: nextPaid, status: nextPaid + 0.001 >= installment.amount ? 'paid' : 'partial' } })
        remaining = money(remaining - applied)
      }
      await tx.customer.update({ where: { id: sale.buyerId }, data: { balance: { decrement: amount } } })
      return tx.propertySalePayment.findUnique({ where: { id: record.id }, include: { cashAccount: { select: { id: true, name: true, type: true } }, sale: { include: propertySaleInclude }, allocations: { include: { installment: true } } } })
    })
    res.status(201).json(payment)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Record plot sale payment failed:', error); res.status(status).json({ error: status === 500 ? 'Could not record plot sale payment.' : error.message }) }
})

router.get('/sales/:id/receipt', requireAnyPermission(['canViewPropertySales', 'canRecordPropertySalePayment']), async (req, res) => {
  try {
    const payment = await prisma.propertySalePayment.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) }, include: { cashAccount: { select: { name: true, type: true } }, allocations: { include: { installment: true } }, sale: { include: propertySaleInclude } } })
    if (!payment) return res.status(404).json({ error: 'Plot sale receipt not found.' })
    const business = await prisma.tenant.findUnique({ where: { id: tenantIdOf(req) }, select: { name: true, address: true, phone: true, logo: true, currency: true } })
    res.json({ receipt: payment, business })
  } catch (error) { console.error('Plot sale receipt failed:', error); res.status(500).json({ error: 'Could not load plot sale receipt.' }) }
})

router.post('/sale-payments/:id/void', requirePermission('canVoidPropertySalePayment'), async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 5) return badRequest(res, 'Enter a clear reason of at least five characters.')
  try {
    const tenantId = tenantIdOf(req)
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "property_sale_payments" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const payment = await tx.propertySalePayment.findFirst({ where: { id: req.params.id, tenantId, status: 'posted' }, include: { sale: true, cashAccount: true, allocations: { include: { installment: true } } } })
      if (!payment) throw Object.assign(new Error('Posted plot payment not found.'), { statusCode: 404 })
      if (!payment.cashAccount) throw Object.assign(new Error('The original transaction account is unavailable; reconcile before reversing this receipt.'), { statusCode: 409 })
      if (!canUseTransactionAccountForPayment(req, payment.cashAccount, payment.paymentMethod)) throw Object.assign(new Error(`You do not have permission to reverse funds from ${payment.cashAccount.name}.`), { statusCode: 403 })
      await tx.propertySalePayment.update({ where: { id: payment.id }, data: { status: 'void', voidReason: reason, voidedAt: new Date() } })
      await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: payment.cashAccount, amount: payment.amount, direction: 'expense', reference: `VOID-${payment.receiptNo}`, description: `Void plot sale receipt ${payment.receiptNo}` })
      await reversePropertyJournal(tx, { tenantId, sourceType: 'PROPERTY_PLOT_SALE_PAYMENT', sourceId: payment.id, userId: req.user.id, reason })
      for (const allocation of payment.allocations) {
        const nextPaid = money(Math.max(0, allocation.installment.amountPaid - allocation.amount))
        await tx.propertySaleInstallment.update({ where: { id: allocation.installmentId }, data: { amountPaid: nextPaid, status: nextPaid < 0.01 ? 'unpaid' : nextPaid + 0.001 >= allocation.installment.amount ? 'paid' : 'partial' } })
      }
      await tx.customer.update({ where: { id: payment.sale.buyerId }, data: { balance: { increment: payment.amount } } })
      return { id: payment.id, status: 'void' }
    })
    res.json(result)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Void plot sale payment failed:', error); res.status(status).json({ error: status === 500 ? 'Could not reverse plot sale payment.' : error.message }) }
})

router.post('/sales/:id/cancel', requirePermission('canCancelPropertySale'), async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 5) return badRequest(res, 'Enter a cancellation reason of at least five characters.')
  try {
    const tenantId = tenantIdOf(req)
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "property_sales" WHERE "id" = ${req.params.id} AND "tenantId" = ${tenantId} FOR UPDATE`
      const sale = await tx.propertySale.findFirst({ where: { id: req.params.id, tenantId, status: 'active' }, include: { payments: { where: { status: 'posted' }, include: { cashAccount: true, allocations: { include: { installment: true } } } } } })
      if (!sale) throw Object.assign(new Error('Active plot sale not found.'), { statusCode: 404 })
      for (const payment of sale.payments) {
        if (!payment.cashAccount) throw Object.assign(new Error(`Receipt ${payment.receiptNo} has no original transaction account; reconcile it before cancelling this sale.`), { statusCode: 409 })
        if (!canUseTransactionAccountForPayment(req, payment.cashAccount, payment.paymentMethod)) throw Object.assign(new Error(`You cannot refund receipt ${payment.receiptNo} from ${payment.cashAccount.name} with your current account permissions.`), { statusCode: 403 })
        await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: payment.cashAccount, amount: payment.amount, direction: 'expense', reference: `CANCEL-${payment.receiptNo}`, description: `Refund plot sale receipt ${payment.receiptNo}` })
        await reversePropertyJournal(tx, { tenantId, sourceType: 'PROPERTY_PLOT_SALE_PAYMENT', sourceId: payment.id, userId: req.user.id, reason })
        await tx.propertySalePayment.update({ where: { id: payment.id }, data: { status: 'void', voidReason: `Sale cancellation: ${reason}`, voidedAt: new Date() } })
        await tx.customer.update({ where: { id: sale.buyerId }, data: { balance: { increment: payment.amount } } })
        for (const allocation of payment.allocations) {
          const nextPaid = money(Math.max(0, allocation.installment.amountPaid - allocation.amount))
          await tx.propertySaleInstallment.update({ where: { id: allocation.installmentId }, data: { amountPaid: nextPaid, status: nextPaid < 0.01 ? 'unpaid' : nextPaid + 0.001 >= allocation.installment.amount ? 'paid' : 'partial' } })
        }
      }
      await reversePropertyJournal(tx, { tenantId, sourceType: 'PROPERTY_PLOT_SALE', sourceId: sale.id, userId: req.user.id, reason })
      await tx.customer.update({ where: { id: sale.buyerId }, data: { balance: { decrement: sale.salePrice } } })
      await tx.propertySale.update({ where: { id: sale.id }, data: { status: 'cancelled', notes: [sale.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') } })
      await tx.propertySaleInstallment.updateMany({ where: { saleId: sale.id }, data: { status: 'cancelled' } })
      await tx.propertyUnit.update({ where: { id: sale.unitId }, data: { status: 'vacant' } })
      return { id: sale.id, status: 'cancelled' }
    })
    res.json(result)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Cancel plot sale failed:', error); res.status(status).json({ error: status === 500 ? 'Could not cancel plot sale.' : error.message }) }
})

export default router
