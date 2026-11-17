import { Router } from 'express';
import prisma from '../src/db.js';
import { authenticateToken, requirePermission, requireTenant } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureCheck.js';
import { deleteCloudinaryAsset, uploadBufferToCloudinary } from '../src/utils/cloudinaryUpload.js';
import { parseChatImage, validClientMessageId, verifiedChatImageMime } from '../src/utils/chatImageUpload.js';

const router = Router();
const access = [authenticateToken, requireTenant, requireFeature('communication.team_messaging')];
const userFields = { id: true, fname: true, lname: true, role: true, avatar: true };
const ONLINE_WINDOW_MS = 60_000;
const MESSAGE_REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏']);
const messageDetails = {
  id: true, conversationId: true, senderId: true, recipientId: true, body: true, imageUrl: true,
  deliveredAt: true, readAt: true, createdAt: true,
  replyToMessage: { select: { id: true, senderId: true, body: true } },
  reactions: { select: { id: true, userId: true, emoji: true } },
};

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

router.post('/presence', requirePermission('canViewTeamMessaging'), async (req, res) => {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const now = new Date();
  await prisma.user.updateMany({ where: { id: req.user.id, tenantId, isActive: true }, data: { teamMessagingLastSeenAt: now } });
  await prisma.businessMessage.updateMany({
    where: { tenantId, recipientId: req.user.id, deliveredAt: null },
    data: { deliveredAt: now },
  });
  res.json({ online: true });
});

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
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: messageDetails },
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
    select: { ...messageDetails, conversationId: true },
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
    select: { id: true, participantOneId: true, participantTwoId: true, participantOneTypingAt: true, participantTwoTypingAt: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  const messages = await prisma.businessMessage.findMany({
    where: { tenantId, conversationId: conversation.id },
    orderBy: { createdAt: 'desc' }, take: 100,
    select: messageDetails,
  });
  const readAt = new Date();
  await prisma.businessMessage.updateMany({
    where: { tenantId, conversationId: conversation.id, recipientId: req.user.id, readAt: null },
    data: { deliveredAt: readAt, readAt },
  });
  const peerTypingAt = conversation.participantOneId === req.user.id
    ? conversation.participantTwoTypingAt
    : conversation.participantOneTypingAt;
  const peerTyping = Boolean(peerTypingAt && Date.now() - peerTypingAt.getTime() < 7000);
  res.json({ messages: messages.reverse(), peerTyping });
});

router.post('/conversations/:id/typing', requirePermission('canViewTeamMessaging'), requirePermission('canSendTeamMessages'), async (req, res) => {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const conversation = await prisma.businessConversation.findFirst({
    where: { id: req.params.id, tenantId, OR: [{ participantOneId: req.user.id }, { participantTwoId: req.user.id }] },
    select: { id: true, participantOneId: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  const field = conversation.participantOneId === req.user.id ? 'participantOneTypingAt' : 'participantTwoTypingAt';
  const typingAt = req.body?.typing === true ? new Date() : null;
  await prisma.businessConversation.update({ where: { id: conversation.id }, data: { [field]: typingAt } });
  res.json({ ok: true });
});

router.post('/conversations/:id/messages/:messageId/reactions', requirePermission('canViewTeamMessaging'), requirePermission('canSendTeamMessages'), async (req, res) => {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const emoji = String(req.body?.emoji || '');
  if (!MESSAGE_REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: 'Choose a supported reaction.' });
  const message = await prisma.businessMessage.findFirst({
    where: {
      id: req.params.messageId,
      conversationId: req.params.id,
      tenantId,
      conversation: { OR: [{ participantOneId: req.user.id }, { participantTwoId: req.user.id }] },
    },
    select: { id: true },
  });
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  const existing = await prisma.businessMessageReaction.findUnique({
    where: { messageId_userId: { messageId: message.id, userId: req.user.id } },
    select: { id: true, emoji: true },
  });
  if (existing?.emoji === emoji) {
    await prisma.businessMessageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.businessMessageReaction.upsert({
      where: { messageId_userId: { messageId: message.id, userId: req.user.id } },
      create: { tenantId, messageId: message.id, userId: req.user.id, emoji },
      update: { emoji, createdAt: new Date() },
    });
  }
  const reactions = await prisma.businessMessageReaction.findMany({
    where: { tenantId, messageId: message.id },
    select: { id: true, userId: true, emoji: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ reactions });
});

router.post('/conversations/:id/messages', requirePermission('canViewTeamMessaging'), requirePermission('canSendTeamMessages'), parseChatImage, async (req, res) => {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const body = String(req.body?.body || '').trim();
  const replyToMessageId = String(req.body?.replyToMessageId || '').trim() || null;
  const clientMessageId = String(req.body?.clientMessageId || '').trim();
  if ((!body && !req.file) || body.length > 4000) return res.status(400).json({ error: 'Write a message of up to 4,000 characters or choose an image.' });
  if (clientMessageId && !validClientMessageId(clientMessageId)) return res.status(400).json({ error: 'Invalid message request ID.' });
  if (req.file && verifiedChatImageMime(req.file.buffer) !== req.file.mimetype) return res.status(400).json({ error: 'Choose a valid JPEG, PNG, or WebP image.' });
  const conversation = await prisma.businessConversation.findFirst({
    where: { id: req.params.id, tenantId, OR: [{ participantOneId: req.user.id }, { participantTwoId: req.user.id }] },
    select: { id: true, participantOneId: true, participantTwoId: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  if (clientMessageId) {
    const existing = await prisma.businessMessage.findUnique({ where: { id: clientMessageId }, select: messageDetails });
    if (existing) {
      if (existing.conversationId !== conversation.id || existing.senderId !== req.user.id) return res.status(409).json({ error: 'Message request ID has already been used.' });
      return res.json({ message: existing });
    }
  }
  if (replyToMessageId) {
    const original = await prisma.businessMessage.findFirst({
      where: { id: replyToMessageId, tenantId, conversationId: conversation.id },
      select: { id: true },
    });
    if (!original) return res.status(400).json({ error: 'You can only reply to a message in this conversation.' });
  }
  const recipientId = conversation.participantOneId === req.user.id ? conversation.participantTwoId : conversation.participantOneId;
  const recipient = await prisma.user.findFirst({
    where: { id: recipientId, tenantId, isActive: true },
    select: { teamMessagingLastSeenAt: true },
  });
  const now = new Date();
  const recipientOnline = Boolean(recipient?.teamMessagingLastSeenAt && now.getTime() - recipient.teamMessagingLastSeenAt.getTime() < ONLINE_WINDOW_MS);
  let uploaded;
  try {
    if (req.file) {
      uploaded = await uploadBufferToCloudinary(req.file.buffer, { resourceType: 'image', folder: 'jibusales/chat-messages' });
      if (!uploaded?.secure_url || !uploaded?.public_id) throw new Error('Image upload did not return a usable asset.');
    }
    const [message] = await prisma.$transaction([
      prisma.businessMessage.create({
        data: {
          ...(clientMessageId ? { id: clientMessageId } : {}),
          tenantId, conversationId: conversation.id, senderId: req.user.id, recipientId, body, replyToMessageId,
          imageUrl: uploaded?.secure_url || null, imagePublicId: uploaded?.public_id || null,
          deliveredAt: recipientOnline ? now : null,
        },
        select: messageDetails,
      }),
      prisma.businessConversation.update({
        where: { id: conversation.id },
        data: {
          updatedAt: new Date(),
          [conversation.participantOneId === req.user.id ? 'participantOneTypingAt' : 'participantTwoTypingAt']: null,
        },
      }),
    ]);
    return res.status(201).json({ message });
  } catch (error) {
    if (uploaded?.public_id) await deleteCloudinaryAsset(uploaded.public_id).catch((cleanupError) => console.warn('Could not remove an unused chat image.', cleanupError.message));
    if (clientMessageId && error?.code === 'P2002') {
      const existing = await prisma.businessMessage.findUnique({ where: { id: clientMessageId }, select: messageDetails });
      if (existing?.conversationId === conversation.id && existing.senderId === req.user.id) return res.json({ message: existing });
    }
    throw error;
  }
});

export default router;
