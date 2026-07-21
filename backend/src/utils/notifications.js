import prisma from '../db.js';
import { sendNotificationToUser } from '../services/fcm.js';

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
  const notif = await prismaClient.notification.create({
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
  // Also send FCM push to the user (if they have registered devices)
  if (userId) {
    sendNotificationToUser(userId, {
      title,
      body: message,
      data: { url: '/notifications', ...(metadata ? typeof metadata === 'object' ? metadata : { metadata: String(metadata) } : {}) },
    }).catch((err) => console.error('FCM push failed for notification:', err));
  }
  return notif;
}

export async function notifyOwnerOfSale({ prismaClient = prisma, tenantId, sale, user, productNames = [], branchName = null, itemDetails = [] }) {
  if (!tenantId) return null;
  const owner = await prismaClient.user.findFirst({
    where: { tenantId, role: 'owner' },
    select: { id: true },
  });
  if (!owner) return null;
  const currency = sale?.currency || 'UGX';
  let summary;
  if (itemDetails.length) {
    const itemLines = itemDetails.map(i => `${i.name} (${formatCurrency(i.price, currency)})`).join(', ');
    summary = `New sale: ${itemLines}.`;
  } else if (productNames.length) {
    summary = `New sale of ${productNames.join(', ')}.`;
  } else {
    summary = 'A new sale was recorded.';
  }
  const branchInfo = branchName ? ` Branch: ${branchName}.` : '';
  return createTenantNotification({
    prismaClient,
    tenantId,
    userId: owner.id,
    title: 'New sale recorded',
    message: `${summary} Total ${formatCurrency(sale?.total || 0, currency)}.${branchInfo}`,
    type: 'success',
    metadata: { saleId: sale?.id, receiptNo: sale?.receiptNo, userId: user?.id, branchName, itemDetails },
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

export async function notifyOwnerOfExpiringProducts({ prismaClient = prisma, tenantId, products = [] }) {
  if (!tenantId || !products.length) return null;
  const owner = await prismaClient.user.findFirst({
    where: { tenantId, role: 'owner' },
    select: { id: true },
  });
  if (!owner) return null;
  const now = new Date();
  const twoMonthsFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const expiring = products.filter((p) => {
    if (!p.expiryDate) return false;
    const exp = new Date(p.expiryDate);
    return exp > now && exp <= twoMonthsFromNow;
  });
  if (!expiring.length) return null;
  const itemList = expiring.map(p => {
    const days = Math.floor((new Date(p.expiryDate) - now) / 86400000);
    return `${p.name} (${days} day${days === 1 ? '' : 's'} left, qty: ${p.quantity})`;
  }).join('; ');
  return createTenantNotification({
    prismaClient,
    tenantId,
    userId: owner.id,
    title: 'Products expiring soon',
    message: `${expiring.length} product${expiring.length === 1 ? '' : 's'} expiring within 2 months: ${itemList}.`,
    type: 'warning',
    metadata: { expiringCount: expiring.length, productIds: expiring.map(p => p.id) },
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
