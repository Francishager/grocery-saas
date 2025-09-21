import { AbilityBuilder, Ability } from '@casl/ability';

// Define CASL abilities per user for RBAC/ABAC on the backend
// Subjects are logical domains e.g. 'businesses', 'subscriptions', 'features', 'inventory', 'sales', 'reports'
export function defineAbilityFor(user = {}) {
  const role = String(user.role || '').toLowerCase();
  const { can, cannot, build } = new AbilityBuilder(Ability);

  switch (role) {
    case 'saas admin':
      can('manage', 'all');
      break;
    case 'owner':
      can('read', 'dashboard');
      can('read', 'reports');
      can('create', 'sales');
      can('update', 'sales');
      can('read', 'inventory');
      can('update', 'inventory');
      break;
    case 'accountant':
      can('read', 'dashboard');
      can('read', 'reports');
      break;
    case 'attendant':
      can('create', 'sales');
      can('read', 'sales');
      break;
    default:
      // no permissions by default
      break;
  }

  // Example ABAC conditions can go here (e.g., constrain to user's business_id)
  // e.g., can('read', 'inventory', { business_id: user.business_id })

  return build();
}

// Middleware to enforce ability
export function authorize(action, subject) {
  return (req, res, next) => {
    const ability = req.ability;
    if (!ability) return res.status(401).json({ error: 'Unauthorized' });
    if (!ability.can(action, subject)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
