import prisma from "../db.js";

/**
 * Log an audit event (SaaS admin operations or system events)
 * @param {object} opts
 * @param {string} opts.tenantId - tenant ID or "platform" for SaaS admin operations
 * @param {string} [opts.targetTenantId] - which tenant was affected by this operation (for cross-tenant operations)
 * @param {string} opts.userId
 * @param {string} opts.userEmail
 * @param {string} opts.action - create | update | delete | login | checkout | bulk_import | suspend | enable | disable | reset | etc.
 * @param {string} opts.model - Product | Sale | Purchase | User | Plan | Tenant | Feature | etc.
 * @param {string} [opts.recordId]
 * @param {object} [opts.changes] - { before, after } or { data }
 * @param {string} [opts.ip]
 * @param {number} [opts.statusCode] - HTTP status code (default 200)
 * @param {string} [opts.severity] - info | warning | critical (default: derived from statusCode)
 */
export async function auditLog(opts) {
  try {
    const severity = opts.severity || (opts.statusCode && opts.statusCode >= 400 ? "warning" : "info");
    await prisma.auditLog.create({
      data: {
        tenantId: opts.tenantId || "platform",
        targetTenantId: opts.targetTenantId || null,
        userId: opts.userId || "system",
        userEmail: opts.userEmail || "",
        action: opts.action,
        model: opts.model,
        recordId: opts.recordId || null,
        changes: opts.changes || null,
        ip: opts.ip || null,
        statusCode: opts.statusCode || 200,
        severity,
      },
    });
  } catch (err) {
    // Never let audit logging break the main operation
    console.error("Audit log write failed:", err.message);
  }
}

/**
 * Log a tenant activity event (captures what users in a tenant are doing)
 * @param {object} opts
 * @param {string} opts.tenantId - tenant ID
 * @param {string} opts.userId - user ID
 * @param {string} opts.userEmail - user email
 * @param {string} opts.action - login, create_product, create_sale, update_product, delete_sale, view_report, etc.
 * @param {string} opts.model - Product, Sale, User, Report, etc.
 * @param {string} [opts.recordId] - ID of the affected record
 * @param {object} [opts.details] - additional context (e.g., { quantity: 10, amount: 500 })
 */
export async function logTenantActivity(opts) {
  try {
    await prisma.tenantActivityLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        userEmail: opts.userEmail,
        action: opts.action,
        model: opts.model,
        recordId: opts.recordId || null,
        details: opts.details || null,
      },
    });
  } catch (err) {
    console.error("Tenant activity log write failed:", err.message);
  }
}

/**
 * Express middleware to auto-audit all mutating requests
 * Captures POST/PUT/PATCH/DELETE and logs all responses (success and failure)
 * Logs SaaS admin operations at platform level
 */
export function auditMiddleware() {
  return async (req, res, next) => {
    // Only audit mutating methods
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

    const originalEnd = res.end.bind(res);
    let responseBody = "";

    // Capture response body
    const originalWrite = res.write.bind(res);
    res.write = function (chunk, ...args) {
      if (typeof chunk === "string") responseBody += chunk;
      return originalWrite(chunk, ...args);
    };

    res.end = function (chunk, ...args) {
      if (typeof chunk === "string") responseBody += chunk;

      // Audit all mutating requests (both success and failure) if user is authenticated
      if (req.user) {
        const action = req.method === "POST" ? "create"
          : req.method === "PUT" || req.method === "PATCH" ? "update"
          : req.method === "DELETE" ? "delete" : "update";

        const model = extractModel(req.originalUrl);
        const recordId = extractRecordId(req);
        const isSaaSAdmin = req.user?.role === "saas_admin";
        const isPlatformRoute = req.originalUrl.includes("/api/admin") || req.originalUrl.includes("/api/platform");
        const isSensitiveOperation = isSensitive(req.originalUrl, action, model);
        const severity = res.statusCode >= 500 ? "critical" : (res.statusCode >= 400 || isSensitiveOperation ? "warning" : "info");

        // Log with high priority for SaaS admin, failed operations, or sensitive operations
        auditLog({
          tenantId: isSaaSAdmin || isPlatformRoute ? "platform" : (req.user?.tenantId || "unknown"),
          userId: req.user?.id || "unknown",
          userEmail: req.user?.email || "",
          action: isSensitiveOperation ? action + "_sensitive" : action,
          model,
          recordId,
          changes: { data: req.body, statusCode: res.statusCode },
          ip: req.ip || req.connection?.remoteAddress,
          statusCode: res.statusCode,
          severity: isSensitiveOperation || isSaaSAdmin ? "critical" : severity,
        }).catch(() => {});

        // Also log successful business operations to tenant activity log
        if (res.statusCode < 400 && !isSaaSAdmin && !isPlatformRoute && req.user?.tenantId) {
          logTenantActivity({
            tenantId: req.user.tenantId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: action,
            model,
            recordId,
            details: req.body,
          }).catch(() => {});
        }
      }

      return originalEnd(chunk, ...args);
    };

    next();
  };
}

/**
 * Check if operation is sensitive and should be marked for high-priority auditing
 */
function isSensitive(url, action, model) {
  const sensitivePatterns = [
    "/admin/",
    "/platform/",
    "subscription",
    "reset-password",
    "permission",
    "feature",
    "plan",
    "tenant",
    "role",
    "invite",
    "provision",
  ];
  return sensitivePatterns.some(p => url.toLowerCase().includes(p));
}

function extractModel(url) {
  // Comprehensive model mapping for all routes
  const modelMap = {
    inventory: "Product",
    sales: "Sale",
    purchases: "Purchase",
    auth: "User",
    tenants: "Tenant",
    admin: "TenantAdmin",
    platform: "PlatformAdmin",
    expenses: "Expense",
    receivables: "Customer",
    payables: "Supplier",
    staff: "Staff",
    branches: "Branch",
    accounting: "Account",
    reports: "Report",
    audit: "AuditLog",
    settings: "Settings",
    integrations: "Integration",
    notifications: "Notification",
    restaurant: "Restaurant",
    fuel: "FuelStation",
    service: "Service",
    manufacturing: "Manufacturing",
    agriculture: "Agriculture",
    rentals: "Rental",
    returns: "Return",
    transfers: "Transfer",
  };

  // Check for specific paths first
  if (url.includes("/subscription")) return "Subscription";
  if (url.includes("/plan")) return "Plan";
  if (url.includes("/feature")) return "Feature";
  if (url.includes("/role")) return "Role";
  if (url.includes("/permission")) return "Permission";
  if (url.includes("/reset-password")) return "User";
  if (url.includes("/invite")) return "Invitation";
  if (url.includes("/provision")) return "Tenant";
  if (url.includes("/create-tenant")) return "Tenant";
  if (url.includes("/businesses")) return "Tenant";

  const segment = url.split("/")[2] || "";
  return modelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1) || "Unknown";
}

function extractRecordId(req) {
  // Try to get ID from params or body
  return req.params?.id || req.body?.id || req.body?.tenantId || req.body?.planId || req.body?.featureId || req.body?.userId || null;
}
