import 'dotenv/config'
import prisma from '../src/db.js'
import process from 'process'

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('Usage: node search-user-by-name.mjs --tenant <tenantId> --name <name>')
  process.exit(1)
}

let tenant = null
let name = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tenant') tenant = args[i+1]
  if (args[i] === '--name') name = args[i+1]
}

if (!tenant || !name) { console.error('Missing args'); process.exit(1) }

async function main() {
  const users = await prisma.user.findMany({ where: { tenantId: tenant, OR: [ { fname: { contains: name, mode: 'insensitive' } }, { lname: { contains: name, mode: 'insensitive' } }, { email: { contains: name, mode: 'insensitive' } } ] }, take: 50 })
  console.log(`Found ${users.length} user(s) matching '${name}' in tenant ${tenant}`)
  for (const u of users) console.log(JSON.stringify({ id: u.id, fname: u.fname, lname: u.lname, email: u.email, cashAccountId: u.cashAccountId }))
  await prisma.$disconnect()
}

main().catch((e)=>{ console.error(e); prisma.$disconnect() })
