import { authenticateToken, requirePermission, requireTenant } from '../../middleware/auth.js';

export const requireAuth = authenticateToken;
export const requireTenantAccess = requireTenant;
export { requirePermission, requireTenant };
