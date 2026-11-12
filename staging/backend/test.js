import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

console.log(typeof prisma.branch)
console.log(typeof prisma.userBranch)
console.log(typeof prisma.category)