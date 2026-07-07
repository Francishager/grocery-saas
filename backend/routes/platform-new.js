import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requirePlatformAdmin } from '../middleware/auth.js'
import { invalidateFeatureCache } from '../middleware/featureCheck.js'

const router = express.Router()
const prisma = new PrismaClient()

// === FEATURE ACCESS CONTROL ===

// Platform stats
router.get('/stats', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const [tenants, users, plans, features] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.plan.count(),
      prisma.feature.count(),
    ])
    const activeTenants = await prisma.tenant.count({ where: { status: 'active' } })
    res.json({ tenants, activeTenants, users, plans, features })
  } catch (err) {
    console.error('Platform stats error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get all features (for SaaS Admin)
router.get('/features', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { category } = req.query
    const where = category ? { category } : {}

    const features = await prisma.feature.findMany({
      where,
      include: { _count: { select: { planFeatures: true, tenantFeatures: true } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    })

    res.json(features)
  } catch (error) {
    console.error('Get features error:', error)
    res.status(500).json({ error: 'Failed to fetch features' })
  }
})

// Create feature
router.post('/features', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { name, displayName, description, category, module: featureModule, isActive } = req.body
    if (!name || !displayName) {
      return res.status(400).json({ error: 'name and displayName are required' })
    }
    const feature = await prisma.feature.create({
      data: {
        name,
        displayName,
        description: description || null,
        category: category || 'core',
        module: featureModule || name.split('.')[0] || 'core',
        isActive: isActive !== false
      }
    })
    res.status(201).json({ message: 'Feature created', feature })
  } catch (err) {
    console.error('Create feature error:', err)
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Feature name already exists' })
    }
    res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
})

// Delete feature
router.delete('/features/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    await prisma.planFeature.deleteMany({ where: { featureId: req.params.id } })
    await prisma.tenantFeature.deleteMany({ where: { featureId: req.params.id } })
    await prisma.feature.delete({ where: { id: req.params.id } })
    res.json({ message: 'Feature deleted' })
  } catch (err) {
    console.error('Delete feature error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get tenant's accessible features
router.get('/tenant/:tenantId/features', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params

    // Get tenant with plan
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: true,
        features: {
          include: {
            feature: true
          }
        }
      }
    })

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' })
    }

    const [allFeatures, planFeatures] = await Promise.all([
      prisma.feature.findMany({ where: { isActive: true } }),
      tenant.planId
        ? prisma.planFeature.findMany({
            where: { planId: tenant.planId, enabled: true },
            include: { feature: true }
          })
        : Promise.resolve([])
    ])

    // Build feature access map
    const featureAccess = {}

    for (const feature of allFeatures) {
      featureAccess[feature.name] = { enabled: false, source: 'default' }
    }

    planFeatures.forEach((pf) => {
      if (pf.feature?.name) featureAccess[pf.feature.name] = { enabled: true, source: 'plan' }
    })

    tenant.features.forEach((tf) => {
      if (tf.feature?.name) featureAccess[tf.feature.name] = { enabled: tf.enabled, source: 'override' }
    })

    res.json({
      tenantId,
      planName: tenant.plan?.name || 'No Plan',
      features: featureAccess
    })
  } catch (error) {
    console.error('Get tenant features error:', error)
    res.status(500).json({ error: 'Failed to fetch tenant features' })
  }
})

// Update tenant feature override
router.post('/tenant/:tenantId/features/:featureName', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId, featureName } = req.params
    const { enabled } = req.body

    // Get feature
    const feature = await prisma.feature.findUnique({
      where: { name: featureName }
    })

    if (!feature) {
      return res.status(404).json({ error: 'Feature not found' })
    }

    // Update or create tenant feature override
    const tenantFeature = await prisma.tenantFeature.upsert({
      where: {
        tenantId_featureId: {
          tenantId,
          featureId: feature.id
        }
      },
      update: { enabled },
      create: {
        tenantId,
        featureId: feature.id,
        enabled
      }
    })

    res.json({
      message: `Feature ${featureName} ${enabled ? 'enabled' : 'disabled'} for tenant`,
      tenantFeature
    })
  } catch (error) {
    console.error('Update tenant feature error:', error)
    res.status(500).json({ error: 'Failed to update tenant feature' })
  }
})

// === PLAN MANAGEMENT ===

// Get all plans with features
router.get('/plans', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const plans = await prisma.plan.findMany({
      include: {
        planFeatures: {
          include: {
            feature: true
          }
        },
        tenants: {
          select: { id: true }
        }
      },
      orderBy: { price: 'asc' }
    })

    // Backfill: for any plan whose JSON features array has entries without PlanFeature rows, create them
    for (const plan of plans) {
      const existingNames = new Set(plan.planFeatures.map(pf => pf.feature?.name).filter(Boolean))
      const jsonFeatures = Array.isArray(plan.features) ? plan.features : []
      const missing = jsonFeatures.filter(name => !existingNames.has(name))
      if (missing.length > 0) {
        for (const featureName of missing) {
          let feature = await prisma.feature.findUnique({ where: { name: featureName } })
          if (!feature) {
            feature = await prisma.feature.create({
              data: {
                name: featureName,
                displayName: featureName.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
                category: featureName.split('.')[0] || 'core',
                module: featureName.split('.')[0] || 'core',
                isActive: true,
              }
            })
          }
          await prisma.planFeature.create({
            data: { planId: plan.id, featureId: feature.id, enabled: true }
          })
        }
        // Invalidate cache for tenants on this plan
        for (const t of plan.tenants) {
          invalidateFeatureCache(t.id)
        }
      }
    }

    // Re-fetch with updated planFeatures if any were backfilled
    const finalPlans = await prisma.plan.findMany({
      include: {
        planFeatures: { include: { feature: true } },
        tenants: { select: { id: true } },
        _count: { select: { tenants: true } }
      },
      orderBy: { price: 'asc' }
    })

    res.json(finalPlans)
  } catch (error) {
    console.error('Get plans error:', error)
    res.status(500).json({ error: 'Failed to fetch plans' })
  }
})

// Create new plan
router.post('/plans', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { name, slug, price, currency = 'USD', billingCycle = 'monthly', maxUsers = 5, maxProducts = 100, maxBranches = 3, maxCustomers = 100, maxSuppliers = 50, features = [] } = req.body

    if (!name || !name.trim()) return res.status(400).json({ error: 'Plan name is required' })
    if (!slug || !slug.trim()) return res.status(400).json({ error: 'Plan slug is required' })
    if (price === undefined || price === null || price < 0) return res.status(400).json({ error: 'Price is required and cannot be negative' })
    if (!currency || !currency.trim()) return res.status(400).json({ error: 'Currency is required' })
    if (!billingCycle || !billingCycle.trim()) return res.status(400).json({ error: 'Billing cycle is required' })
    if (maxUsers < 1) return res.status(400).json({ error: 'Max users must be at least 1' })
    if (maxProducts < 1) return res.status(400).json({ error: 'Max products must be at least 1' })
    if (maxBranches < 1) return res.status(400).json({ error: 'Max branches must be at least 1' })

    // Check if slug already exists
    const existingPlan = await prisma.plan.findUnique({
      where: { slug }
    })

    if (existingPlan) {
      return res.status(400).json({ error: 'Plan with this slug already exists' })
    }

    const plan = await prisma.plan.create({
      data: {
        name,
        slug,
        price,
        currency,
        billingCycle,
        maxUsers,
        maxProducts,
        maxBranches,
        maxCustomers,
        maxSuppliers,
        features
      }
    })

    // Add features to plan — auto-create Feature rows if they don't exist
    if (features && features.length > 0) {
      for (const featureName of features) {
        let feature = await prisma.feature.findUnique({
          where: { name: featureName }
        })

        if (!feature) {
          feature = await prisma.feature.create({
            data: {
              name: featureName,
              displayName: featureName.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
              category: featureName.split('.')[0] || 'core',
              module: featureName.split('.')[0] || 'core',
              isActive: true,
            }
          })
        }

        await prisma.planFeature.create({
          data: {
            planId: plan.id,
            featureId: feature.id,
            enabled: true
          }
        })
      }
    }

    res.status(201).json(plan)
  } catch (error) {
    console.error('Create plan error:', error)
    res.status(500).json({ error: 'Failed to create plan' })
  }
})

// Update plan
router.put('/plans/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, price, currency, billingCycle, maxUsers, maxProducts, maxBranches, maxCustomers, maxSuppliers, features = [] } = req.body

    const plan = await prisma.plan.update({
      where: { id },
      data: {
        name,
        price,
        currency,
        billingCycle,
        maxUsers,
        maxProducts,
        maxBranches,
        maxCustomers,
        maxSuppliers,
        features
      }
    })

    // Update plan features
    await prisma.planFeature.deleteMany({
      where: { planId: id }
    })

    for (const featureName of features) {
      let feature = await prisma.feature.findUnique({
        where: { name: featureName }
      })

      if (!feature) {
        feature = await prisma.feature.create({
          data: {
            name: featureName,
            displayName: featureName.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
            category: featureName.split('.')[0] || 'core',
            module: featureName.split('.')[0] || 'core',
            isActive: true,
          }
        })
      }

      await prisma.planFeature.create({
        data: {
          planId: id,
          featureId: feature.id,
          enabled: true
        }
      })
    }

    // Invalidate feature cache for all tenants on this plan
    const affectedTenants = await prisma.tenant.findMany({
      where: { planId: id },
      select: { id: true },
    })
    for (const t of affectedTenants) {
      invalidateFeatureCache(t.id)
    }

    res.json(plan)
  } catch (error) {
    console.error('Update plan error:', error)
    res.status(500).json({ error: 'Failed to update plan' })
  }
})

// Delete plan
router.delete('/plans/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    // Get all tenants on this plan before nullifying
    const affectedTenants = await prisma.tenant.findMany({
      where: { planId: req.params.id },
      select: { id: true },
    })

    // Nullify planId on all tenants that had this plan — they lose feature access
    // but their business data stays intact
    await prisma.tenant.updateMany({
      where: { planId: req.params.id },
      data: { planId: null },
    })
    await prisma.planFeature.deleteMany({ where: { planId: req.params.id } })
    await prisma.plan.delete({ where: { id: req.params.id } })

    // Invalidate feature cache for all affected tenants so they immediately lose access
    for (const t of affectedTenants) {
      invalidateFeatureCache(t.id)
    }

    res.json({ message: `Plan deleted — ${affectedTenants.length} tenant(s) unassigned and lost feature access` })
  } catch (err) {
    console.error('Delete plan error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get plan features (for toggling UI)
router.get('/plans/:planId/features', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const pfs = await prisma.planFeature.findMany({
      where: { planId: req.params.planId },
      include: { feature: true }
    })
    res.json(pfs)
  } catch (err) {
    console.error('Get plan features error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Override feature for tenant (by featureId)
router.post('/tenant-features', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId, featureId, enabled = true } = req.body
    if (!tenantId || !featureId) return res.status(400).json({ error: 'tenantId and featureId required' })
    const tf = await prisma.tenantFeature.upsert({
      where: { tenantId_featureId: { tenantId, featureId } },
      update: { enabled },
      create: { tenantId, featureId, enabled }
    })
    invalidateFeatureCache(tenantId)
    res.json({ message: 'Tenant feature override saved', tenantFeature: tf })
  } catch (err) {
    console.error('Override feature error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Seed dev data
router.post('/seed', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const bcrypt = (await import('bcryptjs')).default
    const plan = await prisma.plan.upsert({
      where: { name: 'Starter' },
      update: {},
      create: { name: 'Starter', slug: 'starter', price: 0, billingCycle: 'monthly', features: ['inventory', 'sales', 'reports'], maxUsers: 5, maxProducts: 100, isDefault: true },
    })
    const tenant = await prisma.tenant.create({ data: { name: 'Dev Business', slug: 'dev-business', email: 'dev@example.com', status: 'active', planId: plan.id } })
    const hashed = await bcrypt.hash('password123', 12)
    const user = await prisma.user.create({ data: { email: 'owner@dev.com', password: hashed, fname: 'Dev', lname: 'Owner', tenantId: tenant.id, role: 'owner' } })
    const products = await Promise.all([
      prisma.product.create({ data: { name: 'Rice (1kg)', sku: 'RICE-1', price: 3500, cost: 2800, quantity: 50, tenantId: tenant.id } }),
      prisma.product.create({ data: { name: 'Sugar (1kg)', sku: 'SUG-1', price: 4000, cost: 3200, quantity: 30, tenantId: tenant.id } }),
      prisma.product.create({ data: { name: 'Cooking Oil (1L)', sku: 'OIL-1', price: 6000, cost: 4800, quantity: 20, tenantId: tenant.id } }),
    ])
    res.status(201).json({ message: 'Seed data created', tenant, user: { email: 'owner@dev.com' }, products: products.length })
  } catch (err) {
    console.error('Seed error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// === TENANT MANAGEMENT ===

// Lightweight tenant list for dropdowns
router.get('/tenants/list', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, planId: true, plan: { select: { name: true } } },
      orderBy: { name: 'asc' }
    })
    res.json(tenants)
  } catch (error) {
    console.error('Get tenant list error:', error)
    res.status(500).json({ error: 'Failed to fetch tenant list' })
  }
})

// Get all tenants with usage stats
router.get('/tenants', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(status && { status })
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          plan: { select: { id: true, name: true, price: true } },
          usageLimit: true,
          _count: {
            select: {
              users: { where: { isActive: true } },
              customers: true,
              suppliers: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.tenant.count({ where })
    ])

    res.json({
      tenants: tenants.map(tenant => ({
        ...tenant,
        userCount: tenant._count.users,
        customerCount: tenant._count.customers,
        supplierCount: tenant._count.suppliers
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('Get tenants error:', error)
    res.status(500).json({ error: 'Failed to fetch tenants' })
  }
})

// Update tenant usage limits
router.put('/tenants/:tenantId/limits', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params
    const { maxProducts, maxUsers, maxBranches, maxCustomers, maxSuppliers } = req.body

    const usageLimit = await prisma.usageLimit.upsert({
      where: { tenantId },
      update: {
        maxProducts,
        maxUsers,
        maxBranches,
        maxCustomers,
        maxSuppliers
      },
      create: {
        tenantId,
        maxProducts,
        maxUsers,
        maxBranches,
        maxCustomers,
        maxSuppliers
      }
    })

    res.json({
      message: 'Usage limits updated successfully',
      usageLimit
    })
  } catch (error) {
    console.error('Update usage limits error:', error)
    res.status(500).json({ error: 'Failed to update usage limits' })
  }
})

// Suspend/activate tenant
router.put('/tenants/:tenantId/status', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params
    const { status } = req.body

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { status }
    })

    res.json({
      message: `Tenant ${status === 'suspended' ? 'suspended' : 'activated'} successfully`,
      tenant
    })
  } catch (error) {
    console.error('Update tenant status error:', error)
    res.status(500).json({ error: 'Failed to update tenant status' })
  }
})

// === USAGE ANALYTICS ===

// Get platform usage analytics
router.get('/analytics/usage', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const dateFilter = startDate && endDate ? {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    } : {}

    const [
      totalTenants,
      activeTenants,
      totalUsers,
      totalSales,
      totalRevenue,
      planDistribution
    ] = await Promise.all([
      // Total tenants
      prisma.tenant.count(),
      
      // Active tenants
      prisma.tenant.count({ where: { status: 'active' } }),
      
      // Total users
      prisma.user.count({ where: { isActive: true } }),
      
      // Total sales
      prisma.saleRecord.count({
        where: dateFilter
      }),
      
      // Total revenue (sum of sales)
      prisma.saleRecord.aggregate({
        where: dateFilter,
        _sum: { total: true }
      }),

      // Plan distribution
      prisma.tenant.groupBy({
        by: ['planId'],
        _count: true,
        where: { status: 'active' }
      })
    ])

    // Get plan names for distribution
    const planIds = planDistribution.map(p => p.planId).filter(Boolean)
    const plans = await prisma.plan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, name: true }
    })

    const planMap = plans.reduce((map, plan) => {
      map[plan.id] = plan.name
      return map
    }, {})

    const distribution = planDistribution.map(p => ({
      planId: p.planId,
      planName: planMap[p.planId] || 'Unknown',
      count: p._count
    }))

    res.json({
      overview: {
        totalTenants,
        activeTenants,
        totalUsers,
        totalSales,
        totalRevenue: totalRevenue._sum.total || 0
      },
      planDistribution: distribution
    })
  } catch (error) {
    console.error('Get usage analytics error:', error)
    res.status(500).json({ error: 'Failed to fetch usage analytics' })
  }
})

// === TENANT DETAIL (comprehensive) ===

// Get tenant detail with usage, features, users (with IPs), audit logs
router.get('/tenants/:tenantId/detail', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: true,
        owner: { select: { id: true, email: true, fname: true, lname: true, role: true, isActive: true, lastLogin: true, phone: true, createdAt: true } },
        usageLimit: true,
        users: {
          select: { id: true, email: true, fname: true, lname: true, role: true, isActive: true, lastLogin: true, phone: true, createdAt: true },
          orderBy: { createdAt: 'desc' }
        },
        branches: {
          select: { id: true, name: true, address: true, isActive: true, createdAt: true, updatedAt: true },
          orderBy: { createdAt: 'asc' }
        },
        _count: {
          select: {
            users: true,
            customers: true,
            suppliers: true,
            branches: true,
          }
        }
      }
    })

    if (!tenant) return res.status(404).json({ error: 'Tenant not found' })

    // Get product count separately (products relation is via Branch, not direct on Tenant in some schemas)
    const productCount = await prisma.product.count({ where: { tenantId } })
    const branchCount = await prisma.branch.count({ where: { tenantId } })

    // Get product count per branch
    const branchesWithCounts = await Promise.all(
      tenant.branches.map(async (b) => {
        const productCount = await prisma.product.count({ where: { branchId: b.id } })
        const userCount = await prisma.userBranch.count({ where: { branchId: b.id } })
        return { ...b, productCount, userCount }
      })
    )

    // Get enabled features
    const [allFeatures, planFeatures, tenantFeatureOverrides] = await Promise.all([
      prisma.feature.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      tenant.planId
        ? prisma.planFeature.findMany({ where: { planId: tenant.planId, enabled: true }, include: { feature: true } })
        : Promise.resolve([]),
      prisma.tenantFeature.findMany({ where: { tenantId }, include: { feature: true } })
    ])

    const featureAccess = {}
    for (const feature of allFeatures) {
      featureAccess[feature.name] = { enabled: false, source: 'default', displayName: feature.displayName, category: feature.category }
    }
    planFeatures.forEach((pf) => {
      if (pf.feature?.name) featureAccess[pf.feature.name] = { enabled: true, source: 'plan', displayName: pf.feature.displayName, category: pf.feature.category }
    })
    tenantFeatureOverrides.forEach((tf) => {
      if (tf.feature?.name) featureAccess[tf.feature.name] = { enabled: tf.enabled, source: 'override', displayName: tf.feature.displayName, category: tf.feature.category }
    })

    const enabledFeatures = Object.entries(featureAccess)
      .filter(([_, info]) => info.enabled)
      .map(([name, info]) => ({ name, ...info }))

    // Get recent audit logs with IPs (last 50)
    const auditLogs = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, userId: true, userEmail: true, action: true, model: true, recordId: true, ip: true, createdAt: true }
    })

    // Get unique IPs from audit logs
    const uniqueIPs = [...new Set(auditLogs.map(log => log.ip).filter(Boolean))]

    // Build usage stats
    const usage = {
      users: { count: tenant._count.users, limit: tenant.usageLimit?.maxUsers || tenant.plan?.maxUsers || 5 },
      products: { count: productCount, limit: tenant.usageLimit?.maxProducts || tenant.plan?.maxProducts || 100 },
      branches: { count: branchCount, limit: tenant.usageLimit?.maxBranches || 1 },
      customers: { count: tenant._count.customers, limit: tenant.usageLimit?.maxCustomers || 100 },
      suppliers: { count: tenant._count.suppliers, limit: tenant.usageLimit?.maxSuppliers || 50 },
    }

    // Calculate usage percentages
    Object.keys(usage).forEach(key => {
      const u = usage[key]
      u.percentage = u.limit > 0 ? Math.min(100, Math.round((u.count / u.limit) * 100)) : 0
    })

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        email: tenant.email,
        phone: tenant.phone,
        address: tenant.address,
        logo: tenant.logo,
        status: tenant.status,
        businessType: tenant.businessType,
        currency: tenant.currency,
        timezone: tenant.timezone,
        taxRate: tenant.taxRate,
        taxEnabled: tenant.taxEnabled,
        taxId: tenant.taxId,
        subscriptionStart: tenant.subscriptionStart,
        subscriptionEnd: tenant.subscriptionEnd,
        trialEndsAt: tenant.trialEndsAt,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        plan: tenant.plan,
        owner: tenant.owner,
        usageLimit: tenant.usageLimit,
        users: tenant.users,
        branches: branchesWithCounts,
        auditLogs,
        uniqueIPs,
        usage,
        enabledFeatures,
        allFeatures: featureAccess,
      }
    })
  } catch (error) {
    console.error('Get tenant detail error:', error)
    console.error('Stack:', error?.stack)
    console.error('Tenant ID:', req.params.tenantId)
    res.status(500).json({ error: 'Failed to fetch tenant detail', detail: error?.message })
  }
})

// Get tenant usage limits
router.get('/tenants/:tenantId/limits', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { usageLimit: true, plan: true }
    })
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' })

    res.json({
      usageLimit: tenant.usageLimit,
      planDefaults: {
        maxUsers: tenant.plan?.maxUsers || 5,
        maxProducts: tenant.plan?.maxProducts || 100,
      }
    })
  } catch (error) {
    console.error('Get usage limits error:', error)
    res.status(500).json({ error: 'Failed to fetch usage limits' })
  }
})

// Get tenant users with IPs from audit logs
router.get('/tenants/:tenantId/users', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params

    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, fname: true, lname: true, role: true, isActive: true, lastLogin: true, phone: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    })

    // Get IPs for each user from audit logs
    const userIds = users.map(u => u.id)
    const auditLogs = await prisma.auditLog.findMany({
      where: { userId: { in: userIds }, ip: { not: null } },
      select: { userId: true, ip: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      distinct: ['userId', 'ip']
    })

    // Build IP map: userId -> [{ ip, lastSeen }]
    const ipMap = {}
    auditLogs.forEach(log => {
      if (!ipMap[log.userId]) ipMap[log.userId] = []
      ipMap[log.userId].push({ ip: log.ip, lastSeen: log.createdAt })
    })

    res.json({
      users: users.map(u => ({
        ...u,
        name: `${u.fname || ''} ${u.lname || ''}`.trim() || u.email,
        ips: ipMap[u.id] || [],
      }))
    })
  } catch (error) {
    console.error('Get tenant users error:', error)
    res.status(500).json({ error: 'Failed to fetch tenant users' })
  }
})

// Get tenant audit logs with IPs
router.get('/tenants/:tenantId/audit', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params
    const { page = 1, limit = 50, action, model, search } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      tenantId,
      ...(action && { action }),
      ...(model && { model }),
      ...(search && {
        OR: [
          { userEmail: { contains: search, mode: 'insensitive' } },
          { action: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
          { ip: { contains: search, mode: 'insensitive' } },
        ]
      })
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.auditLog.count({ where })
    ])

    res.json({
      logs,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    })
  } catch (error) {
    console.error('Get tenant audit error:', error)
    res.status(500).json({ error: 'Failed to fetch audit logs' })
  }
})

// Update tenant info (name, email, phone, address, businessType, status)
router.put('/tenants/:tenantId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params
    const { name, email, phone, address, businessType, status, currency, timezone, taxRate, taxEnabled, taxId } = req.body

    if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Business name cannot be empty' })
    if (email !== undefined && !email.trim()) return res.status(400).json({ error: 'Business email cannot be empty' })
    if (currency !== undefined && !currency.trim()) return res.status(400).json({ error: 'Currency cannot be empty' })
    if (timezone !== undefined && !timezone.trim()) return res.status(400).json({ error: 'Timezone cannot be empty' })
    if (status !== undefined && !['active', 'suspended', 'trial', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status value' })

    const data = {}
    if (name !== undefined) data.name = name
    if (email !== undefined) data.email = email
    if (phone !== undefined) data.phone = phone
    if (address !== undefined) data.address = address
    if (businessType !== undefined) data.businessType = businessType
    if (status !== undefined) data.status = status
    if (currency !== undefined) data.currency = currency
    if (timezone !== undefined) data.timezone = timezone
    if (taxRate !== undefined) data.taxRate = taxRate
    if (taxEnabled !== undefined) data.taxEnabled = taxEnabled
    if (taxId !== undefined) data.taxId = taxId

    const tenant = await prisma.tenant.update({ where: { id: tenantId }, data })
    res.json({ message: 'Tenant updated', tenant })
  } catch (error) {
    console.error('Update tenant error:', error)
    res.status(500).json({ error: 'Failed to update tenant' })
  }
})

// Delete tenant
router.delete('/tenants/:tenantId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params

    // Check tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' })

    // Delete in transaction to cascade properly
    await prisma.$transaction([
      prisma.auditLog.deleteMany({ where: { tenantId } }),
      prisma.usageLimit.deleteMany({ where: { tenantId } }),
      prisma.tenantFeature.deleteMany({ where: { tenantId } }),
      prisma.tenant.delete({ where: { id: tenantId } }),
    ])

    res.json({ message: 'Tenant deleted successfully' })
  } catch (error) {
    console.error('Delete tenant error:', error)
    res.status(500).json({ error: 'Failed to delete tenant' })
  }
})

// === PLATFORM AUDIT LOGS ===

// Get all audit logs across all tenants (with filtering)
router.get('/audit', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, tenantId, action, model, search, startDate, endDate } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {
      ...(tenantId && { tenantId }),
      ...(action && { action }),
      ...(model && { model }),
      ...(search && {
        OR: [
          { userEmail: { contains: search, mode: 'insensitive' } },
          { action: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
          { ip: { contains: search, mode: 'insensitive' } },
        ]
      }),
      ...(startDate && endDate && {
        createdAt: { gte: new Date(startDate), lte: new Date(endDate) }
      })
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.auditLog.count({ where })
    ])

    // Get tenant names for the logs
    const tenantIds = [...new Set(logs.map(log => log.tenantId))]
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true }
    })
    const tenantMap = tenants.reduce((map, t) => { map[t.id] = t.name; return map }, {})

    res.json({
      logs: logs.map(log => ({ ...log, tenantName: tenantMap[log.tenantId] || 'Unknown' })),
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    })
  } catch (error) {
    console.error('Get platform audit logs error:', error)
    res.status(500).json({ error: 'Failed to fetch audit logs' })
  }
})

// === ENHANCED PLATFORM STATS ===

router.get('/stats/detailed', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      trialTenants,
      totalUsers,
      activeUsers,
      totalPlans,
      totalFeatures,
      totalSales,
      totalRevenue,
      pendingInvitations,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'active' } }),
      prisma.tenant.count({ where: { status: 'suspended' } }),
      prisma.tenant.count({ where: { status: 'trial' } }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.plan.count(),
      prisma.feature.count(),
      prisma.saleRecord.count(),
      prisma.saleRecord.aggregate({ _sum: { total: true } }),
      prisma.invitation.count({ where: { status: 'pending' } }),
    ])

    // Plan distribution
    const planDistribution = await prisma.tenant.groupBy({
      by: ['planId'],
      _count: true,
      where: { status: 'active' }
    })
    const planIds = planDistribution.map(p => p.planId).filter(Boolean)
    const plans = await prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true, price: true, currency: true } })
    const planMap = plans.reduce((map, p) => { map[p.id] = p; return map }, {})
    const distribution = planDistribution.map(p => ({
      planId: p.planId,
      planName: planMap[p.planId]?.name || 'No Plan',
      count: p._count,
      price: planMap[p.planId]?.price || 0,
      currency: planMap[p.planId]?.currency || 'UGX',
    }))

    // Monthly revenue (sum of plan prices for active tenants)
    const monthlyRevenue = distribution.reduce((sum, p) => {
      const price = p.price || 0
      const cycle = planMap[p.planId]?.billingCycle || 'monthly'
      const monthly = cycle === 'yearly' ? price / 12 : price
      return sum + (monthly * p.count)
    }, 0)

    // Expiring subscriptions (within 7 days)
    const sevenDaysFromNow = new Date()
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    const expiringSubscriptions = await prisma.tenant.count({
      where: {
        status: 'active',
        subscriptionEnd: { gte: new Date(), lte: sevenDaysFromNow }
      }
    })

    // Recent tenants
    const recentTenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { plan: { select: { name: true } }, _count: { select: { users: true } } }
    })

    // Recent audit activity
    const recentActivity = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, tenantId: true, userEmail: true, action: true, model: true, ip: true, createdAt: true }
    })

    res.json({
      overview: {
        totalTenants,
        activeTenants,
        suspendedTenants,
        trialTenants,
        totalUsers,
        activeUsers,
        totalPlans,
        totalFeatures,
        totalSales,
        totalRevenue: totalRevenue._sum.total || 0,
        pendingInvitations,
        monthlyRevenue: Math.round(monthlyRevenue),
        expiringSubscriptions,
      },
      planDistribution: distribution,
      recentTenants: recentTenants.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        planName: t.plan?.name || 'No Plan',
        userCount: t._count.users,
        createdAt: t.createdAt,
      })),
      recentActivity,
    })
  } catch (error) {
    console.error('Get detailed stats error:', error)
    res.status(500).json({ error: 'Failed to fetch detailed stats' })
  }
})

export default router
