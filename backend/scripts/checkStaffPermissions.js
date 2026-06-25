import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkStaffPermissions() {
  console.log('Checking staff permissions...');

  const staff = await prisma.user.findMany({
    where: {
      role: { in: ['manager', 'accountant', 'attendant'] }
    },
    include: {
      permissions: true
    }
  });

  console.log(`Found ${staff.length} staff members\n`);

  for (const user of staff) {
    console.log(`User: ${user.email} (${user.role})`);
    console.log(`  ID: ${user.id}`);
    if (user.permissions) {
      console.log(`  canViewPayable: ${user.permissions.canViewPayable}`);
      console.log(`  canCreatePayable: ${user.permissions.canCreatePayable}`);
      console.log(`  canEditPayable: ${user.permissions.canEditPayable}`);
      console.log(`  canViewReceivable: ${user.permissions.canViewReceivable}`);
      console.log(`  canCreateReceivable: ${user.permissions.canCreateReceivable}`);
      console.log(`  canEditReceivable: ${user.permissions.canEditReceivable}`);
      console.log(`  canViewExpense: ${user.permissions.canViewExpense}`);
      console.log(`  canCreateExpense: ${user.permissions.canCreateExpense}`);
      console.log(`  canEditExpense: ${user.permissions.canEditExpense}`);
    } else {
      console.log(`  No UserPermission record found`);
    }
    console.log('');
  }
}

checkStaffPermissions()
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
