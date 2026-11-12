import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const globalForPrisma = globalThis
const resolvedDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL

if (resolvedDatabaseUrl && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvedDatabaseUrl
}

function withConnectionLimit(databaseUrl) {
  if (!databaseUrl) return undefined

  const url = new URL(databaseUrl)
  const configuredLimit = Number.parseInt(process.env.PRISMA_CONNECTION_LIMIT || '5', 10)
  const connectionLimit = Number.isInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : 5

  url.searchParams.set('connection_limit', String(connectionLimit))
  return url.toString()
}

const runtimeDatabaseUrl = withConnectionLimit(resolvedDatabaseUrl)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    ...(runtimeDatabaseUrl ? { datasourceUrl: runtimeDatabaseUrl } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
