import { Router } from 'express';
import { authenticateToken, blockPlatformAdmin, requirePermission, requireTenant } from '../../middleware/auth.js';
import { requireAnyFeature } from '../../middleware/featureCheck.js';
import { createAdvisorLimiter, requestBusinessAdvice, advisorError } from '../services/businessAdvisor.js';

const router = Router();
const acquire = createAdvisorLimiter();
const sensitivePattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\s().-]*){8,}\d|\b(?:UGX|KES|TZS|RWF|USD|EUR|GBP)\s*[\d,.]+|[$€£]\s*[\d,.]+|\b(?:password|passcode|pin|bank account|account number|card number|national id|nin|customer balance|salary|credit limit)\b/i;
const fields = {
  crm: new Set(['opportunity', 'lead notes', 'interaction notes', 'support case details', 'campaign name', 'email subject', 'campaign content']),
  planner: new Set(['planner title', 'planner notes']),
};

router.use(authenticateToken, blockPlatformAdmin, requireTenant, requirePermission('canUseBusinessAI'));
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

function respondWithDraft(moduleName) {
  return async (req, res) => {
    let release;
    try {
      const { field, instruction } = req.body || {};
      if (Object.keys(req.body || {}).some(key => !['field', 'instruction'].includes(key)) ||
          typeof field !== 'string' || !fields[moduleName].has(field) ||
          typeof instruction !== 'string' || !instruction.trim() || instruction.length > 1200) {
        throw advisorError(400, 'Provide a short instruction for a supported writing field.', 'INVALID_INPUT');
      }
      if (sensitivePattern.test(instruction)) throw advisorError(400, 'Remove contact details, long number sequences, currency amounts, and account or identity information before requesting help.', 'SENSITIVE_INPUT');
      if (!process.env.NVIDIA_API_KEY) throw advisorError(503, 'Writing assistance is not configured. Contact JibuSales Admin.', 'AI_NOT_CONFIGURED');
      release = acquire(req.user.tenantId, req.user.id);
      const result = await requestBusinessAdvice({
        messages: [{ role: 'user', content: JSON.stringify({ field, instruction: instruction.trim() }) }],
        context: {}, signal: AbortSignal.timeout(25000), maxTokens: 700,
        systemPrompt: 'You are a concise professional writing assistant. Draft content only for the named generic field, following only the user instruction. The request contains no business record context. Do not ask for or invent names, contact details, amounts, dates, credentials, or other factual claims. Use placeholders where facts are needed. Return only the draft text, without Markdown fences.',
      });
      res.json({ text: result.reply });
    } catch (error) {
      if (!error.statusCode) console.error('AI writing assistance failed', error.code || 'INTERNAL_ERROR');
      if (error.statusCode === 429) res.set('Retry-After', '60');
      res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Writing assistance is temporarily unavailable.', code: error.code || 'AI_UNAVAILABLE' });
    } finally { release?.(); }
  };
}

router.post('/crm', requireAnyFeature(['crm', 'rentals']), respondWithDraft('crm'));
router.post('/planner', requireAnyFeature(['planner', 'rentals']), respondWithDraft('planner'));

export { sensitivePattern };
export default router;
