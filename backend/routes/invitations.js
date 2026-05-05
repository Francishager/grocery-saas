import express from 'express';
import { fetchFromGrist, addToGrist, updateGristRecord, deleteFromGrist } from '../gristUtils.js';
import { authenticateToken, requirePlatformAdmin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const router = express.Router();
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE || 'Invitations';
const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const TENANTS_TABLE = process.env.TENANTS_TABLE || 'Tenants';
const PLANS_TABLE = process.env.PLANS_TABLE || 'Plans';

// Generate secure token
const generateToken = () => crypto.randomBytes(32).toString('hex');

// Get all invitations (SaaS Admin only)
router.get('/', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    let invitations = await fetchFromGrist(INVITATIONS_TABLE) || [];
    
    // Filter by status
    if (status && status !== 'all') {
      invitations = invitations.filter(inv => inv.status === status);
    }
    
    // Search
    if (search) {
      const s = search.toLowerCase();
      invitations = invitations.filter(inv => 
        inv.email?.toLowerCase().includes(s) || 
        inv.name?.toLowerCase().includes(s)
      );
    }
    
    // Calculate stats
    const stats = {
      total: invitations.length,
      pending: invitations.filter(i => i.status === 'pending').length,
      accepted: invitations.filter(i => i.status === 'accepted').length,
      expired: invitations.filter(i => i.status === 'expired').length,
      cancelled: invitations.filter(i => i.status === 'cancelled').length,
    };
    
    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginated = invitations.slice(offset, offset + parseInt(limit));
    
    res.json({ invitations: paginated, total: invitations.length, stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get invitation by token (public - for acceptance page)
router.get('/token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const invitations = await fetchFromGrist(INVITATIONS_TABLE) || [];
    const invitation = invitations.find(inv => inv.token === token);
    
    if (!invitation) {
      return res.status(404).json({ message: 'Invalid invitation token' });
    }
    
    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: `Invitation already ${invitation.status}` });
    }
    
    if (new Date(invitation.expires_at) < new Date()) {
      await updateGristRecord(INVITATIONS_TABLE, invitation.id, { status: 'expired' });
      return res.status(400).json({ message: 'Invitation has expired' });
    }
    
    // Get plan info
    let planName = null;
    if (invitation.plan_id) {
      const plans = await fetchFromGrist(PLANS_TABLE) || [];
      const plan = plans.find(p => p.id === invitation.plan_id || String(p.id) === String(invitation.plan_id));
      if (plan) planName = plan.name;
    }
    
    res.json({ 
      ...invitation, 
      planName,
      id: invitation.id 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create invitation (SaaS Admin only)
router.post('/', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { email, name, phone, planId, message } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    // Check if email already exists as user
    const users = await fetchFromGrist(USERS_TABLE) || [];
    const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Check for existing pending invitation
    const invitations = await fetchFromGrist(INVITATIONS_TABLE) || [];
    const existingInv = invitations.find(inv => 
      inv.email?.toLowerCase() === email.toLowerCase() && inv.status === 'pending'
    );
    if (existingInv) {
      return res.status(400).json({ message: 'Pending invitation already exists for this email' });
    }
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    const invitation = await addToGrist(INVITATIONS_TABLE, {
      email: email.toLowerCase(),
      name: name || '',
      phone: phone || '',
      plan_id: planId || null,
      message: message || '',
      token,
      status: 'pending',
      invited_by: req.user.id,
      invited_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });
    
    // TODO: Send invitation email
    
    res.status(201).json({
      id: invitation.id,
      email: email.toLowerCase(),
      name,
      phone,
      planId,
      message,
      token,
      status: 'pending',
      invitedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Batch create invitations
router.post('/batch', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { invitations } = req.body;
    
    if (!Array.isArray(invitations) || invitations.length === 0) {
      return res.status(400).json({ message: 'Invitations array is required' });
    }
    
    const created = [];
    const errors = [];
    
    for (const inv of invitations) {
      try {
        if (!inv.email) {
          errors.push({ email: inv.email, error: 'Email is required' });
          continue;
        }
        
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        const invitation = await addToGrist(INVITATIONS_TABLE, {
          email: inv.email.toLowerCase(),
          name: inv.name || '',
          phone: inv.phone || '',
          plan_id: inv.planId || null,
          message: inv.message || '',
          token,
          status: 'pending',
          invited_by: req.user.id,
          invited_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });
        
        created.push(invitation);
      } catch (err) {
        errors.push({ email: inv.email, error: err.message });
      }
    }
    
    res.status(201).json({ created, errors, total: created.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cancel invitation
router.post('/:id/cancel', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const invitations = await fetchFromGrist(INVITATIONS_TABLE) || [];
    const invitation = invitations.find(inv => String(inv.id) === String(id));
    
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }
    
    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: `Cannot cancel invitation with status: ${invitation.status}` });
    }
    
    await updateGristRecord(INVITATIONS_TABLE, id, { 
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: req.user.id,
    });
    
    res.json({ ...invitation, status: 'cancelled' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Resend invitation
router.post('/:id/resend', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const invitations = await fetchFromGrist(INVITATIONS_TABLE) || [];
    const invitation = invitations.find(inv => String(inv.id) === String(id));
    
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }
    
    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: 'Can only resend pending invitations' });
    }
    
    // Generate new token and extend expiry
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await updateGristRecord(INVITATIONS_TABLE, id, {
      token,
      expires_at: expiresAt.toISOString(),
      resent_at: new Date().toISOString(),
    });
    
    // TODO: Send invitation email
    
    res.json({ ...invitation, token, expiresAt });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Extend invitation expiry
router.post('/:id/extend', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 7 } = req.body;
    
    const invitations = await fetchFromGrist(INVITATIONS_TABLE) || [];
    const invitation = invitations.find(inv => String(inv.id) === String(id));
    
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }
    
    const expiresAt = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000);
    
    await updateGristRecord(INVITATIONS_TABLE, id, {
      expires_at: expiresAt.toISOString(),
    });
    
    res.json({ ...invitation, expiresAt });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get invitation stats
router.get('/stats', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const invitations = await fetchFromGrist(INVITATIONS_TABLE) || [];
    
    res.json({
      total: invitations.length,
      pending: invitations.filter(i => i.status === 'pending').length,
      accepted: invitations.filter(i => i.status === 'accepted').length,
      expired: invitations.filter(i => i.status === 'expired').length,
      cancelled: invitations.filter(i => i.status === 'cancelled').length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
