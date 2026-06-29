import prisma from '../db.js'

/**
 * Get the effective usage limits for a tenant (from UsageLimit override or Plan defaults).
 * @param {string} tenantId
 * @returns {Promise<{maxUsers:number,maxProducts:number,maxBranches:number,maxCustomers:number,maxSuppliers:number}>}
 */
export async function getTenantLimits(tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { plan: true, usageLimit: true },
  })
  if (!tenant) return null

  return {
    maxUsers: tenant.usageLimit?.maxUsers ?? tenant.plan?.maxUsers ?? 5,
    maxProducts: tenant.usageLimit?.maxProducts ?? tenant.plan?.maxProducts ?? 100,
    maxBranches: tenant.usageLimit?.maxBranches ?? tenant.plan?.maxBranches ?? 3,
    maxCustomers: tenant.usageLimit?.maxCustomers ?? tenant.plan?.maxCustomers ?? 100,
    maxSuppliers: tenant.usageLimit?.maxSuppliers ?? tenant.plan?.maxSuppliers ?? 50,
  }
}

/**
 * Check if a tenant has reached its limit for a given resource type.
 * Throws { statusCode: 403, message } if limit reached.
 * @param {string} tenantId
 * @param {'users'|'products'|'branches'|'customers'|'suppliers'} resource
 */
export async function checkUsageLimit(tenantId, resource) {
  const limits = await getTenantLimits(tenantId)
  if (!limits) return

  const limit = limits[resource === 'users' ? 'maxUsers'
    : resource === 'products' ? 'maxProducts'
    : resource === 'branches' ? 'maxBranches'
    : resource === 'customers' ? 'maxCustomers'
    : resource === 'suppliers' ? 'maxSuppliers'
    : null]

  if (!limit || limit <= 0) return

  let count
  switch (resource) {
    case 'users':
      count = await prisma.user.count({ where: { tenantId, isActive: true } })
      break
    case 'products':
      count = await prisma.product.count({ where: { tenantId } })
      break
    case 'branches':
      count = await prisma.branch.count({ where: { tenantId } })
      break
    case 'customers':
      count = await prisma.customer.count({ where: { tenantId } })
      break
    case 'suppliers':
      count = await prisma.supplier.count({ where: { tenantId } })
      break
    default:
      return
  }

  if (count >= limit) {
    const err = new Error(`${resource.charAt(0).toUpperCase() + resource.slice(1)} limit reached (${count}/${limit}). Contact your SaaS admin to increase the limit.`)
    err.statusCode = 403
    err.code = 'LIMIT_REACHED'
    throw err
  }
}
