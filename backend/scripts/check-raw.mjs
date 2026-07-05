import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
// Raw query to check actual columns
const result = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'user_permissions' ORDER BY ordinal_position`;
console.log('All columns in user_permissions:');
result.forEach(r => console.log(' ', r.column_name));
// Check one owner's actual data
const raw = await p.$queryRaw`SELECT "userId", "canViewFuelStation", "canViewFuelStationReport", "canViewDashboard", "canViewSalesReport" FROM user_permissions LIMIT 3`;
console.log('\nSample data:');
raw.forEach(r => console.log(r));
await p.$disconnect();
