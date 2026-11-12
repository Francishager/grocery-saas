export const PLATFORM_PERMISSION_DEFINITIONS = [
  { id: 'view_all_tenants', name: 'View businesses', description: 'View business tenant profiles and account status.', category: 'Tenant operations' },
  { id: 'manage_tenants', name: 'Manage businesses', description: 'Create and update business tenant profiles.', category: 'Tenant operations' },
  { id: 'suspend_tenants', name: 'Suspend or activate businesses', description: 'Change a business tenant account status.', category: 'Tenant operations' },
  { id: 'invite_business_owners', name: 'Onboard business owners', description: 'Invite or manage business-owner onboarding.', category: 'Tenant operations' },
  { id: 'view_platform_users', name: 'View platform users', description: 'View SaaS platform users and business owners.', category: 'Tenant operations' },
  { id: 'view_tenant_billing', name: 'View subscriptions and payments', description: 'View subscription details and the payment ledger.', category: 'Billing' },
  { id: 'manage_tenant_billing', name: 'Manage subscriptions and payments', description: 'Record/cancel manual receipts and manage tenant billing.', category: 'Billing' },
  { id: 'manage_plans', name: 'Manage subscription plans', description: 'Create, update, and assign subscription plans.', category: 'Billing' },
  { id: 'view_platform_analytics', name: 'View platform analytics', description: 'View platform-level usage, activity, and metrics.', category: 'Platform operations' },
  { id: 'manage_platform_staff', name: 'Manage SaaS staff', description: 'Create and manage platform staff assignments and permissions.', category: 'Platform operations' },
  { id: 'view_platform_content', name: 'View platform guides', description: 'View JibuSales Admin help and operating guides.', category: 'Platform operations' },
  { id: 'manage_platform_content', name: 'Manage platform guides', description: 'Create and manage platform help content.', category: 'Platform operations' },
];

export const PLATFORM_PERMISSION_KEYS = PLATFORM_PERMISSION_DEFINITIONS.map(({ id }) => id);
const permissionSet = new Set(PLATFORM_PERMISSION_KEYS);

export const PLATFORM_JOB_PRESETS = [
  { id: 'tenant_support', name: 'Tenant Support', permissions: ['view_all_tenants', 'view_platform_users', 'invite_business_owners'] },
  { id: 'billing_officer', name: 'Subscriptions & Billing', permissions: ['view_all_tenants', 'view_tenant_billing', 'manage_tenant_billing'] },
  { id: 'platform_operations', name: 'Platform Operations', permissions: ['view_all_tenants', 'manage_tenants', 'suspend_tenants', 'view_platform_analytics'] },
  { id: 'staff_manager', name: 'SaaS Staff Manager', permissions: ['manage_platform_staff'] },
  { id: 'custom', name: 'Custom assignment', permissions: [] },
];

export function sanitizePlatformPermissions(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.filter((key) => typeof key === 'string' && permissionSet.has(key)))];
}

export function canDelegatePlatformPermissions(granted, requested) {
  const available = new Set(Array.isArray(granted) ? granted : []);
  return Array.isArray(requested) && requested.every((key) => available.has(key));
}

export function platformPermissionForRequest(method, requestPath) {
  const verb = String(method || '').toUpperCase();
  const pathname = String(requestPath || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (/\/platform-staff(?:\/permission-schema|\/[^/]+\/permissions)?$/.test(pathname)) return 'manage_platform_staff';
  if (/\/billing\//.test(pathname)) return 'manage_tenant_billing';
  if (/\/provision-tenant$/.test(pathname)) return 'manage_tenants';
  if (/\/subscription$/.test(pathname) || /\/renewal-status$/.test(pathname) || /\/payment-methods$/.test(pathname)) return verb === 'GET' ? 'view_tenant_billing' : 'manage_tenant_billing';
  if (/\/platform\/audit(?:\/|$)/.test(pathname)) return 'view_platform_analytics';
  if (/\/platform\/tenant\//.test(pathname)) return verb === 'GET' ? 'view_all_tenants' : 'manage_tenants';
  if (/\/user-guide(?:\/|$)/.test(pathname)) return verb === 'GET' ? 'view_platform_content' : 'manage_platform_content';
  if (/\/referrals\/admin(?:\/|$)/.test(pathname)) return 'view_platform_analytics';
  if (/\/subscription-payments(?:\/|$)/.test(pathname)) return verb === 'GET' ? 'view_tenant_billing' : 'manage_tenant_billing';
  if (/\/subscriptions(?:\/|$)/.test(pathname)) return verb === 'GET' && !/\/payments/.test(pathname) ? 'view_tenant_billing' : 'manage_tenant_billing';
  if (/\/(?:metrics|stats)$/.test(pathname)) return 'view_platform_analytics';
  if (/\/businesses$/.test(pathname)) return verb === 'GET' ? 'view_all_tenants' : 'manage_tenants';
  if (/\/owners(?:\/|$)/.test(pathname)) return verb === 'GET' ? 'view_platform_users' : 'invite_business_owners';
  if (/\/invitations(?:\/|$)/.test(pathname)) return 'invite_business_owners';
  if (/\/tenants(?:\/|$)/.test(pathname)) {
    if (/\/(?:suspend|activate|status)$/.test(pathname)) return 'suspend_tenants';
    return verb === 'GET' ? 'view_all_tenants' : 'manage_tenants';
  }
  if (/\/hr-features\//.test(pathname) || /\/tenants\/(?:activity|audit-trail|metrics|admin-actions|comparison)/.test(pathname)) {
    return verb === 'GET' ? 'view_all_tenants' : 'manage_tenants';
  }
  if (/\/plans?(?:\/|$)/.test(pathname) || /\/features(?:\/|$)/.test(pathname) || /\/plan-features$/.test(pathname)) {
    return verb === 'GET' ? 'view_tenant_billing' : 'manage_plans';
  }
  if (/\/seed$/.test(pathname)) return 'manage_plans';
  return null;
}
