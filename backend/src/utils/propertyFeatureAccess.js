import { getTenantFeatures, hasFeatureAccess } from '../../middleware/featureCheck.js'

export const PROPERTY_MANAGEMENT_FEATURES = [
  'property_management.landlord',
  'property_management.agent',
]

const PROPERTY_ACCOUNT_MARKER = 'JibuSales property accounting role:'

export function isPropertySystemAccount(account) {
  return String(account?.description || '').startsWith(PROPERTY_ACCOUNT_MARKER)
}

export function stripPropertySystemAccounts(accounts) {
  return accounts
    .filter((account) => !isPropertySystemAccount(account))
    .map((account) => ({
      ...account,
      parent: isPropertySystemAccount(account.parent) ? null : account.parent,
      children: Array.isArray(account.children)
        ? account.children.filter((child) => !isPropertySystemAccount(child))
        : account.children,
    }))
}

export async function tenantHasPropertyManagement(tenantId) {
  if (!tenantId) return false
  const features = await getTenantFeatures(tenantId)
  return PROPERTY_MANAGEMENT_FEATURES.some((feature) => hasFeatureAccess(features, feature))
}

export function isPropertyManagementNotification(notification) {
  const metadata = notification?.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const link = String(metadata.link || metadata.url || metadata.href || '').toLowerCase()
  const source = String(metadata.source || metadata.module || metadata.type || '').toLowerCase()
  return Boolean(
    metadata.tenancyId ||
    metadata.propertyTenancyId ||
    link.includes('/property-management') ||
    source.startsWith('property_') ||
    source.startsWith('property-management'),
  )
}

export function canViewPropertyNotification(user, permissionRecord = null) {
  if (['owner', 'saas_admin', 'platform_admin', 'super_admin'].includes(user?.role) || user?.isPlatformUser) return true
  const permissions = new Set(Array.isArray(user?.permissions) ? user.permissions : [])
  const record = Array.isArray(permissionRecord) ? permissionRecord[0] : permissionRecord
  return permissions.has('*') || [
    'canViewPropertyManagement',
    'canViewPropertyPortfolio',
    'canViewPropertyCollections',
    'canViewPropertyStatements',
    'canViewPropertyReports',
  ].some((permission) => permissions.has(permission) || record?.[permission] === true)
}

export async function filterPropertyManagementNotifications(tenantId, notifications, user, permissionRecord = null) {
  const enabled = await tenantHasPropertyManagement(tenantId)
  const allowed = enabled && canViewPropertyNotification(user, permissionRecord)
  return allowed ? notifications : notifications.filter((notification) => !isPropertyManagementNotification(notification))
}
