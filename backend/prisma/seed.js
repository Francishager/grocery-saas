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
  // DEFAULT CATEGORIES
  // =====================================================

  const categories = [
    { name: "Electrical Supplies", slug: "electrical-supplies" },
    { name: "Electric Cables & Wires", slug: "electric-cables-wires" },
    { name: "Switches & Sockets", slug: "switches-sockets" },
    { name: "Circuit Breakers", slug: "circuit-breakers" },
    { name: "Lighting & Bulbs", slug: "lighting-bulbs" },
    { name: "Mobile Accessories", slug: "mobile-accessories" },
    { name: "Phone Chargers", slug: "phone-chargers" },
    { name: "Power Banks", slug: "power-banks" },
    { name: "Earphones & Headsets", slug: "earphones-headsets" },
    { name: "Phone Cases", slug: "phone-cases" },
    { name: "Screen Protectors", slug: "screen-protectors" },
    { name: "Hardware Tools", slug: "hardware-tools" },
    { name: "Nails & Screws", slug: "nails-screws" },
    { name: "Plumbing Accessories", slug: "plumbing-accessories" },
    { name: "Building Hardware", slug: "building-hardware" },
    { name: "General Merchandise", slug: "general-merchandise" },
    { name: "Wholesale Goods", slug: "wholesale-goods" },
    { name: "Household Items", slug: "household-items" },
    { name: "Supermarket Essentials", slug: "supermarket-essentials" },
    { name: "Groceries", slug: "groceries" },
    { name: "Beverages", slug: "beverages" },
    { name: "Dairy Products", slug: "dairy-products" },
    { name: "Bakery", slug: "bakery" },
    { name: "Snacks", slug: "snacks" },
    { name: "Confectionery", slug: "confectionery" },
    { name: "Fruits", slug: "fruits" },
    { name: "Vegetables", slug: "vegetables" },
    { name: "Meat & Poultry", slug: "meat-poultry" },
    { name: "Frozen Foods", slug: "frozen-foods" },
    { name: "Electronics", slug: "electronics" },
    { name: "Mobile Phones", slug: "mobile-phones" },
    { name: "Phone Accessories", slug: "phone-accessories" },
    { name: "Computers", slug: "computers" },
    { name: "Printers", slug: "printers" },
    { name: "Stationery", slug: "stationery" },
    { name: "Books", slug: "books" },
    { name: "Office Supplies", slug: "office-supplies" },
    { name: "Hardware", slug: "hardware" },
    { name: "Building Materials", slug: "building-materials" },
    { name: "Paints", slug: "paints" },
    { name: "Plumbing", slug: "plumbing" },
    { name: "Electrical", slug: "electrical" },
    { name: "Cosmetics", slug: "cosmetics" },
    { name: "Beauty Products", slug: "beauty-products" },
    { name: "Personal Care", slug: "personal-care" },
    { name: "Salon Supplies", slug: "salon-supplies" },
    { name: "Pharmaceuticals", slug: "pharmaceuticals" },
    { name: "Medical Supplies", slug: "medical-supplies" },
    { name: "Baby Products", slug: "baby-products" },
    { name: "Clothing", slug: "clothing" },
    { name: "Shoes", slug: "shoes" },
    { name: "Bags", slug: "bags" },
    { name: "Fashion Accessories", slug: "fashion-accessories" },
    { name: "Jewelry", slug: "jewelry" },
    { name: "Home Appliances", slug: "home-appliances" },
    { name: "Kitchenware", slug: "kitchenware" },
    { name: "Furniture", slug: "furniture" },
    { name: "Bedding", slug: "bedding" },
    { name: "Cleaning Supplies", slug: "cleaning-supplies" },
    { name: "Laundry Products", slug: "laundry-products" },
    { name: "Pet Supplies", slug: "pet-supplies" },
    { name: "Agricultural Inputs", slug: "agricultural-inputs" },
    { name: "Seeds", slug: "seeds" },
    { name: "Animal Feeds", slug: "animal-feeds" },
    { name: "Restaurant Supplies", slug: "restaurant-supplies" },
    { name: "Liquor & Wines", slug: "liquor-wines" },
    { name: "Water", slug: "water" },
    { name: "Industrial Supplies", slug: "industrial-supplies" },
    { name: "Spare Parts", slug: "spare-parts" },
    { name: "Other", slug: "other" },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: category.slug,
        },
      },
      update: {},
      create: {
        name: category.name,
        slug: category.slug,
        tenantId: tenant.id,
      },
    });
  }

  console.log(`✅ Created ${categories.length} categories`);

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