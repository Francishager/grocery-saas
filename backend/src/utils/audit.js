import prisma from "../db.js";

/**
 * Log an audit event
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.userId
 * @param {string} opts.userEmail
 * @param {string} opts.action - create | update | delete | login | checkout | bulk_import
 * @param {string} opts.model - Product | Sale | Purchase | User | etc.
 * @param {string} [opts.recordId]
 * @param {object} [opts.changes] - { before, after } or { data }
 * @param {string} [opts.ip]
 */
export async function auditLog(opts) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        userEmail: opts.userEmail || "",
        action: opts.action,
        model: opts.model,
        recordId: opts.recordId || null,
        changes: opts.changes || null,
        ip: opts.ip || null,
      },
    });
  } catch (err) {
    // Never let audit logging break the main operation
    console.error("Audit log write failed:", err.message);
  }
}

/**
 * Express middleware to auto-audit all mutating requests
 * Captures POST/PUT/PATCH/DELETE and logs after response
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

      // Only audit successful responses
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const action = req.method === "POST" ? "create"
          : req.method === "PUT" || req.method === "PATCH" ? "update"
          : req.method === "DELETE" ? "delete" : "update";

        const model = extractModel(req.originalUrl);
        const recordId = extractRecordId(req);

        auditLog({
          tenantId: req.user?.tenantId || "platform",
          userId: req.user?.id || "unknown",
          userEmail: req.user?.email || "",
          action,
          model,
          recordId,
          changes: { data: req.body },
          ip: req.ip || req.connection?.remoteAddress,
        }).catch(() => {});
      }

      return originalEnd(chunk, ...args);
    };

    next();
  };
}

function extractModel(url) {
  // /api/inventory → Product, /api/sales → Sale, /api/purchases → Purchase, etc.
  const modelMap = {
    inventory: "Product",
    sales: "Sale",
    purchases: "Purchase",
    auth: "User",
    tenants: "Tenant",
    admin: "Admin",
    expenses: "Expense",
    receivables: "Customer",
    payables: "Supplier",
  };
  const segment = url.split("/")[2] || "";
  return modelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
}

function extractRecordId(req) {
  // Try to get ID from params or body
  return req.params?.id || req.body?.id || null;
}
