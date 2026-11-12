import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const createTenantFixture = async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: `Test Tenant - Uncategorized Import ${suffix}`,
      slug: `tenant-${suffix}`,
      email: `tenant-${suffix}@example.com`,
    },
  });

  const branch = await prisma.branch.create({
    data: {
      name: 'Test Branch',
      tenantId: tenant.id,
    },
  });

  const user = await prisma.user.create({
    data: {
      email: `test-import-${Date.now()}@test.com`,
      password: 'hashed_password',
      tenantId: tenant.id,
      role: 'attendant',
      isActive: true,
    },
  });

  await prisma.userPermission.create({
    data: {
      userId: user.id,
      canImportInventory: true,
      canCreateProduct: true,
    },
  });

  return { tenant, branch, user };
};

const cleanupTenantFixture = async (tenantId) => {
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.category.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.userPermission.deleteMany({ where: { user: { tenantId } } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
};

test('should allow importing products without categories', async () => {
  const { tenant, branch } = await createTenantFixture();
  try {
    const importData = {
      rows: [
        {
          'Product Name': 'Uncategorized Product 1',
          'Selling Price': 100,
          'Cost Price': 50,
          'Stock Quantity': 10,
          'Item Type': 'product',
        },
        {
          'Product Name': 'Uncategorized Product 2',
          'Selling Price': 200,
          'Cost Price': 100,
          'Stock Quantity': 5,
          'Item Type': 'product',
          'Category': 'NonexistentCategory',
        },
      ],
      branchId: branch.id,
    };

    assert.equal(importData.rows.length, 2);
    assert.equal(importData.rows[0]['Category'], undefined);
    assert.equal(importData.rows[1]['Category'], 'NonexistentCategory');
  } finally {
    await cleanupTenantFixture(tenant.id);
  }
});

test('should mark imported products as uncategorized when category is missing', async () => {
  const { tenant } = await createTenantFixture();

  try {
    const products = await prisma.product.findMany({
      where: {
        tenantId: tenant.id,
        isUncategorized: true,
      },
    });

    assert.ok(Array.isArray(products));

    for (const product of products) {
      assert.equal(product.isUncategorized, true);
      assert.equal(product.categoryId, null);
    }
  } finally {
    await cleanupTenantFixture(tenant.id);
  }
});

test('should allow categorization of previously uncategorized products', async () => {
  const { tenant } = await createTenantFixture();

  try {
    const category = await prisma.category.create({
      data: {
        name: 'Test Category',
        slug: `test-category-${Date.now()}`,
        tenantId: tenant.id,
      },
    });

    const uncategorized = await prisma.product.findFirst({
      where: {
        tenantId: tenant.id,
        isUncategorized: true,
      },
    });

    if (uncategorized) {
      const updated = await prisma.product.update({
        where: { id: uncategorized.id },
        data: {
          categoryId: category.id,
          isUncategorized: false,
        },
      });

      assert.equal(updated.categoryId, category.id);
      assert.equal(updated.isUncategorized, false);
    }
  } finally {
    await cleanupTenantFixture(tenant.id);
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
