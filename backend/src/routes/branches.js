import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { checkUsageLimit } from "../utils/usageLimits.js";

const router = Router();

const tenantRoles = ["owner", "manager", "accountant", "attendant"];
const branchManagerRoles = ["owner"];

function tenantIdFrom(req) {
  return req.user?.tenantId || req.user?.tenant_id || req.user?.business_id || null;
}

function requireTenantUser(req, res, next) {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) {
    return res.status(403).json({ error: "Tenant access required" });
  }
  req.tenantId = tenantId;
  next();
}

function cleanBranchPayload(body = {}) {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    data.name = String(body.name || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, "address")) {
    const address = String(body.address || "").trim();
    data.address = address || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
    data.isActive = Boolean(body.isActive);
  } else if (Object.prototype.hasOwnProperty.call(body, "status")) {
    data.isActive = body.status !== "inactive";
  }

  return data;
}

function branchResponse(branch) {
  return {
    ...branch,
    status: branch.isActive ? "active" : "inactive",
    userCount: branch._count?.users ?? undefined,
  };
}

async function findTenantBranch(req, res) {
  const branch = await prisma.branch.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
    include: { _count: { select: { users: true } } },
  });

  if (!branch) {
    res.status(404).json({ error: "Branch not found" });
    return null;
  }

  return branch;
}

router.get(
  "/",
  authenticateToken,
  requirePermission("canViewBranch"),
  requireTenantUser,
  async (req, res) => {
    try {
      const { status } = req.query;
      const where = { tenantId: req.tenantId };
      if (status === "active") where.isActive = true;
      if (status === "inactive") where.isActive = false;

      const branches = await prisma.branch.findMany({
        where,
        include: { _count: { select: { users: true } } },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      });

      res.json({ branches: branches.map(branchResponse) });
    } catch (err) {
      console.error("List branches error:", err);
      res.status(500).json({ error: "Failed to load branches" });
    }
  }
);

router.get(
  "/active",
  authenticateToken,
  requirePermission("canViewBranch"),
  requireTenantUser,
  async (req, res) => {
    try {
      const branches = await prisma.branch.findMany({
        where: { tenantId: req.tenantId, isActive: true },
        include: { _count: { select: { users: true } } },
        orderBy: { name: "asc" },
      });

      res.json({ branches: branches.map(branchResponse) });
    } catch (err) {
      console.error("List active branches error:", err);
      res.status(500).json({ error: "Failed to load active branches" });
    }
  }
);

router.get(
  "/:id",
  authenticateToken,
  requirePermission("canViewBranch"),
  requireTenantUser,
  async (req, res) => {
    try {
      const branch = await findTenantBranch(req, res);
      if (!branch) return;
      res.json(branchResponse(branch));
    } catch (err) {
      console.error("Get branch error:", err);
      res.status(500).json({ error: "Failed to load branch" });
    }
  }
);

router.post(
  "/",
  authenticateToken,
  requirePermission("canCreateBranch"),
  requireTenantUser,
  async (req, res) => {
    try {
      const data = cleanBranchPayload(req.body);
      if (!data.name) return res.status(400).json({ error: "Branch name required" });

      await checkUsageLimit(req.tenantId, 'branches');

      const branch = await prisma.branch.create({
        data: {
          name: data.name,
          address: data.address,
          isActive: data.isActive ?? true,
          tenantId: req.tenantId,
        },
        include: { _count: { select: { users: true } } },
      });

      res.status(201).json({ message: "Branch created", branch: branchResponse(branch) });
    } catch (err) {
      if (err?.code === 'LIMIT_REACHED') return res.status(403).json({ error: err.message });
      if (err?.code === "P2002") {
        return res.status(409).json({ error: "A branch with this name already exists" });
      }
      console.error("Create branch error:", err);
      res.status(500).json({ error: "Failed to create branch" });
    }
  }
);

router.put(
  "/:id",
  authenticateToken,
  requirePermission("canEditBranch"),
  requireTenantUser,
  async (req, res) => {
    try {
      const existing = await findTenantBranch(req, res);
      if (!existing) return;

      const data = cleanBranchPayload(req.body);
      if (Object.prototype.hasOwnProperty.call(data, "name") && !data.name) {
        return res.status(400).json({ error: "Branch name required" });
      }

      const branch = await prisma.branch.update({
        where: { id: existing.id },
        data,
        include: { _count: { select: { users: true } } },
      });

      res.json({ message: "Branch updated", branch: branchResponse(branch) });
    } catch (err) {
      if (err?.code === "P2002") {
        return res.status(409).json({ error: "A branch with this name already exists" });
      }
      console.error("Update branch error:", err);
      res.status(500).json({ error: "Failed to update branch" });
    }
  }
);

router.patch(
  "/:id",
  authenticateToken,
  requirePermission("canEditBranch"),
  requireTenantUser,
  async (req, res) => {
    try {
      const existing = await findTenantBranch(req, res);
      if (!existing) return;

      const data = cleanBranchPayload(req.body);
      if (Object.prototype.hasOwnProperty.call(data, "name") && !data.name) {
        return res.status(400).json({ error: "Branch name required" });
      }

      const branch = await prisma.branch.update({
        where: { id: existing.id },
        data,
        include: { _count: { select: { users: true } } },
      });

      res.json({ message: "Branch updated", branch: branchResponse(branch) });
    } catch (err) {
      if (err?.code === "P2002") {
        return res.status(409).json({ error: "A branch with this name already exists" });
      }
      console.error("Patch branch error:", err);
      res.status(500).json({ error: "Failed to update branch" });
    }
  }
);

router.delete(
  "/:id",
  authenticateToken,
  requirePermission("canDeleteBranch"),
  requireTenantUser,
  async (req, res) => {
    try {
      const existing = await findTenantBranch(req, res);
      if (!existing) return;

      await prisma.branch.delete({ where: { id: existing.id } });
      res.json({ message: "Branch deleted" });
    } catch (err) {
      console.error("Delete branch error:", err);
      res.status(500).json({ error: "Failed to delete branch" });
    }
  }
);

export default router;
