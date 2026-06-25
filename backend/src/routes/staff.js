import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { tenantIdFromUser } from "../utils/branchAccess.js";

const router = Router();

const staffRoles = new Set(["manager", "accountant", "attendant"]);

const PERM_KEYS = [
  "canCreateSale","canViewSale","canEditSale","canDeleteSale","canRefundSale",
  "canCreateProduct","canViewProduct","canEditProduct","canDeleteProduct",
  "canCreatePurchase","canViewPurchase","canEditPurchase","canDeletePurchase",
  "canCreateExpense","canViewExpense","canEditExpense","canDeleteExpense",
  "canCreateCustomer","canViewCustomer","canEditCustomer","canDeleteCustomer",
  "canCreateSupplier","canViewSupplier","canEditSupplier","canDeleteSupplier",
  "canCreateStaff","canViewStaff","canEditStaff","canDeleteStaff",
  "canCreateBranch","canViewBranch","canEditBranch","canDeleteBranch",
  "canViewReport","canViewSettings","canEditSettings","canGiveDiscount",
];

const ROLE_DEFAULTS = {
  manager: {
    canCreateSale:true,canViewSale:true,canEditSale:true,canDeleteSale:false,canRefundSale:true,
    canCreateProduct:true,canViewProduct:true,canEditProduct:true,canDeleteProduct:false,
    canCreatePurchase:true,canViewPurchase:true,canEditPurchase:true,canDeletePurchase:false,
    canCreateExpense:true,canViewExpense:true,canEditExpense:true,canDeleteExpense:false,
    canCreateCustomer:true,canViewCustomer:true,canEditCustomer:true,canDeleteCustomer:false,
    canCreateSupplier:true,canViewSupplier:true,canEditSupplier:true,canDeleteSupplier:false,
    canCreateStaff:false,canViewStaff:true,canEditStaff:false,canDeleteStaff:false,
    canCreateBranch:false,canViewBranch:true,canEditBranch:false,canDeleteBranch:false,
    canViewReport:true,canViewSettings:true,canEditSettings:false,canGiveDiscount:true,
  },
  accountant: {
    canCreateSale:false,canViewSale:true,canEditSale:false,canDeleteSale:false,canRefundSale:false,
    canCreateProduct:false,canViewProduct:true,canEditProduct:false,canDeleteProduct:false,
    canCreatePurchase:true,canViewPurchase:true,canEditPurchase:true,canDeletePurchase:false,
    canCreateExpense:true,canViewExpense:true,canEditExpense:true,canDeleteExpense:false,
    canCreateCustomer:true,canViewCustomer:true,canEditCustomer:true,canDeleteCustomer:false,
    canCreateSupplier:true,canViewSupplier:true,canEditSupplier:true,canDeleteSupplier:false,
    canCreateStaff:false,canViewStaff:true,canEditStaff:false,canDeleteStaff:false,
    canCreateBranch:false,canViewBranch:true,canEditBranch:false,canDeleteBranch:false,
    canViewReport:true,canViewSettings:true,canEditSettings:false,canGiveDiscount:false,
  },
  attendant: {
    canCreateSale:true,canViewSale:true,canEditSale:false,canDeleteSale:false,canRefundSale:false,
    canCreateProduct:false,canViewProduct:true,canEditProduct:false,canDeleteProduct:false,
    canCreatePurchase:false,canViewPurchase:false,canEditPurchase:false,canDeletePurchase:false,
    canCreateExpense:false,canViewExpense:false,canEditExpense:false,canDeleteExpense:false,
    canCreateCustomer:false,canViewCustomer:true,canEditCustomer:false,canDeleteCustomer:false,
    canCreateSupplier:false,canViewSupplier:false,canEditSupplier:false,canDeleteSupplier:false,
    canCreateStaff:false,canViewStaff:false,canEditStaff:false,canDeleteStaff:false,
    canCreateBranch:false,canViewBranch:false,canEditBranch:false,canDeleteBranch:false,
    canViewReport:false,canViewSettings:false,canEditSettings:false,canGiveDiscount:false,
  },
};

// Get permission keys and role defaults
router.get("/permissions/schema", authenticateToken, requireRole(["owner"]), (req, res) => {
  res.json({ keys: PERM_KEYS, defaults: ROLE_DEFAULTS });
});

function splitName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return {
    fname: parts[0] || "",
    lname: parts.slice(1).join(" "),
  };
}

function staffResponse(user) {
  const primaryBranch = user.branches?.find((item) => item.isPrimary) || user.branches?.[0] || null;
  const { password: _, branches, ...safe } = user;
  return {
    ...safe,
    name: `${user.fname || ""} ${user.lname || ""}`.trim() || user.email,
    branchId: primaryBranch?.branchId || null,
    branch: primaryBranch?.branch || null,
    branches: branches?.map((item) => ({
      id: item.branchId,
      name: item.branch?.name || "",
      isPrimary: item.isPrimary,
    })) || [],
  };
}

async function requireTenantBranch(tenantId, branchId) {
  if (!branchId) return null;

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, isActive: true },
  });

  if (!branch) {
    const error = new Error("Branch not found");
    error.statusCode = 404;
    throw error;
  }

  return branch;
}

async function replacePrimaryBranch(userId, branchId) {
  if (!branchId) return;

  await prisma.userBranch.deleteMany({ where: { userId } });
  await prisma.userBranch.create({
    data: { userId, branchId, isPrimary: true },
  });
}

router.get("/", authenticateToken, requireRole(["owner"]), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const staff = await prisma.user.findMany({
      where: { tenantId, role: { in: [...Array.from(staffRoles), "owner"] } },
      include: {
        branches: {
          include: { branch: { select: { id: true, name: true, isActive: true } } },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    res.json({ staff: staff.map(staffResponse) });
  } catch (err) {
    console.error("List staff error:", err);
    res.status(500).json({ error: "Failed to load staff" });
  }
});

router.post("/", authenticateToken, requireRole(["owner"]), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const { name, email, password, fname, lname, phone, role = "attendant", branchId, permissions } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ error: "Email is required" });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (!staffRoles.has(role)) return res.status(400).json({ error: "Invalid staff role" });
    if (!branchId) return res.status(400).json({ error: "Branch is required" });

    await requireTenantBranch(tenantId, branchId);

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ error: "User already exists" });

    const parsed = splitName(name);
    const hashed = await bcrypt.hash(String(password), 12);

    // Build permission data from request or role defaults
    const permData = {};
    for (const key of PERM_KEYS) {
      if (permissions && permissions[key] !== undefined) {
        permData[key] = Boolean(permissions[key]);
      } else {
        permData[key] = ROLE_DEFAULTS[role]?.[key] ?? ROLE_DEFAULTS.attendant[key];
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashed,
          fname: fname || parsed.fname || normalizedEmail.split("@")[0],
          lname: lname || parsed.lname || "",
          phone,
          role,
          tenantId,
          isActive: true,
        },
      });

      await tx.userBranch.create({
        data: { userId: created.id, branchId, isPrimary: true },
      });

      await tx.userPermission.create({
        data: { userId: created.id, ...permData },
      });

      return tx.user.findUnique({
        where: { id: created.id },
        include: {
          branches: {
            include: { branch: { select: { id: true, name: true, isActive: true } } },
          },
        },
      });
    });

    res.status(201).json({ message: "Staff created", staff: staffResponse(user) });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err?.code === "P2002") return res.status(409).json({ error: "User already exists" });
    console.error("Create staff error:", err);
    res.status(500).json({ error: "Failed to create staff" });
  }
});

router.patch("/:id", authenticateToken, requireRole(["owner"]), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId, role: { in: [...Array.from(staffRoles), "owner"] } },
    });

    if (!existing) return res.status(404).json({ error: "Staff not found" });

    const data = {};
    const { name, fname, lname, phone, role, isActive, branchId, password } = req.body;

    if (role !== undefined) {
      if (!staffRoles.has(role) && role !== "owner") return res.status(400).json({ error: "Invalid staff role" });
      data.role = role;
    }

    if (name !== undefined) {
      const parsed = splitName(name);
      data.fname = parsed.fname;
      data.lname = parsed.lname;
    }
    if (fname !== undefined) data.fname = fname;
    if (lname !== undefined) data.lname = lname;
    if (phone !== undefined) data.phone = phone || null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (password !== undefined) {
      if (!password || String(password).length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      data.password = await bcrypt.hash(String(password), 12);
    }

    if (branchId) await requireTenantBranch(tenantId, branchId);

    const user = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: existing.id }, data });
      if (branchId) {
        await tx.userBranch.deleteMany({ where: { userId: existing.id } });
        await tx.userBranch.create({
          data: { userId: existing.id, branchId, isPrimary: true },
        });
      }

      return tx.user.findUnique({
        where: { id: existing.id },
        include: {
          branches: {
            include: { branch: { select: { id: true, name: true, isActive: true } } },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
        },
      });
    });

    res.json({ message: "Staff updated", staff: staffResponse(user) });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error("Update staff error:", err);
    res.status(500).json({ error: "Failed to update staff" });
  }
});

router.delete("/:id", authenticateToken, requireRole(["owner"]), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId, role: { in: [...Array.from(staffRoles), "owner"] } },
    });
    if (!existing) return res.status(404).json({ error: "Staff not found" });

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { isActive: false },
      include: {
        branches: {
          include: { branch: { select: { id: true, name: true, isActive: true } } },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
    });

    res.json({ message: "Staff deactivated", staff: staffResponse(user) });
  } catch (err) {
    console.error("Deactivate staff error:", err);
    res.status(500).json({ error: "Failed to deactivate staff" });
  }
});

// Get permissions for a staff member
router.get("/:id/permissions", authenticateToken, requireRole(["owner"]), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId, role: { in: [...Array.from(staffRoles), "owner"] } },
    });
    if (!user) return res.status(404).json({ error: "Staff not found" });

    let perms = await prisma.userPermission.findUnique({ where: { userId: user.id } });
    if (!perms) {
      // Owner gets all permissions; others get role defaults
      const defaults = user.role === "owner" ? Object.fromEntries(PERM_KEYS.map(k => [k, true])) : (ROLE_DEFAULTS[user.role] || ROLE_DEFAULTS.attendant);
      const permData = {};
      for (const key of PERM_KEYS) permData[key] = defaults[key] ?? false;
      perms = await prisma.userPermission.create({ data: { userId: user.id, ...permData } });
    }
    res.json(perms);
  } catch (err) {
    console.error("Get permissions error:", err);
    res.status(500).json({ error: "Failed to load permissions" });
  }
});

// Update permissions for a staff member
router.put("/:id/permissions", authenticateToken, requireRole(["owner"]), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId, role: { in: [...Array.from(staffRoles), "owner"] } },
    });
    if (!user) return res.status(404).json({ error: "Staff not found" });

    const data = {};
    for (const key of PERM_KEYS) {
      if (req.body[key] !== undefined) data[key] = Boolean(req.body[key]);
    }

    const perms = await prisma.userPermission.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });
    res.json({ message: "Permissions updated", permissions: perms });
  } catch (err) {
    console.error("Update permissions error:", err);
    res.status(500).json({ error: "Failed to update permissions" });
  }
});

export default router;
