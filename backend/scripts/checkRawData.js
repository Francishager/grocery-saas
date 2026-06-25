import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkRawData() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        "userId",
        "canViewPayable",
        "canCreatePayable",
        "canEditPayable",
        "canDeletePayable",
        "canViewReceivable",
        "canCreateReceivable",
        "canEditReceivable",
        "canDeleteReceivable",
        "canViewExpense",
        "canCreateExpense",
        "canEditExpense",
        "canDeleteExpense"
      FROM user_permissions
    `;
    console.log('Raw UserPermission data:');
    console.table(result);
  } catch (error) {
    console.error('Error checking raw data:', error);
  }
}

checkRawData()
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
