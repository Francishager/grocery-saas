import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { fetchFromGrist, addToGrist, updateGristRecord } from '../gristUtils.js';

const router = express.Router();
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE || 'Invitations';
const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const TENANTS_TABLE = process.env.TENANTS_TABLE || 'Tenants';
const PLANS_TABLE = process.env.PLANS_TABLE || 'Plans';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate slug from business name
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) + '-' + Math.random().toString(36).substring(2, 6);
};

// Accept invitation and create account
router.post('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password, name, phone, businessName, businessType } = req.body;
    
    // Validate input
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!businessName) {
      return res.status(400).json({ message: 'Business name is required' });
    }
    
    // Find invitation
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
    
    // Check if user already exists
    const users = await fetchFromGrist(USERS_TABLE) || [];
    const existingUser = users.find(u => u.email?.toLowerCase() === invitation.email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Create tenant/business
    const slug = generateSlug(businessName);
    const tenant = await addToGrist(TENANTS_TABLE, {
      name: businessName,
      slug,
      business_type: businessType || 'retail',
      status: 'active',
      plan_id: invitation.plan_id || null,
      owner_email: invitation.email,
      owner_name: name,
      phone: phone || invitation.phone || '',
      created_at: new Date().toISOString(),
      subscription_status: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 day trial
    });
    
    // Create user (owner)
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await addToGrist(USERS_TABLE, {
      email: invitation.email.toLowerCase(),
      password: hashedPassword,
      name,
      phone: phone || invitation.phone || '',
      role: 'owner',
      tenant_id: tenant.id,
      business_id: tenant.id,
      is_platform_user: false,
      permissions: [
        'view_dashboard',
        'view_sales', 'create_sales', 'edit_sales', 'delete_sales', 'refund_sales',
        'view_purchases', 'create_purchases', 'edit_purchases', 'delete_purchases',
        'view_inventory', 'manage_inventory', 'adjust_stock', 'transfer_stock',
        'view_reports', 'export_reports',
        'view_users', 'manage_users', 'assign_roles',
        'view_settings', 'manage_settings',
        'view_own_billing', 'manage_own_billing',
      ],
      created_at: new Date().toISOString(),
      email_verified: true,
      email_verified_at: new Date().toISOString(),
    });
    
    // Update tenant with owner_id
    await updateGristRecord(TENANTS_TABLE, tenant.id, {
      owner_id: user.id,
    });
    
    // Mark invitation as accepted
    await updateGristRecord(INVITATIONS_TABLE, invitation.id, {
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
      tenant_id: tenant.id,
      tenant_name: businessName,
    });
    
    // Generate tokens
    const accessToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        tenantId: tenant.id,
        isPlatformUser: false,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenant.id,
        institutionId: tenant.id,
        isPlatformUser: false,
        permissions: user.permissions,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
        tokenType: 'Bearer',
      },
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
