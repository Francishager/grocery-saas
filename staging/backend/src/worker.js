import 'dotenv/config'
import prisma from './db.js'
import { startBackgroundJobs } from './backgroundJobs.js'

await prisma.$connect()
console.log('JibuSales background worker connected to PostgreSQL.')
const stopBackgroundJobs = startBackgroundJobs()

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Background worker received ${signal}; stopping.`)
  stopBackgroundJobs()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
