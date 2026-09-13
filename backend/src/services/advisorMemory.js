import { createHash } from 'node:crypto';
import { advisorError } from './businessAdvisor.js';
import { resolveBranchScope } from '../utils/branchAccess.js';

export const privateWhere = req => ({ tenantId: req.user.tenantId, userId: req.user.id });
export async function advisorScopeKey(db, req) {
  const scope = await resolveBranchScope(db, { ...req, query: {} }, { allowOwnerAll: true });
  return createHash('sha256').update(JSON.stringify({ tenant: scope.tenantId, branch: scope.branchId,
    role: req.user.role, permissions: [...(req.user.permissions || [])].sort(),
    features: [...(req.tenantFeatures || [])].sort() })).digest('hex');
}
export async function ownedConversation(db, req, id, scopeKey) {
  if (typeof id !== 'string' || !id || id.length > 100) throw advisorError(400, 'Invalid conversation.', 'INVALID_INPUT');
  const row = await db.advisorConversation.findFirst({ where: { ...privateWhere(req), id }, include: { collection: true } });
  if (!row) throw advisorError(404, 'Conversation not found.', 'CHAT_NOT_FOUND');
  if (scopeKey && row.scopeKey !== scopeKey) throw advisorError(403, 'Your access has changed since this conversation. Start a new chat with your current permissions.', 'CHAT_ACCESS_CHANGED');
  return row;
}
export async function ownedCollection(db, req, id) {
  if (!id) return null;
  if (typeof id !== 'string' || id.length > 100) throw advisorError(400, 'Invalid project or folder.', 'INVALID_INPUT');
  const collection = await db.advisorCollection.findFirst({ where: { ...privateWhere(req), id } });
  if (!collection) throw advisorError(404, 'Project or folder not found.', 'COLLECTION_NOT_FOUND');
  return collection;
}

// A database lease and request ID protect retries and multiple tabs/server instances.
export async function beginAdvisorTurn(db, req, id, scopeKey, requestId, input) {
  return db.$transaction(async tx => {
    const conversation = await ownedConversation(tx, req, id, scopeKey);
    const existing = await tx.advisorTurn.findUnique({ where: { conversationId_requestId: { conversationId: id, requestId } } });
    if (existing && existing.input !== input) throw advisorError(409, 'This request was already used for a different message.', 'CHAT_REQUEST_CONFLICT');
    if (existing?.status === 'complete') return { conversation, turn: existing, cached: true };
    const now = new Date();
    const lock = await tx.advisorConversation.updateMany({ where: { ...privateWhere(req), id,
      OR: [{ busyUntil: null }, { busyUntil: { lt: now } }] }, data: { busyUntil: new Date(now.getTime() + 150000), activeRequestId: requestId } });
    if (!lock.count) throw advisorError(409, 'A reply is already being prepared for this chat. Please wait.', 'CHAT_BUSY');
    let turn;
    if (existing) turn = await tx.advisorTurn.update({ where: { id: existing.id }, data: { status: 'pending' } });
    else {
      const updated = await tx.advisorConversation.update({ where: { id }, data: { nextSequence: { increment: 1 } } });
      turn = await tx.advisorTurn.create({ data: { conversationId: id, requestId, input, sequence: updated.nextSequence - 1, status: 'pending' } });
    }
    return { conversation, turn, cached: false };
  });
}

export async function finishAdvisorTurn(db, req, turn, result, memory) {
  return db.$transaction(async tx => {
    const update = await tx.advisorConversation.updateMany({ where: { ...privateWhere(req), id: turn.conversationId, activeRequestId: turn.requestId },
      data: { busyUntil: null, activeRequestId: null, updatedAt: new Date(), ...(memory || {}) } });
    if (!update.count) throw advisorError(409, 'The conversation changed. Reopen it to see the latest reply.', 'CHAT_CHANGED');
    return tx.advisorTurn.update({ where: { id: turn.id }, data: { status: 'complete', output: result.reply, context: result.context, truncated: result.truncated } });
  });
}
export async function failAdvisorTurn(db, req, turn) {
  await db.$transaction(async tx => {
    const lock = await tx.advisorConversation.updateMany({ where: { ...privateWhere(req), id: turn.conversationId, activeRequestId: turn.requestId }, data: { busyUntil: null, activeRequestId: null } });
    if (lock.count) await tx.advisorTurn.updateMany({ where: { id: turn.id, status: 'pending' }, data: { status: 'failed' } });
  });
}

export async function loadAdvisorMemory(db, req, conversation, input, remember = true) {
  const turns = await db.advisorTurn.findMany({ where: { conversationId: conversation.id, status: 'complete', sequence: { gt: conversation.memoryThrough } }, orderBy: { sequence: 'asc' } });
  const words = input.match(/[\p{L}]{4,}/gu)?.filter(word => !['this', 'that', 'what', 'with', 'have', 'about', 'please', 'would'].includes(word.toLowerCase())).slice(0, 5) || [];
  const baseWhere = { ...privateWhere(req), id: { not: conversation.id }, scopeKey: conversation.scopeKey, ...(conversation.collectionId ? { collectionId: conversation.collectionId } : {}) };
  const options = { take: 4, orderBy: { updatedAt: 'desc' }, select: { title: true, memory: true, updatedAt: true, turns: { where: { status: 'complete' }, orderBy: { sequence: 'desc' }, take: 2, select: { input: true, output: true } } } };
  let related = remember ? await db.advisorConversation.findMany({ ...options, where: { ...baseWhere,
    ...(words.length ? { OR: words.flatMap(word => [{ title: { contains: word, mode: 'insensitive' } }, { memory: { contains: word, mode: 'insensitive' } }, { turns: { some: { input: { contains: word, mode: 'insensitive' } } } }]) } : {}) } }) : [];
  if (remember && !related.length && words.length) related = await db.advisorConversation.findMany({ ...options, where: baseWhere });
  return { turns, related: related.map(row => ({ title: row.title, asOf: row.updatedAt, memory: row.memory, recent: row.turns.map(turn => ({ question: turn.input.slice(0, 1000), answer: turn.output?.slice(0, 2000) })) })) };
}
