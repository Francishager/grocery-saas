import { Router } from 'express';
import prisma from '../db.js';
import { authenticateToken, requirePermission, requireTenant, blockPlatformAdmin } from '../../middleware/auth.js';
import { requireFeature } from '../../middleware/featureCheck.js';
import { buildBusinessAdvisorContext } from '../services/businessAdvisorContext.js';
import { createAdvisorLimiter, requestBusinessAdvice, validateAdvisorRequest, advisorError, compactAdvisorMemory } from '../services/businessAdvisor.js';
import { privateWhere, advisorScopeKey, ownedConversation, ownedCollection, beginAdvisorTurn, finishAdvisorTurn, failAdvisorTurn, loadAdvisorMemory } from '../services/advisorMemory.js';
import { addAdvisorPeopleContext } from '../services/advisorPeopleContext.js';
import { fetchAdvisorResearch } from '../services/advisorResearch.js';
import { artifactSelect, createArtifact, creativeOptions, ownedArtifact, validateArtifactInput } from '../services/advisorArtifacts.js';

const router = Router();
const acquire = createAdvisorLimiter();
router.use(authenticateToken, blockPlatformAdmin, requireTenant, requirePermission('canUseBusinessAI'), requireFeature('dashboard'));
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
function errorResponse(res, error) {
  if (res.destroyed) return;
  if (error.statusCode === 429) res.set('Retry-After', '60');
  if (!error.statusCode) console.error('AI advisor request failed', error.code || 'INTERNAL_ERROR');
  res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unable to load AI Advisor. Please try again.', code: error.code || 'AI_UNAVAILABLE' });
}
const action = handler => async (req, res) => { try { await handler(req, res); } catch (error) { errorResponse(res, error); } };
const text = (value, max, fallback) => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw advisorError(400, `Enter between 1 and ${max} characters.`, 'INVALID_INPUT');
  return value.trim();
};
function validateKeys(body, keys) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !keys.includes(key))) throw advisorError(400, 'Invalid request fields.', 'INVALID_INPUT');
}
const publicChat = ({ id, title, collectionId, updatedAt, scopeKey }, currentScope) => ({ id, title: scopeKey === currentScope ? title : 'Conversation from previous access', collectionId, updatedAt, locked: scopeKey !== currentScope });

router.get('/status', (req, res) => res.json({ configured: Boolean(process.env.NVIDIA_API_KEY), memory: true, research: true }));
router.get('/collections', action(async (req, res) => {
  res.json({ collections: await prisma.advisorCollection.findMany({ where: privateWhere(req), orderBy: [{ kind: 'asc' }, { name: 'asc' }] }) });
}));
router.post('/collections', action(async (req, res) => {
  validateKeys(req.body, ['name', 'kind', 'parentId', 'instructions']);
  const { kind = 'project', parentId = null } = req.body;
  if (!['project', 'folder'].includes(kind)) throw advisorError(400, 'Choose a project or folder.', 'INVALID_INPUT');
  const parent = await ownedCollection(prisma, req, parentId);
  if (parent && (parent.kind !== 'folder' || kind !== 'project')) throw advisorError(400, 'Projects can be placed in a folder. Folders stay at the top level.', 'INVALID_INPUT');
  const instructions = req.body.instructions ? text(req.body.instructions, 4000) : '';
  const collection = await prisma.advisorCollection.create({ data: { ...privateWhere(req), name: text(req.body.name, 100), kind, parentId: parent?.id || null, instructions } });
  res.status(201).json({ collection });
}));
router.patch('/collections/:id', action(async (req, res) => {
  validateKeys(req.body, ['name', 'instructions', 'parentId']);
  const collection = await ownedCollection(prisma, req, req.params.id);
  const data = {};
  if (req.body.name !== undefined) data.name = text(req.body.name, 100);
  if (req.body.instructions !== undefined) data.instructions = req.body.instructions === '' ? '' : text(req.body.instructions, 4000);
  if (req.body.parentId !== undefined) {
    const parent = await ownedCollection(prisma, req, req.body.parentId);
    if (parent && (parent.id === collection.id || parent.kind !== 'folder' || collection.kind !== 'project')) throw advisorError(400, 'Choose a parent folder for the project.', 'INVALID_INPUT');
    data.parentId = parent?.id || null;
  }
  await prisma.advisorCollection.updateMany({ where: { ...privateWhere(req), id: collection.id }, data });
  res.json({ success: true });
}));
router.delete('/collections/:id', action(async (req, res) => {
  const result = await prisma.advisorCollection.deleteMany({ where: { ...privateWhere(req), id: req.params.id } });
  if (!result.count) throw advisorError(404, 'Project or folder not found.', 'COLLECTION_NOT_FOUND');
  res.json({ success: true });
}));

router.get('/conversations', action(async (req, res) => {
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw advisorError(400, 'Invalid page.', 'INVALID_INPUT');
  const collection = req.query.collectionId ? await ownedCollection(prisma, req, req.query.collectionId) : null;
  const scopeKey = await advisorScopeKey(prisma, req);
  const search = req.query.search ? text(req.query.search, 100) : '';
  const chats = await prisma.advisorConversation.findMany({ where: { ...privateWhere(req), ...(collection ? { collectionId: collection.id } : {}),
    ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}) }, select: { id: true, title: true, collectionId: true, updatedAt: true, scopeKey: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 51 });
  res.json({ conversations: chats.slice(0, 50).map(chat => publicChat(chat, scopeKey)), hasMore: chats.length > 50 });
}));
router.post('/conversations', action(async (req, res) => {
  validateKeys(req.body, ['title', 'collectionId']);
  const collection = await ownedCollection(prisma, req, req.body.collectionId);
  const scopeKey = await advisorScopeKey(prisma, req);
  const conversation = await prisma.advisorConversation.create({ data: { ...privateWhere(req), title: text(req.body.title, 100, 'New chat'), collectionId: collection?.id || null, scopeKey } });
  res.status(201).json({ conversation: publicChat(conversation, scopeKey) });
}));
router.get('/conversations/:id', action(async (req, res) => {
  const scopeKey = await advisorScopeKey(prisma, req);
  const conversation = await ownedConversation(prisma, req, req.params.id, scopeKey);
  const before = req.query.before ? Number(req.query.before) : null;
  if (before !== null && (!Number.isSafeInteger(before) || before < 1)) throw advisorError(400, 'Invalid message cursor.', 'INVALID_INPUT');
  const turns = await prisma.advisorTurn.findMany({ where: { conversationId: conversation.id, ...(before ? { sequence: { lt: before } } : {}) }, orderBy: { sequence: 'desc' }, take: 51 });
  res.json({ conversation: publicChat(conversation, scopeKey), turns: turns.slice(0, 50).reverse(), hasMore: turns.length > 50 });
}));
router.patch('/conversations/:id', action(async (req, res) => {
  validateKeys(req.body, ['title', 'collectionId']);
  await ownedConversation(prisma, req, req.params.id, await advisorScopeKey(prisma, req));
  const data = {};
  if (req.body.title !== undefined) data.title = text(req.body.title, 100);
  if (req.body.collectionId !== undefined) data.collectionId = (await ownedCollection(prisma, req, req.body.collectionId))?.id || null;
  await prisma.advisorConversation.updateMany({ where: { ...privateWhere(req), id: req.params.id }, data });
  res.json({ success: true });
}));
router.delete('/conversations/:id', action(async (req, res) => {
  const result = await prisma.advisorConversation.deleteMany({ where: { ...privateWhere(req), id: req.params.id } });
  if (!result.count) throw advisorError(404, 'Conversation not found.', 'CHAT_NOT_FOUND');
  res.json({ success: true });
}));

router.post('/chat', async (req, res) => {
  let release, timer, turn;
  const controller = new AbortController();
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnect);
  try {
    if (!process.env.NVIDIA_API_KEY) throw advisorError(503, 'AI Advisor is not configured yet. Contact JibuSales Admin.', 'AI_NOT_CONFIGURED');
    release = acquire(req.user.tenantId, req.user.id);
    timer = setTimeout(() => controller.abort(), 120000);
    // Older deployed clients remain usable during a rolling frontend/backend deployment.
    if (req.body?.messages) {
      const { messages, days } = validateAdvisorRequest(req.body);
      const context = await buildBusinessAdvisorContext(prisma, req, days);
      const result = await requestBusinessAdvice({ messages, context, signal: controller.signal });
      return res.json({ ...result, context });
    }
    validateKeys(req.body, ['conversationId', 'requestId', 'message', 'days', 'research', 'remember']);
    const input = text(req.body.message, 6000);
    const requestId = text(req.body.requestId, 100);
    const id = text(req.body.conversationId, 100);
    const days = req.body.days ?? 30;
    if (![7, 30, 90].includes(days) || ['research', 'remember'].some(key => req.body[key] !== undefined && typeof req.body[key] !== 'boolean')) throw advisorError(400, 'Invalid chat options.', 'INVALID_INPUT');
    const scopeKey = await advisorScopeKey(prisma, req);
    const started = await beginAdvisorTurn(prisma, req, id, scopeKey, requestId, input);
    turn = started.turn;
    if (started.cached) return res.json({ reply: turn.output, context: turn.context, truncated: turn.truncated, turn });
    const { conversation } = started;
    const context = await addAdvisorPeopleContext(prisma, req, await buildBusinessAdvisorContext(prisma, req, days), input);
    const history = await loadAdvisorMemory(prisma, req, conversation, input, req.body.remember !== false);
    let memory = conversation.memory, memoryThrough = conversation.memoryThrough;
    let keep = history.turns.length;
    const characters = list => list.reduce((total, row) => total + row.input.length + (row.output?.length || 0), 0);
    if (keep > 12 || characters(history.turns) > 96000) {
      keep = Math.min(8, keep);
      while (keep > 2 && characters(history.turns.slice(-keep)) > 96000) keep--;
    }
    const toCompact = history.turns.slice(0, Math.max(0, history.turns.length - keep));
    if (toCompact.length) {
      memory = await compactAdvisorMemory(memory, toCompact, controller.signal);
      memoryThrough = toCompact.at(-1).sequence;
    }
    context.conversationMemory = memory;
    context.relatedConversations = history.related;
    context.project = conversation.collection ? { name: conversation.collection.name, instructions: conversation.collection.instructions } : null;
    context.research = req.body.research === false ? { status: 'disabled', sources: [] } : await fetchAdvisorResearch(input, { signal: controller.signal });
    if (controller.signal.aborted) throw advisorError(504, 'The advisor took too long. Please retry.', 'AI_TIMEOUT');
    const messages = history.turns.filter(row => row.sequence > memoryThrough).flatMap(row => [{ role: 'user', content: row.input }, { role: 'assistant', content: row.output }]);
    messages.push({ role: 'user', content: input });
    const result = await requestBusinessAdvice({ messages, context, signal: controller.signal });
    const snapshot = { business: context.business, period: context.period, scope: context.scope, asOf: context.asOf, sources: context.sources,
      limitations: context.limitations, research: context.research, memory: { previousConversations: history.related.length, summarizedThrough: memoryThrough } };
    const saved = await finishAdvisorTurn(prisma, req, turn, { ...result, context: snapshot }, { memory, memoryThrough });
    if (!res.destroyed) res.json({ ...result, context: snapshot, turn: saved });
  } catch (error) {
    if (turn) await failAdvisorTurn(prisma, req, turn).catch(() => {});
    errorResponse(res, error);
  } finally {
    clearTimeout(timer); release?.(); res.off('close', disconnect);
  }
});

router.put('/conversations/:id/turns/:turnId/feedback', action(async (req, res) => {
  validateKeys(req.body, ['feedback']);
  if (![1, -1, null].includes(req.body.feedback)) throw advisorError(400, 'Choose thumbs up, thumbs down, or clear the rating.', 'INVALID_FEEDBACK');
  await ownedConversation(prisma, req, req.params.id, await advisorScopeKey(prisma, req));
  const result = await prisma.advisorTurn.updateMany({ where: { id: req.params.turnId, conversationId: req.params.id, status: 'complete' }, data: { feedback: req.body.feedback, feedbackUpdatedAt: new Date() } });
  if (!result.count) throw advisorError(404, 'Completed reply not found.', 'REPLY_NOT_FOUND');
  res.json({ feedback: req.body.feedback });
}));
router.get('/creative-options', action(async (req, res) => res.json(await creativeOptions(prisma, req))));
router.get('/conversations/:id/artifacts', action(async (req, res) => {
  await ownedConversation(prisma, req, req.params.id, await advisorScopeKey(prisma, req));
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw advisorError(400, 'Invalid page.', 'INVALID_ARTIFACT');
  const rows = await prisma.advisorArtifact.findMany({ where: { conversationId: req.params.id }, select: artifactSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21, skip: (page - 1) * 20 });
  res.json({ artifacts: rows.slice(0, 20), hasMore: rows.length > 20 });
}));
router.post('/conversations/:id/artifacts', async (req, res) => {
  const controller = new AbortController();
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnect);
  let release;
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const input = validateArtifactInput(req.body);
    release = acquire(req.user.tenantId, req.user.id);
    const artifact = await createArtifact(prisma, req, req.params.id, input, controller.signal);
    if (!res.destroyed) res.status(201).json({ artifact });
  } catch (error) { errorResponse(res, error); }
  finally { clearTimeout(timer); release?.(); res.off('close', disconnect); }
});
router.get('/artifacts/:id/image', action(async (req, res) => {
  const artifact = await ownedArtifact(prisma, req, req.params.id);
  if (artifact.status !== 'complete' || !artifact.imageMime) throw advisorError(404, 'Image not available.', 'IMAGE_NOT_FOUND');
  const row = await prisma.advisorArtifact.findUnique({ where: { id: artifact.id }, select: { image: true, imageMime: true } });
  if (!row?.image) throw advisorError(404, 'Image not available.', 'IMAGE_NOT_FOUND');
  res.set('X-Content-Type-Options', 'nosniff'); res.set('Content-Type', row.imageMime); res.send(Buffer.from(row.image));
}));
router.patch('/artifacts/:id', action(async (req, res) => {
  validateKeys(req.body, ['headline', 'subheading', 'body', 'cta', 'caption', 'offer']);
  const artifact = await ownedArtifact(prisma, req, req.params.id);
  if (artifact.status !== 'complete') throw advisorError(409, 'Wait for this visual to finish.', 'ARTIFACT_BUSY');
  const copy = { ...artifact.data.copy };
  for (const [key, max] of Object.entries({ headline: 100, subheading: 180, body: 320, cta: 70, caption: 2400, offer: 70 })) {
    if (req.body[key] !== undefined) {
      if (typeof req.body[key] !== 'string' || req.body[key].length > max || (key === 'headline' && !req.body[key].trim())) throw advisorError(400, `Invalid ${key}. Maximum ${max} characters.`, 'INVALID_ARTIFACT');
      copy[key] = req.body[key].trim();
    }
  }
  await prisma.advisorArtifact.updateMany({ where: { id: artifact.id, status: 'complete' }, data: { data: { ...artifact.data, copy }, ...(artifact.kind !== 'report' ? { title: copy.headline } : {}) } });
  res.json({ artifact: await prisma.advisorArtifact.findUnique({ where: { id: artifact.id }, select: artifactSelect }) });
}));
router.delete('/artifacts/:id', action(async (req, res) => {
  const artifact = await ownedArtifact(prisma, req, req.params.id);
  await prisma.advisorArtifact.deleteMany({ where: { id: artifact.id } });
  res.json({ success: true });
}));
export default router;
