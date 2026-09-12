import { Router } from 'express';
import prisma from '../db.js';
import { authenticateToken, requirePermission, requireTenant, blockPlatformAdmin } from '../../middleware/auth.js';
import { requireFeature } from '../../middleware/featureCheck.js';
import { buildBusinessAdvisorContext } from '../services/businessAdvisorContext.js';
import { createAdvisorLimiter, requestBusinessAdvice, validateAdvisorRequest } from '../services/businessAdvisor.js';

const router = Router();
const acquire = createAdvisorLimiter();
router.use(authenticateToken, blockPlatformAdmin, requireTenant, requirePermission('canUseBusinessAI'), requireFeature('dashboard'));
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

router.get('/status', (req, res) => res.json({ configured: Boolean(process.env.NVIDIA_API_KEY) }));
router.post('/chat', async (req, res) => {
  let release, timer;
  const controller = new AbortController();
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnect);
  try {
    const { messages, days } = validateAdvisorRequest(req.body);
    if (!process.env.NVIDIA_API_KEY) return res.status(503).json({ error: 'AI Advisor is not configured yet. Contact JibuSales Admin.', code: 'AI_NOT_CONFIGURED' });
    release = acquire(req.user.tenantId, req.user.id);
    timer = setTimeout(() => controller.abort(), 55000);
    const context = await buildBusinessAdvisorContext(prisma, req, days);
    if (controller.signal.aborted) return res.status(504).json({ error: 'The advisor took too long to respond. Please try again.', code: 'AI_TIMEOUT' });
    const result = await requestBusinessAdvice({ messages, context, signal: controller.signal });
    if (res.destroyed) return;
    res.json({ ...result, context: { business: context.business, period: context.period, scope: context.scope, asOf: context.asOf, sources: context.sources, limitations: context.limitations } });
  } catch (error) {
    if (res.destroyed) return;
    if (error.statusCode === 429) res.set('Retry-After', '60');
    if (!error.statusCode) console.error('AI advisor request failed', error.code || 'INTERNAL_ERROR');
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unable to load your business data. Please try again.', code: error.code || 'AI_CONTEXT_UNAVAILABLE' });
  } finally {
    clearTimeout(timer);
    release?.();
    res.off('close', disconnect);
  }
});

export default router;
