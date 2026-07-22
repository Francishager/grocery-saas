-- Create enum types for rentals
CREATE TYPE "RentalPeriod" AS ENUM ('hourly', 'daily', 'weekly', 'weekend', 'monthly', 'custom');
CREATE TYPE "RentalStatus" AS ENUM ('active', 'returned', 'overdue', 'lost', 'cancelled');
CREATE TYPE "ItemCondition" AS ENUM ('good', 'fair', 'damaged');

-- CreateTable
CREATE TABLE "rentals" (
    "id" TEXT NOT NULL,
    "rentalNo" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT,
    "userId" TEXT NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnDate" TIMESTAMP(3) NOT NULL,
    "actualReturnDate" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositStatus" TEXT NOT NULL DEFAULT 'collected',
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paymentMethod" TEXT,
    "mobileProvider" TEXT,
    "phoneNumber" TEXT,
    "transactionId" TEXT,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "guarantorName" TEXT,
    "guarantorPhone" TEXT,
    "customerNin" TEXT,
    "status" "RentalStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_items" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitHirePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rentalPeriod" "RentalPeriod" NOT NULL DEFAULT 'daily',
    "periods" INTEGER NOT NULL DEFAULT 1,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conditionOut" "ItemCondition" NOT NULL DEFAULT 'good',
    "conditionReturn" "ItemCondition",
    "damageFee" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rentals_tenantId_branchId_idx" ON "rentals"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "rentals_customerId_idx" ON "rentals"("customerId");

-- CreateIndex
CREATE INDEX "rental_items_rentalId_idx" ON "rental_items"("rentalId");

-- CreateIndex
CREATE INDEX "rental_items_productId_idx" ON "rental_items"("productId");

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT;

-- AddForeignKey
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT;
