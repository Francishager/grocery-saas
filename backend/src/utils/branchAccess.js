export const tenantIdFromUser = (user) =>
  user?.tenantId || user?.tenant_id || user?.business_id || null;

const ownerRoles = new Set(["owner"]);

export function isOwner(user) {
  return ownerRoles.has(user?.role);
}

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requestedBranchId(req, source = "query") {
  if (source === "body") return req.body?.branchId || req.body?.branch_id || null;
  if (source === "params") return req.params?.branchId || req.params?.branch_id || null;
  return req.query?.branchId || req.query?.branch_id || null;
}

async function tenantBranch(prisma, tenantId, branchId) {
  if (!branchId) return null;

  return prisma.branch.findFirst({
    where: { id: branchId, tenantId, isActive: true },
    select: { id: true, name: true },
  });
}

async function fallbackTenantBranch(prisma, tenantId) {
  return prisma.branch.findFirst({
    where: { tenantId, isActive: true },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, name: true },
  });
}

async function userBranches(prisma, tenantId, userId) {
  return prisma.userBranch.findMany({
    where: {
      userId,
      branch: { tenantId, isActive: true },
    },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function resolveBranchScope(prisma, req, options = {}) {
  const {
    source = "query",
    requireBranch = false,
    allowOwnerAll = true,
  } = options;

  const tenantId = tenantIdFromUser(req.user);
  if (!tenantId) throw httpError(403, "Tenant access required");

  const branchId = requestedBranchId(req, source);

  if (isOwner(req.user)) {
    if (branchId) {
      const branch = await tenantBranch(prisma, tenantId, branchId);
      if (!branch) throw httpError(404, "Branch not found");
      return { tenantId, branchId: branch.id, branch, canAccessAllBranches: false };
    }

    if (requireBranch || !allowOwnerAll) {
      const branch = await fallbackTenantBranch(prisma, tenantId);
      if (!branch) throw httpError(400, "Create a branch before adding branch data");
      return { tenantId, branchId: branch.id, branch, canAccessAllBranches: false };
    }

    return { tenantId, branchId: null, branch: null, canAccessAllBranches: true };
  }

  const assignments = await userBranches(prisma, tenantId, req.user?.id);
  if (!assignments.length) {
    throw httpError(403, "No branch assigned to this user");
  }

  if (branchId) {
    const assignment = assignments.find((item) => item.branchId === branchId);
    if (!assignment) throw httpError(403, "You do not have access to this branch");
    return {
      tenantId,
      branchId: assignment.branchId,
      branch: assignment.branch,
      canAccessAllBranches: false,
    };
  }

  const primary = assignments[0];
  return {
    tenantId,
    branchId: primary.branchId,
    branch: primary.branch,
    canAccessAllBranches: false,
  };
}

export function scopedWhere(scope, extra = {}) {
  return {
    ...extra,
    tenantId: scope.tenantId,
    ...(scope.branchId ? { branchId: scope.branchId } : {}),
  };
}

export function ensureSameBranch(record, scope, label = "Record") {
  if (!record) throw httpError(404, `${label} not found`);
  if (scope.branchId && record.branchId && record.branchId !== scope.branchId) {
    throw httpError(403, `${label} belongs to another branch`);
  }
  return record;
}

export function handleBranchError(res, error, fallback = "Internal server error") {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  return res.status(500).json({ error: fallback });
}
