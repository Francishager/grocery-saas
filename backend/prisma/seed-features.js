import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function seedFeatures() {
  console.log('🌱 Seeding features...')

  // Core Features
  const coreFeatures = [
    { name: 'pos', displayName: 'Point of Sale', category: 'core', description: 'Basic sales and receipt generation' },
    { name: 'inventory', displayName: 'Inventory Management', category: 'core', description: 'Product and stock management' },
    { name: 'customers', displayName: 'Customer Management', category: 'core', description: 'Customer profiles and history' },
    { name: 'reports', displayName: 'Basic Reports', category: 'core', description: 'Sales and inventory reports' },
  ]

  // Advanced Features
  const advancedFeatures = [
    { name: 'credit', displayName: 'Credit Sales', category: 'advanced', description: 'Sell on credit and track receivables' },
    { name: 'suppliers', displayName: 'Supplier Management', category: 'advanced', description: 'Manage suppliers and payables' },
    { name: 'expenses', displayName: 'Expense Tracking', category: 'advanced', description: 'Track business expenses' },
    { name: 'multi_branch', displayName: 'Multi-Branch', category: 'advanced', description: 'Manage multiple branches' },
    { name: 'advanced_reports', displayName: 'Advanced Analytics', category: 'advanced', description: 'Advanced business insights' },
    { name: 'cash_flow', displayName: 'Cash Flow Management', category: 'advanced', description: 'Track cash flow across accounts' },
  ]

  // Integration Features
  const integrationFeatures = [
    { name: 'sms', displayName: 'SMS Notifications', category: 'integration', description: 'Send SMS reminders and alerts' },
    { name: 'whatsapp', displayName: 'WhatsApp Integration', category: 'integration', description: 'Send notifications via WhatsApp' },
    { name: 'offline_mode', displayName: 'Offline Mode', category: 'integration', description: 'Work without internet connection' },
  ]

  const allFeatures = [...coreFeatures, ...advancedFeatures, ...integrationFeatures]

  for (const feature of allFeatures) {
    await prisma.feature.upsert({
      where: { name: feature.name },
      update: feature,
      create: feature,
    })
  }

  console.log(`✅ Created ${allFeatures.length} features`)
}

async function seedPlanFeatures() {
  console.log('🌱 Seeding plan features...')

  const plans = await prisma.plan.findMany()
  const features = await prisma.feature.findMany()

  for (const plan of plans) {
    // Determine features based on plan name
    let planFeatures = []

    switch (plan.slug) {
      case 'starter':
        planFeatures = ['pos', 'inventory', 'customers', 'reports']
        break
      case 'professional':
        planFeatures = ['pos', 'inventory', 'customers', 'reports', 'credit', 'suppliers', 'expenses', 'advanced_reports']
        break
      case 'enterprise':
        planFeatures = features.map(f => f.name) // All features
        break
    }

    // Create plan features
    for (const featureName of planFeatures) {
      const feature = features.find(f => f.name === featureName)
      if (feature) {
        await prisma.planFeature.upsert({
          where: {
            planId_featureId: {
              planId: plan.id,
              featureId: feature.id,
            },
          },
          update: { enabled: true },
          create: {
            planId: plan.id,
            featureId: feature.id,
            enabled: true,
          },
        })
      }
    }
  }

  console.log(`✅ Seeded features for ${plans.length} plans`)
}

async function seedUsageLimits() {
  console.log('🌱 Seeding usage limits...')

  const tenants = await prisma.tenant.findMany()

  for (const tenant of tenants) {
    // Get tenant's plan
    const plan = await prisma.plan.findUnique({
      where: { id: tenant.planId || '' },
    })

    let limits = {
      maxProducts: 100,
      maxUsers: 5,
      maxBranches: 1,
      maxCustomers: 100,
      maxSuppliers: 50,
    }

    // Adjust limits based on plan
    switch (plan?.slug) {
      case 'starter':
        limits = { maxProducts: 50, maxUsers: 2, maxBranches: 1, maxCustomers: 50, maxSuppliers: 20 }
        break
      case 'professional':
        limits = { maxProducts: 500, maxUsers: 20, maxBranches: 3, maxCustomers: 500, maxSuppliers: 100 }
        break
      case 'enterprise':
        limits = { maxProducts: 999999, maxUsers: 999999, maxBranches: 999999, maxCustomers: 999999, maxSuppliers: 999999 }
        break
    }

    await prisma.usageLimit.upsert({
      where: { tenantId: tenant.id },
      update: limits,
      create: {
        tenantId: tenant.id,
        ...limits,
      },
    })
  }

  console.log(`✅ Seeded usage limits for ${tenants.length} tenants`)
}

async function main() {
  console.log('🌱 Seeding features and plan configurations...')

  await seedFeatures()
  await seedPlanFeatures()
  await seedUsageLimits()

  console.log('🎉 Feature seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
