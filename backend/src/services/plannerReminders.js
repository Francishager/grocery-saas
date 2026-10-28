import { createHash } from 'node:crypto';
import prisma from '../db.js';
import { isWebPushConfigured, sendNotificationToUser } from './webPush.js';

const PLANNER_TITLE = '__JIBUSALES_PLANNER_DATA__';

export async function deliverDuePlannerReminders({ prismaClient = prisma, sendPush = sendNotificationToUser, now = new Date() } = {}) {
  const notes = await prismaClient.stickyNote.findMany({
    where: { title: PLANNER_TITLE, userId: { not: null }, tenantId: { not: null } },
    select: { id: true, userId: true, tenantId: true, lines: true },
    take: 5000,
  });
  let delivered = 0;
  const nowIso = now.toISOString();

  for (const note of notes) {
    const items = Array.isArray(note.lines?.items) ? note.lines.items : [];
    let changed = false;
    for (const item of items) {
      const reminderAt = item?.reminderAt;
      if (item?.completed || typeof reminderAt !== 'string' || new Date(reminderAt).getTime() > now.getTime() ||
          !Number.isFinite(new Date(reminderAt).getTime()) || item.reminderDeliveredFor === reminderAt) continue;

      const digest = createHash('sha256').update(`${note.userId}:${item.id}:${reminderAt}`).digest('hex');
      const notificationId = `planner-reminder-${digest}`;
      try {
        await prismaClient.notification.create({ data: {
          id: notificationId,
          tenantId: note.tenantId,
          userId: note.userId,
          title: 'Planner reminder',
          message: String(item.title || 'A planner item is due').slice(0, 180),
          type: 'info',
          metadata: { link: '/tenant/planner', plannerEntryId: String(item.id || '').slice(0, 100) },
        } });
        if (isWebPushConfigured()) {
          await sendPush(note.userId, {
            title: 'Planner reminder',
            body: 'You have a scheduled Planner reminder. Open JibuSales to view it.',
            tag: notificationId,
            data: { link: '/tenant/planner', notificationId, type: 'info' },
          });
        }
        delivered += 1;
      } catch (error) {
        if (error?.code !== 'P2002') {
          console.error('Planner reminder delivery failed:', error?.code || error?.message || 'UNKNOWN_ERROR');
          continue;
        }
      }
      item.reminderDeliveredFor = reminderAt;
      changed = true;
    }
    if (changed) {
      await prismaClient.stickyNote.updateMany({ where: { id: note.id, userId: note.userId }, data: { lines: { ...note.lines, items } } });
    }
  }
  return { delivered };
}
