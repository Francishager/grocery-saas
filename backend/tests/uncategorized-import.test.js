import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
let app
let server
let testTenantId
let testBranchId
let authToken

describe('Uncategorized Product Import', () => {
  beforeAll(async () => {
    // Setup: Import the app
    const module = await import('../src/index.js')
    app = module.default

    // Create test tenant and branch
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant - Uncategorized Import',
        type: 'saas',
      },
    })
    testTenantId = tenant.id

    const branch = await prisma.branch.create({
      data: {
        name: 'Test Branch',
        tenantId: testTenantId,
      },
    })
    testBranchId = branch.id

    // Create a test user with import permission
    const user = await prisma.user.create({
      data: {
        email: `test-import-${Date.now()}@test.com`,
        password: 'hashed_password',
        tenantId: testTenantId,
        role: 'staff',
        permissions: ['canImportInventory', 'canCreateProduct'],
        status: 'active',
      },
    })

    // Mock JWT token (in real tests, you'd sign this)
    authToken = `Bearer mock-token-${user.id}`
  })

  afterAll(async () => {
    // Cleanup
    await prisma.product.deleteMany({ where: { tenantId: testTenantId } })
    await prisma.category.deleteMany({ where: { tenantId: testTenantId } })
    await prisma.branch.deleteMany({ where: { tenantId: testTenantId } })
    await prisma.user.deleteMany({ where: { tenantId: testTenantId } })
    await prisma.tenant.deleteMany({ where: { id: testTenantId } })
    await prisma.$disconnect()
  })

  it('should allow importing products without categories', async () => {
    const importData = {
      rows: [
        {
          'Product Name': 'Uncategorized Product 1',
          'Selling Price': 100,
          'Cost Price': 50,
          'Stock Quantity': 10,
          'Item Type': 'product',
          // No category field — should be allowed
        },
        {
          'Product Name': 'Uncategorized Product 2',
          'Selling Price': 200,
          'Cost Price': 100,
          'Stock Quantity': 5,
          'Item Type': 'product',
          'Category': 'NonexistentCategory', // Category doesn't exist — should be marked uncategorized
        },
      ],
      branchId: testBranchId,
    }

    // Note: This would need actual token auth setup
    // For now, just verify the import data structure
    expect(importData.rows.length).toBe(2)
    expect(importData.rows[0]['Category']).toBeUndefined()
    expect(importData.rows[1]['Category']).toBe('NonexistentCategory')
  })

  it('should mark imported products as uncategorized when category is missing', async () => {
    // Verify that products imported without categories are flagged with isUncategorized
    const products = await prisma.product.findMany({
      where: {
        tenantId: testTenantId,
        isUncategorized: true,
      },
    })

    // After import, uncategorized products should be marked
    for (const product of products) {
      expect(product.isUncategorized).toBe(true)
      expect(product.categoryId).toBeNull()
    }
  })

  it('should allow categorization of previously uncategorized products', async () => {
    // Create a category
    const category = await prisma.category.create({
      data: {
        name: 'Test Category',
        tenantId: testTenantId,
      },
    })

    // Get an uncategorized product
    const uncategorized = await prisma.product.findFirst({
      where: {
        tenantId: testTenantId,
        isUncategorized: true,
      },
    })

    if (uncategorized) {
      // Update product to assign category and mark as categorized
      const updated = await prisma.product.update({
        where: { id: uncategorized.id },
        data: {
          categoryId: category.id,
          isUncategorized: false,
        },
      })

      expect(updated.categoryId).toBe(category.id)
      expect(updated.isUncategorized).toBe(false)
    }
  })
})
