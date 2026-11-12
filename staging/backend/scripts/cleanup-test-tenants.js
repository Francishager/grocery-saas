const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const TARGET_NAME = 'Test Tenant - Uncategorized Import';

async function cleanup() {
  const matches = await prisma.tenant.findMany({
    where: { name: TARGET_NAME },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!matches.length) {
    console.log(`No tenants found with name: ${TARGET_NAME}`);
    return;
  }

  const ids = matches.map((tenant) => tenant.id);

  await prisma.userPermission.deleteMany({
    where: {
      user: {
        tenantId: { in: ids },
      },
    },
  });

  await prisma.user.deleteMany({
    where: { tenantId: { in: ids } },
  });

  await prisma.branch.deleteMany({
    where: { tenantId: { in: ids } },
  });

  const deleted = await prisma.tenant.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(`Deleted ${deleted.count} tenant(s) named ${TARGET_NAME}`);
}

cleanup()
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
