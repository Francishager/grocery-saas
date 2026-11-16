import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import prisma from '../src/db.js';
import { authenticateToken, requirePermission, requireTenant } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureCheck.js';
import { createJibuId, isValidJibuId, normalizeJibuId, JIBU_NETWORK_DIAL_CODES } from '../src/services/jibuNetworkIdentity.js';
import { deleteCloudinaryAsset, uploadBufferToCloudinary } from '../src/utils/cloudinaryUpload.js';

const router = Router();
const statusImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(null, true);
    callback(Object.assign(new Error('Choose a JPEG, PNG, or WebP image.'), { statusCode: 400 }));
  },
});
const parseStatusImage = (req, res, next) => statusImageUpload.single('image')(req, res, (error) => {
  if (!error) return next();
  const tooLarge = error.code === 'LIMIT_FILE_SIZE';
  return fail(res, tooLarge ? 413 : 400, tooLarge ? 'Status images must be 5 MB or smaller.' : error.message || 'Choose a valid status image.');
});
const statusRateLimit = async (req, res, next) => {
  try {
    if (!await allowNetworkRate(req.user.id, 'status', 12, 60 * 60 * 1000)) return fail(res, 429, 'You have posted several updates recently. Try again later.');
    next();
  } catch (error) { next(error); }
};
const dialCodes = new Set(JIBU_NETWORK_DIAL_CODES);
const updateBackgrounds = new Set(['emerald', 'blue', 'rose', 'amber', 'violet', 'slate']);
const reportReasons = new Set(['spam', 'harassment', 'impersonation', 'inappropriate', 'other']);
const publicUserSelect = { id: true, fname: true, lname: true, avatar: true, jibuId: true };
let lastExpiredUpdateCleanupAt = 0;
let lastExpiredRateCleanupAt = 0;

function imageMimeFromBuffer(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function cleanupExpiredUpdates(now) {
  const expired = await prisma.jibuNetworkUpdate.findMany({
    where: { expiresAt: { lte: now } }, select: { id: true, imagePublicId: true }, take: 100,
  });
  for (const update of expired) {
    try {
      if (update.imagePublicId) await deleteCloudinaryAsset(update.imagePublicId);
      await prisma.jibuNetworkUpdate.deleteMany({ where: { id: update.id, expiresAt: { lte: now } } });
    } catch (error) {
      console.warn('Could not clean up expired JibuSales status asset; it will be retried.', error.message);
    }
  }
}

router.use(authenticateToken, requireTenant, requireFeature('communication.team_messaging'), requirePermission('canViewTeamMessaging'));

function fail(res, status, error) { return res.status(status).json({ error }); }
function displayName(user) { return [user?.fname, user?.lname].filter(Boolean).join(' ').trim() || 'JibuSales member'; }
function publicUser(user) { return user ? { id: user.id, name: displayName(user), avatar: user.avatar || null, jibuId: user.jibuId } : null; }
const networkId = normalizeJibuId;
const validNetworkId = isValidJibuId;
async function allowNetworkRate(userId, action, maximum, windowMs) {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const id = `${userId}:${action}:${windowStart.getTime()}`;
  const rows = await prisma.$queryRaw`
    INSERT INTO jibu_network_rate_limits (id, "userId", action, "windowStart", count)
    VALUES (${id}, ${userId}, ${action}, ${windowStart}, 1)
    ON CONFLICT ("userId", action, "windowStart")
    DO UPDATE SET count = jibu_network_rate_limits.count + 1
    RETURNING count
  `;
  if (Date.now() - lastExpiredRateCleanupAt > 5 * 60 * 1000) {
    lastExpiredRateCleanupAt = Date.now();
    void prisma.$executeRaw`DELETE FROM jibu_network_rate_limits WHERE id IN (
      SELECT id FROM jibu_network_rate_limits WHERE "windowStart" < ${new Date(Date.now() - 24 * 60 * 60 * 1000)} LIMIT 1000
    )`.catch(error => console.warn('Could not prune JibuSales Network rate-limit rows.', error.message));
  }
  return Number(rows[0]?.count || 0) <= maximum;
}
async function blockedEitherWay(oneId, twoId) {
  return Boolean(await prisma.jibuNetworkBlock.findFirst({
    where: { OR: [{ blockerId: oneId, blockedUserId: twoId }, { blockerId: twoId, blockedUserId: oneId }] },
    select: { id: true },
  }));
}
async function chatForParticipant(id, userId) {
  return prisma.jibuNetworkConversation.findFirst({
    where: { id, OR: [{ participantOneId: userId }, { participantTwoId: userId }] },
  });
}
function requestView(row, userId) {
  const incoming = row.requestedById !== userId;
  const peer = row.participantOneId === userId ? row.participantTwo : row.participantOne;
  const latestMessage = row.messages?.[0] || null;
  return { id: row.id, status: row.status, incoming, participant: publicUser(peer), latestMessage, updatedAt: row.updatedAt };
}

router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { ...publicUserSelect, jibuCountryCode: true, jibuNetworkEnabled: true } });
  res.json({ profile: { ...publicUser(user), countryCode: user?.jibuCountryCode || null, enabled: Boolean(user?.jibuNetworkEnabled) } });
});

router.put('/me', async (req, res) => {
  if (req.body?.enabled === false) {
    await prisma.user.update({ where: { id: req.user.id }, data: { jibuNetworkEnabled: false } });
    return res.json({ profile: { enabled: false } });
  }
  if (req.user.role !== 'owner' && !req.user.permissions?.includes('canSendTeamMessages') && !req.user.permissions?.includes('*')) {
    return fail(res, 403, 'Send Team Messages permission is required to opt in to cross-business discovery.');
  }
  const countryCode = String(req.body?.countryCode || '').trim();
  if (!dialCodes.has(countryCode)) return fail(res, 400, 'Choose a supported country calling code.');
  const current = await prisma.user.findUnique({ where: { id: req.user.id }, select: { jibuId: true, jibuCountryCode: true } });
  if (current?.jibuId) {
    if (current.jibuCountryCode !== countryCode) return fail(res, 409, 'Your JibuSales ID country code cannot be changed after it is issued. Contact support if it is incorrect.');
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { jibuNetworkEnabled: true }, select: { ...publicUserSelect, jibuCountryCode: true, jibuNetworkEnabled: true } });
    return res.json({ profile: { ...publicUser(user), countryCode: user.jibuCountryCode, enabled: true } });
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const user = await prisma.user.update({ where: { id: req.user.id }, data: { jibuId: createJibuId(countryCode), jibuCountryCode: countryCode, jibuNetworkEnabled: true }, select: { ...publicUserSelect, jibuCountryCode: true, jibuNetworkEnabled: true } });
      return res.json({ profile: { ...publicUser(user), countryCode: user.jibuCountryCode, enabled: true } });
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
    }
  }
  return fail(res, 503, 'Could not issue an ID right now. Please try again.');
});

router.use(async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.user.id, isActive: true }, select: { jibuNetworkEnabled: true } });
    if (!user?.jibuNetworkEnabled) return fail(res, 403, 'Opt in to cross-business messaging before accessing Network contacts, chats, updates or community.');
    next();
  } catch (error) { next(error); }
});

router.get('/lookup', async (req, res) => {
  if (!await allowNetworkRate(req.user.id, 'lookup', 25, 60_000)) return fail(res, 429, 'Too many ID lookups. Wait a minute and try again.');
  const id = networkId(req.query.id);
  if (!validNetworkId(id)) return fail(res, 400, 'Enter a complete JibuSales ID including its country code.');
  const person = await prisma.user.findFirst({ where: { jibuId: id, jibuNetworkEnabled: true, isActive: true }, select: publicUserSelect });
  if (!person || person.id === req.user.id || await blockedEitherWay(req.user.id, person.id)) return res.json({ person: null });
  res.json({ person: publicUser(person) });
});

router.get('/contacts', async (req, res) => {
  const rows = await prisma.jibuNetworkContact.findMany({
    where: { ownerId: req.user.id },
    include: { contactUser: { select: { ...publicUserSelect, isActive: true, jibuNetworkEnabled: true } } },
    orderBy: [{ contactUser: { fname: 'asc' } }, { contactUser: { lname: 'asc' } }],
    take: 500,
  });
  const blockedRows = await prisma.jibuNetworkBlock.findMany({
    where: { OR: [{ blockerId: req.user.id }, { blockedUserId: req.user.id }] },
    select: { blockerId: true, blockedUserId: true },
  });
  const blockedIds = new Set(blockedRows.map(row => row.blockerId === req.user.id ? row.blockedUserId : row.blockerId));
  res.json({ contacts: rows
    .filter(row => row.contactUser?.isActive && row.contactUser.jibuNetworkEnabled && !blockedIds.has(row.contactUserId))
    .map(row => ({ ...publicUser(row.contactUser), savedAt: row.createdAt })) });
});

router.post('/contacts', requirePermission('canSendTeamMessages'), async (req, res) => {
  if (!await allowNetworkRate(req.user.id, 'contact', 40, 60 * 60 * 1000)) return fail(res, 429, 'You have added several contacts recently. Try again later.');
  const targetId = networkId(req.body?.jibuId);
  if (!validNetworkId(targetId)) return fail(res, 400, 'Enter a complete JibuSales ID including its country code.');
  const [owner, target] = await Promise.all([
    prisma.user.findFirst({ where: { id: req.user.id, jibuNetworkEnabled: true, isActive: true }, select: { id: true } }),
    prisma.user.findFirst({ where: { jibuId: targetId, jibuNetworkEnabled: true, isActive: true }, select: publicUserSelect }),
  ]);
  if (!owner) return fail(res, 403, 'Enable your JibuSales Network profile before saving contacts.');
  if (!target || target.id === req.user.id || await blockedEitherWay(req.user.id, target.id)) return fail(res, 404, 'That JibuSales member is not available.');
  const contact = await prisma.jibuNetworkContact.upsert({
    where: { ownerId_contactUserId: { ownerId: req.user.id, contactUserId: target.id } },
    create: { id: randomUUID(), ownerId: req.user.id, contactUserId: target.id },
    update: {},
  });
  res.status(201).json({ contact: { ...publicUser(target), savedAt: contact.createdAt } });
});

router.delete('/contacts/:jibuId', requirePermission('canSendTeamMessages'), async (req, res) => {
  const id = networkId(req.params.jibuId);
  if (!validNetworkId(id)) return fail(res, 400, 'Enter a complete JibuSales ID including its country code.');
  const target = await prisma.user.findFirst({ where: { jibuId: id }, select: { id: true } });
  if (target) await prisma.jibuNetworkContact.deleteMany({ where: { ownerId: req.user.id, contactUserId: target.id } });
  res.json({ saved: false });
});

router.get('/chats', async (req, res) => {
  const rows = await prisma.jibuNetworkConversation.findMany({
    where: { OR: [{ participantOneId: req.user.id }, { participantTwoId: req.user.id }] },
    include: {
      participantOne: { select: publicUserSelect }, participantTwo: { select: publicUserSelect },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' }, take: 100,
  });
  const hidden = [];
  const visible = [];
  for (const row of rows) {
    const peer = row.participantOneId === req.user.id ? row.participantTwo : row.participantOne;
    if (!peer?.jibuNetworkEnabled || await blockedEitherWay(req.user.id, peer.id)) hidden.push(row.id);
    else visible.push(requestView(row, req.user.id));
  }
  if (visible.length) {
    await prisma.jibuNetworkMessage.updateMany({
      where: { conversationId: { in: visible.map((chat) => chat.id) }, senderId: { not: req.user.id }, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
  }
  const unread = visible.length
    ? await prisma.jibuNetworkMessage.count({ where: { conversationId: { in: visible.map((chat) => chat.id) }, senderId: { not: req.user.id }, readAt: null } })
    : 0;
  res.json({ chats: visible, unread });
});

router.post('/requests', requirePermission('canSendTeamMessages'), async (req, res) => {
  if (!await allowNetworkRate(req.user.id, 'request', 8, 60 * 60 * 1000)) return fail(res, 429, 'You have sent several chat requests recently. Try again later.');
  const targetId = networkId(req.body?.jibuId);
  const body = String(req.body?.message || '').trim();
  if (!validNetworkId(targetId)) return fail(res, 400, 'Enter a complete JibuSales ID including its country code.');
  if (!body || body.length > 500) return fail(res, 400, 'Add a short introduction of 1 to 500 characters.');
  const [sender, recipient] = await Promise.all([
    prisma.user.findFirst({ where: { id: req.user.id, jibuNetworkEnabled: true, isActive: true }, select: { id: true } }),
    prisma.user.findFirst({ where: { jibuId: targetId, jibuNetworkEnabled: true, isActive: true }, select: { id: true } }),
  ]);
  if (!sender) return fail(res, 403, 'Enable your JibuSales Network profile before starting a chat.');
  if (!recipient || recipient.id === req.user.id || await blockedEitherWay(req.user.id, recipient.id)) return fail(res, 404, 'That JibuSales member is not available.');
  const [participantOneId, participantTwoId] = [sender.id, recipient.id].sort();
  const existing = await prisma.jibuNetworkConversation.findUnique({ where: { participantOneId_participantTwoId: { participantOneId, participantTwoId } } });
  if (existing) {
    if (existing.status === 'accepted') return res.json({ chatId: existing.id, status: existing.status, existing: true });
    return fail(res, 409, existing.status === 'pending' ? 'A message request already exists for this member.' : 'A chat request between these accounts was already declined.');
  }
  const chat = await prisma.$transaction(async (tx) => {
    const created = await tx.jibuNetworkConversation.create({ data: { participantOneId, participantTwoId, requestedById: sender.id, status: 'pending' } });
    await tx.jibuNetworkMessage.create({ data: { conversationId: created.id, senderId: sender.id, body } });
    return created;
  });
  res.status(201).json({ chatId: chat.id, status: chat.status });
});

router.post('/chats/:id/accept', requirePermission('canSendTeamMessages'), async (req, res) => {
  const chat = await chatForParticipant(req.params.id, req.user.id);
  if (!chat || chat.status !== 'pending' || chat.requestedById === req.user.id) return fail(res, 404, 'Incoming message request not found.');
  if (await blockedEitherWay(req.user.id, chat.requestedById)) return fail(res, 403, 'This request is unavailable.');
  await prisma.jibuNetworkConversation.update({ where: { id: chat.id }, data: { status: 'accepted' } });
  res.json({ ok: true, status: 'accepted' });
});

router.post('/chats/:id/decline', requirePermission('canSendTeamMessages'), async (req, res) => {
  const chat = await chatForParticipant(req.params.id, req.user.id);
  if (!chat || chat.status !== 'pending' || chat.requestedById === req.user.id) return fail(res, 404, 'Incoming message request not found.');
  await prisma.jibuNetworkConversation.update({ where: { id: chat.id }, data: { status: 'declined' } });
  res.json({ ok: true, status: 'declined' });
});

router.get('/chats/:id/messages', async (req, res) => {
  const chat = await chatForParticipant(req.params.id, req.user.id);
  if (!chat || !['accepted', 'pending'].includes(chat.status)) return fail(res, 404, 'Chat not found.');
  const peerId = chat.participantOneId === req.user.id ? chat.participantTwoId : chat.participantOneId;
  const peer = await prisma.user.findFirst({ where: { id: peerId, jibuNetworkEnabled: true, isActive: true }, select: { id: true } });
  if (!peer || await blockedEitherWay(req.user.id, peerId)) return fail(res, 404, 'Chat not found.');
  await prisma.jibuNetworkMessage.updateMany({ where: { conversationId: chat.id, senderId: peerId, readAt: null }, data: { readAt: new Date(), deliveredAt: new Date() } });
  const messages = (await prisma.jibuNetworkMessage.findMany({ where: { conversationId: chat.id }, orderBy: { createdAt: 'desc' }, take: 100 })).reverse();
  res.json({ messages, status: chat.status, requestedById: chat.requestedById });
});

router.post('/chats/:id/messages', requirePermission('canSendTeamMessages'), async (req, res) => {
  if (!await allowNetworkRate(req.user.id, 'message', 60, 60_000)) return fail(res, 429, 'You are sending messages too quickly. Wait a minute and try again.');
  const body = String(req.body?.body || '').trim();
  if (!body || body.length > 4000) return fail(res, 400, 'Write a message of 1 to 4,000 characters.');
  const chat = await chatForParticipant(req.params.id, req.user.id);
  if (!chat || chat.status !== 'accepted') return fail(res, 403, 'The recipient must accept your message request before the chat opens.');
  const peerId = chat.participantOneId === req.user.id ? chat.participantTwoId : chat.participantOneId;
  const peer = await prisma.user.findFirst({ where: { id: peerId, jibuNetworkEnabled: true, isActive: true }, select: { id: true } });
  if (!peer || await blockedEitherWay(req.user.id, peerId)) return fail(res, 404, 'Chat not found.');
  const message = await prisma.$transaction(async (tx) => {
    const row = await tx.jibuNetworkMessage.create({ data: { conversationId: chat.id, senderId: req.user.id, body } });
    await tx.jibuNetworkConversation.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
    return row;
  });
  res.status(201).json({ message });
});

router.get('/community/:list', async (req, res) => {
  if (!['followers', 'following'].includes(req.params.list)) return fail(res, 404, 'List not found.');
  const where = req.params.list === 'followers' ? { followeeId: req.user.id } : { followerId: req.user.id };
  const rows = await prisma.jibuNetworkFollow.findMany({ where, include: { follower: { select: publicUserSelect }, followee: { select: publicUserSelect } }, orderBy: { createdAt: 'desc' }, take: 300 });
  const people = [];
  for (const row of rows) {
    const person = req.params.list === 'followers' ? row.follower : row.followee;
    if (person.jibuNetworkEnabled && !await blockedEitherWay(req.user.id, person.id)) people.push(publicUser(person));
  }
  res.json({ people });
});

router.post('/community/follow', requirePermission('canSendTeamMessages'), async (req, res) => {
  const self = await prisma.user.findFirst({ where: { id: req.user.id, jibuNetworkEnabled: true, isActive: true }, select: { id: true } });
  if (!self) return fail(res, 403, 'Enable your JibuSales Network profile before following members.');
  const target = await prisma.user.findFirst({ where: { jibuId: networkId(req.body?.jibuId), jibuNetworkEnabled: true, isActive: true }, select: { id: true } });
  if (!target || target.id === req.user.id || await blockedEitherWay(req.user.id, target.id)) return fail(res, 404, 'That JibuSales member is not available.');
  await prisma.jibuNetworkFollow.upsert({ where: { followerId_followeeId: { followerId: req.user.id, followeeId: target.id } }, create: { followerId: req.user.id, followeeId: target.id }, update: {} });
  res.json({ following: true });
});

router.delete('/community/follow/:jibuId', requirePermission('canSendTeamMessages'), async (req, res) => {
  const target = await prisma.user.findFirst({ where: { jibuId: networkId(req.params.jibuId) }, select: { id: true } });
  if (!target) return res.json({ following: false });
  await prisma.jibuNetworkFollow.deleteMany({ where: { followerId: req.user.id, followeeId: target.id } });
  res.json({ following: false });
});

router.get('/updates', async (req, res) => {
  const now = new Date();
  if (Date.now() - lastExpiredUpdateCleanupAt > 5 * 60 * 1000) {
    await cleanupExpiredUpdates(now);
    lastExpiredUpdateCleanupAt = Date.now();
  }
  const follows = await prisma.jibuNetworkFollow.findMany({ where: { followerId: req.user.id }, select: { followeeId: true } });
  const followedIds = follows.map((row) => row.followeeId);
  const visibleIds = [...new Set([req.user.id, ...followedIds])];
  const updates = await prisma.jibuNetworkUpdate.findMany({
    where: { userId: { in: visibleIds }, expiresAt: { gt: now }, user: { jibuNetworkEnabled: true, isActive: true } },
    include: { user: { select: publicUserSelect } }, orderBy: { createdAt: 'desc' }, take: 250,
  });
  const filtered = [];
  for (const update of updates) {
    if (await blockedEitherWay(req.user.id, update.userId)) continue;
    const { imagePublicId: _privateAssetId, ...visibleUpdate } = update;
    filtered.push({ ...visibleUpdate, user: publicUser(update.user) });
  }
  res.json({ updates: filtered });
});

router.post('/updates', requirePermission('canSendTeamMessages'), statusRateLimit, parseStatusImage, async (req, res) => {
  const body = String(req.body?.body || '').trim();
  const background = String(req.body?.background || 'emerald');
  if ((!body && !req.file) || body.length > 500) return fail(res, 400, 'Add a caption of up to 500 characters or choose an image.');
  if (!updateBackgrounds.has(background)) return fail(res, 400, 'Choose a supported status color.');
  if (req.file && imageMimeFromBuffer(req.file.buffer) !== req.file.mimetype) return fail(res, 400, 'Choose a valid JPEG, PNG, or WebP image.');
  const enabled = await prisma.user.findFirst({ where: { id: req.user.id, jibuNetworkEnabled: true, isActive: true }, select: { id: true } });
  if (!enabled) return fail(res, 403, 'Enable your JibuSales Network profile before posting an update.');
  const now = new Date();
  let uploaded;
  try {
    if (req.file) uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: `jibusales/network-status/${req.user.id}`,
      resourceType: 'image',
      transformation: [{ width: 1080, height: 1920, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
    });
    const update = await prisma.jibuNetworkUpdate.create({ data: {
      userId: req.user.id, body, background,
      imageUrl: uploaded?.secure_url || null,
      imagePublicId: uploaded?.public_id || null,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    } });
    res.status(201).json({ update });
  } catch (error) {
    if (uploaded?.public_id) await deleteCloudinaryAsset(uploaded.public_id).catch(() => {});
    throw error;
  }
});

router.delete('/updates/:id', requirePermission('canSendTeamMessages'), async (req, res) => {
  const update = await prisma.jibuNetworkUpdate.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!update) return fail(res, 404, 'Update not found.');
  if (update.imagePublicId) await deleteCloudinaryAsset(update.imagePublicId);
  await prisma.jibuNetworkUpdate.delete({ where: { id: update.id } });
  res.json({ ok: true });
});

router.get('/blocks', async (req, res) => {
  const rows = await prisma.jibuNetworkBlock.findMany({ where: { blockerId: req.user.id }, include: { blockedUser: { select: publicUserSelect } }, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json({ people: rows.map((row) => publicUser(row.blockedUser)) });
});

router.post('/blocks', requirePermission('canSendTeamMessages'), async (req, res) => {
  const target = await prisma.user.findFirst({ where: { jibuId: networkId(req.body?.jibuId) }, select: { id: true } });
  if (!target || target.id === req.user.id) return fail(res, 404, 'JibuSales member not found.');
  await prisma.jibuNetworkBlock.upsert({ where: { blockerId_blockedUserId: { blockerId: req.user.id, blockedUserId: target.id } }, create: { blockerId: req.user.id, blockedUserId: target.id }, update: {} });
  await prisma.jibuNetworkFollow.deleteMany({ where: { OR: [{ followerId: req.user.id, followeeId: target.id }, { followerId: target.id, followeeId: req.user.id }] } });
  res.json({ blocked: true });
});

router.delete('/blocks/:jibuId', requirePermission('canSendTeamMessages'), async (req, res) => {
  const target = await prisma.user.findFirst({ where: { jibuId: networkId(req.params.jibuId) }, select: { id: true } });
  if (!target) return res.json({ blocked: false });
  await prisma.jibuNetworkBlock.deleteMany({ where: { blockerId: req.user.id, blockedUserId: target.id } });
  res.json({ blocked: false });
});

router.post('/reports', requirePermission('canSendTeamMessages'), async (req, res) => {
  if (!await allowNetworkRate(req.user.id, 'report', 10, 60 * 60 * 1000)) return fail(res, 429, 'You have submitted several reports recently. Try again later.');
  const chat = await chatForParticipant(String(req.body?.conversationId || ''), req.user.id);
  const requestedJibuId = networkId(req.body?.jibuId);
  const target = chat
    ? { id: chat.participantOneId === req.user.id ? chat.participantTwoId : chat.participantOneId }
    : validNetworkId(requestedJibuId)
      ? await prisma.user.findFirst({ where: { jibuId: requestedJibuId }, select: { id: true } })
      : null;
  const reportedUserId = target?.id || '';
  const reason = String(req.body?.reason || '');
  if (!reportedUserId || reportedUserId === req.user.id || !reportReasons.has(reason)) return fail(res, 400, 'Choose a member and a report reason.');
  await prisma.jibuNetworkReport.create({ data: { reporterId: req.user.id, reportedUserId, conversationId: chat?.id || null, reason, details: String(req.body?.details || '').trim().slice(0, 1000) } });
  res.status(201).json({ submitted: true });
});

export default router;
