import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import prisma from "./db.js";

import authRoutes from "./routes/auth.js";
import purchaseRoutes from "./routes/purchases.js";
import salesRoutes from "./routes/sales.js";
import inventoryRoutes from "./routes/inventory.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportRoutes from "./routes/reports.js";
import adminRoutes from "./routes/admin.js";
import invitationRoutes from "./routes/invitations.js";
import tenantRoutes from "./routes/tenants.js";
import crudRoutes from "./routes/crud.js";
import auditRoutes from "./routes/audit.js";
import receiptRoutes from "./routes/receipts.js";
import branchRoutes from "./routes/branches.js";
import staffRoutes from "./routes/staff.js";
import settingsRoutes from "./routes/settings.js";

import receivablesRouter from "../routes/receivables.js";
import payablesRouter from "../routes/payables.js";
import expensesRouter from "../routes/expenses.js";
import platformNewRouter from "../routes/platform-new.js";
import rentalsRouter from "../routes/rentals.js";
import returnsRouter from "../routes/returns.js";
import accountingRouter from "../routes/accounting.js";
import hrRouter from "../routes/hr.js";
import transfersRouter from "../routes/transfers.js";
import notificationsRouter from "../routes/notifications.js";
import integrationsRouter from "../routes/integrations.js";
import restaurantRouter from "../routes/restaurant.js";

import { auditMiddleware } from "./utils/audit.js";

dotenv.config();
const resolvedDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;
if (resolvedDatabaseUrl && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Serve uploaded files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Validate env
const missingEnvVars = ["DATABASE_URL", "JWT_SECRET"].filter(
  (k) => !process.env[k] || String(process.env[k]).trim() === ""
);
if (missingEnvVars.length) {
  console.warn("⚠️ Missing env vars:", missingEnvVars.join(", "));
} else {
  console.log("✅ All required env vars set.");
}

// DB connect
(async () => {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");
  } catch (e) {
    console.warn("⚠️ Database connection failed:", e.message);
  }
})();

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Always allow production frontend as fallback
const productionFrontend = "https://grocery-saas.grocerysaas.workers.dev";

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (origin.includes("localhost")) return cb(null, true);
      if (origin === productionFrontend) return cb(null, true);
      if (!allowedOrigins.length) return cb(null, true);
      cb(new Error("CORS: Origin not allowed"), false);
    },
    credentials: true,
  })
);
app.use(express.json());

// Audit logging middleware (captures all mutating requests)
app.use("/api", auditMiddleware());

// Security headers
app.use((req, res, next) => {
  res.set("X-Frame-Options", "DENY");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  next();
});

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Grocery SaaS API",
    version: "2.0.0",
    missingEnvVars: missingEnvVars.length ? missingEnvVars : undefined,
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/admin/crud", crudRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/settings", settingsRoutes);

// Platform routes (single router — handles plans, features, tenants, analytics)
app.use("/api/platform", platformNewRouter);
app.use("/api/receivables", receivablesRouter);
app.use("/api/payables", payablesRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/rentals", rentalsRouter);
app.use("/api/returns", returnsRouter);
app.use("/api/accounting", accountingRouter);
app.use("/api/hr", hrRouter);
app.use("/api/transfers", transfersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/restaurant", restaurantRouter);

// 404
app.use("/{*path}", (req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// Start
const HOST = process.env.HOST || "0.0.0.0";
app.listen(Number(PORT), HOST, () => {
  console.log(`✅ Backend running on http://${HOST}:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
