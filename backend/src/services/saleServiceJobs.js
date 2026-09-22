import { randomUUID } from 'node:crypto';

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
export const saleJobInclude = {
  technician: { select: { id: true, name: true } },
  sale: { select: { receiptNo: true, status: true, user: { select: { fname: true, lname: true } } } },
};
export function saleJobReportRow(card) {
  return { id: card.id, cardNo: card.cardNo, date: card.createdAt, receiptNo: card.saleReceiptNo || card.sale?.receiptNo || '',
    customer: card.customerName, product: card.soldProductName || '', service: card.serviceTitle,
    description: card.serviceDescription || '', source: card.serviceSource === 'included_service' ? 'Included free' : card.serviceSource === 'paid_service' ? 'Paid service' : 'Manual',
    quantity: card.serviceQuantity, cashier: [card.sale?.user?.fname, card.sale?.user?.lname].filter(Boolean).join(' '),
    technician: card.technician?.name || 'Unassigned', status: card.status, saleStatus: card.sale?.status || '',
    scheduledStart: card.scheduledStart, actualEnd: card.actualEnd, completionNotes: card.completionNotes || '', totalCost: card.totalCost,
  };
}
export const hasSaleServicePermission = (req, permission) => (req.user?.permissions || []).some(p => p === '*' || p === permission);

export function normalizeJobRequests(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) fail('Invalid service job selections');
  const ids = new Set();
  return value.map(job => {
    if (!job || typeof job.serviceProductId !== 'string' || ids.has(job.serviceProductId)) fail('Select each service only once per sale item');
    ids.add(job.serviceProductId);
    if (typeof job.technicianId !== 'string' || !job.technicianId) fail('Assign a technician for each selected service');
    if (typeof job.description !== 'string' || !job.description.trim() || job.description.length > 4000) fail('Enter service job details (up to 4000 characters)');
    if (!['low', 'normal', 'high', 'urgent'].includes(job.priority || 'normal')) fail('Invalid job priority');
    const scheduledStart = job.scheduledStart ? new Date(job.scheduledStart) : null;
    if (scheduledStart && !Number.isFinite(scheduledStart.getTime())) fail('Invalid service schedule');
    return { serviceProductId: job.serviceProductId, technicianId: job.technicianId, description: job.description.trim(), priority: job.priority || 'normal', scheduledStart };
  });
}

export async function saveProductServiceLinks(db, product, linkedItemIds) {
  if (linkedItemIds === undefined) return;
  if (!['product', 'service'].includes(product.itemType) || !Array.isArray(linkedItemIds) || linkedItemIds.some(id => typeof id !== 'string')) fail('Invalid included service/product selection');
  const ids = [...new Set(linkedItemIds)];
  const counterpartType = product.itemType === 'service' ? 'product' : 'service';
  const counterparts = await db.product.findMany({ where: { id: { in: ids }, tenantId: product.tenantId, isActive: true, itemType: counterpartType }, select: { id: true, branchId: true } });
  if (counterparts.length !== ids.length || counterparts.some(item => item.branchId && product.branchId && item.branchId !== product.branchId)) fail('Choose active products and services from this business and branch');
  const side = product.itemType === 'service' ? 'serviceProductId' : 'productId';
  await db.productServiceLink.deleteMany({ where: { tenantId: product.tenantId, [side]: product.id } });
  if (ids.length) await db.productServiceLink.createMany({ data: ids.map(id => ({ tenantId: product.tenantId, productId: side === 'productId' ? product.id : id, serviceProductId: side === 'serviceProductId' ? product.id : id })) });
}

export async function attachProductServiceLinks(db, tenantId, products) {
  if (!products.length) return products;
  const ids = products.map(p => p.id);
  const select = { id: true, name: true, description: true, branchId: true, isActive: true };
  const links = await db.productServiceLink.findMany({ where: { tenantId, OR: [{ productId: { in: ids } }, { serviceProductId: { in: ids } }] }, include: { product: { select }, serviceProduct: { select } } });
  return products.map(product => ({ ...product,
    includedServices: links.filter(link => link.productId === product.id && link.serviceProduct.isActive && (!link.serviceProduct.branchId || link.serviceProduct.branchId === product.branchId)).map(link => link.serviceProduct),
    includedInProducts: links.filter(link => link.serviceProductId === product.id && link.product.isActive && (!product.branchId || link.product.branchId === product.branchId)).map(link => link.product),
  }));
}

export async function prepareSaleServiceJobs(db, req, scope, items, customerName) {
  if (!items.some(item => item.jobRequests.length)) return;
  if (!hasSaleServicePermission(req, 'canCreateServiceJobCard')) fail('Permission required: create job cards', 403);
  if (typeof customerName !== 'string' || !customerName.trim() || customerName.length > 160) fail('Customer name is required for service job cards');
  const serviceIds = [...new Set(items.flatMap(item => item.jobRequests.map(job => job.serviceProductId)))];
  const technicianIds = [...new Set(items.flatMap(item => item.jobRequests.map(job => job.technicianId)))];
  const services = await db.product.findMany({ where: { tenantId: scope.tenantId, id: { in: serviceIds }, itemType: 'service', isActive: true, OR: [{ branchId: scope.branchId }, { branchId: null }] } });
  const technicians = await db.serviceTechnician.findMany({ where: { tenantId: scope.tenantId, id: { in: technicianIds }, isActive: true, OR: [{ branchId: scope.branchId }, { branchId: null }] } });
  const links = await db.productServiceLink.findMany({ where: { tenantId: scope.tenantId, productId: { in: items.map(item => item.productId) }, serviceProductId: { in: serviceIds } } });
  for (const item of items) {
    for (const job of item.jobRequests) {
      const service = services.find(s => s.id === job.serviceProductId);
      const technician = technicians.find(t => t.id === job.technicianId);
      if (!service || !technician) fail('The selected service or technician is unavailable in this branch');
      if (technician.userId !== req.user.id && !hasSaleServicePermission(req, 'canAssignServiceJobCard')) fail('Permission required: assign job cards to another technician', 403);
      const isPaidService = item.itemType === 'service' && item.productId === service.id;
      if (!isPaidService && !links.some(link => link.productId === item.productId && link.serviceProductId === service.id)) fail('This service is no longer included with the product. Refresh the product and try again.');
      job.serviceTitle = service.name;
      job.serviceSource = isPaidService ? 'paid_service' : 'included_service';
      job.technicianUserId = technician.userId;
    }
  }
}

export async function createSaleServiceJobs(tx, sale, items) {
  const cards = [];
  for (const item of items) {
    for (const job of item.jobRequests) {
      const card = await tx.serviceJobCard.create({ data: {
        tenantId: sale.tenantId, branchId: sale.branchId, saleId: sale.id, saleItemId: item.id,
        saleReceiptNo: sale.receiptNo, soldProductName: item.productName,
        cardNo: `JC-${randomUUID().slice(0, 13).toUpperCase()}`,
        productId: job.serviceProductId, technicianId: job.technicianId,
        createdByUserId: sale.userId, customerName: sale.customerName,
        serviceTitle: job.serviceTitle, serviceDescription: job.description,
        serviceSource: job.serviceSource, serviceQuantity: item.quantity,
        priority: job.priority, scheduledStart: job.scheduledStart, status: 'pending',
        laborCost: 0, partsCost: 0, totalCost: 0,
      }, include: { technician: { select: { id: true, name: true } } } });
      cards.push(card);
      for (const recipient of new Set([sale.userId, job.technicianUserId].filter(Boolean))) {
        await tx.notification.create({ data: {
          tenantId: sale.tenantId, userId: recipient, title: `Job card ${card.cardNo}`,
          message: `${card.customerName}: ${card.serviceTitle} (${sale.receiptNo}) - ${card.technician.name}`,
          type: 'info', metadata: { link: `/tenant/service/job-cards?jobCardId=${card.id}`, saleId: sale.id, jobCardId: card.id },
        } });
      }
    }
  }
  return cards;
}
