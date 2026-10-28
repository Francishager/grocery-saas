import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { requireFeature } from '../../middleware/featureCheck.js';
import prisma from '../db.js';
import { getCurrencyRates, normalizeCurrencyCode } from '../services/currencyRates.js';

const router = Router();

router.get('/rates', authenticateToken, requireFeature('settings.currencies'), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.user?.business_id;
    if (!tenantId) return res.status(403).json({ error: 'Tenant access required.' });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } });
    if (!tenant) return res.status(404).json({ error: 'Business not found.' });
    const requestedBase = req.query.base == null ? tenant.currency || 'UGX' : normalizeCurrencyCode(req.query.base);
    if (!requestedBase) return res.status(400).json({ error: 'Enter a valid three-letter currency code.' });
    const result = await getCurrencyRates(requestedBase);
    res.set('Cache-Control', 'private, max-age=900');
    res.json(result);
  } catch (error) {
    const status = error.statusCode || 503;
    if (status >= 500) console.error('Currency rate lookup failed:', error.cause?.message || error.message);
    res.status(status).json({ error: error.message || 'Could not load exchange rates.' });
  }
});

export default router;
