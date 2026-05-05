import express from 'express';
import { fetchFromGrist } from '../gristUtils.js';
import { authenticateToken, requirePlatformAdmin } from '../middleware/auth.js';

const router = express.Router();
const TENANTS_TABLE = process.env.TENANTS_TABLE || 'Tenants';
const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE || 'Invitations';
const PLANS_TABLE = process.env.PLANS_TABLE || 'Plans';

// Get platform statistics (SaaS Admin only)
router.get('/stats', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenants = await fetchFromGrist(TENANTS_TABLE) || [];
    const users = await fetchFromGrist(USERS_TABLE) || [];
    const invitations = await fetchFromGrist(INVITATIONS_TABLE) || [];
    const plans = await fetchFromGrist(PLANS_TABLE) || [];
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    
    // Calculate tenant stats
    const activeTenants = tenants.filter(t => t.status === 'active');
    const suspendedTenants = tenants.filter(t => t.status === 'suspended');
    const trialTenants = tenants.filter(t => t.status === 'trial');
    
    // Calculate monthly revenue (sum of plan prices for active tenants)
    let monthlyRevenue = 0;
    for (const tenant of activeTenants) {
      const plan = plans.find(p => String(p.id) === String(tenant.plan_id));
      if (plan?.price) {
        monthlyRevenue += parseFloat(plan.price) || 0;
      }
    }
    
    // Calculate expiring subscriptions (within 7 days)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringSubscriptions = tenants.filter(t => {
      if (t.status !== 'active') return false;
      const expiresAt = t.expires_at || t.trial_ends_at;
      if (!expiresAt) return false;
      return new Date(expiresAt) <= sevenDaysFromNow;
    }).length;
    
    // Pending invitations
    const pendingInvitations = invitations.filter(i => i.status === 'pending').length;
    
    // New tenants this month
    const newTenantsThisMonth = tenants.filter(t => {
      const createdAt = new Date(t.created_at);
      return createdAt >= thirtyDaysAgo;
    }).length;
    
    res.json({
      totalTenants: tenants.length,
      activeTenants: activeTenants.length,
      suspendedTenants: suspendedTenants.length,
      trialTenants: trialTenants.length,
      totalUsers: users.length,
      monthlyRevenue,
      revenueChange: 0, // TODO: Calculate from previous month
      pendingInvitations,
      expiringSubscriptions,
      newTenantsThisMonth,
      totalPlans: plans.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all platform users (SaaS Admin only)
router.get('/users', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    let users = await fetchFromGrist(USERS_TABLE) || [];
    
    // Filter by role
    if (role) {
      users = users.filter(u => u.role === role);
    }
    
    // Search
    if (search) {
      const s = search.toLowerCase();
      users = users.filter(u => 
        u.email?.toLowerCase().includes(s) || 
        u.name?.toLowerCase().includes(s)
      );
    }
    
    // Remove sensitive data
    const safeUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      tenantId: u.tenant_id || u.business_id,
      isPlatformUser: u.is_platform_user || false,
      createdAt: u.created_at,
      lastLogin: u.last_login,
    }));
    
    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginated = safeUsers.slice(offset, offset + parseInt(limit));
    
    res.json({ users: paginated, total: safeUsers.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get subscription plans
router.get('/plans', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const plans = await fetchFromGrist(PLANS_TABLE) || [];
    
    res.json(plans.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency || 'UGX',
      durationDays: p.duration_days || 30,
      maxUsers: p.max_users,
      maxBranches: p.max_branches,
      maxProducts: p.max_products,
      features: p.features || [],
      isActive: p.is_active !== false,
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create/update plan
router.post('/plans', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { name, description, price, currency, durationDays, maxUsers, maxBranches, maxProducts, features } = req.body;
    
    const { addToGrist } = await import('../gristUtils.js');
    const plan = await addToGrist(PLANS_TABLE, {
      name,
      description: description || '',
      price: parseFloat(price) || 0,
      currency: currency || 'UGX',
      duration_days: parseInt(durationDays) || 30,
      max_users: parseInt(maxUsers) || null,
      max_branches: parseInt(maxBranches) || null,
      max_products: parseInt(maxProducts) || null,
      features: features || [],
      is_active: true,
      created_at: new Date().toISOString(),
    });
    
    res.status(201).json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
