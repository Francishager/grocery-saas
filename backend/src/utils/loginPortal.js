const PLATFORM_ROLES = new Set(['saas_admin', 'platform_staff', 'platform_admin', 'super_admin']);

export function isPlatformRole(role) {
  return PLATFORM_ROLES.has(String(role || '').toLowerCase());
}

export function loginPortalMatchesUser(user, portal) {
  if (!['tenant', 'saas_admin'].includes(portal) || !user) return false;
  if (portal === 'saas_admin') return isPlatformRole(user.role);
  return !isPlatformRole(user.role) && Boolean(user.tenantId || user.tenant_id);
}
