import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe('ALTER TABLE customers ADD COLUMN IF NOT EXISTS "walletEnabled" BOOLEAN NOT NULL DEFAULT FALSE')
  await prisma.$executeRawUnsafe('ALTER TABLE customers ADD COLUMN IF NOT EXISTS "openingBalanceType" TEXT NOT NULL DEFAULT \'debit\'')
  await prisma.$executeRawUnsafe(`UPDATE customers SET "openingBalanceType" = CASE WHEN "openingBalance" < 0 THEN 'credit' ELSE 'debit' END WHERE "openingBalanceType" = 'debit' AND "openingBalance" < 0`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS customer_wallets (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "customerId" TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    "branchId" TEXT REFERENCES branches(id) ON DELETE SET NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "migratedLegacyAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT REFERENCES users(id) ON DELETE SET NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS customer_wallet_transactions (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "branchId" TEXT REFERENCES branches(id) ON DELETE SET NULL,
    "walletId" TEXT NOT NULL REFERENCES customer_wallets(id) ON DELETE CASCADE,
    "userId" TEXT REFERENCES users(id) ON DELETE SET NULL,
    "paymentId" TEXT UNIQUE REFERENCES customer_payments(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    direction TEXT NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    reference TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "idempotencyKey" TEXT UNIQUE,
    "paymentMethod" TEXT,
    notes TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await prisma.$executeRawUnsafe('ALTER TABLE customer_withdrawals ADD COLUMN IF NOT EXISTS "walletId" TEXT')
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'customer_withdrawals_walletId_fkey'
        AND conrelid = 'customer_withdrawals'::regclass
    ) THEN
      ALTER TABLE customer_withdrawals
        ADD CONSTRAINT "customer_withdrawals_walletId_fkey"
        FOREIGN KEY ("walletId") REFERENCES customer_wallets(id) ON DELETE SET NULL;
    END IF;
  END $$`)
  await prisma.$executeRawUnsafe(`UPDATE customer_withdrawals AS withdrawal
    SET "walletId" = wallet_transaction."walletId"
    FROM customer_wallet_transactions AS wallet_transaction
    WHERE withdrawal."walletId" IS NULL
      AND wallet_transaction."sourceType" = 'withdrawal'
      AND wallet_transaction."sourceId" = withdrawal.id`)
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS customer_wallets_tenant_branch_active_idx ON customer_wallets ("tenantId", "branchId", "isActive")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS customer_wallet_transactions_wallet_created_idx ON customer_wallet_transactions ("tenantId", "walletId", "createdAt")')
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS customer_wallet_transactions_source_idx ON customer_wallet_transactions ("tenantId", "sourceType", "sourceId")')
  for (const permission of ['canViewCustomerWallet', 'canActivateCustomerWallet', 'canDepositCustomerWallet', 'canWithdrawCustomerWallet']) {
    await prisma.$executeRawUnsafe(`ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS "${permission}" BOOLEAN NOT NULL DEFAULT FALSE`)
  }
  await prisma.feature.upsert({
    where: { name: 'customers.wallet' },
    create: {
      name: 'customers.wallet', displayName: 'Customer Wallet',
      description: 'Customer deposits, wallet balances, withdrawals, receipts, and wallet-funded credit sales.',
      module: 'customers', category: 'advanced', isActive: true,
    },
    update: {
      displayName: 'Customer Wallet',
      description: 'Customer deposits, wallet balances, withdrawals, receipts, and wallet-funded credit sales.',
      module: 'customers', category: 'advanced', isActive: true,
    },
  })
  console.log('Customer Wallet tables, withdrawal linkage, activation flag, and permissions are ready.')
} catch (error) {
  console.error('Unable to prepare Customer Wallet schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
