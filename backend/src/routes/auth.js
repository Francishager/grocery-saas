import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import cloudinary from "cloudinary";
import prisma from "../db.js";
import { authenticateToken } from "../../middleware/auth.js";
import { sendMail } from "../../mailer.js";
import { resolveEffectivePermissions } from "../utils/permissions.js";
import { getTenantFeatures } from "../../middleware/featureCheck.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

function primaryBranchId(user) {
  const primary = user.branches?.find((item) => item.isPrimary) || user.branches?.[0];
  return primary?.branchId || null;
}

function userPayload(user, userPerm, tenantFeatures = null) {
  const isPlatformUser = user.role === "saas_admin";
  const permissions = resolveEffectivePermissions(user, userPerm, [], tenantFeatures);

  return {
    id: user.id,
    email: user.email,
    name: `${user.fname || ""} ${user.lname || ""}`.trim(),
    fname: user.fname,
    lname: user.lname,
    avatar: user.avatar || null,
    role: user.role,
    tenantId: user.tenantId,
    branchId: primaryBranchId(user),
    isPlatformUser,
    permissions,
  };
}

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        tenant: true,
        branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      },
    });
    if (!user || !user.isActive) return res.status(401).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    // Force password reset if otpCode is present (first login after admin invite)
    if (user.otpCode && user.otpExpires && new Date(user.otpExpires) > new Date()) {
      return res.json({
        forceReset: true,
        email: user.email,
        message: "Please reset your password using the OTP sent to your email",
      });
    }

    // Fetch granular permissions BEFORE signing JWT so they're included in the token
    const userPerm = await prisma.userPermission.findUnique({ where: { userId: user.id } });
    const tenantFeatures = user.tenantId ? await getTenantFeatures(user.tenantId) : new Set();

    // Build permissions list: saas_admin gets wildcard, owner gets feature-aware access, others get explicit permissions from UserPermission table
    const jwtPermissions = resolveEffectivePermissions(user, userPerm, [], tenantFeatures);

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, isPlatformUser: user.role === "saas_admin", permissions: jwtPermissions },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    const refreshToken = jwt.sign({ id: user.id, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    res.json({
      user: userPayload(user, userPerm, tenantFeatures),
      tokens: { accessToken, refreshToken, expiresIn: 86400, tokenType: "Bearer" },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error", detail: err.message });
  }
});

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, password, fname, lname, phone, tenantId, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "User already exists" });

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashed, fname, lname, phone, tenantId, role: role || "attendant" },
    });

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      token: { accessToken, expiresIn: 86400 },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Refresh access token using refresh token
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    if (decoded.type !== "refresh") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { tenant: true, branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "User not found or inactive" });
    }

    const userPerm = await prisma.userPermission.findUnique({ where: { userId: user.id } });
    const tenantFeatures = user.tenantId ? await getTenantFeatures(user.tenantId) : new Set();

    // Build permissions list: saas_admin gets wildcard, owner gets feature-aware access, others get explicit permissions from UserPermission table
    const jwtPermissions = resolveEffectivePermissions(user, userPerm, [], tenantFeatures);

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, isPlatformUser: user.role === "saas_admin", permissions: jwtPermissions },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    const newRefreshToken = jwt.sign({ id: user.id, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      user: userPayload(user, userPerm, tenantFeatures),
      tokens: { accessToken, refreshToken: newRefreshToken, expiresIn: 86400, tokenType: "Bearer" },
    });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Me
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        tenant: true,
        branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    const userPerm = await prisma.userPermission.findUnique({ where: { userId: user.id } });
    const tenantFeatures = user.tenantId ? await getTenantFeatures(user.tenantId) : new Set();
    const { password: _, ...safe } = user;
    res.json({ user: { ...safe, ...userPayload(user, userPerm, tenantFeatures) } });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Request password reset (OTP)
router.post("/request-reset", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.user.update({ where: { id: user.id }, data: { otpCode: otp, otpExpires } });

    let emailSent = false;
    let emailError = null;
    try {
      await sendMail(
        user.email,
        "Password reset code",
        `<p>Hello ${user.fname || ""},</p><p>Your password reset code is <b>${otp}</b>.</p><p>This code expires in 24 hours.</p>`
      );
      emailSent = true;
    } catch (err) {
      emailError = err?.message || "Email failed";
      console.warn("Password reset email failed:", emailError);
    }

    res.json({
      message: emailSent ? "Reset code sent" : "Reset code generated, but email failed",
      emailSent,
      emailError,
      otp: emailSent ? undefined : otp,
    });
  } catch (err) {
    console.error("Request reset error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset password with OTP
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: "email, otp, newPassword required" });
    if (String(newPassword).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.otpCode || !user.otpExpires) return res.status(400).json({ error: "No OTP requested" });
    if (String(user.otpCode) !== String(otp) || new Date(user.otpExpires) < new Date()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, otpCode: null, otpExpires: null } });
    res.json({ message: "Password updated" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update profile (name, phone, avatar)
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { fname, lname, phone, avatar } = req.body;
    const data = {};
    if (fname !== undefined) data.fname = fname;
    if (lname !== undefined) data.lname = lname;
    if (phone !== undefined) data.phone = phone || null;
    if (avatar !== undefined) data.avatar = avatar || null;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      include: {
        tenant: true,
        branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      },
    });

    const userPerm = await prisma.userPermission.findUnique({ where: { userId: req.user.id } });
    res.json({ message: "Profile updated", user: userPayload(user, userPerm) });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Change password (requires current password)
router.put("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Current and new password required" });
    if (String(newPassword).length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ error: "Current password is incorrect" });

    const hashed = await bcrypt.hash(String(newPassword), 12);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// Upload avatar
router.post("/avatar", authenticateToken, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const stream = cloudinary.v2.uploader.upload_stream(
      { folder: `jibusales/avatars/${req.user.id}`, public_id: `avatar-${Date.now()}`, overwrite: true },
      async (error, cloudResult) => {
        if (error) {
          console.error("Avatar upload error:", error);
          return res.status(500).json({ error: "Failed to upload avatar" });
        }
        const avatarUrl = cloudResult.secure_url;
        await prisma.user.update({ where: { id: req.user.id }, data: { avatar: avatarUrl } });

        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          include: { tenant: true, branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
        });
        const userPerm = await prisma.userPermission.findUnique({ where: { userId: req.user.id } });
        res.json({ message: "Avatar uploaded", avatar: avatarUrl, user: userPayload(user, userPerm) });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    console.error("Upload avatar error:", err);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  res.json({ message: "Logged out" });
});

export default router;
