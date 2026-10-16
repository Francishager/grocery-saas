import { Router } from 'express';
import prisma from '../src/db.js';
import { authenticateToken, requirePermission, requireTenant } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureCheck.js';

const router = Router();
const access = [authenticateToken, requireTenant, requireFeature('communication.team_messaging')];
const userFields = { id: true, fname: true, lname: true, role: true, avatar: true };

function displayName(user) {
  return [user?.fname, user?.lname].filter(Boolean).join(' ').trim() || 'Team member';
}

function conversationView(row, currentUserId, unreadCounts = new Map()) {
  const participant = row.participantOneId === currentUserId ? row.participantTwo : row.participantOne;
  const latest = row.messages?.[0] || null;
  return {
    id: row.id,
    participant: participant ? { ...participant, name: displayName(participant) } : null,
    latestMessage: latest,
    unreadCount: unreadCounts.get(row.id) || 0,
    updatedAt: row.updatedAt,
  };
}

router.use(...access);

router.get('/people', requirePermission('canViewTeamMessaging'), requirePermission('canSendTeamMessages'), async (req, res) => {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const people = await prisma.user.findMany({
    where: { tenantId, isActive: true, id: { not: req.user.id } },
    select: userFields,
    orderBy: [{ fname: 'asc' }, { lname: 'asc' }],
  });
  res.json({ people: people.map((person) => ({ ...person, name: displayName(person) })) });
});

router.get('/conversations', requirePermission('canViewTeamMessaging'), async (req, res) => {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const rows = await prisma.businessConversation.findMany({
    where: { tenantId, OR: [{ participantOneId: req.user.id }, { participantTwoId: req.user.id }] },
    include: {
      participantOne: { select: userFields },
      participantTwo: { select: userFields },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, senderId: true, recipientId: true, body: true, readAt: true, createdAt: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  const unreadRows = rows.length ? await prisma.businessMessage.groupBy({
    by: ['conversationId'],
    where: { tenantId, recipientId: req.user.id, readAt: null, conversationId: { in: rows.map(({ id }) => id) } },
    _count: { _all: true },
  }) : [];
  const unreadCounts = new Map(unreadRows.map((row) => [row.conversationId, row._count._all]));
  const unreadMessages = rows.length ? await prisma.businessMessage.findMany({
    where: { tenantId, recipientId: req.user.id, readAt: null, conversationId: { in: rows.map(({ id }) => id) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, conversationId: true, senderId: true, recipientId: true, body: true, readAt: true, createdAt: true },
  }) : [];
  const unreadLatest = new Map();
  for (const message of unreadMessages) if (!unreadLatest.has(message.conversationId)) unreadLatest.set(message.conversationId, message);
  res.json({ conversations: rows.map((row) => ({
    ...conversationView(row, req.user.id, unreadCounts),
    latestUnread: unreadLatest.get(row.id) || null,
  })) });
});

router.post('/conversations', requirePermission('canViewTeamMessaging'), requirePermission('canSendTeamMessages'), async (req, res) => {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const recipientId = String(req.body?.recipientId || '').trim();
  if (!recipientId || recipientId === req.user.id) return res.status(400).json({ error: 'Choose another active team member.' });
  const recipient = await prisma.user.findFirst({ where: { id: recipientId, tenantId, isActive: true }, select: userFields });
  if (!recipient) return res.status(404).json({ error: 'That team member is not available in this business.' });
  const [participantOneId, participantTwoId] = [req.user.id, recipientId].sort((a, b) => a.localeCompare(b));
  const conversation = await prisma.businessConversation.upsert({
    where: { tenantId_participantOneId_participantTwoId: { tenantId, participantOneId, participantTwoId } },
    create: { tenantId, participantOneId, participantTwoId },
    update: {},
  });
  res.status(200).json({ conversation: { id: conversation.id, participant: { ...recipient, name: displayName(recipient) }, updatedAt: conversation.updatedAt } });
});

router.get('/conversations/:id/messages', requirePermission('canViewTeamMessaging'), async (req, res) => {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const conversation = await prisma.businessConversation.findFirst({
    where: { id: req.params.id, tenantId, OR: [{ participantOneId: req.user.id }, { participantTwoId: req.user.id }] },
    select: { id: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  const messages = await prisma.businessMessage.findMany({
    where: { tenantId, conversationId: conversation.id },
    orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, senderId: true, recipientId: true, body: true, readAt: true, createdAt: true },
  });
  await prisma.businessMessage.updateMany({
    where: { tenantId, conversationId: conversation.id, recipientId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ messages: messages.reverse() });
});

router.post('/conversations/:id/messages', requirePermission('canViewTeamMessaging'), requirePermission('canSendTeamMessages'), async (req, res) => {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const body = String(req.body?.body || '').trim();
  if (!body || body.length > 4000) return res.status(400).json({ error: 'Write a message of 1 to 4,000 characters.' });
  const conversation = await prisma.businessConversation.findFirst({
    where: { id: req.params.id, tenantId, OR: [{ participantOneId: req.user.id }, { participantTwoId: req.user.id }] },
    select: { id: true, participantOneId: true, participantTwoId: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  const recipientId = conversation.participantOneId === req.user.id ? conversation.participantTwoId : conversation.participantOneId;
  const [message] = await prisma.$transaction([
    prisma.businessMessage.create({
      data: { tenantId, conversationId: conversation.id, senderId: req.user.id, recipientId, body },
      select: { id: true, senderId: true, recipientId: true, body: true, readAt: true, createdAt: true },
    }),
    prisma.businessConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
  ]);
  res.status(201).json({ message });
});

export default router;
