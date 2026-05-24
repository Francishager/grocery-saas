import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, requirePlatformAdmin } from '../middleware/auth.js'

const router = express.Router()
const prisma = new PrismaClient()

// === FEATURE ACCESS CONTROL ===

// Get all features (for SaaS Admin)
router.get('/features', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { category } = req.query
    const where = category ? { category } : {}

    const features = await prisma.feature.findMany({
      where,
      orderBy: { category: 'asc', name: 'asc' }
    })

    res.json(features)
  } catch (error) {
    console.error('Get features error:', error)
    res.status(500).json({ error: 'Failed to fetch features' })
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
        plan: {
          include: {
            planFeatures: {
              include: {
                feature: true
              }
            }
          }
        },
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

    // Get all features
    const allFeatures = await prisma.feature.findMany({
      where: { isActive: true }
    })

    // Build feature access map
    const featureAccess = {}
    
    for (const feature of allFeatures) {
      // Check tenant override first
      const tenantFeature = tenant.features.find(tf => tf.featureId === feature.id)
      
      if (tenantFeature) {
        // Use tenant override
        featureAccess[feature.name] = {
          enabled: tenantFeature.enabled,
          source: 'override'
        }
      } else if (tenant.plan) {
        // Check plan features
        const planFeature = tenant.plan.planFeatures.find(pf => pf.featureId === feature.id)
        featureAccess[feature.name] = {
          enabled: planFeature ? planFeature.enabled : false,
          source: 'plan'
        }
      } else {
        // No plan, default to disabled
        featureAccess[feature.name] = {
          enabled: false,
          source: 'default'
        }
      }
    }

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

    res.json(plans)
  } catch (error) {
    console.error('Get plans error:', error)
    res.status(500).json({ error: 'Failed to fetch plans' })
  }
})

// Create new plan
router.post('/plans', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { name, slug, price, currency = 'USD', billingCycle = 'monthly', maxUsers = 5, maxProducts = 100, features = [] } = req.body

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
        features
      }
    })

    // Add features to plan
    if (features && features.length > 0) {
      for (const featureName of features) {
        const feature = await prisma.feature.findUnique({
          where: { name: featureName }
        })

        if (feature) {
          await prisma.planFeature.create({
            data: {
              planId: plan.id,
              featureId: feature.id,
              enabled: true
            }
          })
        }
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
    const { name, price, currency, billingCycle, maxUsers, maxProducts, features = [] } = req.body

    const plan = await prisma.plan.update({
      where: { id },
      data: {
        name,
        price,
        currency,
        billingCycle,
        maxUsers,
        maxProducts,
        features
      }
    })

    // Update plan features
    await prisma.planFeature.deleteMany({
      where: { planId: id }
    })

    for (const featureName of features) {
      const feature = await prisma.feature.findUnique({
        where: { name: featureName }
      })

      if (feature) {
        await prisma.planFeature.create({
          data: {
            planId: id,
            featureId: feature.id,
            enabled: true
          }
        })
      }
    }

    res.json(plan)
  } catch (error) {
    console.error('Update plan error:', error)
    res.status(500).json({ error: 'Failed to update plan' })
  }
})

// === TENANT MANAGEMENT ===

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

export default router
