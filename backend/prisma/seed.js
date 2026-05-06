import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create default plans
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { slug: 'starter' },
      update: {},
      create: {
        name: 'Starter',
        slug: 'starter',
        price: 0,
        currency: 'USD',
        billingCycle: 'monthly',
        features: ['Up to 5 users', 'Up to 100 products', 'Basic reports', 'Email support'],
        maxUsers: 5,
        maxProducts: 100,
        isDefault: true,
      },
    }),
    prisma.plan.upsert({
      where: { slug: 'professional' },
      update: {},
      create: {
        name: 'Professional',
        slug: 'professional',
        price: 29.99,
        currency: 'USD',
        billingCycle: 'monthly',
        features: ['Up to 20 users', 'Up to 500 products', 'Advanced reports', 'Priority support', 'API access'],
        maxUsers: 20,
        maxProducts: 500,
        isDefault: false,
      },
    }),
    prisma.plan.upsert({
      where: { slug: 'enterprise' },
      update: {},
      create: {
        name: 'Enterprise',
        slug: 'enterprise',
        price: 99.99,
        currency: 'USD',
        billingCycle: 'monthly',
        features: ['Unlimited users', 'Unlimited products', 'Custom reports', '24/7 support', 'API access', 'Custom integrations'],
        maxUsers: 999999,
        maxProducts: 999999,
        isDefault: false,
      },
    }),
  ])

  console.log(`✅ Created ${plans.length} plans`)

  // Create SaaS Admin user
  const hashedPassword = await bcrypt.hash('Admin123!', 10)
  
  const saasAdmin = await prisma.user.upsert({
    where: { email: 'admin@grocerysaas.com' },
    update: {},
    create: {
      email: 'admin@grocerysaas.com',
      password: hashedPassword,
      fname: 'Platform',
      lname: 'Admin',
      role: UserRole.saas_admin,
      isActive: true,
    },
  })

  console.log(`✅ Created SaaS Admin: ${saasAdmin.email}`)

  console.log('🎉 Seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
