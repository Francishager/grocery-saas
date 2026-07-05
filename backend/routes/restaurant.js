import express from 'express'
import prisma from '../src/db.js'
import { authenticateToken, requirePermission } from '../middleware/auth.js'
import { requireFeature } from '../middleware/featureCheck.js'
import { handleBranchError, resolveBranchScope, scopedWhere } from '../src/utils/branchAccess.js'

const router = express.Router()

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
      include: { _count: { select: { orders: true, tips: true } } },
      orderBy: { name: 'asc' }
    })
    res.json(waiters)
  } catch (error) { handleBranchError(res, error) }
})

router.post('/waiters', authenticateToken, requirePermission('canCreateRestaurant'), requireFeature('restaurant.waiters'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req)
    const { name, phone, code } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'Waiter name is required' })
    const waiter = await prisma.waiter.create({
      data: { name, phone, code, tenantId: scope.tenantId, branchId: scope.branchId }
    })
    res.status(201).json(waiter)
  } catch (error) { handleBranchError(res, error) }
})

router.put('/waiters/:id', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.waiters'), async (req, res) => {
  try {
    const { name, phone, code, isActive } = req.body
    const waiter = await prisma.waiter.update({ where: { id: req.params.id }, data: { name, phone, code, isActive } })
    res.json(waiter)
  } catch (error) { handleBranchError(res, error) }
})

router.delete('/waiters/:id', authenticateToken, requirePermission('canDeleteRestaurant'), requireFeature('restaurant.waiters'), async (req, res) => {
  try {
    await prisma.waiter.delete({ where: { id: req.params.id } })
    res.json({ message: 'Waiter deleted' })
  } catch (error) { handleBranchError(res, error) }
})

// =====================================================
// ORDERS
// =====================================================
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
        waiter: true,
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
    const order = await prisma.restaurantOrder.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } }, table: true, waiter: true, tips: true, delivery: true, customer: true }
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

    // Generate order number
    const count = await prisma.restaurantOrder.count({ where: { tenantId: scope.tenantId } })
    const orderNo = `ORD-${String(count + 1).padStart(5, '0')}`

    // Calculate totals
    let subtotal = 0
    const orderItems = items.map(item => {
      const total = item.price * item.quantity - (item.discount || 0)
      subtotal += total
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount || 0,
        total,
        station: item.station || 'kitchen',
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
      include: { items: { include: { product: true } }, table: true, waiter: true }
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
router.put('/orders/:id/items/:itemId/status', authenticateToken, requirePermission('canEditRestaurant'), requireFeature('restaurant.kitchen'), async (req, res) => {
  try {
    const { status } = req.body
    const item = await prisma.restaurantOrderItem.update({
      where: { id: req.params.itemId },
      data: { status }
    })
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
    const order = await prisma.restaurantOrder.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } }, table: true }
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
    const sale = await prisma.sale.create({
      data: {
        receiptNo, tenantId: order.tenantId, branchId: order.branchId,
        userId: req.user.id,
        subtotal: order.subtotal,
        discount: finalDiscount,
        tax: 0,
        total,
        paymentMethod: paymentMethod || 'cash',
        status: 'completed',
        items: {
          create: order.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            discount: item.discount,
            total: item.total
          }))
        }
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
    const order = await prisma.restaurantOrder.findUnique({
      where: { id: req.params.id },
      include: { items: true }
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
          userId: req.user.id, subtotal, discount: 0, tax: 0, total,
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
      include: { items: { where: { station: 'kitchen', status: { in: ['pending', 'preparing', 'ready'] } }, include: { product: true } }, table: true },
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
      include: { items: { where: { station: 'bar', status: { in: ['pending', 'preparing', 'ready'] } }, include: { product: true } }, table: true },
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
    const where = scopedWhere(scope, ...(date ? { date: new Date(date) } : {}))
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
      where: scopedWhere(scope, ...(status ? { status } : {})),
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
      include: { waiter: true, order: true },
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
      prisma.restaurantOrder.count({ where: { ...where, status: { in: ['pending', 'preparing'] } } }),
      prisma.restaurantOrder.count({ where: { ...where, status: { in: ['pending', 'preparing'] } } }),
      prisma.restaurantOrder.findMany({ where: { ...where, status: 'completed', createdAt: { gte: today } }, include: { items: true } })
    ])

    const todaySales = completedToday.reduce((sum, o) => sum + o.total, 0)
    const avgBill = completedToday.length > 0 ? todaySales / completedToday.length : 0

    res.json({
      ordersToday, openTables, occupiedTables, kitchenOrders, barOrders,
      todaySales, avgBill, completedCount: completedToday.length
    })
  } catch (error) { handleBranchError(res, error) }
})

export default router
