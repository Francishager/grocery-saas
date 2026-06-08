import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
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

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, isPlatformUser: user.role === "saas_admin" },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    const refreshToken = jwt.sign({ id: user.id, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    const isPlatformUser = user.role === "saas_admin";
    const permissions = isPlatformUser ? ["*"] : ["dashboard", "sales", "inventory", "purchases", "customers", "reports", "expenses", "settings"];

    res.json({
      user: { id: user.id, email: user.email, name: `${user.fname || ""} ${user.lname || ""}`.trim(), role: user.role, tenantId: user.tenantId, isPlatformUser, permissions },
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

// Me
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { tenant: true } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password: _, ...safe } = user;
    const isPlatformUser = user.role === "saas_admin";
    const permissions = isPlatformUser ? ["*"] : ["dashboard", "sales", "inventory", "purchases", "customers", "reports", "expenses", "settings"];
    res.json({ user: { ...safe, isPlatformUser, permissions } });
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

    res.json({ message: "OTP sent", otp }); // In production, email the OTP instead of returning it
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset password with OTP
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: "email, otp, newPassword required" });

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

// Logout
router.post("/logout", (req, res) => {
  res.json({ message: "Logged out" });
});

export default router;

