import express from 'express'
import prisma from '../src/db.js'
import { authenticateToken, requireAnyPermission, requirePermission } from '../middleware/auth.js'
import { getTenantFeatures, hasFeatureAccess, requireFeature } from '../middleware/featureCheck.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'
import { resolveEffectivePermissions } from '../src/utils/permissions.js'
import multer from 'multer'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { deleteCloudinaryAsset, safeCloudinaryId, uploadBufferToCloudinary } from '../src/utils/cloudinaryUpload.js'
import { getJwtSecret } from '../src/utils/jwtSecret.js'
import { createRateLimiter } from '../src/middleware/rateLimit.js'

const router = express.Router()
const HR_WAITER_LINK_PERMISSIONS = ['canViewHR', 'canCreateHREmployee', 'canEditHREmployee']
const waiterPinLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 6,
  keyGenerator: req => `${req.user?.id || 'unknown'}:${req.params.id || 'unknown'}:${req.ip || 'unknown'}`,
})
const menuImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    ? callback(null, true) : callback(new Error('UNSUPPORTED_MENU_IMAGE')),
})

function parseMenuImage(req, res, next) {
  menuImageUpload.single('image')(req, res, error => {
    if (!error) return next()
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Menu images must be 2 MB or smaller.'
      : error.message === 'UNSUPPORTED_MENU_IMAGE' ? 'Choose a JPEG, PNG, or WebP image.'
        : 'The menu image could not be accepted.'
    res.status(400).json({ error: message })
  })
}

function isSupportedMenuImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true
  return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
}

async function hasHrWaiterLinkPermission(req, features) {
  const permissionRecord = await prisma.userPermission.findUnique({ where: { userId: req.user.id } })
  const permissions = resolveEffectivePermissions(req.user, permissionRecord, [], features)
  return permissions.includes('*') || HR_WAITER_LINK_PERMISSIONS.some(permission => permissions.includes(permission))
}

async function findLinkableHrEmployee(req, scope, employeeId) {
  const features = await getTenantFeatures(scope.tenantId)
  if (!hasFeatureAccess(features, 'hr')) {
    const error = new Error('HR is not enabled for this business.')
    error.statusCode = 403
    throw error
  }
  if (!await hasHrWaiterLinkPermission(req, features)) {
    const error = new Error('You do not have permission to link an HR employee.')
    error.statusCode = 403
    throw error
  }
  const employee = await prisma.employee.findFirst({
    where: scopedWhere(scope, { id: employeeId, status: 'active' }),
    select: { id: true, firstName: true, middleName: true, lastName: true, phone: true, branchId: true },
  })
  if (!employee) {
    const error = new Error('Active HR employee not found in this business or branch.')
    error.statusCode = 404
    throw error
  }
  if (scope.branchId && employee.branchId && scope.branchId !== employee.branchId) {
    const error = new Error('The HR employee belongs to a different branch.')
    error.statusCode = 400
    throw error
  }
  return employee
}

function waiterDetailsFromEmployee(employee) {
  return {
    name: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' '),
    phone: employee.phone || null,
  }
}

// =====================================================
// TABLES
// =====================================================
router.get('/tables', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.tables'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const tables = await prisma.restaurantTable.findMany({
      where: scopedWhere(scope),
      include: { _count: { select: { orders: { where: { status: { in: ['pending', 'preparing', 'ready'] } } } } } },
      orderBy: { name: 'asc' }
    })
    res.json(tables)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/tables', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant.tables'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { name, capacity, area } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'Table name is required' })
    if (capacity !== undefined && capacity < 1) return res.status(400).json({ error: 'Capacity must be at least 1' })
    const table = await prisma.restaurantTable.create({
      data: { name, capacity: capacity || 4, area, tenantId: scope.tenantId, branchId: scope.branchId }
    })
    res.status(201).json(table)
  } catch (error) { handleBranchError(res, error) }
})

router.put('/tables/:id', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.tables'), async (req, res) => {
  try {
    const { name, capacity, area, status, isActive, mergedWith } = req.body
    const table = await prisma.restaurantTable.update({
      where: { id: req.params.id }, data: { name, capacity, area, status, isActive, mergedWith }
    })
    res.json(table)
  } catch (error) { handleBranchError(res, error) }
})

router.delete('/tables/:id', authenticateToken, requirePermission('canDeleteRestaurant'), requireFeature('restaurant.tables'), async (req, res) => {
  try {
    await prisma.restaurantTable.delete({ where: { id: req.params.id } })
    res.json({ message: 'Table deleted' })
  } catch (error) { handleBranchError(res, error) }
})

// Merge tables
router.post('/tables/merge', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.merge_tables'), async (req, res) => {
  try {
    const { tableIds, primaryTableId } = req.body
    await prisma.$transaction(
      tableIds.filter(id => id !== primaryTableId).map(id =>
        prisma.restaurantTable.update({ where: { id }, data: { mergedWith: primaryTableId, status: 'occupied' } })
      )
    )
    await prisma.restaurantTable.update({ where: { id: primaryTableId }, data: { status: 'occupied' } })
    res.json({ message: 'Tables merged' })
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// WAITERS
// =====================================================
router.get('/waiters', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.waiters'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const waiters = await prisma.waiter.findMany({
      where: scopedWhere(scope),
      select: { id: true, name: true, phone: true, code: true, isActive: true, branchId: true, employeeId: true, pinHash: true, _count: { select: { orders: true, tips: true } } },
      orderBy: { name: 'asc' }
    })
    res.json(waiters.map(({ pinHash, ...waiter }) => ({ ...waiter, hasPin: Boolean(pinHash) })))
  } catch (error) { handleBranchError(res, error) }
})

router.get('/waiters/hr-employees', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.waiters'), requireFeature('hr'), requireAnyPermission(HR_WAITER_LINK_PERMISSIONS), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const employees = await prisma.employee.findMany({
      where: scopedWhere(scope, { status: 'active' }),
      select: { id: true, firstName: true, middleName: true, lastName: true, phone: true, employeeNumber: true, branchId: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })
    res.json(employees)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/waiters', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant.waiters'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { name, phone, code, pin, employeeId } = req.body
    const employee = employeeId ? await findLinkableHrEmployee(req, scope, employeeId) : null
    const employeeDetails = employee ? waiterDetailsFromEmployee(employee) : null
    if (!(employeeDetails?.name || name?.trim())) return res.status(400).json({ error: 'Waiter name is required' })
    if (!/^\d{4,8}$/.test(String(pin || ''))) return res.status(400).json({ error: 'Set a PIN with 4 to 8 digits.' })
    const waiter = await prisma.waiter.create({
      data: { name: employeeDetails?.name || name, phone: employeeDetails ? employeeDetails.phone : phone, code, employeeId: employee?.id || null, pinHash: await bcrypt.hash(String(pin), 12), pinUpdatedAt: new Date(), tenantId: scope.tenantId, branchId: employee?.branchId || scope.branchId }
    })
    const { pinHash: _pinHash, pinUpdatedAt: _pinUpdatedAt, ...safeWaiter } = waiter
    res.status(201).json({ ...safeWaiter, hasPin: true })
  } catch (error) { handleBranchError(res, error) }
})

router.put('/waiters/:id', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.waiters'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const existing = await prisma.waiter.findFirst({ where: scopedWhere(scope, { id: req.params.id }) })
    if (!existing) return res.status(404).json({ error: 'Waiter not found.' })
    const { name, phone, code, isActive, pin, employeeId } = req.body
    if (pin !== undefined && pin !== '' && !/^\d{4,8}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must contain 4 to 8 digits.' })
    const employee = employeeId ? await findLinkableHrEmployee(req, scope, employeeId) : null
    const retainedEmployee = employeeId === undefined && existing.employeeId
      ? await prisma.employee.findFirst({ where: { id: existing.employeeId, tenantId: scope.tenantId }, select: { id: true, firstName: true, middleName: true, lastName: true, phone: true, branchId: true } })
      : null
    const linkedEmployee = employee || retainedEmployee
    const employeeDetails = linkedEmployee ? waiterDetailsFromEmployee(linkedEmployee) : null
    const waiter = await prisma.waiter.update({
      where: { id: existing.id },
      data: {
        name: employeeDetails?.name || name,
        phone: employeeDetails ? employeeDetails.phone : phone,
        code,
        isActive,
        ...(employeeId !== undefined ? { employeeId: employee?.id || null, ...(employee ? { branchId: employee.branchId || scope.branchId } : {}) } : {}),
        ...(pin ? { pinHash: await bcrypt.hash(String(pin), 12), pinUpdatedAt: new Date() } : {}),
      },
    })
    const { pinHash: _pinHash, pinUpdatedAt: _pinUpdatedAt, ...safeWaiter } = waiter
    res.json({ ...safeWaiter, hasPin: Boolean(waiter.pinHash) })
  } catch (error) { handleBranchError(res, error) }
})

router.post('/waiters/:id/verify-pin', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.waiters'), waiterPinLimiter, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const waiter = await prisma.waiter.findFirst({ where: scopedWhere(scope, { id: req.params.id, isActive: true }) })
    if (!waiter?.pinHash) return res.status(400).json({ error: 'This waiter needs a PIN set by a restaurant manager before they can be selected.' })
    const pin = String(req.body?.pin || '')
    const correct = /^\d{4,8}$/.test(pin) && await bcrypt.compare(pin, waiter.pinHash)
    if (!correct) return res.status(401).json({ error: 'Incorrect waiter PIN.' })
    const token = jwt.sign({
      typ: 'restaurant_waiter_session',
      tenantId: scope.tenantId,
      userId: req.user.id,
      waiterId: waiter.id,
      pinUpdatedAt: waiter.pinUpdatedAt.getTime(),
    }, getJwtSecret(), { expiresIn: '12h' })
    res.json({ token, expiresInSeconds: 43200, waiter: { id: waiter.id, name: waiter.name } })
  } catch (error) { handleBranchError(res, error) }
})

router.delete('/waiters/:id', authenticateToken, requirePermission('canDeleteRestaurant'), requireFeature('restaurant.waiters'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const waiter = await prisma.waiter.findFirst({ where: scopedWhere(scope, { id: req.params.id }), select: { id: true } })
    if (!waiter) return res.status(404).json({ error: 'Waiter not found.' })
    await prisma.waiter.delete({ where: { id: waiter.id } })
    res.json({ message: 'Waiter deleted' })
  } catch (error) { handleBranchError(res, error) }
})

// Menu images use the existing product record so all business views share one image URL.
router.post('/menu/:productId/image', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant'), parseMenuImage, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose an image to upload.' })
    if (!isSupportedMenuImage(req.file.buffer)) return res.status(400).json({ error: 'The selected file is not a valid JPEG, PNG, or WebP image.' })
    const scope = await resolveBranchScope(prisma, req)
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.productId }), select: { id: true, tenantId: true, imagePublicId: true } })
    if (!product) return res.status(404).json({ error: 'Menu item not found.' })
    const result = await uploadBufferToCloudinary(req.file.buffer, {
      resourceType: 'image',
      folder: `jibusales/restaurant-menu/${scope.tenantId}`,
      publicId: `${safeCloudinaryId(product.id)}-${Date.now()}`,
      transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
    })
    if (!result?.secure_url || !result?.public_id) return res.status(502).json({ error: 'Image storage did not return a usable image.' })
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { image: result.secure_url, imagePublicId: result.public_id },
      select: { id: true, image: true },
    })
    if (product.imagePublicId) deleteCloudinaryAsset(product.imagePublicId).catch(error => console.error('Old menu image cleanup failed:', error))
    res.json(updated)
  } catch (error) { handleBranchError(res, error) }
})

router.delete('/menu/:productId/image', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.productId }), select: { id: true, imagePublicId: true } })
    if (!product) return res.status(404).json({ error: 'Menu item not found.' })
    await prisma.product.update({ where: { id: product.id }, data: { image: null, imagePublicId: null } })
    if (product.imagePublicId) await deleteCloudinaryAsset(product.imagePublicId).catch(error => console.error('Menu image cleanup failed:', error))
    res.json({ message: 'Menu image removed.' })
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// ORDERS
// =====================================================
router.get('/menu', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const entries = await prisma.restaurantMenuEntry.findMany({
      where: scopedWhere(scope, { product: { isActive: true } }),
      include: { product: { include: { category: { select: { id: true, name: true } } } } },
      orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }, { createdAt: 'asc' }],
    })
    res.json(entries)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/menu', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const productId = String(req.body?.productId || '').trim()
    const category = String(req.body?.category || '').trim().slice(0, 80) || 'General'
    const description = String(req.body?.description || '').trim().slice(0, 500) || null
    const station = req.body?.station === 'bar' ? 'bar' : 'kitchen'
    const price = Number(req.body?.price)
    if (!productId) return res.status(400).json({ error: 'Choose an inventory item to add to the menu.' })
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Enter a valid non-negative menu price.' })
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: productId, isActive: true }), select: { id: true } })
    if (!product) return res.status(404).json({ error: 'Active inventory item not found in this business or branch.' })
    const entry = await prisma.restaurantMenuEntry.create({
      data: { tenantId: scope.tenantId, branchId: scope.branchId, productId, category, description, station, price },
      include: { product: { include: { category: { select: { id: true, name: true } } } } },
    })
    res.status(201).json(entry)
  } catch (error) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'This inventory item is already on the restaurant menu.' })
    handleBranchError(res, error)
  }
})

router.put('/menu/:id', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const current = await prisma.restaurantMenuEntry.findFirst({ where: scopedWhere(scope, { id: req.params.id }) })
    if (!current) return res.status(404).json({ error: 'Menu entry not found.' })
    const price = req.body?.price === undefined ? current.price : Number(req.body.price)
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Enter a valid non-negative menu price.' })
    const entry = await prisma.restaurantMenuEntry.update({
      where: { id: current.id },
      data: {
        price,
        category: req.body?.category === undefined ? current.category : String(req.body.category || '').trim().slice(0, 80) || 'General',
        description: req.body?.description === undefined ? current.description : String(req.body.description || '').trim().slice(0, 500) || null,
        station: req.body?.station === 'bar' ? 'bar' : req.body?.station === 'kitchen' ? 'kitchen' : current.station,
        isAvailable: typeof req.body?.isAvailable === 'boolean' ? req.body.isAvailable : current.isAvailable,
        sortOrder: Number.isInteger(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : current.sortOrder,
      },
      include: { product: { include: { category: { select: { id: true, name: true } } } } },
    })
    res.json(entry)
  } catch (error) { handleBranchError(res, error) }
})

router.delete('/menu/:id', authenticateToken, requirePermission('canDeleteRestaurant'), requireFeature('restaurant'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const current = await prisma.restaurantMenuEntry.findFirst({ where: scopedWhere(scope, { id: req.params.id }), select: { id: true } })
    if (!current) return res.status(404).json({ error: 'Menu entry not found.' })
    await prisma.restaurantMenuEntry.delete({ where: { id: current.id } })
    res.json({ message: 'Menu entry removed. Inventory and historical sales were not deleted.' })
  } catch (error) { handleBranchError(res, error) }
})

router.get('/orders', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.orders'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { status, tableId } = req.query
    const where = scopedWhere(scope, {
      ...(status ? { status } : {}),
      ...(tableId ? { tableId } : {})
    })
    const orders = await prisma.restaurantOrder.findMany({
      where,
      include: {
        items: { include: { product: true } },
        table: true,
        waiter: { select: { id: true, name: true, phone: true, code: true, isActive: true } },
        tips: true,
        delivery: true,
        customer: true,
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(orders)
  } catch (error) { handleBranchError(res, error) }
})

router.get('/orders/:id', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.orders'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const order = await prisma.restaurantOrder.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: { items: { include: { product: true } }, table: true, waiter: { select: { id: true, name: true, phone: true, code: true, isActive: true } }, user: { select: { fname: true, lname: true } }, tips: true, delivery: true, customer: true }
    })
    if (!order) return res.status(404).json({ message: 'Order not found' })
    res.json(order)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/orders', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant.orders'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { tableId, waiterId, customerId, orderType, items, specialInstructions } = req.body
    if (!orderType) return res.status(400).json({ error: 'Order type is required' })
    if (orderType === 'dine_in' && !tableId) return res.status(400).json({ error: 'Table is required for dine-in orders' })
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' })
    if (items.some(i => !i.productId || i.quantity < 1)) return res.status(400).json({ error: 'All items must have a product and quantity >= 1' })
    const menuProductIds = [...new Set(items.map(item => item.productId))]
    const menuEntries = await prisma.restaurantMenuEntry.findMany({
      where: scopedWhere(scope, { productId: { in: menuProductIds }, isAvailable: true, product: { isActive: true } }),
      select: { productId: true, price: true, station: true },
    })
    const menuByProductId = new Map(menuEntries.map(entry => [entry.productId, entry]))
    if (menuEntries.length !== menuProductIds.length) return res.status(400).json({ error: 'One or more selected items are unavailable or not on the restaurant menu.' })
    const waiterFeatureEnabled = hasFeatureAccess(req.tenantFeatures || new Set(), 'restaurant.waiters')
    if (waiterId) {
      if (!waiterFeatureEnabled) return res.status(403).json({ error: 'Waiter selection is not enabled for this business.' })
      const waiter = await prisma.waiter.findFirst({ where: scopedWhere(scope, { id: waiterId, isActive: true }) })
      if (!waiter) return res.status(400).json({ error: 'Choose an active server from this business and branch.' })
      if (!waiter.pinHash) return res.status(403).json({ error: 'This server needs a PIN set by a restaurant manager.' })
      let session
      try { session = jwt.verify(String(req.headers['x-restaurant-waiter-session'] || ''), getJwtSecret()) } catch { session = null }
      if (!session || session.typ !== 'restaurant_waiter_session' || session.tenantId !== scope.tenantId || session.userId !== req.user.id || session.waiterId !== waiter.id || session.pinUpdatedAt !== waiter.pinUpdatedAt.getTime()) {
        return res.status(403).json({ error: 'Confirm this server’s PIN again before taking an order.', code: 'WAITER_PIN_REQUIRED' })
      }
    } else if (waiterFeatureEnabled) {
      const activeWaiters = await prisma.waiter.count({ where: scopedWhere(scope, { isActive: true }) })
      if (activeWaiters > 0) return res.status(400).json({ error: 'Select a server and confirm their PIN before taking an order.', code: 'WAITER_PIN_REQUIRED' })
    }

    // Generate order number
    const count = await prisma.restaurantOrder.count({ where: { tenantId: scope.tenantId } })
    const orderNo = `ORD-${String(count + 1).padStart(5, '0')}`

    // Calculate totals
    let subtotal = 0
    const orderItems = items.map(item => {
      const menuEntry = menuByProductId.get(item.productId)
      const price = Number(menuEntry.price)
      const total = price * item.quantity - (item.discount || 0)
      subtotal += total
      return {
        productId: item.productId,
        quantity: item.quantity,
        price,
        discount: item.discount || 0,
        total,
        station: menuEntry.station,
        specialInstructions: item.specialInstructions,
      }
    })

    const order = await prisma.restaurantOrder.create({
      data: {
        orderNo, tenantId: scope.tenantId, branchId: scope.branchId,
        tableId, waiterId, customerId, userId: req.user.id,
        orderType: orderType || 'dine_in',
        status: 'pending',
        subtotal,
        total: subtotal,
        specialInstructions,
        items: { create: orderItems }
      },
      include: { items: { include: { product: true } }, table: true, waiter: { select: { id: true, name: true, phone: true, code: true, isActive: true } }, customer: true, user: { select: { fname: true, lname: true } } }
    })

    // Update table status
    if (tableId) {
      await prisma.restaurantTable.update({ where: { id: tableId }, data: { status: 'occupied' } })
    }

    res.status(201).json(order)
  } catch (error) { handleBranchError(res, error) }
})

// Update order status
router.put('/orders/:id/status', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.orders'), async (req, res) => {
  try {
    const { status } = req.body
    const order = await prisma.restaurantOrder.update({
      where: { id: req.params.id },
      data: { status },
      include: { items: true, table: true }
    })

    // Update table status when order completed/cancelled
    if (status === 'completed' || status === 'cancelled') {
      if (order.tableId) {
        const activeOrders = await prisma.restaurantOrder.count({
          where: { tableId: order.tableId, status: { in: ['pending', 'preparing', 'ready', 'served'] } }
        })
        if (activeOrders === 0) {
          await prisma.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'cleaning' } })
        }
      }
    }

    // Update item statuses
    if (status === 'preparing') {
      await prisma.restaurantOrderItem.updateMany({ where: { orderId: order.id, status: 'pending' }, data: { status: 'preparing' } })
    } else if (status === 'ready') {
      await prisma.restaurantOrderItem.updateMany({ where: { orderId: order.id, status: 'preparing' }, data: { status: 'ready' } })
    } else if (status === 'served') {
      await prisma.restaurantOrderItem.updateMany({ where: { orderId: order.id, status: 'ready' }, data: { status: 'served' } })
    }

    res.json(order)
  } catch (error) { handleBranchError(res, error) }
})

// Update individual item status (kitchen display)
router.put('/orders/:id/items/:itemId/status', authenticateToken, requirePermission('canEditRestaurant'), async (req, res) => {
  try {
    const { status } = req.body
    if (!['pending', 'preparing', 'ready', 'served'].includes(status)) {
      return res.status(400).json({ error: 'Invalid kitchen item status' })
    }
    const scope = await resolveBranchScope(prisma, req)
    const existing = await prisma.restaurantOrderItem.findFirst({
      where: { id: req.params.itemId, orderId: req.params.id, order: { tenantId: scope.tenantId } },
      select: { id: true, station: true },
    })
    if (!existing) return res.status(404).json({ error: 'Order item not found' })
    const features = await getTenantFeatures(scope.tenantId)
    const stationFeature = existing.station === 'bar' ? 'restaurant.bar' : 'restaurant.kitchen'
    if (!hasFeatureAccess(features, stationFeature)) {
      return res.status(403).json({ error: 'This service station is not enabled for this business' })
    }
    const item = await prisma.restaurantOrderItem.update({ where: { id: existing.id }, data: { status } })
    res.json(item)
  } catch (error) { handleBranchError(res, error) }
})

// Move order to different table
router.put('/orders/:id/move', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.orders'), async (req, res) => {
  try {
    const { tableId } = req.body
    const oldOrder = await prisma.restaurantOrder.findUnique({ where: { id: req.params.id } })
    const order = await prisma.restaurantOrder.update({
      where: { id: req.params.id }, data: { tableId }
    })
    // Free old table if no more active orders
    if (oldOrder?.tableId) {
      const active = await prisma.restaurantOrder.count({
        where: { tableId: oldOrder.tableId, status: { in: ['pending', 'preparing', 'ready', 'served'] } }
      })
      if (active === 0) await prisma.restaurantTable.update({ where: { id: oldOrder.tableId }, data: { status: 'available' } })
    }
    // Mark new table occupied
    if (tableId) await prisma.restaurantTable.update({ where: { id: tableId }, data: { status: 'occupied' } })
    res.json(order)
  } catch (error) { handleBranchError(res, error) }
})

// Complete order and create sale
router.post('/orders/:id/complete', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.orders'), async (req, res) => {
  try {
    const { paymentMethod, discount, tipAmount, tipWaiterId } = req.body
    const scope = await resolveBranchScope(prisma, req)
    const order = await prisma.restaurantOrder.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: { items: { include: { product: true } }, table: true, waiter: { select: { id: true, name: true, phone: true, code: true, isActive: true } }, customer: true }
    })
    if (!order) return res.status(404).json({ message: 'Order not found' })
    if (order.status === 'completed') return res.status(400).json({ message: 'Order already completed' })

    const finalDiscount = discount || 0
    const finalTip = tipAmount || 0
    const total = order.subtotal - finalDiscount + finalTip

    // Generate receipt number
    const saleCount = await prisma.sale.count({ where: { tenantId: order.tenantId } })
    const receiptNo = `RCP-${String(saleCount + 1).padStart(5, '0')}`

    // Create sale
    const saleItems = await Promise.all(order.items.map(async item => {
      const recipe = await prisma.recipe.findFirst({
        where: { productId: item.productId, tenantId: order.tenantId, isActive: true },
        include: { ingredients: { include: { product: { select: { cost: true } } } } },
      })
      const cost = recipe
        ? recipe.ingredients.reduce((sum, ingredient) => sum + Number(ingredient.product.cost || 0) * Number(ingredient.quantity || 0), 0)
        : Number(item.product.cost || 0)
      return { productId: item.productId, quantity: item.quantity, price: item.price, cost, discount: item.discount, total: item.total }
    }))
    const sale = await prisma.sale.create({
      data: {
        receiptNo, tenantId: order.tenantId, branchId: order.branchId,
        userId: req.user.id,
        servedBy: order.waiter?.name || [req.user.fname, req.user.lname].filter(Boolean).join(' ').trim() || req.user.email || 'Server not recorded',
        customerName: order.customer?.name || null,
        subtotal: order.subtotal,
        discount: finalDiscount,
        tax: 0,
        total,
        paymentMethod: paymentMethod || 'cash',
        status: 'completed',
        items: { create: saleItems }
      }
    })

    // Deduct inventory
    for (const item of order.items) {
      // Check if product has a recipe
      const recipe = await prisma.recipe.findFirst({ where: { productId: item.productId, tenantId: order.tenantId }, include: { ingredients: true } })
      if (recipe) {
        // Deduct recipe ingredients
        for (const ing of recipe.ingredients) {
          await prisma.product.update({
            where: { id: ing.productId },
            data: { quantity: { decrement: ing.quantity * item.quantity } }
          })
        }
      } else {
        // Deduct product directly
        await prisma.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } }
        })
      }
    }

    // Record tip
    if (finalTip > 0 && tipWaiterId) {
      await prisma.tip.create({
        data: { tenantId: order.tenantId, orderId: order.id, waiterId: tipWaiterId, userId: req.user.id, amount: finalTip, tipType: 'amount' }
      })
    }

    // Update order
    const updatedOrder = await prisma.restaurantOrder.update({
      where: { id: order.id },
      data: { status: 'completed', paymentStatus: 'paid', paymentMethod, discount: finalDiscount, tipAmount: finalTip, total, saleId: sale.id }
    })

    // Free table
    if (order.tableId) {
      await prisma.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'cleaning' } })
    }

    res.json({ order: updatedOrder, sale })
  } catch (error) { handleBranchError(res, error) }
})

// Split bill
router.post('/orders/:id/split', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.split_bills'), async (req, res) => {
  try {
    const { splits } = req.body // array of { itemIds: [], paymentMethod, tipAmount }
    const scope = await resolveBranchScope(prisma, req)
    const order = await prisma.restaurantOrder.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: { items: true, waiter: { select: { id: true, name: true, phone: true, code: true, isActive: true } }, customer: true }
    })
    if (!order) return res.status(404).json({ message: 'Order not found' })

    const sales = []
    for (const split of splits) {
      const splitItems = order.items.filter(i => split.itemIds.includes(i.id))
      const subtotal = splitItems.reduce((sum, i) => sum + i.total, 0)
      const tip = split.tipAmount || 0
      const total = subtotal + tip

      const saleCount = await prisma.sale.count({ where: { tenantId: order.tenantId } })
      const receiptNo = `RCP-${String(saleCount + 1).padStart(5, '0')}`

      const sale = await prisma.sale.create({
        data: {
          receiptNo, tenantId: order.tenantId, branchId: order.branchId,
          userId: req.user.id, servedBy: order.waiter?.name || [req.user.fname, req.user.lname].filter(Boolean).join(' ').trim() || req.user.email || 'Server not recorded', customerName: order.customer?.name || null, subtotal, discount: 0, tax: 0, total,
          paymentMethod: split.paymentMethod || 'cash', status: 'completed',
          items: { create: splitItems.map(i => ({ productId: i.productId, quantity: i.quantity, price: i.price, discount: i.discount, total: i.total })) }
        }
      })
      sales.push(sale)
    }

    await prisma.restaurantOrder.update({ where: { id: order.id }, data: { status: 'completed', paymentStatus: 'paid' } })
    if (order.tableId) await prisma.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'cleaning' } })

    res.json({ sales })
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// KITCHEN / BAR DISPLAY
// =====================================================
router.get('/kitchen/orders', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.kitchen'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const orders = await prisma.restaurantOrder.findMany({
      where: { ...scopedWhere(scope), status: { in: ['pending', 'preparing', 'ready'] } },
      include: { items: { where: { station: 'kitchen', status: { in: ['pending', 'preparing', 'ready'] } }, include: { product: true } }, table: true, waiter: { select: { id: true, name: true, phone: true, code: true, isActive: true } }, user: { select: { fname: true, lname: true } } },
      orderBy: { createdAt: 'asc' }
    })
    res.json(orders.filter(o => o.items.length > 0))
  } catch (error) { handleBranchError(res, error) }
})

router.get('/bar/orders', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.bar'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const orders = await prisma.restaurantOrder.findMany({
      where: { ...scopedWhere(scope), status: { in: ['pending', 'preparing', 'ready'] } },
      include: { items: { where: { station: 'bar', status: { in: ['pending', 'preparing', 'ready'] } }, include: { product: true } }, table: true, waiter: { select: { id: true, name: true, phone: true, code: true, isActive: true } }, user: { select: { fname: true, lname: true } } },
      orderBy: { createdAt: 'asc' }
    })
    res.json(orders.filter(o => o.items.length > 0))
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// RESERVATIONS
// =====================================================
router.get('/reservations', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.reservations'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { date } = req.query
    const where = scopedWhere(scope, date ? { date: new Date(date) } : {})
    const reservations = await prisma.reservation.findMany({
      where, include: { table: true, customer: true }, orderBy: { date: 'asc' }
    })
    res.json(reservations)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/reservations', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant.reservations'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { tableId, customerId, customerName, customerPhone, date, time, guests, specialRequests } = req.body
    if (!customerName || !customerName.trim()) return res.status(400).json({ error: 'Customer name is required' })
    if (!customerPhone || !customerPhone.trim()) return res.status(400).json({ error: 'Customer phone is required' })
    if (!date) return res.status(400).json({ error: 'Date is required' })
    if (!time) return res.status(400).json({ error: 'Time is required' })
    if (guests === undefined || guests < 1) return res.status(400).json({ error: 'Guests must be at least 1' })
    const reservation = await prisma.reservation.create({
      data: { tenantId: scope.tenantId, branchId: scope.branchId, tableId, customerId, customerName, customerPhone, date: new Date(date), time, guests, specialRequests }
    })
    if (tableId) await prisma.restaurantTable.update({ where: { id: tableId }, data: { status: 'reserved' } })
    res.status(201).json(reservation)
  } catch (error) { handleBranchError(res, error) }
})

router.put('/reservations/:id/status', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.reservations'), async (req, res) => {
  try {
    const { status } = req.body
    const reservation = await prisma.reservation.update({ where: { id: req.params.id }, data: { status } })
    if (status === 'checked_in' && reservation.tableId) {
      await prisma.restaurantTable.update({ where: { id: reservation.tableId }, data: { status: 'occupied' } })
    }
    if (status === 'completed' && reservation.tableId) {
      await prisma.restaurantTable.update({ where: { id: reservation.tableId }, data: { status: 'cleaning' } })
    }
    res.json(reservation)
  } catch (error) { handleBranchError(res, error) }
})

router.delete('/reservations/:id', authenticateToken, requirePermission('canDeleteRestaurant'), requireFeature('restaurant.reservations'), async (req, res) => {
  try {
    await prisma.reservation.delete({ where: { id: req.params.id } })
    res.json({ message: 'Reservation deleted' })
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// RECIPES (Bill of Materials)
// =====================================================
router.get('/recipes', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.recipes'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const recipes = await prisma.recipe.findMany({
      where: { tenantId: scope.tenantId },
      include: { product: true, ingredients: { include: { product: true } } }
    })
    res.json(recipes)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/recipes', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant.recipes'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { productId, name, yield: recipeYield, ingredients } = req.body
    if (!productId) return res.status(400).json({ error: 'Product is required' })
    if (!name || !name.trim()) return res.status(400).json({ error: 'Recipe name is required' })
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) return res.status(400).json({ error: 'At least one ingredient is required' })
    if (ingredients.some(i => !i.productId || i.quantity < 1)) return res.status(400).json({ error: 'All ingredients must have a product and quantity >= 1' })
    const recipe = await prisma.recipe.create({
      data: {
        tenantId: scope.tenantId, productId, name, yield: recipeYield,
        ingredients: { create: ingredients.map(i => ({ productId: i.productId, quantity: i.quantity, unit: i.unit, notes: i.notes })) }
      },
      include: { ingredients: { include: { product: true } } }
    })
    res.status(201).json(recipe)
  } catch (error) { handleBranchError(res, error) }
})

router.put('/recipes/:id', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.recipes'), async (req, res) => {
  try {
    const { name, yield: recipeYield, isActive, ingredients } = req.body
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: req.params.id } })
    const recipe = await prisma.recipe.update({
      where: { id: req.params.id },
      data: { name, yield: recipeYield, isActive, ingredients: { create: ingredients.map(i => ({ productId: i.productId, quantity: i.quantity, unit: i.unit, notes: i.notes })) } },
      include: { ingredients: { include: { product: true } } }
    })
    res.json(recipe)
  } catch (error) { handleBranchError(res, error) }
})

router.delete('/recipes/:id', authenticateToken, requirePermission('canDeleteRestaurant'), requireFeature('restaurant.recipes'), async (req, res) => {
  try {
    await prisma.recipe.delete({ where: { id: req.params.id } })
    res.json({ message: 'Recipe deleted' })
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// HAPPY HOUR
// =====================================================
router.get('/happy-hour', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.happy_hour'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const rules = await prisma.happyHourRule.findMany({ where: { tenantId: scope.tenantId }, include: { product: true } })
    res.json(rules)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/happy-hour', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant.happy_hour'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { name, productId, startTime, endTime, daysOfWeek, discountType, discountValue } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'Rule name is required' })
    if (!productId) return res.status(400).json({ error: 'Product is required' })
    if (!startTime || !endTime) return res.status(400).json({ error: 'Start and end times are required' })
    if (discountValue === undefined || discountValue <= 0) return res.status(400).json({ error: 'Discount value must be greater than 0' })
    const rule = await prisma.happyHourRule.create({
      data: { tenantId: scope.tenantId, branchId: scope.branchId, name, productId, startTime, endTime, daysOfWeek, discountType, discountValue }
    })
    res.status(201).json(rule)
  } catch (error) { handleBranchError(res, error) }
})

router.put('/happy-hour/:id', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.happy_hour'), async (req, res) => {
  try {
    const { name, productId, startTime, endTime, daysOfWeek, discountType, discountValue, isActive } = req.body
    const rule = await prisma.happyHourRule.update({
      where: { id: req.params.id }, data: { name, productId, startTime, endTime, daysOfWeek, discountType, discountValue, isActive }
    })
    res.json(rule)
  } catch (error) { handleBranchError(res, error) }
})

router.delete('/happy-hour/:id', authenticateToken, requirePermission('canDeleteRestaurant'), requireFeature('restaurant.happy_hour'), async (req, res) => {
  try {
    await prisma.happyHourRule.delete({ where: { id: req.params.id } })
    res.json({ message: 'Happy hour rule deleted' })
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// COMBO MEALS
// =====================================================
router.get('/combos', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.combos'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const combos = await prisma.comboMeal.findMany({
      where: { tenantId: scope.tenantId },
      include: { items: { include: { product: true } } }
    })
    res.json(combos)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/combos', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant.combos'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { name, description, price, items } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'Combo name is required' })
    if (price === undefined || price <= 0) return res.status(400).json({ error: 'Price must be greater than 0' })
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' })
    if (items.some(i => !i.productId || i.quantity < 1)) return res.status(400).json({ error: 'All items must have a product and quantity >= 1' })
    const combo = await prisma.comboMeal.create({
      data: { tenantId: scope.tenantId, branchId: scope.branchId, name, description, price, items: { create: items.map(i => ({ productId: i.productId, quantity: i.quantity })) } },
      include: { items: { include: { product: true } } }
    })
    res.status(201).json(combo)
  } catch (error) { handleBranchError(res, error) }
})

router.put('/combos/:id', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.combos'), async (req, res) => {
  try {
    const { name, description, price, isActive, items } = req.body
    await prisma.comboMealItem.deleteMany({ where: { comboMealId: req.params.id } })
    const combo = await prisma.comboMeal.update({
      where: { id: req.params.id },
      data: { name, description, price, isActive, items: { create: items.map(i => ({ productId: i.productId, quantity: i.quantity })) } },
      include: { items: { include: { product: true } } }
    })
    res.json(combo)
  } catch (error) { handleBranchError(res, error) }
})

router.delete('/combos/:id', authenticateToken, requirePermission('canDeleteRestaurant'), requireFeature('restaurant.combos'), async (req, res) => {
  try {
    await prisma.comboMeal.delete({ where: { id: req.params.id } })
    res.json({ message: 'Combo deleted' })
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// DELIVERY
// =====================================================
router.get('/deliveries', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.delivery'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { status } = req.query
    const deliveries = await prisma.delivery.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(scope.branchId ? { order: { is: { branchId: scope.branchId } } } : {}),
        ...(status ? { status } : {}),
      },
      include: { order: true, customer: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json(deliveries)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/deliveries', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant.delivery'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { orderId, customerId, customerName, customerPhone, address, riderName, riderPhone, deliveryFee, notes } = req.body
    if (!customerName || !customerName.trim()) return res.status(400).json({ error: 'Customer name is required' })
    if (!customerPhone || !customerPhone.trim()) return res.status(400).json({ error: 'Customer phone is required' })
    if (!address || !address.trim()) return res.status(400).json({ error: 'Delivery address is required' })
    const delivery = await prisma.delivery.create({
      data: { tenantId: scope.tenantId, orderId, customerId, customerName, customerPhone, address, riderName, riderPhone, deliveryFee, notes }
    })
    res.status(201).json(delivery)
  } catch (error) { handleBranchError(res, error) }
})

router.put('/deliveries/:id/status', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.delivery'), async (req, res) => {
  try {
    const { status } = req.body
    const delivery = await prisma.delivery.update({ where: { id: req.params.id }, data: { status } })
    res.json(delivery)
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// TIPS
// =====================================================
router.get('/tips', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant.tips'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const tips = await prisma.tip.findMany({
      where: { tenantId: scope.tenantId },
      include: { waiter: { select: { id: true, name: true } }, order: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json(tips)
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// DASHBOARD STATS
// =====================================================
router.get('/dashboard', authenticateToken, requirePermission('canViewRestaurant'), requireFeature('restaurant'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const where = scopedWhere(scope)

    const [ordersToday, openTables, occupiedTables, kitchenOrders, barOrders, completedToday] = await Promise.all([
      prisma.restaurantOrder.count({ where: { ...where, createdAt: { gte: today } } }),
      prisma.restaurantTable.count({ where: { ...where, status: 'available', isActive: true } }),
      prisma.restaurantTable.count({ where: { ...where, status: 'occupied', isActive: true } }),
      prisma.restaurantOrder.count({ where: { ...where, status: { in: ['pending', 'preparing'] }, items: { some: { status: { in: ['pending', 'preparing'] }, OR: [{ station: 'kitchen' }, { station: null }] } } } }),
      prisma.restaurantOrder.count({ where: { ...where, status: { in: ['pending', 'preparing'] }, items: { some: { station: 'bar', status: { in: ['pending', 'preparing'] } } } } }),
      prisma.restaurantOrder.findMany({ where: { ...where, status: 'completed', createdAt: { gte: today } }, include: { items: true } })
    ])

    const canViewSales = req.user.permissions?.includes('*') || req.user.permissions?.includes('canViewSale') || req.user.permissions?.includes('canViewReportSalesSummary')
    const todaySales = canViewSales ? completedToday.reduce((sum, o) => sum + o.total, 0) : null
    const avgBill = canViewSales && completedToday.length > 0 ? todaySales / completedToday.length : null

    res.json({
      ordersToday, openTables, occupiedTables, kitchenOrders, barOrders,
      todaySales, avgBill, completedCount: canViewSales ? completedToday.length : null
    })
  } catch (error) { handleBranchError(res, error) }
})

export default router
