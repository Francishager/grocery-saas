ALTER TABLE "user_permissions"
  ADD COLUMN "canCreateProcurementOrder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canApproveProcurementOrder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canAcknowledgeProcurementOrder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canReceiveProcurementGoods" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canSubmitProcurementInvoice" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canReviewProcurementInvoice" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "procurement_purchase_orders" (
  "id" TEXT NOT NULL,
  "buyerTenantId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "poNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_approval',
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "branchId" TEXT,
  "deliveryAddress" TEXT,
  "terms" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "acknowledgedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "procurement_purchase_orders_quoteId_key" ON "procurement_purchase_orders"("quoteId");
CREATE UNIQUE INDEX "procurement_purchase_orders_buyerTenantId_poNumber_key" ON "procurement_purchase_orders"("buyerTenantId", "poNumber");
CREATE INDEX "procurement_purchase_orders_buyerTenantId_status_createdAt_idx" ON "procurement_purchase_orders"("buyerTenantId", "status", "createdAt");
CREATE INDEX "procurement_purchase_orders_sellerTenantId_status_createdAt_idx" ON "procurement_purchase_orders"("sellerTenantId", "status", "createdAt");

CREATE TABLE "procurement_purchase_order_lines" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "quoteLineId" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "orderedQuantity" DECIMAL(18,3) NOT NULL,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "taxRate" DECIMAL(7,4),
  "productId" TEXT,
  "receivedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_purchase_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_purchase_order_lines_order_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "procurement_purchase_order_lines_quantity_check" CHECK ("orderedQuantity" > 0 AND "receivedQuantity" >= 0 AND "receivedQuantity" <= "orderedQuantity"),
  CONSTRAINT "procurement_purchase_order_lines_price_check" CHECK ("unitPrice" >= 0)
);
CREATE UNIQUE INDEX "procurement_purchase_order_lines_quoteLineId_key" ON "procurement_purchase_order_lines"("quoteLineId");
CREATE INDEX "procurement_purchase_order_lines_orderId_idx" ON "procurement_purchase_order_lines"("orderId");

CREATE TABLE "procurement_goods_receipts" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "receiptNo" TEXT NOT NULL,
  "receivedById" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_goods_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_goods_receipts_order_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "procurement_goods_receipts_tenantId_receiptNo_key" ON "procurement_goods_receipts"("tenantId", "receiptNo");
CREATE INDEX "procurement_goods_receipts_orderId_receivedAt_idx" ON "procurement_goods_receipts"("orderId", "receivedAt");

CREATE TABLE "procurement_goods_receipt_lines" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  CONSTRAINT "procurement_goods_receipt_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_goods_receipt_lines_receipt_fkey" FOREIGN KEY ("receiptId") REFERENCES "procurement_goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "procurement_goods_receipt_lines_orderLine_fkey" FOREIGN KEY ("orderLineId") REFERENCES "procurement_purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "procurement_goods_receipt_lines_quantity_check" CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX "procurement_goods_receipt_lines_receiptId_orderLineId_key" ON "procurement_goods_receipt_lines"("receiptId", "orderLineId");

CREATE TABLE "procurement_invoices" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "buyerTenantId" TEXT NOT NULL,
  "sellerTenantId" TEXT NOT NULL,
  "invoiceNo" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "deliveryFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "documentUrl" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "submittedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "supplierPurchaseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_invoices_order_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "procurement_invoices_amounts_check" CHECK ("total" >= 0 AND "taxAmount" >= 0 AND "deliveryFee" >= 0)
);
CREATE UNIQUE INDEX "procurement_invoices_supplierPurchaseId_key" ON "procurement_invoices"("supplierPurchaseId");
CREATE UNIQUE INDEX "procurement_invoices_buyerTenantId_sellerTenantId_invoiceNo_key" ON "procurement_invoices"("buyerTenantId", "sellerTenantId", "invoiceNo");
CREATE INDEX "procurement_invoices_buyerTenantId_status_createdAt_idx" ON "procurement_invoices"("buyerTenantId", "status", "createdAt");
CREATE INDEX "procurement_invoices_sellerTenantId_status_createdAt_idx" ON "procurement_invoices"("sellerTenantId", "status", "createdAt");

CREATE TABLE "procurement_invoice_lines" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "taxRate" DECIMAL(7,4),
  CONSTRAINT "procurement_invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_invoice_lines_invoice_fkey" FOREIGN KEY ("invoiceId") REFERENCES "procurement_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "procurement_invoice_lines_orderLine_fkey" FOREIGN KEY ("orderLineId") REFERENCES "procurement_purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "procurement_invoice_lines_amounts_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0)
);
CREATE UNIQUE INDEX "procurement_invoice_lines_invoiceId_orderLineId_key" ON "procurement_invoice_lines"("invoiceId", "orderLineId");
