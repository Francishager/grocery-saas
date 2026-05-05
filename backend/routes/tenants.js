import express from 'express';
import { fetchFromGrist, addToGrist, updateGristRecord } from '../gristUtils.js';
import { authenticateToken, requirePlatformAdmin } from '../middleware/auth.js';

const router = express.Router();
const TENANTS_TABLE = process.env.TENANTS_TABLE || 'Tenants';
const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const PLANS_TABLE = process.env.PLANS_TABLE || 'Plans';

// Get all tenants (SaaS Admin only)
router.get('/', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    let tenants = await fetchFromGrist(TENANTS_TABLE) || [];
    let users = await fetchFromGrist(USERS_TABLE) || [];
    let plans = await fetchFromGrist(PLANS_TABLE) || [];
    
    // Filter by status
    if (status && status !== 'all') {
      tenants = tenants.filter(t => t.status === status);
    }
    
    // Search
    if (search) {
      const s = search.toLowerCase();
      tenants = tenants.filter(t => 
        t.name?.toLowerCase().includes(s) || 
        t.slug?.toLowerCase().includes(s) ||
        t.owner_email?.toLowerCase().includes(s) ||
        t.owner_name?.toLowerCase().includes(s)
      );
    }
    
    // Enrich tenant data
    const enrichedTenants = tenants.map(tenant => {
      const owner = users.find(u => String(u.id) === String(tenant.owner_id));
      const plan = plans.find(p => String(p.id) === String(tenant.plan_id));
      
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status || 'active',
        planId: tenant.plan_id,
        planName: plan?.name || null,
        ownerId: tenant.owner_id,
        ownerName: owner?.name || tenant.owner_name || 'Unknown',
        ownerEmail: owner?.email || tenant.owner_email || '',
        createdAt: tenant.created_at,
        expiresAt: tenant.expires_at,
        stats: {
          users: users.filter(u => u.tenant_id === tenant.id || u.business_id === tenant.id).length,
          branches: tenant.branches_count || 1,
          products: tenant.products_count || 0,
          monthlySales: tenant.monthly_sales || 0,
        },
      };
    });
    
    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginated = enrichedTenants.slice(offset, offset + parseInt(limit));
    
    res.json({ tenants: paginated, total: enrichedTenants.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get tenant by ID (SaaS Admin only)
router.get('/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tenants = await fetchFromGrist(TENANTS_TABLE) || [];
    const tenant = tenants.find(t => String(t.id) === String(id));
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    const users = await fetchFromGrist(USERS_TABLE) || [];
    const plans = await fetchFromGrist(PLANS_TABLE) || [];
    
    const owner = users.find(u => String(u.id) === String(tenant.owner_id));
    const plan = plans.find(p => String(p.id) === String(tenant.plan_id));
    
    res.json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status || 'active',
      planId: tenant.plan_id,
      planName: plan?.name || null,
      ownerId: tenant.owner_id,
      ownerName: owner?.name || tenant.owner_name || 'Unknown',
      ownerEmail: owner?.email || tenant.owner_email || '',
      phone: tenant.phone,
      address: tenant.address,
      createdAt: tenant.created_at,
      expiresAt: tenant.expires_at,
      settings: tenant.settings || {},
      stats: {
        users: users.filter(u => u.tenant_id === tenant.id || u.business_id === tenant.id).length,
        branches: tenant.branches_count || 1,
        products: tenant.products_count || 0,
        monthlySales: tenant.monthly_sales || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Suspend tenant
router.post('/:id/suspend', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const tenants = await fetchFromGrist(TENANTS_TABLE) || [];
    const tenant = tenants.find(t => String(t.id) === String(id));
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    await updateGristRecord(TENANTS_TABLE, id, {
      status: 'suspended',
      suspended_at: new Date().toISOString(),
      suspended_by: req.user.id,
      suspension_reason: reason || '',
    });
    
    res.json({ ...tenant, status: 'suspended' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Activate tenant
router.post('/:id/activate', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const tenants = await fetchFromGrist(TENANTS_TABLE) || [];
    const tenant = tenants.find(t => String(t.id) === String(id));
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    await updateGristRecord(TENANTS_TABLE, id, {
      status: 'active',
      activated_at: new Date().toISOString(),
      activated_by: req.user.id,
    });
    
    res.json({ ...tenant, status: 'active' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update tenant plan
router.put('/:id/plan', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { planId } = req.body;
    
    const tenants = await fetchFromGrist(TENANTS_TABLE) || [];
    const tenant = tenants.find(t => String(t.id) === String(id));
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    await updateGristRecord(TENANTS_TABLE, id, {
      plan_id: planId,
      plan_updated_at: new Date().toISOString(),
    });
    
    res.json({ ...tenant, planId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
