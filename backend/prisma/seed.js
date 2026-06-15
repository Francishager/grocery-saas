import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // =====================================================
  // CREATE PLANS
  // =====================================================
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

  // =====================================================
  // SaaS ADMIN
  // =====================================================
  const adminPassword = await bcrypt.hash('Admin123!', 10)

  const saasAdmin = await prisma.user.upsert({
    where: { email: 'admin@grocerysaas.com' },
    update: {},
    create: {
      email: 'admin@grocerysaas.com',
      password: adminPassword,
      fname: 'Platform',
      lname: 'Admin',
      role: UserRole.saas_admin,
      isActive: true,
    },
  })

  console.log(`✅ Created SaaS Admin: ${saasAdmin.email}`)

  // =====================================================
  // TENANT (FIXED - ONLY ONCE)
  // =====================================================
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'kyengo-mart' },
    update: {},
    create: {
      name: 'Kyengo Mart',
      slug: 'kyengo-mart',
      email: 'kyengo@tenant.local',
      plan: {
        connect: { id: plans[1].id }
      },
    },
  })

  console.log(`✅ Created Tenant: ${tenant.name}`)

  // =====================================================
  // OWNER USER
  // =====================================================
  const ownerPassword = await bcrypt.hash('Owner@2024!', 10)

  const owner = await prisma.user.upsert({
    where: { email: 'jibusales00@gmail.com' },
    update: {},
    create: {
      email: 'jibusales00@gmail.com',
      password: ownerPassword,
      fname: 'Moses',
      lname: 'Nsubuga',
      role: UserRole.owner,
      tenantId: tenant.id,
      isActive: true,
    },
  })

  console.log(`✅ Created Owner: ${owner.email}`)

  // =====================================================
  // LINK TENANT OWNER
  // =====================================================
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      ownerId: owner.id,
    },
  })

  // =====================================================
  // MAIN BRANCH
  // =====================================================
  const branch = await prisma.branch.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: 'Namulanda (Main)',
      },
    },
    update: {},
    create: {
      name: 'Namulanda (Main)',
      tenantId: tenant.id,
      address: 'Namulanda',
      isActive: true,
    },
  })

  console.log(`✅ Created Branch: ${branch.name}`)

  // =====================================================
  // LINK OWNER TO BRANCH
  // =====================================================
  await prisma.userBranch.upsert({
    where: {
      userId_branchId: {
        userId: owner.id,
        branchId: branch.id,
      },
    },
    update: {},
    create: {
      userId: owner.id,
      branchId: branch.id,
      isPrimary: true,
    },
  })

  console.log(`✅ Linked Owner to Branch`)

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