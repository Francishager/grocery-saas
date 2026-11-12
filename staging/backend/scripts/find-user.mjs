import 'dotenv/config'
import prisma from '../src/db.js'

const id = process.argv[2]
if (!id) {
  console.error('Usage: node find-user.mjs <userId>')
  process.exit(1)
}

async function main() {
  const u = await prisma.user.findUnique({ where: { id } })
  console.log(u ? JSON.stringify({ id: u.id, fname: u.fname, lname: u.lname, name: u.name, cashAccountId: u.cashAccountId }) : 'User not found')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); prisma.$disconnect() })
