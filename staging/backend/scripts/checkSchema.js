import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkSchema() {
  try {
    // Check if the new columns exist by trying to select them
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_permissions'
      ORDER BY ordinal_position
    `;
    console.log('UserPermission table columns:');
    console.table(result);
  } catch (error) {
    console.error('Error checking schema:', error);
  }
}

checkSchema()
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
