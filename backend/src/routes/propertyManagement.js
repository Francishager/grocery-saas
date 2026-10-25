import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import prisma from '../db.js'
import { authenticateToken, requirePermission, requireAnyPermission, loadUserPermissions, canUseTransactionAccountForPayment } from '../../middleware/auth.js'
import { requireAnyFeature, getTenantFeatures, hasFeatureAccess } from '../../middleware/featureCheck.js'
import { ensurePropertyAccounting, ensurePropertyCashLedgerAccount, recordPropertyCashMovement, postPropertyJournal, reversePropertyJournal, propertyRentChargeLines, propertyRentReceiptLines, propertyDepositReceiptLines, propertyOwnerPayoutLines, propertyDepositRefundLines, propertyOpeningDepositLines } from '../services/propertyAccountingService.js'
import { safeCloudinaryId, uploadBufferToCloudinary } from '../utils/cloudinaryUpload.js'

const router = Router()
const identityUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 3 } })
const money = value => Math.round((Number(value) || 0) * 100) / 100
const tenantIdOf = req => req.user?.tenantId
const monthKey = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
const dueDateFor = (period, dueDay) => {
  const [year, month] = period.split('-').map(Number)
  const day = Math.min(Math.max(Number(dueDay) || 1, 1), new Date(Date.UTC(year, month, 0)).getUTCDate())
  return new Date(Date.UTC(year, month - 1, day, 12))
}
const pageSize = value => Math.min(Math.max(Number.parseInt(value, 10) || 100, 1), 500)
const badRequest = (res, message) => res.status(400).json({ error: message })
const canViewCustomerIdentity = req => (req.user?.permissions || []).includes('*') || (req.user?.permissions || []).includes('canViewCustomerIdentity')

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

router.get('/payment-accounts', requireAnyPermission(['canRecordRentPayment', 'canRecordTenantDeposit', 'canRefundTenantDeposit', 'canRecordOwnerPayout', 'canManageRentPayment']), async (req, res) => {
  try {
    const accounts = await prisma.cashAccount.findMany({ where: { tenantId: tenantIdOf(req), isActive: true }, orderBy: { name: 'asc' } })
    const permitted = accounts.flatMap(account => {
      const paymentMethod = paymentMethodsByAccount[String(account.type).toLowerCase()]
      const hasAction = ['canRecordRentPayment', 'canRecordTenantDeposit', 'canRefundTenantDeposit', 'canRecordOwnerPayout', 'canManageRentPayment'].some(key => req.user?.permissions?.includes(key))
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
      prisma.propertyOwnerPayout.groupBy({ by: ['ownerId'], where: { tenantId, status: 'posted' }, _sum: { amount: true } }),
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

router.get('/properties', requireAnyPermission(['canViewPropertyPortfolio', 'canViewPropertyManagement']), async (req, res) => {
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
    if (req.body.ownerId && !await prisma.propertyOwner.findFirst({ where: { id: req.body.ownerId, tenantId: tenantIdOf(req) } })) return badRequest(res, 'Select an owner in this business.')
    const updated = await prisma.managedProperty.update({ where: { id: property.id }, data: { name: String(req.body.name || property.name).trim(), address: String(req.body.address || property.address).trim(), city: req.body.city?.trim() || null, propertyType: req.body.propertyType || property.propertyType, ownerId: req.body.ownerId || null, notes: req.body.notes?.trim() || null, status: req.body.status || property.status } })
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
    const unit = await prisma.propertyUnit.create({ data: { propertyId: property.id, unitCode, unitType: req.body.unitType?.trim() || null, bedrooms: req.body.bedrooms == null ? null : Number(req.body.bedrooms), bathrooms: req.body.bathrooms == null ? null : Number(req.body.bathrooms), rentAmount: money(rentAmount), currency: property.tenant.currency || 'UGX', notes: req.body.notes?.trim() || null } })
    res.status(201).json(unit)
  } catch (error) { if (error.code === 'P2002') return res.status(409).json({ error: 'That unit code already exists in this property.' }); console.error('Create property unit failed:', error); res.status(500).json({ error: 'Could not save unit.' }) }
})

router.put('/units/:id', requirePermission('canManagePropertyUnits'), async (req, res) => {
  try {
    const unit = await prisma.propertyUnit.findFirst({ where: { id: req.params.id, property: { tenantId: tenantIdOf(req) } } })
    if (!unit) return res.status(404).json({ error: 'Unit not found.' })
    const active = await prisma.propertyTenancy.count({ where: { unitId: unit.id, status: 'active' } })
    if (active && req.body.status === 'vacant') return res.status(409).json({ error: 'End the active tenancy before marking this unit vacant.' })
    const updated = await prisma.propertyUnit.update({ where: { id: unit.id }, data: { unitCode: req.body.unitCode?.trim() || unit.unitCode, unitType: req.body.unitType?.trim() || null, rentAmount: req.body.rentAmount == null ? unit.rentAmount : money(req.body.rentAmount), status: req.body.status || unit.status, notes: req.body.notes?.trim() || null } })
    res.json(updated)
  } catch (error) { console.error('Update property unit failed:', error); res.status(500).json({ error: 'Could not update unit.' }) }
})

router.get('/tenancies', requireAnyPermission(['canViewPropertyPortfolio', 'canViewPropertyManagement', 'canViewPropertyStatements']), async (req, res) => {
  try {
    const where = { tenantId: tenantIdOf(req), ...(req.query.status && req.query.status !== 'all' ? { status: String(req.query.status) } : {}), ...(req.query.ownerId ? { unit: { property: { ownerId: String(req.query.ownerId) } } } : {}) }
    const rows = await prisma.propertyTenancy.findMany({ where, take: pageSize(req.query.limit), orderBy: [{ status: 'asc' }, { tenantName: 'asc' }], include: { unit: { include: { property: { include: { owner: true } } } }, charges: { where: { status: { in: ['unpaid', 'partial', 'overdue'] } }, orderBy: { dueDate: 'asc' } } } })
    res.json(rows.map(row => {
      const { nationalId, ...details } = row
      return { ...details, ...(canViewCustomerIdentity(req) ? { nationalId } : {}), balance: money(row.charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0)), overdueBalance: money(row.charges.filter(charge => charge.dueDate < new Date()).reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0)) }
    }))
  } catch (error) { console.error('List property tenancies failed:', error); res.status(500).json({ error: 'Could not load tenancies.' }) }
})

router.post('/tenancies', identityUpload.fields([{ name: 'profilePhoto', maxCount: 1 }, { name: 'nationalIdFront', maxCount: 1 }, { name: 'nationalIdBack', maxCount: 1 }]), requireAnyPermission(['canCreateTenancies', 'canManageTenancies']), async (req, res) => {
  const tenantName = String(req.body?.tenantName || '').trim()
  const startDate = new Date(req.body?.startDate)
  const rentAmount = Number(req.body?.rentAmount)
  const dueDay = Number(req.body?.dueDay || 1)
  const depositRequired = Number(req.body?.depositRequired || 0)
  const depositHeld = Number(req.body?.depositHeld || 0)
  const endDate = req.body?.endDate ? new Date(req.body.endDate) : null
  if (!tenantName || !req.body?.unitId || !Number.isFinite(startDate.getTime()) || (endDate && (!Number.isFinite(endDate.getTime()) || endDate < startDate)) || !Number.isFinite(rentAmount) || rentAmount <= 0 || !Number.isFinite(depositRequired) || depositRequired < 0 || !Number.isFinite(depositHeld) || depositHeld < 0 || depositHeld - depositRequired > 0.01 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return badRequest(res, 'Enter a tenant, valid unit and agreement dates, positive monthly rent, deposits where amount already held does not exceed deposit required, and due day (1–31).')
  try {
    const identity = await uploadRenterIdentity(req)
    const unit = await prisma.propertyUnit.findFirst({ where: { id: req.body.unitId, property: { tenantId: tenantIdOf(req), status: 'active' } } })
    if (!unit) return res.status(404).json({ error: 'Unit not found in this business.' })
    if (unit.status !== 'vacant') return res.status(409).json({ error: 'This unit is not vacant.' })
    const result = await prisma.$transaction(async tx => {
      const claim = await tx.propertyUnit.updateMany({ where: { id: unit.id, status: 'vacant' }, data: { status: 'occupied' } })
      if (claim.count !== 1) throw Object.assign(new Error('This unit has just been assigned. Refresh and choose another vacant unit.'), { statusCode: 409 })
      const customer = await findOrCreateRenterCustomer(tx, tenantIdOf(req), req.body)
      const tenancy = await tx.propertyTenancy.create({ data: { tenantId: tenantIdOf(req), customerId: customer.id, unitId: unit.id, tenantName, email: req.body.email?.trim() || null, phone: req.body.phone?.trim() || null, nationalId: req.body.nationalId?.trim() || null, agreementRef: req.body.agreementRef?.trim() || null, startDate, endDate, dueDay, rentAmount: money(rentAmount), currency: req.body.currency || unit.currency || 'UGX', depositRequired: money(depositRequired), depositHeld: money(depositHeld), agreementNotes: req.body.agreementNotes?.trim() || null }, include: { customer: { select: { id: true, name: true } }, unit: { include: { property: { include: { owner: true } } } } } })
      if (Object.values(identity).some(Boolean)) await tx.propertyTenantIdentity.create({ data: { tenantId: tenantIdOf(req), tenancyId: tenancy.id, profilePhotoUrl: identity.profilePhoto, nationalIdFrontUrl: identity.nationalIdFront, nationalIdBackUrl: identity.nationalIdBack } })
      if (depositHeld > 0) {
        const config = await ensurePropertyAccounting(tx, tenantIdOf(req))
        await postPropertyJournal(tx, { tenantId: tenantIdOf(req), userId: req.user.id, sourceType: 'PROPERTY_DEPOSIT_OPENING', sourceId: tenancy.id, date: startDate, reference: tenancy.agreementRef || tenancy.id, description: `Opening tenant security deposit for ${tenantName}`, lines: propertyOpeningDepositLines(config, { amount: depositHeld, reference: tenancy.agreementRef || tenancy.id }) })
      }
      const currentPeriod = monthKey(new Date())
      const currentDueDate = dueDateFor(currentPeriod, dueDay)
      if (startDate <= currentDueDate) {
        const currentUnit = await tx.propertyUnit.findUnique({ where: { id: unit.id }, include: { property: { select: { name: true, ownerId: true } } } })
        const charge = await tx.rentCharge.upsert({ where: { tenancyId_period: { tenancyId: tenancy.id, period: currentPeriod } }, update: {}, create: { tenantId: tenantIdOf(req), tenancyId: tenancy.id, period: currentPeriod, dueDate: currentDueDate, amount: money(rentAmount), description: `Rent for ${currentPeriod}` } })
        const config = await ensurePropertyAccounting(tx, tenantIdOf(req))
        await postPropertyJournal(tx, { tenantId: tenantIdOf(req), userId: req.user.id, sourceType: 'PROPERTY_RENT_CHARGE', sourceId: charge.id, date: currentDueDate, reference: `RENT-${tenancy.id}-${currentPeriod}`, description: `Rent charge for ${tenantName}, ${currentUnit.property.name} / ${currentUnit.unitCode}`, lines: propertyRentChargeLines(config, { amount: charge.amount, managed: Boolean(currentUnit.property.ownerId), description: `Rent ${currentPeriod}` }) })
      }
      return tenancy
    })
    res.status(201).json(result)
  } catch (error) { const status = error.statusCode || 500; if (status === 500) console.error('Create tenancy failed:', error); res.status(status).json({ error: status === 500 ? 'Could not create tenancy.' : error.message }) }
})

router.put('/tenancies/:id/profile', identityUpload.fields([{ name: 'profilePhoto', maxCount: 1 }, { name: 'nationalIdFront', maxCount: 1 }, { name: 'nationalIdBack', maxCount: 1 }]), requirePermission('canManageTenancies'), async (req, res) => {
  try {
    const tenancy = await prisma.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) } })
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
        payments: { where: { status: 'posted', paymentType: 'rent' }, orderBy: { paymentDate: 'asc' } },
        identity: true,
      },
    })
    const includeIdentity = canViewCustomerIdentity(req)
    const entries = tenancies.flatMap(tenancy => [
      ...tenancy.charges.map(charge => ({ id: charge.id, tenancyId: tenancy.id, date: charge.dueDate, type: 'rent_due', reference: charge.period, description: `${charge.description} · ${tenancy.unit.property.name} / ${tenancy.unit.unitCode}`, debit: charge.amount, credit: 0, status: charge.status })),
      ...tenancy.payments.map(payment => ({ id: payment.id, tenancyId: tenancy.id, date: payment.paymentDate, type: 'rent_payment', reference: payment.receiptNo, description: `Rent payment · ${tenancy.unit.property.name} / ${tenancy.unit.unitCode}`, debit: 0, credit: payment.amount, paymentMethod: payment.paymentMethod, status: payment.status })),
    ]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    let balance = 0
    for (const entry of entries) { balance = money(balance + entry.debit - entry.credit); entry.runningBalance = balance }
    const identity = tenancies.find(row => row.identity)?.identity
    res.json({
      customer: { id: customer.id, name: customer.name, ...(includeIdentity ? { profilePhotoUrl: identity?.profilePhotoUrl, nationalId: customer.nin, nationalIdFrontUrl: identity?.nationalIdFrontUrl, nationalIdBackUrl: identity?.nationalIdBackUrl } : {}) },
      tenancies: tenancies.map(({ charges, payments, identity: _identity, ...tenancy }) => {
        const { nationalId, ...details } = tenancy
        return { ...details, ...(includeIdentity ? { nationalId } : {}), balance: money(charges.reduce((sum, charge) => sum + charge.amount - charge.amountPaid, 0)) }
      }),
      entries,
      closingBalance: balance,
      access: { identity: includeIdentity },
    })
  } catch (error) { console.error('Load renter ledger failed:', error); res.status(500).json({ error: 'Could not load rental history.' }) }
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

router.get('/tenancies/:id/statement', requirePermission('canViewPropertyStatements'), async (req, res) => {
  try {
    const tenancy = await prisma.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId: tenantIdOf(req) }, include: { unit: { include: { property: { include: { owner: true } } } }, charges: { orderBy: { dueDate: 'asc' }, include: { allocations: { include: { payment: true } } } }, payments: { where: { status: 'posted', paymentType: 'rent' }, orderBy: { paymentDate: 'asc' }, include: { allocations: { include: { charge: true } } } } } })
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found.' })
    const entries = [
      ...tenancy.charges.map(charge => ({ id: charge.id, date: charge.dueDate, type: 'rent_due', reference: charge.period, description: charge.description, debit: charge.amount, credit: 0, paid: charge.amountPaid, balance: money(charge.amount - charge.amountPaid), status: charge.status })),
      ...tenancy.payments.map(payment => ({ id: payment.id, date: payment.paymentDate, type: 'payment', reference: payment.receiptNo, description: `Rent payment (${payment.paymentMethod})`, debit: 0, credit: payment.amount, amount: payment.amount, status: payment.status })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    let balance = 0
    for (const entry of entries) { balance = money(balance + entry.debit - entry.credit); entry.runningBalance = balance }
    const { nationalId, ...tenancyDetails } = tenancy
    res.json({ tenancy: { ...tenancyDetails, ...(canViewCustomerIdentity(req) ? { nationalId } : {}), charges: undefined, payments: undefined }, entries, closingBalance: balance })
  } catch (error) { console.error('Property tenancy statement failed:', error); res.status(500).json({ error: 'Could not load statement.' }) }
})

router.post('/tenancies/:id/payments', requirePermission('canRecordRentPayment'), async (req, res) => {
  const amount = money(req.body?.amount)
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
      const tenancy = await tx.propertyTenancy.findFirst({ where: { id: req.params.id, tenantId, status: { in: ['active', 'ended'] } }, include: { charges: { where: { status: { in: ['unpaid', 'partial', 'overdue'] } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] } } })
      if (!tenancy) throw Object.assign(new Error('Tenancy not found.'), { statusCode: 404 })
      const open = tenancy.charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0)
      if (amount - open > 0.01) throw Object.assign(new Error(`Payment exceeds outstanding rent of ${tenancy.currency} ${money(open).toLocaleString()}.`), { statusCode: 400 })
      const receiptNo = `RENT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const account = await tx.cashAccount.findFirst({ where: { id: cashAccountId, tenantId, isActive: true } })
      if (!account || account.type !== expectedType) throw Object.assign(new Error('Selected transaction account is no longer available; reload and retry.'), { statusCode: 409 })
      const record = await tx.propertyRentPayment.create({ data: { tenantId, tenancyId: tenancy.id, cashAccountId: account.id, receiptNo, idempotencyKey, amount, paymentDate, paymentMethod: method, transactionRef: req.body.transactionRef?.trim() || null, notes: req.body.notes?.trim() || null, paymentType: 'rent' } })
      const movement = await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: account, amount, direction: 'receipt', reference: receiptNo, description: `Property rent received from ${tenancy.tenantName}` })
      const config = await ensurePropertyAccounting(tx, tenantId)
      await postPropertyJournal(tx, { tenantId, userId: req.user.id, sourceType: 'PROPERTY_RENT_PAYMENT', sourceId: record.id, date: paymentDate, reference: receiptNo, description: `Rent payment received from ${tenancy.tenantName}`, lines: propertyRentReceiptLines(config, { amount, cashAccountLedgerId: movement.ledgerAccount.id, reference: receiptNo }) })
      let remaining = amount
      for (const charge of tenancy.charges) {
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

router.get('/payments/:id/receipt', requireAnyPermission(['canViewPropertyCollections', 'canRecordRentPayment', 'canRecordTenantDeposit', 'canRefundTenantDeposit', 'canRecordOwnerPayout', 'canManageRentPayment']), async (req, res) => {
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
      const payment = await tx.propertyRentPayment.findFirst({ where: { id: req.params.id, tenantId, status: 'posted' }, include: { cashAccount: true, allocations: { include: { charge: true } } } })
      if (!payment) throw Object.assign(new Error('Posted rent payment not found.'), { statusCode: 404 })
      if (!payment.cashAccount) throw Object.assign(new Error('This legacy receipt has no saved transaction account; reconcile its original cash/bank account before voiding.'), { statusCode: 409 })
      if (!canUseTransactionAccountForPayment(req, payment.cashAccount, payment.paymentMethod)) throw Object.assign(new Error(`You do not have permission to reverse a movement from ${payment.cashAccount.name}.`), { statusCode: 403 })
      const claim = await tx.propertyRentPayment.updateMany({ where: { id: payment.id, tenantId, status: 'posted' }, data: { status: 'void', voidReason: reason, voidedAt: new Date() } })
      if (claim.count !== 1) throw Object.assign(new Error('This payment has already been voided.'), { statusCode: 409 })
      const reversalRef = `VOID-${payment.receiptNo}`
      const isDepositRefund = payment.paymentType === 'deposit_refund'
      await recordPropertyCashMovement(tx, { tenantId, userId: req.user.id, cashAccount: payment.cashAccount, amount: payment.amount, direction: isDepositRefund ? 'receipt' : 'expense', reference: reversalRef, description: `Void property receipt ${payment.receiptNo}` })
      const journalSource = payment.paymentType === 'deposit' ? 'PROPERTY_DEPOSIT_RECEIPT' : isDepositRefund ? 'PROPERTY_DEPOSIT_REFUND' : 'PROPERTY_RENT_PAYMENT'
      await reversePropertyJournal(tx, { tenantId, sourceType: journalSource, sourceId: payment.id, userId: req.user.id, reason })
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
    const [charges, payments, tenancies, payouts] = await Promise.all([
      prisma.rentCharge.findMany({ where: { tenantId, dueDate: { gte: from, lte: to }, tenancy: propertyScope }, include: { tenancy: { include: { unit: { include: { property: { include: { owner: true } } } } } }, allocations: true }, orderBy: { dueDate: 'asc' } }),
      prisma.propertyRentPayment.findMany({ where: { tenantId, status: 'posted', paymentType: 'rent', paymentDate: { gte: from, lte: to }, tenancy: propertyScope }, include: { tenancy: { include: { unit: { include: { property: { include: { owner: true } } } } } } }, orderBy: { paymentDate: 'asc' } }),
      prisma.propertyTenancy.findMany({ where: { tenantId, status: 'active', ...(ownerId ? { unit: { property: { ownerId } } } : {}) }, include: { unit: { include: { property: { include: { owner: true } } } }, charges: { where: { status: { in: ['unpaid', 'partial', 'overdue'] } } } } }),
      prisma.propertyOwnerPayout.findMany({ where: { tenantId, status: 'posted', payoutDate: { gte: from, lte: to }, ...(ownerId ? { ownerId } : {}) }, include: { owner: true, cashAccount: { select: { name: true } } }, orderBy: { payoutDate: 'asc' } }),
    ])
    const arrears = tenancies.map(tenancy => {
      const due = tenancy.charges.filter(charge => charge.dueDate < new Date())
      const overdueBalance = money(due.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0))
      return { tenancyId: tenancy.id, tenantName: tenancy.tenantName, phone: tenancy.phone, email: tenancy.email, ownerName: tenancy.unit.property.owner?.name || 'Own portfolio', propertyName: tenancy.unit.property.name, unitCode: tenancy.unit.unitCode, balance: money(tenancy.charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0)), overdueBalance, overduePeriods: due.length, persistentArrears: due.length >= 3 }
    }).filter(row => row.balance > 0).sort((a, b) => b.overdueBalance - a.overdueBalance)
    const outstanding = money(charges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.amountPaid), 0))
    res.json({ period: { from, to }, summary: { rentCharged: money(charges.reduce((sum, charge) => sum + charge.amount, 0)), collected: money(payments.reduce((sum, payment) => sum + payment.amount, 0)), ownerPayouts: money(payouts.reduce((sum, payout) => sum + payout.amount, 0)), periodOutstanding: outstanding, arrears: money(arrears.reduce((sum, row) => sum + row.overdueBalance, 0)), persistentArrearsCount: arrears.filter(row => row.persistentArrears).length, activeTenancies: tenancies.length }, arrears, collections: payments.map(payment => ({ date: payment.paymentDate, receiptNo: payment.receiptNo, tenantName: payment.tenancy.tenantName, property: payment.tenancy.unit.property.name, unit: payment.tenancy.unit.unitCode, owner: payment.tenancy.unit.property.owner?.name || 'Own portfolio', paymentMethod: payment.paymentMethod, amount: payment.amount })), ownerPayouts: payouts.map(payout => ({ date: payout.payoutDate, reference: payout.reference, owner: payout.owner.name, account: payout.cashAccount.name, amount: payout.amount })) })
  } catch (error) { console.error('Property reports failed:', error); res.status(500).json({ error: 'Could not generate property reports.' }) }
})

export async function runPropertyRentAutomation(now = new Date()) {
  const period = monthKey(now)
  const active = await prisma.propertyTenancy.findMany({ where: { status: 'active', tenant: { status: 'active' } }, select: { id: true, tenantId: true, tenantName: true, dueDay: true, rentAmount: true, currency: true, startDate: true, unit: { select: { unitCode: true, property: { select: { name: true, ownerId: true } } } } } })
  const enabledTenants = new Set()
  for (const tenantId of new Set(active.map(row => row.tenantId))) {
    const features = await getTenantFeatures(tenantId)
    if (PROPERTY_MANAGEMENT_FEATURES.some(feature => hasFeatureAccess(features, feature))) enabledTenants.add(tenantId)
  }
  await prisma.rentCharge.updateMany({ where: { dueDate: { lt: now }, status: { in: ['unpaid', 'partial'] }, tenantId: { in: [...enabledTenants] } }, data: { status: 'overdue' } })
  for (const tenancy of active.filter(row => enabledTenants.has(row.tenantId))) {
    const dueDate = dueDateFor(period, tenancy.dueDay)
    if (new Date(tenancy.startDate) <= dueDate) {
      await prisma.$transaction(async tx => {
        const charge = await tx.rentCharge.upsert({ where: { tenancyId_period: { tenancyId: tenancy.id, period } }, update: {}, create: { tenantId: tenancy.tenantId, tenancyId: tenancy.id, period, dueDate, amount: tenancy.rentAmount, description: `Rent for ${period}` } })
        const user = await tx.user.findFirst({ where: { tenantId: tenancy.tenantId, isActive: true }, select: { id: true } })
        if (!user) throw new Error(`Cannot post property rent charge for tenant ${tenancy.tenantId}: no active user is available for the system journal.`)
        const config = await ensurePropertyAccounting(tx, tenancy.tenantId)
        await postPropertyJournal(tx, { tenantId: tenancy.tenantId, userId: user.id, sourceType: 'PROPERTY_RENT_CHARGE', sourceId: charge.id, date: dueDate, reference: `RENT-${tenancy.id}-${period}`, description: `Rent charge for ${tenancy.tenantName}, ${tenancy.unit.property.name} / ${tenancy.unit.unitCode}`, lines: propertyRentChargeLines(config, { amount: charge.amount, managed: Boolean(tenancy.unit.property.ownerId), description: `Rent ${period}` }) })
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
      const prior = await tx.propertyRentPayment.findFirst({ where: { tenantId, idempotencyKey } })
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
      const [received, paid, config] = await Promise.all([
        tx.propertyRentPayment.aggregate({ where: { tenantId, status: 'posted', paymentType: 'rent', tenancy: { unit: { property: { ownerId: owner.id } } } }, _sum: { amount: true } }),
        tx.propertyOwnerPayout.aggregate({ where: { tenantId, ownerId: owner.id, status: 'posted' }, _sum: { amount: true } }),
        ensurePropertyAccounting(tx, tenantId),
      ])
      const available = money(Number(received._sum.amount || 0) - Number(paid._sum.amount || 0))
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

export default router
