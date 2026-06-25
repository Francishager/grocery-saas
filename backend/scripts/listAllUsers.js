import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function listAllUsers() {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: { in: ['manager', 'accountant', 'attendant', 'owner'] }
      },
      select: {
        id: true,
        email: true,
        role: true,
        fname: true,
        lname: true,
        permissions: {
          select: {
            canViewPayable: true,
            canCreatePayable: true,
            canEditPayable: true,
            canViewReceivable: true,
            canCreateReceivable: true,
            canEditReceivable: true,
            canViewExpense: true,
            canCreateExpense: true,
            canEditExpense: true,
          }
        }
      }
    });
    console.log('All users with permissions:');
    console.table(users);
  } catch (error) {
    console.error('Error listing users:', error);
  }
}

listAllUsers()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
