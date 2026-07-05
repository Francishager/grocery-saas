import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const users = await p.user.findMany({ where: { role: 'owner' }, include: { permissions: true } });
users.forEach(x => {
  console.log(x.email, 'role:', x.role);
  const perm = x.permissions;
  if (perm) {
    console.log('  canViewFuelStation:', perm.canViewFuelStation);
    console.log('  canViewFuelStationReport:', perm.canViewFuelStationReport);
    console.log('  canViewSalesReport:', perm.canViewSalesReport);
    console.log('  canViewDashboard:', perm.canViewDashboard);
    console.log('  canViewService:', perm.canViewService);
    console.log('  canViewRental:', perm.canViewRental);
    console.log('  canViewRestaurant:', perm.canViewRestaurant);
  } else {
    console.log('  NO permissions record');
  }
});
await p.$disconnect();
