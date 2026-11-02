import prisma from '../db.js'

try {
  if (!await prisma.$queryRawUnsafe(`SELECT to_regclass('public.rentals')::text AS table_name`).then(rows => rows[0]?.table_name)) {
    console.log('Rental base table is not installed; rental runtime schema will be applied after its base migration.')
    process.exitCode = 0
  } else {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE rentals
        ADD COLUMN IF NOT EXISTS "customerName" TEXT,
        ADD COLUMN IF NOT EXISTS "customerPhone" TEXT,
        ADD COLUMN IF NOT EXISTS "bookingState" TEXT NOT NULL DEFAULT 'checked_out',
        ADD COLUMN IF NOT EXISTS "bookingPurpose" TEXT,
        ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT,
        ADD COLUMN IF NOT EXISTS "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "contractDraft" TEXT,
        ADD COLUMN IF NOT EXISTS "contractGeneratedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "depositPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "depositRefunded" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "isHistoricalRecord" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "historicalImportKey" TEXT,
        ADD COLUMN IF NOT EXISTS "historicalReference" TEXT,
        ADD COLUMN IF NOT EXISTS "isHistoricalReceivable" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "historicalReceivableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
    `)

    await prisma.$executeRawUnsafe(`
      ALTER TABLE rental_items
        ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS rental_charge_lines (
        "id" TEXT PRIMARY KEY,
        "rentalId" TEXT NOT NULL REFERENCES rentals("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "productId" TEXT REFERENCES products("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "lineType" TEXT NOT NULL DEFAULT 'service',
        "label" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'service',
        "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
        "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "stockConsumedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE rental_charge_lines
        ADD COLUMN IF NOT EXISTS "productId" TEXT,
        ADD COLUMN IF NOT EXISTS "lineType" TEXT NOT NULL DEFAULT 'service',
        ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'service',
        ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "stockConsumedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    `)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_charge_lines_rentalId_idx" ON rental_charge_lines("rentalId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_charge_lines_productId_idx" ON rental_charge_lines("productId")`)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS rental_payments (
        "id" TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL REFERENCES tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "rentalId" TEXT NOT NULL REFERENCES rentals("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "cashAccountId" TEXT REFERENCES cash_accounts("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "userId" TEXT NOT NULL REFERENCES users("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "kind" TEXT NOT NULL DEFAULT 'rental_payment',
        "receiptNo" TEXT NOT NULL,
        "idempotencyKey" TEXT NOT NULL,
        "amount" DOUBLE PRECISION NOT NULL,
        "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "paymentMethod" TEXT,
        "mobileProvider" TEXT,
        "phoneNumber" TEXT,
        "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "transactionRef" TEXT,
        "notes" TEXT,
        "status" TEXT NOT NULL DEFAULT 'posted',
        "voidReason" TEXT,
        "voidedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE rental_payments
        ADD COLUMN IF NOT EXISTS "cashAccountId" TEXT,
        ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'rental_payment',
        ADD COLUMN IF NOT EXISTS "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT,
        ADD COLUMN IF NOT EXISTS "mobileProvider" TEXT,
        ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT,
        ADD COLUMN IF NOT EXISTS "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "transactionRef" TEXT,
        ADD COLUMN IF NOT EXISTS "notes" TEXT,
        ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'posted',
        ADD COLUMN IF NOT EXISTS "voidReason" TEXT,
        ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    `)
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "rental_payments_tenantId_receiptNo_key" ON rental_payments("tenantId", "receiptNo")`)
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "rental_payments_tenantId_idempotencyKey_key" ON rental_payments("tenantId", "idempotencyKey")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_payments_rentalId_paymentDate_idx" ON rental_payments("rentalId", "paymentDate")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_payments_cashAccountId_paymentDate_idx" ON rental_payments("cashAccountId", "paymentDate")`)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS rental_accounting_configs (
        "id" TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL UNIQUE REFERENCES tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "receivableAccountId" TEXT NOT NULL REFERENCES accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "revenueAccountId" TEXT NOT NULL REFERENCES accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "deferredRevenueAccountId" TEXT NOT NULL REFERENCES accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "depositLiabilityAccountId" TEXT NOT NULL REFERENCES accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "taxPayableAccountId" TEXT NOT NULL REFERENCES accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "openingEquityAccountId" TEXT NOT NULL REFERENCES accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "inventoryAccountId" TEXT REFERENCES accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "costOfGoodsSoldAccountId" TEXT REFERENCES accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "salesRevenueAccountId" TEXT REFERENCES accounts("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "isEnabled" BOOLEAN NOT NULL DEFAULT true,
        "isSystemManaged" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "rentals_tenantId_historicalImportKey_key" ON rentals("tenantId", "historicalImportKey")`)
    console.log('Rental runtime tables and additive columns are ready.')
  }
} catch (error) {
  console.error('Unable to prepare rental runtime schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
