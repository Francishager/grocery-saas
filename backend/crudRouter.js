import express from 'express';
import { fetchFromGrist, addToGrist, updateGristRecord, deleteFromGrist } from './gristUtils.js';

const router = express.Router();

// Environment overrides for actual Grist table names
const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const BUSINESSES_TABLE = process.env.BUSINESSES_TABLE || 'Businesses';
const BRANCHES_TABLE = process.env.BRANCHES_TABLE || 'Branches';
const SUBSCRIPTIONS_TABLE = process.env.SUBSCRIPTIONS_TABLE || 'Subscription';
const FEATURES_TABLE = process.env.FEATURES_TABLE || 'Features';
const SUBSCRIPTION_FEATURES_TABLE = process.env.SUBSCRIPTION_FEATURES_TABLE || 'Subscription_Features';
const PLANS_TABLE = process.env.PLANS_TABLE || 'Plans';

// Whitelisted table configurations
const tables = {
  Users: {
    name: USERS_TABLE,
    defaults: (body) => ({
      created_at: new Date().toISOString(),
      is_active: body.is_active !== false,
    }),
    sanitize: (body) => ({
      business_id: body.business_id || null,
      fname: body.fname || '',
      mname: body.mname || '',
      lname: body.lname || '',
      phone_number: body.phone_number || '',
      email: body.email || '',
      role: body.role || 'Owner',
      // password_hash should be set via auth flow
      otp_code: body.otp_code || null,
      otp_expires: body.otp_expires || null,
      last_login: body.last_login || null,
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
    })
  },
  Businesses: {
    name: BUSINESSES_TABLE,
    defaults: (body) => ({ status: body.status || 'active', created_at: new Date().toISOString() }),
    sanitize: (body) => ({
      name: body.name || '',
      owner_id: body.owner_id || null,
      subscription_id: body.subscription_id || null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      logo_url: body.logo_url || null,
      fiscal_year_start: body.fiscal_year_start || null,
      fiscal_year_end: body.fiscal_year_end || null,
      status: body.status || 'active',
      created_at: body.created_at || new Date().toISOString(),
    })
  },
  Branches: {
    name: BRANCHES_TABLE,
    defaults: () => ({ created_at: new Date().toISOString() }),
    sanitize: (body) => ({
      branch_id: body.branch_id || null,
      business_id: body.business_id || null,
      name: body.name || '',
      // Accept both address and location for compatibility
      address: body.address || body.location || '',
      location: body.location || body.address || '',
      opening_date: body.opening_date || null,
      updated_at: body.updated_at || body.update_at || null,
      created_at: body.created_at || new Date().toISOString(),
    })
  },
  Subscription: { // plans
    name: SUBSCRIPTIONS_TABLE,
    defaults: (body) => ({ is_active: body.is_active !== false, created_at: new Date().toISOString() }),
    sanitize: (body) => ({
      name: body.name || '',
      price: Number(body.price || 0),
      billing_cycle: body.billing_cycle || 'monthly',
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
      // Optional plan-level limits
      limit_max_staff: (body.limit_max_staff !== undefined && body.limit_max_staff !== null) ? Number(body.limit_max_staff) : undefined,
      limit_max_branches: (body.limit_max_branches !== undefined && body.limit_max_branches !== null) ? Number(body.limit_max_branches) : undefined,
      created_at: body.created_at || new Date().toISOString(),
    })
  },
  Features: {
    name: FEATURES_TABLE,
    defaults: (body) => ({ is_active: body.is_active !== false }),
    sanitize: (body) => ({
      name: body.name || '',
      code: body.code || slugify(body.name || ''),
      description: body.description || '',
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
    })
  },
  Subscription_Features: {
    name: SUBSCRIPTION_FEATURES_TABLE,
    defaults: () => ({}),
    sanitize: (body) => ({
      subscription_id: body.subscription_id,
      feature_id: body.feature_id,
      limit_value: body.limit_value || null,
    })
  },
  Plans: {
    name: PLANS_TABLE,
    defaults: (body) => ({
      created_at: new Date().toISOString(),
      status: body.status || 'Active',
    }),
    sanitize: (body) => ({
      name: body.name || '',
      price_monthly: parseFloat(body.price_monthly) || 0,
      price_termly: body.price_termly ? parseFloat(body.price_termly) : null,
      price_annual: parseFloat(body.price_annual) || 0,
      max_staff: parseInt(body.max_staff) || 1,
      max_students: body.max_students ? parseInt(body.max_students) : null,
      max_branches: parseInt(body.max_branches) || 1,
      features: body.features || '',
      status: body.status || 'Active'
    })
  },
};

function slugify(s) {
  const base = (s || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return base || Math.random().toString(36).slice(2, 8);
}

function getConfig(tableParam) {
  const key = Object.keys(tables).find(k => k.toLowerCase() === String(tableParam).toLowerCase());
  return key ? tables[key] : null;
}

// GET list (simple; optional q filter applied client-side for now)
router.get('/:table', async (req, res) => {
  try {
    const cfg = getConfig(req.params.table);
    if (!cfg) return res.status(400).json({ error: 'Unknown table' });
    const rows = await fetchFromGrist(cfg.name);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
});

// CREATE
router.post('/:table', async (req, res) => {
  try {
    const cfg = getConfig(req.params.table);
    if (!cfg) return res.status(400).json({ error: 'Unknown table' });
    const tableKey = String(req.params.table || '').toLowerCase();
    const payload = { ...cfg.defaults(req.body || {}), ...cfg.sanitize(req.body || {}) };

    // Validate business date fields when creating Businesses
    if (tableKey === 'businesses') {
      try {
        const s = payload.start_date ? new Date(payload.start_date) : null;
        const e = payload.end_date ? new Date(payload.end_date) : null;
        if (s && isNaN(s.getTime())) return res.status(400).json({ error: 'Invalid Start Date' });
        if (e && isNaN(e.getTime())) return res.status(400).json({ error: 'Invalid End Date' });
        if (s && e && e < s) return res.status(400).json({ error: 'End Date must be on or after Start Date' });
        const fs = payload.fiscal_year_start ? new Date(payload.fiscal_year_start) : null;
        const fe = payload.fiscal_year_end ? new Date(payload.fiscal_year_end) : null;
        if (fs && isNaN(fs.getTime())) return res.status(400).json({ error: 'Invalid Fiscal Year Start' });
        if (fe && isNaN(fe.getTime())) return res.status(400).json({ error: 'Invalid Fiscal Year End' });
        if (fs && fe && fe < fs) return res.status(400).json({ error: 'Fiscal Year End must be on or after Fiscal Year Start' });
      } catch (ve) { return res.status(400).json({ error: 'Invalid date(s) supplied' }); }
    }

    // Enforce plan limits when creating Branches or Users
    try {
      if ((tableKey === 'branches' || tableKey === 'users') && payload?.business_id) {
        // Find business and its plan
        const businesses = await fetchFromGrist(BUSINESSES_TABLE);
        const biz = (businesses || []).find(b => String(b.id) === String(payload.business_id) || String(b.business_id||'') === String(payload.business_id));
        const planId = biz?.subscription_id;
        if (planId) {
          const subs = await fetchFromGrist(SUBSCRIPTIONS_TABLE);
          const plan = (subs || []).find(p => String(p.id) === String(planId));
          const limitStaff = Number(plan?.limit_max_staff);
          const limitBranches = Number(plan?.limit_max_branches);
          if (tableKey === 'branches' && Number.isFinite(limitBranches)) {
            const branches = await fetchFromGrist(BRANCHES_TABLE);
            const count = (branches || []).filter(r => String(r.business_id) === String(payload.business_id)).length;
            if (count >= limitBranches) {
              return res.status(400).json({ error: `Branch limit reached for this plan (${limitBranches}). Upgrade plan to add more branches.` });
            }
          }
          if (tableKey === 'users' && Number.isFinite(limitStaff)) {
            const users = await fetchFromGrist(USERS_TABLE);
            const count = (users || []).filter(u => String(u.business_id) === String(payload.business_id) && String(u.role||'').toLowerCase() !== 'saas admin').length;
            if (count >= limitStaff) {
              return res.status(400).json({ error: `Staff limit reached for this plan (${limitStaff}). Upgrade plan to add more staff.` });
            }
          }
        }
      }
    } catch (limitErr) { console.warn('Plan limit enforcement warning:', limitErr?.message); }

    const r = await addToGrist(cfg.name, payload);
    if (!r.success) return res.status(500).json({ error: r.error || 'Failed to create' });
    res.status(201).json(r.data);
  } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
});

// UPDATE
router.patch('/:table/:id', async (req, res) => {
  try {
    const cfg = getConfig(req.params.table);
    if (!cfg) return res.status(400).json({ error: 'Unknown table' });
    const upd = cfg.sanitize(req.body || {});
    const tableKey = String(req.params.table || '').toLowerCase();
    if (tableKey === 'businesses') {
      try {
        const s = upd.start_date ? new Date(upd.start_date) : null;
        const e = upd.end_date ? new Date(upd.end_date) : null;
        if (s && isNaN(s.getTime())) return res.status(400).json({ error: 'Invalid Start Date' });
        if (e && isNaN(e.getTime())) return res.status(400).json({ error: 'Invalid End Date' });
        if (s && e && e < s) return res.status(400).json({ error: 'End Date must be on or after Start Date' });
        const fs = upd.fiscal_year_start ? new Date(upd.fiscal_year_start) : null;
        const fe = upd.fiscal_year_end ? new Date(upd.fiscal_year_end) : null;
        if (fs && isNaN(fs.getTime())) return res.status(400).json({ error: 'Invalid Fiscal Year Start' });
        if (fe && isNaN(fe.getTime())) return res.status(400).json({ error: 'Invalid Fiscal Year End' });
        if (fs && fe && fe < fs) return res.status(400).json({ error: 'Fiscal Year End must be on or after Fiscal Year Start' });
      } catch (ve) { return res.status(400).json({ error: 'Invalid date(s) supplied' }); }
    }
    const r = await updateGristRecord(cfg.name, Number(req.params.id), upd);
    if (!r.success) return res.status(500).json({ error: r.error || 'Failed to update' });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE
router.delete('/:table/:id', async (req, res) => {
  try {
    const cfg = getConfig(req.params.table);
    if (!cfg) return res.status(400).json({ error: 'Unknown table' });
    const r = await deleteFromGrist(cfg.name, Number(req.params.id));
    if (!r.success) return res.status(500).json({ error: r.error || 'Failed to delete' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
