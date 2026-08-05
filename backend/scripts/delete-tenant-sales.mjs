import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const targetTenantId = 'cms8rr22503iycxem8r0h3zuj'
const targetEmail = 'rezofamilyricestore@gmail.com'

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ id: targetTenantId }, { email: targetEmail }]
    },
    select: { id: true, email: true, name: true }
  })

  if (!tenant) {
    console.log('Tenant not found')
    return
  }

  if (tenant.id !== targetTenantId || tenant.email !== targetEmail) {
    console.log('Found a different tenant than requested')
    console.log(JSON.stringify(tenant, null, 2))
    return
  }

  const saleCountBefore = await prisma.sale.count({ where: { tenantId: tenant.id } })
  const saleRecordCountBefore = await prisma.saleRecord.count({ where: { tenantId: tenant.id } })
  const invoiceCountBefore = await prisma.invoice.count({ where: { tenantId: tenant.id } })
  const customerPaymentCountBefore = await prisma.customerPayment.count({ where: { tenantId: tenant.id } })
  const creditNoteCountBefore = await prisma.creditNote.count({ where: { tenantId: tenant.id } })

  console.log(`Deleting sales for tenant ${tenant.id} (${tenant.email})`)
  console.log(`Sales before: ${saleCountBefore}`)
  console.log(`Receivables sales before: ${saleRecordCountBefore}`)
  console.log(`Invoices before: ${invoiceCountBefore}`)
  console.log(`Customer payments before: ${customerPaymentCountBefore}`)
  console.log(`Credit notes before: ${creditNoteCountBefore}`)

  await prisma.saleItem.deleteMany({ where: { sale: { tenantId: tenant.id } } })
  await prisma.sale.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.saleRecordItem.deleteMany({ where: { sale: { tenantId: tenant.id } } })
  await prisma.saleRecord.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.invoice.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.customerPayment.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.creditNote.deleteMany({ where: { tenantId: tenant.id } })

  const saleCountAfter = await prisma.sale.count({ where: { tenantId: tenant.id } })
  const saleRecordCountAfter = await prisma.saleRecord.count({ where: { tenantId: tenant.id } })
  const invoiceCountAfter = await prisma.invoice.count({ where: { tenantId: tenant.id } })
  const customerPaymentCountAfter = await prisma.customerPayment.count({ where: { tenantId: tenant.id } })
  const creditNoteCountAfter = await prisma.creditNote.count({ where: { tenantId: tenant.id } })

  console.log(`Sales after: ${saleCountAfter}`)
  console.log(`Receivables sales after: ${saleRecordCountAfter}`)
  console.log(`Invoices after: ${invoiceCountAfter}`)
  console.log(`Customer payments after: ${customerPaymentCountAfter}`)
  console.log(`Credit notes after: ${creditNoteCountAfter}`)
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
