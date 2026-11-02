import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe('ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "theme" TEXT')
  console.log('User theme preference schema is ready.')
} catch (error) {
  console.error('Unable to prepare user theme preference schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
