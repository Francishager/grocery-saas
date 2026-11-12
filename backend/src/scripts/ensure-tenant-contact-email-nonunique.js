import prisma from '../db.js';

try {
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "Tenant_email_key"');
  console.log('Tenant contact email is no longer globally unique; owner login email remains unique.');
} catch (error) {
  console.error('Unable to relax tenant contact email uniqueness:', error.code || '', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
