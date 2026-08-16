import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TARGET = 'Test Tenant - Uncategorized Import';

async function main() {
  const matches = await prisma.tenant.findMany({
    where: {
      name: { contains: TARGET, mode: 'insensitive' },
    },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`MATCHES ${matches.length}`);
  if (matches.length) {
    console.log(JSON.stringify(matches, null, 2));
  }

  if (!matches.length) {
    await prisma.$disconnect();
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

  console.log(`DELETED_COUNT ${deleted.count}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
