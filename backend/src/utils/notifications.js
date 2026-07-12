import prisma from '../db.js';

export function formatCurrency(value, currency = 'UGX') {
  const amount = Number(value || 0);
  return `${currency} ${amount.toLocaleString('en-US')}`;
}

export function buildDailySalesSummaryMessage(summary = {}) {
  const salesCount = Number(summary.salesCount || 0);
  const totalRevenue = Number(summary.totalRevenue || 0);
  const totalDiscount = Number(summary.totalDiscount || 0);
  const totalTax = Number(summary.totalTax || 0);
  const lowStockCount = Number(summary.lowStockCount || 0);
  const expiringSoonCount = Number(summary.expiringSoonCount || 0);
  const currency = summary.currency || 'UGX';
  const inventorySentence = lowStockCount || expiringSoonCount
    ? `Inventory watch: ${lowStockCount} low-stock item${lowStockCount === 1 ? '' : 's'} and ${expiringSoonCount} expiring soon.`
    : 'Inventory watch: no urgent stock issues today.';
  return `Today's sales summary: ${salesCount} sales, revenue ${formatCurrency(totalRevenue, currency)}, discount ${formatCurrency(totalDiscount, currency)}, tax ${formatCurrency(totalTax, currency)}. ${inventorySentence}`;
}

export async function createTenantNotification({ prismaClient = prisma, tenantId, userId = null, title, message, type = 'info', metadata = null, channel = 'in_app' }) {
  if (!tenantId || !title || !message) return null;
  return prismaClient.notification.create({
    data: {
      tenantId,
      userId,
      channel,
      title,
      message,
      type,
      metadata,
    },
  });
}

export async function notifyOwnerOfSale({ prismaClient = prisma, tenantId, sale, user, productNames = [] }) {
  if (!tenantId) return null;
  const owner = await prismaClient.user.findFirst({
    where: { tenantId, role: 'owner' },
    select: { id: true },
  });
  if (!owner) return null;
  const summary = productNames.length ? `New sale of ${productNames.join(', ')}.` : 'A new sale was recorded.';
  return createTenantNotification({
    prismaClient,
    tenantId,
    userId: owner.id,
    title: 'New sale recorded',
    message: `${summary} Total ${formatCurrency(sale?.total || 0, sale?.currency || 'UGX')}.`,
    type: 'success',
    metadata: { saleId: sale?.id, receiptNo: sale?.receiptNo, userId: user?.id },
  });
}

export async function notifyOwnerOfLowStock({ prismaClient = prisma, tenantId, product }) {
  if (!tenantId || !product) return null;
  const owner = await prismaClient.user.findFirst({
    where: { tenantId, role: 'owner' },
    select: { id: true },
  });
  if (!owner) return null;
  return createTenantNotification({
    prismaClient,
    tenantId,
    userId: owner.id,
    title: 'Low stock alert',
    message: `${product.name} is running low. Current stock: ${product.quantity} ${product.baseUnit || 'units'} (min: ${product.minStock || 0}).`,
    type: 'warning',
    metadata: { productId: product.id, quantity: product.quantity, minStock: product.minStock },
  });
}

export async function notifyOwnerOfDailySalesSummary({ prismaClient = prisma, tenantId, summary }) {
  if (!tenantId) return null;
  const owner = await prismaClient.user.findFirst({
    where: { tenantId, role: 'owner' },
    select: { id: true },
  });
  if (!owner) return null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const existing = await prismaClient.notification.findFirst({
    where: {
      tenantId,
      userId: owner.id,
      title: 'Daily sales summary',
      createdAt: {
        gte: new Date(`${todayKey}T00:00:00.000Z`),
        lt: new Date(`${todayKey}T23:59:59.999Z`),
      },
    },
    select: { id: true },
  });
  if (existing) return existing;
  return createTenantNotification({
    prismaClient,
    tenantId,
    userId: owner.id,
    title: 'Daily sales summary',
    message: buildDailySalesSummaryMessage(summary),
    type: 'info',
    metadata: { summary, generatedAt: new Date().toISOString(), day: todayKey },
  });
}
