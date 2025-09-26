import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { fetchFromGrist, addToGrist, updateGristRecord, bulkAddToGrist, decryptDeep, fetchTableColumns } from "./gristUtils.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { sendMail } from "./mailer.js";
import crudRouter from "./crudRouter.js";
import { defineAbilityFor, authorize } from "./accessControl.js";

dotenv.config();

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurable table names
const USERS_TABLE = process.env.USERS_TABLE || "Users";
const SUBSCRIPTIONS_TABLE = process.env.SUBSCRIPTIONS_TABLE || 'Subscription';
const BUSINESSES_TABLE = process.env.BUSINESSES_TABLE || 'Businesses';

// Validate required environment variables at startup
function validateEnv() {
  const required = ["GRIST_API_KEY", "GRIST_DOC_ID", "JWT_SECRET"];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
  if (missing.length) {
    console.error("Missing required environment variables:", missing.join(", "));
    console.error("Please create/update your .env with the required keys.");
    process.exit(1);
  }
}
validateEnv();

const app = express();
// Configure CORS: allow credentials and restrict to configured origins if provided
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow same-origin or mobile apps
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS: Origin not allowed'), false);
  },
  credentials: true
}));
app.use(express.json());

// Basic security headers (does not prevent copying but improves security posture)
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  // Avoid caching sensitive admin UI and scripts
  if (req.path === '/admin' || req.path === '/admin.html' || req.path === '/js/admin.js' || req.path.startsWith('/js/admin/')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// === Purchases: create purchase (Owner, Manager, Accountant) ===
app.post('/purchases', authenticateToken, requireRole(['Owner','Manager','Accountant']), async (req, res) => {
  try {
    const business_id = req.user?.business_id;
    const staff_name = `${req.user?.fname || ''} ${req.user?.lname || ''}`.trim();

    // Require a transaction account for the acting user
    try {
      const users = await fetchFromGrist(USERS_TABLE);
      const me = (users || []).find(u => String(u.id) === String(req.user?.id) || String(u.email) === String(req.user?.email));
      const txn = me?.txn_account || me?.txn_account_code || me?.txn_acct || me?.transaction_account || null;
      if (!txn || String(txn).trim() === '') {
        return res.status(400).json({ error: 'Transaction account required for this user. Ask an admin to assign a transaction account before recording purchases.' });
      }
      req.user.txn_account_code = txn;
    } catch (e) {
      console.warn('txn account verification failed:', e?.message);
      return res.status(500).json({ error: 'Unable to verify transaction account' });
    }

    const { product_id, product_name, quantity, unit_cost, vendor_name = '', invoice_no = '', date = new Date().toISOString(), notes = '' } = req.body || {};
    if (!product_id || !product_name || !quantity || !unit_cost) return res.status(400).json({ error: 'Missing required fields' });
    const total_cost = Number(unit_cost) * Number(quantity);
    const rec = { business_id, product_id, product_name, quantity: Number(quantity), unit_cost: Number(unit_cost), total_cost, vendor_name, invoice_no, date, staff_name };
    const result = await addToGrist('Purchases', rec);
    if (!result.success) return res.status(500).json({ error: 'Failed to record purchase' });
    res.status(201).json(decryptDeep(result.data));
  } catch (err) {
    console.error('Create purchase error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === Purchases: checkout multiple items ===
app.post('/purchases/checkout', authenticateToken, requireRole(['Owner','Manager','Accountant']), async (req, res) => {
  try {
    const business_id = req.user?.business_id;
    const staff_name = `${req.user?.fname || ''} ${req.user?.lname || ''}`.trim();

    // Require a transaction account for the acting user
    try {
      const users = await fetchFromGrist(USERS_TABLE);
      const me = (users || []).find(u => String(u.id) === String(req.user?.id) || String(u.email) === String(req.user?.email));
      const txn = me?.txn_account || me?.txn_account_code || me?.txn_acct || me?.transaction_account || null;
      if (!txn || String(txn).trim() === '') {
        return res.status(400).json({ error: 'Transaction account required for this user. Ask an admin to assign a transaction account before recording purchases.' });
      }
      req.user.txn_account_code = txn;
    } catch (e) {
      console.warn('txn account verification failed:', e?.message);
      return res.status(500).json({ error: 'Unable to verify transaction account' });
    }

    const { items = [], vendor_name = '', invoice_no = '', date = new Date().toISOString() } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'No purchase items' });

    const rows = items.map(it => {
      const quantity = Number(it.qty || it.quantity || 1);
      const unit_cost = Number(it.unit_cost || it.cost_price || it.cost_of_goods || 0);
      const total_cost = quantity * unit_cost;
      return {
        business_id,
        product_id: it.id || it.product_id,
        product_name: it.name || it.product_name,
        quantity,
        unit_cost,
        total_cost,
        vendor_name,
        invoice_no,
        date,
        staff_name,
      };
    });

    const result = await import('./gristUtils.js').then(m => m.bulkAddToGrist('Purchases', rows));
    if (!result.success) return res.status(500).json({ error: 'Failed to record purchases' });
    const grand = rows.reduce((sum, r) => sum + r.total_cost, 0);
    res.status(201).json(decryptDeep({ message: 'Purchases recorded', count: rows.length, total_cost: grand, purchases: rows }));
  } catch (err) {
    console.error('Purchases checkout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// moved below after withAuthAndAbility definition
// Clear auth cookie
app.post('/logout', (req, res) => {
  try {
    const sameSite = (process.env.COOKIE_SAMESITE || 'Lax').toLowerCase();
    const isNone = sameSite === 'none';
    const secureFlag = (process.env.COOKIE_SECURE === 'true' || isNone) ? '; Secure' : '';
    const sameSiteAttr = isNone ? 'SameSite=None' : 'SameSite=Lax';
    res.setHeader('Set-Cookie', `token=; HttpOnly; Path=/; Max-Age=0; ${sameSiteAttr}${secureFlag}`);
  } catch {}
  res.json({ message: 'Logged out' });
});

const PORT = process.env.PORT || 3000;

// Serve static frontend from ../public
const publicDir = path.join(__dirname, "..", "public");

// Protected SaaS Admin console routes BEFORE static to prevent static bypass
app.get("/admin", (req, res) => {
  try {
    const raw = req.headers.cookie || '';
    let tok = null;
    for (const part of raw.split(';')) { const [k, ...v] = part.trim().split('='); if (k === 'token') { tok = decodeURIComponent(v.join('=')); break; } }
    if (!tok) return res.redirect('/');
    const payload = jwt.verify(tok, process.env.JWT_SECRET);
    if (payload?.role !== 'SaaS Admin') return res.redirect('/dashboard');
  } catch {
    return res.redirect('/');
  }
  res.type('html');
  const adminNoExt = path.join(publicDir, 'admin');
  const adminHtml = path.join(publicDir, 'admin.html');
  const target = fs.existsSync(adminNoExt) ? adminNoExt : adminHtml;
  res.sendFile(target);
});

app.get("/admin.html", (req, res) => {
  try {
    const raw = req.headers.cookie || '';
    let tok = null;
    for (const part of raw.split(';')) { const [k, ...v] = part.trim().split('='); if (k === 'token') { tok = decodeURIComponent(v.join('=')); break; } }
    if (!tok) return res.redirect('/');
    const payload = jwt.verify(tok, process.env.JWT_SECRET);
    if (payload?.role !== 'SaaS Admin') return res.redirect('/dashboard');
  } catch {
    return res.redirect('/');
  }
  res.type('html');
  const adminNoExt = path.join(publicDir, 'admin');
  const adminHtml = path.join(publicDir, 'admin.html');
  const target = fs.existsSync(adminNoExt) ? adminNoExt : adminHtml;
  res.sendFile(target);
});

// Protect admin JS assets; require valid JWT cookie and SaaS Admin role before serving
app.use((req, res, next) => {
  try {
    if (req.method === 'GET' && req.path && (req.path === '/js/admin.js' || req.path.startsWith('/js/admin/'))) {
      const raw = req.headers.cookie || '';
      let tok = null;
      for (const part of raw.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === 'token') { tok = decodeURIComponent(v.join('=')); break; }
      }
      if (!tok) return res.status(401).send('Unauthorized');
      const payload = jwt.verify(tok, process.env.JWT_SECRET);
      if ((payload?.role || '') !== 'SaaS Admin') return res.status(403).send('Forbidden');
    }
  } catch { return res.status(401).send('Unauthorized'); }
  next();
});
// If obfuscation is enabled, transparently serve /js/admin/* from /js/admin-obf/* when available
if (process.env.OBFUSCATE_ADMIN === 'true') {
  const obfDir = path.join(publicDir, 'js', 'admin-obf');
  // Map /js/admin/* to obfuscated versions when present
  app.use('/js/admin', (req, res, next) => {
    const rel = (req.path || '').replace(/^\/js\/admin\//, '');
    const fp = path.join(obfDir, rel);
    if (fs.existsSync(fp)) return res.sendFile(fp);
    next();
  });
  // Map /js/admin.js to obfuscated version when present
  app.get('/js/admin.js', (req, res, next) => {
    const fp = path.join(obfDir, 'admin.js');
    if (fs.existsSync(fp)) return res.sendFile(fp);
    next();
  });
}
app.use(express.static(publicDir));

// Simple file-backed store for business feature overrides (keyed by business_id string)
const dataDir = path.join(__dirname, 'data');
const bizSettingsPath = path.join(dataDir, 'business-settings.json');
function ensureBizSettings(){
  try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  try { if (!fs.existsSync(bizSettingsPath)) fs.writeFileSync(bizSettingsPath, JSON.stringify({}), 'utf-8'); } catch {}
}
function readBizSettings(){
  try { ensureBizSettings(); return JSON.parse(fs.readFileSync(bizSettingsPath, 'utf-8') || '{}'); } catch { return {}; }
}
function writeBizSettings(obj){
  try { ensureBizSettings(); fs.writeFileSync(bizSettingsPath, JSON.stringify(obj, null, 2), 'utf-8'); return true; } catch { return false; }
}

// Root route -> index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Deep link routes for static pages
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/sales", (req, res) => {
  res.sendFile(path.join(publicDir, "sales.html"));
});

app.get("/reports", (req, res) => {
  res.sendFile(path.join(publicDir, "reports.html"));
});

// (duplicate admin cookie helper and routes removed; consolidated earlier)

// Login alias
app.get(["/login", "/signin"], (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// === Dev seed endpoint (guarded by ENABLE_SEED) ===
app.post("/seed/dev-user", async (req, res) => {
  try {
    if (process.env.ENABLE_SEED !== "true") {
      return res.status(403).json({ error: "Seeding disabled. Set ENABLE_SEED=true in .env to enable." });
    }

    const email = "owner@example.com";
    const password = "password123";

    const users = await fetchFromGrist(USERS_TABLE);
    const exists = users.find(u => u.email === email);
    if (exists) {
      return res.json({ message: "Dev user already exists", credentials: { email, password } });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const newUser = {
      email,
      password_hash,
      fname: "Demo",
      lname: "Owner",
      role: "Owner",
      business_name: "Demo Shop",
      business_id: "DEMO-001",
      created_at: new Date().toISOString(),
      is_active: true
    };

    const result = await addToGrist(USERS_TABLE, newUser);
    if (!result.success) {
      return res.status(500).json({ error: "Failed to create dev user" });
    }

    res.status(201).json({ message: "Dev user created", credentials: { email, password } });
  } catch (err) {
    console.error("Seed dev user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === Dev seed: owner + sample inventory (guarded by ENABLE_SEED) ===
app.post("/seed/owner-and-sample-data", async (req, res) => {
  try {
    if (process.env.ENABLE_SEED !== "true") {
      return res.status(403).json({ error: "Seeding disabled. Set ENABLE_SEED=true in .env to enable." });
    }

    const email = "owner@example.com";
    const password = "password123";
    const business_id = "DEMO-001";
    const business_name = "Demo Shop";

    // Ensure owner user exists
    const users = await fetchFromGrist(USERS_TABLE);
    let owner = users.find(u => u.email === email);
    if (!owner) {
      const password_hash = await bcrypt.hash(password, 12);
      const newUser = {
        email,
        password_hash,
        fname: "Demo",
        lname: "Owner",
        role: "Owner",
        business_name,
        business_id,
        created_at: new Date().toISOString(),
        is_active: true
      };
      const created = await addToGrist(USERS_TABLE, newUser);
      if (!created.success) {
        return res.status(500).json({ error: "Failed to create owner user" });
      }
      owner = newUser;
    }

    // Seed sample inventory
    const inventory = await fetchFromGrist("Inventory", business_id);
    if (inventory.length === 0) {
      const sampleItems = [
        { business_id, product_id: "SKU-001", product_name: "Maize Flour 2kg", quantity: 40, unit_price: 6500, cost_price: 5000, low_stock_alert: 10, updated_at: new Date().toISOString() },
        { business_id, product_id: "SKU-002", product_name: "Cooking Oil 1L", quantity: 30, unit_price: 12000, cost_price: 10000, low_stock_alert: 8, updated_at: new Date().toISOString() },
        { business_id, product_id: "SKU-003", product_name: "Sugar 1kg", quantity: 50, unit_price: 4500, cost_price: 3800, low_stock_alert: 12, updated_at: new Date().toISOString() },
        { business_id, product_id: "SKU-004", product_name: "Soap Bar", quantity: 60, unit_price: 2500, cost_price: 1800, low_stock_alert: 15, updated_at: new Date().toISOString() },
        { business_id, product_id: "SKU-005", product_name: "Rice 5kg", quantity: 20, unit_price: 28000, cost_price: 24000, low_stock_alert: 5, updated_at: new Date().toISOString() }
      ];
      const invResult = await bulkAddToGrist("Inventory", sampleItems);
      if (!invResult.success) {
        return res.status(500).json({ error: "Failed to seed inventory" });
      }
    }

    res.json({
      message: "Owner and sample inventory ready",
      credentials: { email, password },
      business: { business_id, business_name }
    });
  } catch (err) {
    console.error("Seed owner and sample data error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// === JWT Authentication Middleware ===
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// === Role-based middleware ===
function requireRole(roles) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: "Unauthorized - insufficient permissions" });
    }
    next();
  }
}

// Compose auth + per-request ability
const withAuthAndAbility = [
  authenticateToken,
  (req, res, next) => { try { req.ability = defineAbilityFor(req.user || {}); } catch {} next(); }
];

// === SaaS Admin: schema check diagnostics ===
app.get('/admin/schema-check', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    const spec = {
      Users: ['business_id','fname','mname','lname','phone_number','email','role','password_hash','otp_code','otp_expires','last_login','is_active','txn_account','txn_account_code','created_at'],
      Businesses: ['name','business_id','owner_id','subscription_id','start_date','end_date','logo_url','fiscal_year_start','fiscal_year_end','status','is_active','created_at'],
      Branches: ['branch_id','business_id','name','address','location','opening_date','updated_at','created_at'],
      Subscription: ['name','price','billing_cycle','is_active','limit_max_staff','limit_max_branches','created_at','description'],
      Features: ['name','code','description','is_active'],
      Subscription_Features: ['subscription_id','feature_id','limit_value'],
      Sales: ['business_id','product_id','product_name','quantity','unit_price','discount','tax','total','cost_of_goods','staff_name','date','payment_mode'],
      Purchases: ['business_id','product_id','product_name','quantity','unit_cost','total_cost','vendor_name','invoice_no','date','staff_name'],
    };
    const tables = await Promise.all(Object.keys(spec).map(async (t) => {
      const cols = await fetchTableColumns(t);
      const expected = new Set(spec[t]);
      const got = new Set(cols);
      const present = cols.length > 0;
      const missingColumns = present ? Array.from(expected).filter(c => !got.has(c)) : Array.from(expected);
      const extraColumns = present ? Array.from(got).filter(c => !expected.has(c)) : [];
      return { table: t, present, columns: cols, missingColumns, extraColumns };
    }));
    const ok = tables.every(t => t.present);
    const lines = [
      `Grist Schema Diagnostics`,
      `- Status: ${ok ? 'OK' : 'Issues found'}`,
      ...tables.map(t => `- ${t.table}: ${t.present ? 'present' : 'missing'}; missing=[${t.missingColumns.join(', ')}]`)
    ];
    res.json({ ok, tables, report: lines.join('\n') });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === User Registration ===
app.post("/register", async (req, res) => {
  try {
    const { email, password, fname, lname, role, business_name, business_id } = req.body;

    // Validate required fields
    if (!email || !password || !fname || !lname || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if user already exists
    const existingUsers = await fetchFromGrist(USERS_TABLE);
    const userExists = existingUsers.find(u => u.email === email);
    if (userExists) {
      return res.status(409).json({ error: "User already exists" });
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create user object
    const newUser = {
      email,
      password_hash,
      fname,
      lname,
      role,
      business_name: business_name || null,
      business_id: business_id || null,
      created_at: new Date().toISOString(),
      is_active: true
    };

    // Add user to Grist
    const result = await addToGrist(USERS_TABLE, newUser);
    
    if (result.success) {
      // Remove password hash from response
      const { password_hash, ...userResponse } = newUser;
      res.status(201).json({ 
        message: "User registered successfully", 
        user: userResponse 
      });
    } else {
      res.status(500).json({ error: "Failed to create user" });
    }

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === User Login ===
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // Fetch user from Grist
    const users = await fetchFromGrist(USERS_TABLE);
    const normalized = users.map(u => ({
      ...u,
      _hash: u.password_hash || u.password, // support either column
      _fname: u.fname || u.first_name,
      _lname: u.lname || u.last_name,
      _active: typeof u.is_active === 'boolean' ? u.is_active : true, // default to true when missing
      _forceReset: typeof u.force_password_reset === 'boolean' ? u.force_password_reset : false,
    }));
    const user = normalized.find(u => u.email === email && u._active);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user._forceReset) {
      return res.status(403).json({ error: "Password reset required", requiresPasswordReset: true, email: user.email });
    }

    // Compare password
    if (!user._hash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const passwordMatch = await bcrypt.compare(password, user._hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      business_id: user.business_id,
      fname: user._fname,
      mname: user.mname || user.middle_name || "",
      lname: user._lname,
      business_name: user.business_name
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

    // Set httpOnly JWT cookie for browser navigation protection
    try {
      const maxAgeSec = 24 * 60 * 60; // 1 day
      const sameSite = (process.env.COOKIE_SAMESITE || 'Lax').toLowerCase();
      const isNone = sameSite === 'none';
      const secureFlag = (process.env.COOKIE_SECURE === 'true' || isNone) ? '; Secure' : '';
      const sameSiteAttr = isNone ? 'SameSite=None' : 'SameSite=Lax';
      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; ${sameSiteAttr}${secureFlag}`);
    } catch {}

    // Remove password hash from response
    const { _hash, ...userResponse } = user;

    // Update last_login (non-blocking best-effort)
    try { await updateGristRecord(USERS_TABLE, user.id, { last_login: new Date().toISOString() }); } catch (e) { console.warn('last_login update failed:', e?.message); }

    res.json({
      message: "Login successful",
      token,
      user: userResponse
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Debug: list first few users (guarded by ENABLE_SEED)
app.get("/debug/grist/users", async (req, res) => {
  try {
    if (process.env.ENABLE_SEED !== "true") {
      return res.status(403).json({ error: "Debug disabled" });
    }
    const users = await fetchFromGrist(USERS_TABLE);
    res.json(users.slice(0, 5));
  } catch (e) {
    res.status(500).json({ error: e?.message || "Unknown error" });
  }
});

// === Token Validation Endpoint ===
app.get("/validate-token", authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// (duplicate /logout removed; cookie-clearing version defined earlier)

// === Auth: request password reset (generate OTP and email) ===
app.post('/auth/request-reset', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const users = await fetchFromGrist(USERS_TABLE);
    const u = users.find(x => x.email === email);
    if (!u) return res.status(404).json({ error: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expires = new Date(Date.now() + 24*60*60*1000).toISOString();
    const payload = { otp_code: otp, otp_expires, force_password_reset: true };
    try {
      await updateGristRecord(USERS_TABLE, u.id, payload);
    } catch (e) {
      console.error('Failed to update reset OTP:', e?.message);
      return res.status(500).json({ error: 'Failed to set reset token' });
    }

    const html = `
      <p>Hello ${u.fname || ''} ${u.lname || ''},</p>
      <p>Your password reset code (OTP) is: <b>${otp}</b></p>
      <p>This OTP expires in 24 hours.</p>
    `;
    try { await sendMail(email, 'Password reset code (OTP)', html); } catch (e) { console.warn('Email send failed:', e?.message); }
    res.json({ message: 'Reset code sent if account exists' });
  } catch (e) {
    console.error('request-reset error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === Dashboard KPIs & Low Stock ===
app.get("/dashboard/kpis", authenticateToken, requireRole(["Owner","Accountant"]), async (req,res)=>{
  // Resolve businessId from authenticated user; allow SaaS Admin to override via query
  const businessId = req.user?.business_id;
  const sales = await fetchFromGrist("Sales", businessId);
  const inventory = await fetchFromGrist("Inventory", businessId);

  const total_sales = sales.reduce((acc,s)=>acc+s.total,0);
  const total_profit = sales.reduce((acc,s)=>acc+(s.total - (s.cost_of_goods||0)),0);
  const total_discount = sales.reduce((acc,s)=>acc+(s.discount||0),0);
  const total_tax = sales.reduce((acc,s)=>acc+(s.tax||0),0);

  const low_stock = inventory.filter(i=>i.quantity <= (i.low_stock_alert || 5));

  res.json(decryptDeep({total_sales,total_profit,total_discount,total_tax,low_stock}));
});

// === Reports Endpoints ===
app.get("/reports/products", authenticateToken, requireRole(["Owner","Accountant"]), async (req,res)=>{
  const businessId = req.user?.business_id;
  const sales = await fetchFromGrist("Sales", businessId);

  const productMap = {};
  sales.forEach(s=>{
    if(!productMap[s.product_name]) productMap[s.product_name]={quantity:0,revenue:0,profit:0};
    productMap[s.product_name].quantity += s.quantity;
    productMap[s.product_name].revenue += s.total;
    productMap[s.product_name].profit += (s.total - (s.cost_of_goods||0));
  });

  const topProducts = Object.entries(productMap)
    .map(([product,vals])=>({product,...vals}))
    .sort((a,b)=>b.profit - a.profit)
    .slice(0,5);

  res.json(decryptDeep(topProducts));
});

app.get("/reports/staff", authenticateToken, requireRole(["Owner","Accountant"]), async (req,res)=>{
  const businessId = req.user?.business_id;
  const sales = await fetchFromGrist("Sales", businessId);

  const staffMap = {};
  sales.forEach(s=>{
    if(!staffMap[s.staff_name]) staffMap[s.staff_name]={sales_count:0,total_revenue:0,profit:0};
    staffMap[s.staff_name].sales_count += 1;
    staffMap[s.staff_name].total_revenue += s.total;
    staffMap[s.staff_name].profit += (s.total - (s.cost_of_goods||0));
  });

  const leaderboard = Object.entries(staffMap)
    .map(([staff,vals])=>({staff,...vals}))
    .sort((a,b)=>b.profit - a.profit)
    .slice(0,5);

  res.json(decryptDeep(leaderboard));
});

app.get("/reports/daily", authenticateToken, requireRole(["Owner","Accountant"]), async (req,res)=>{
  const businessId = req.user?.business_id;
  const sales = await fetchFromGrist("Sales", businessId);

  const dailyMap = {};
  sales.forEach(s=>{
    const d = new Date(s.date).toISOString().split("T")[0];
    if(!dailyMap[d]) dailyMap[d]={ gross:0, discount:0, tax:0, cost:0, profit:0 };
    const gross = Number(s.total || 0);
    const discount = Number(s.discount || 0);
    const tax = Number(s.tax || 0);
    const cost = Number(s.cost_of_goods || 0);
    dailyMap[d].gross += gross;
    dailyMap[d].discount += discount;
    dailyMap[d].tax += tax;
    dailyMap[d].cost += cost;
    dailyMap[d].profit += (gross - cost);
  });

  const dailyData = Object.entries(dailyMap)
    .sort((a,b)=> new Date(a[0]) - new Date(b[0]))
    .map(([date,val])=>({date,...val}));
  res.json(dailyData);
});

app.get("/reports/monthly", authenticateToken, requireRole(["Owner","Accountant"]), async (req,res)=>{
  const businessId = req.user?.business_id;
  const sales = await fetchFromGrist("Sales", businessId);

  const monthlyMap = {};
  sales.forEach(s=>{
    const d = new Date(s.date);
    const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if(!monthlyMap[month]) monthlyMap[month]={ gross:0, discount:0, tax:0, cost:0, profit:0 };
    const gross = Number(s.total || 0);
    const discount = Number(s.discount || 0);
    const tax = Number(s.tax || 0);
    const cost = Number(s.cost_of_goods || 0);
    monthlyMap[month].gross += gross;
    monthlyMap[month].discount += discount;
    monthlyMap[month].tax += tax;
    monthlyMap[month].cost += cost;
    monthlyMap[month].profit += (gross - cost);
  });

  const monthlyData = Object.entries(monthlyMap)
    .sort((a,b)=> a[0].localeCompare(b[0]))
    .map(([month,val])=>({month,...val}));
  res.json(decryptDeep(monthlyData));
});

// === Export Reports Placeholder ===
app.get("/reports/export", authenticateToken, requireRole(["Owner","Accountant"]), (req,res)=>{
  const { type } = req.query;
  res.json({message:`Export ${type} not implemented yet`});
});

// === Inventory: list items (Owner/Manager/Accountant) ===
app.get("/inventory", authenticateToken, requireRole(["Owner","Manager","Accountant"]), async (req, res) => {
  try {
    const businessId = req.user?.business_id;
    let items = await fetchFromGrist("Inventory", businessId);

    const q = (req.query.q || "").toString().trim().toLowerCase();
    if (q) {
      items = items.filter((i) =>
        String(i.product_name || i.name || "").toLowerCase().includes(q)
      );
    }

    res.json(items);
  } catch (err) {
    console.error("Inventory list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Compatibility route to support existing frontend `/inventory/:businessId?q=` usage
app.get("/inventory/:businessId", authenticateToken, requireRole(["Owner","Manager","Accountant"]), async (req, res) => {
  try {
    const businessId = req.user?.business_id; // enforce owner's own business
    let items = await fetchFromGrist("Inventory", businessId);

    const q = (req.query.q || "").toString().trim().toLowerCase();
    if (q) {
      items = items.filter((i) =>
        String(i.product_name || i.name || "").toLowerCase().includes(q)
      );
    }

    res.json(items);
  } catch (err) {
    console.error("Inventory (compat) list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === Sales: create sale (Owner and Attendant) ===
app.post("/sales", authenticateToken, requireRole(["Owner","Attendant"]), async (req, res) => {
  try {
    const business_id = req.user?.business_id;
    const staff_name = `${req.user?.fname || ''} ${req.user?.lname || ''}`.trim();

    // Require a transaction account for the acting user
    try {
      const users = await fetchFromGrist(USERS_TABLE);
      const me = (users || []).find(u => String(u.id) === String(req.user?.id) || String(u.email) === String(req.user?.email));
      const txn = me?.txn_account || me?.txn_account_code || me?.txn_acct || me?.transaction_account || null;
      if (!txn || String(txn).trim() === '') {
        return res.status(400).json({ error: 'Transaction account required for this user. Ask an admin to assign a transaction account before performing sales.' });
      }
      // Optionally attach for downstream posting
      req.user.txn_account_code = txn;
    } catch (e) {
      console.warn('txn account verification failed:', e?.message);
      return res.status(500).json({ error: 'Unable to verify transaction account' });
    }

    const { product_id, product_name, quantity, unit_price, discount = 0, tax = 0, cost_of_goods = 0, notes = "" } = req.body;
    if (!product_id || !product_name || !quantity || !unit_price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const total = Number(unit_price) * Number(quantity) - Number(discount) + Number(tax);
    const sale = {
      business_id,
      product_id,
      product_name,
      quantity: Number(quantity),
      unit_price: Number(unit_price),
      discount: Number(discount),
      tax: Number(tax),
      total,
      cost_of_goods: Number(cost_of_goods),
      staff_name,
      date: new Date().toISOString(),
      notes
    };

    const result = await addToGrist("Sales", sale);
    if (!result.success) {
      return res.status(500).json({ error: "Failed to create sale" });
    }

    res.status(201).json(decryptDeep({ message: "Sale recorded", saleId: result.data?.id, sale }));
  } catch (err) {
    console.error("Sales create error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === Sales: checkout multiple items (Owner and Attendant) ===
app.post("/sales/checkout", authenticateToken, requireRole(["Owner","Attendant"]), async (req, res) => {
  try {
    const business_id = req.user?.business_id;
    const staff_name = `${req.user?.fname || ''} ${req.user?.lname || ''}`.trim();

    // Require a transaction account for the acting user
    try {
      const users = await fetchFromGrist(USERS_TABLE);
      const me = (users || []).find(u => String(u.id) === String(req.user?.id) || String(u.email) === String(req.user?.email));
      const txn = me?.txn_account || me?.txn_account_code || me?.txn_acct || me?.transaction_account || null;
      if (!txn || String(txn).trim() === '') {
        return res.status(400).json({ error: 'Transaction account required for this user. Ask an admin to assign a transaction account before performing sales.' });
      }
      req.user.txn_account_code = txn;
    } catch (e) {
      console.warn('txn account verification failed:', e?.message);
      return res.status(500).json({ error: 'Unable to verify transaction account' });
    }

    const { cart = [], payment_mode = "" } = req.body || {};
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const salesPayload = cart.map((c) => {
      const quantity = Number(c.qty || c.quantity || 1);
      const unit_price = Number(c.selling_price || c.unit_price || 0);
      const discount = Number(c.discount || 0);
      const tax = Number(c.tax || 0);
      const total = unit_price * quantity - discount + tax;
      return {
        business_id,
        product_id: c.id || c.product_id,
        product_name: c.name || c.product_name,
        quantity,
        unit_price,
        discount,
        tax,
        total,
        cost_of_goods: Number(c.cost_of_goods || c.cost_price || 0),
        staff_name,
        date: new Date().toISOString(),
        payment_mode,
      };
    });

    const result = await import("./gristUtils.js").then(m => m.bulkAddToGrist("Sales", salesPayload));
    if (!result.success) {
      return res.status(500).json({ error: "Failed to record sales" });
    }

    const grandTotal = salesPayload.reduce((acc, s) => acc + s.total, 0);
    res.status(201).json(decryptDeep({
      message: "Checkout successful",
      count: salesPayload.length,
      total: grandTotal,
      sales: salesPayload,
    }));
  } catch (err) {
    console.error("Sales checkout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === SaaS Admin endpoints (no direct access to business data) ===
// Create a business
app.post("/admin/businesses", ...withAuthAndAbility, requireRole(["SaaS Admin"]), async (req, res) => {
  try {
    const { name, subscription_tier = "free", limits = {} } = req.body;
    if (!name) return res.status(400).json({ error: "Business name is required" });
    const business = {
      name,
      subscription_tier,
      limits_json: JSON.stringify(limits),
      created_at: new Date().toISOString(),
      is_active: true
    };
    const result = await addToGrist("Businesses", business);
    if (!result.success) return res.status(500).json({ error: "Failed to create business" });
    res.status(201).json(decryptDeep({ message: "Business created", business }));
  } catch (e) {
    console.error("Create business error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create an owner account for a business
app.post("/admin/owners", ...withAuthAndAbility, requireRole(["SaaS Admin"]), async (req, res) => {
  try {
    const { email, password, fname, mname = "", lname, business_id, business_name = "" } = req.body;
    if (!email || !password || !fname || !lname || !business_id) {
      return res.status(400).json({ error: "email, password, fname, lname, business_id are required" });
    }
    // Check existing
    const existing = await fetchFromGrist(USERS_TABLE);
    if (existing.find(u => u.email === email)) {
      return res.status(409).json({ error: "User already exists" });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const user = {
      email,
      // write to both likely columns for compatibility
      password_hash,
      password: password_hash,
      role: "Owner",
      fname,
      mname,
      lname,
      business_id,
      business_name,
      is_active: true,
      created_at: new Date().toISOString()
    };
    const created = await addToGrist(USERS_TABLE, user);
    if (!created.success) return res.status(500).json({ error: "Failed to create owner" });
    res.status(201).json(decryptDeep({ message: "Owner created", email, business_id }));
  } catch (e) {
    console.error("Create owner error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === SaaS Admin: list businesses ===
app.get("/admin/businesses", ...withAuthAndAbility, requireRole(["SaaS Admin"]), async (req, res) => {
  try {
    const businesses = await fetchFromGrist("Businesses");
    res.json(decryptDeep(businesses));
  } catch (e) {
    console.error("List businesses error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === SaaS Admin: metrics for dashboard ===
app.get("/admin/metrics", ...withAuthAndAbility, requireRole(["SaaS Admin"]), async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch core tables
    const businesses = await fetchFromGrist("Businesses");
    let subscriptions = [];
    try { subscriptions = await fetchFromGrist("Subscription"); } catch {}

    // Cards
    const totalBusinesses = businesses.length;
    const totalRegistered = businesses.filter(b => b.created_at && new Date(b.created_at) >= new Date(now.getFullYear(), now.getMonth()-1, now.getDate())).length;

    // Active subs: prefer subscriptions.status, else businesses.is_active
    const activeSubs = subscriptions.length
      ? subscriptions.filter(s => (String(s.status || "").toLowerCase() === "active") || s.is_active === true).length
      : businesses.filter(b => b.is_active === true).length;

    // Monthly revenue (best-effort): sum subscription.amount for current month
    let monthlyRevenue = 0;
    if (subscriptions.length) {
      monthlyRevenue = subscriptions.reduce((sum, s) => {
        const amt = Number(s.amount || s.price || 0);
        const d = s.renewed_at || s.start_date || s.created_at;
        const inMonth = d ? (new Date(d) >= startOfMonth) : true; // fallback: count if no date
        const active = (String(s.status || "").toLowerCase() === "active") || s.is_active === true;
        return sum + (active && inMonth ? amt : 0);
      }, 0);
    }

    // Plan distribution: from subscriptions.plan or businesses.subscription_tier
    const planCounts = {};
    if (subscriptions.length) {
      subscriptions.forEach(s => {
        const plan = s.plan || s.subscription_plan || s.tier || "unknown";
        planCounts[plan] = (planCounts[plan] || 0) + 1;
      });
    } else {
      businesses.forEach(b => {
        const plan = b.subscription_tier || "unknown";
        planCounts[plan] = (planCounts[plan] || 0) + 1;
      });
    }

    // Revenue by month (12 months, best-effort from subscriptions, else zeros)
    const months = [];
    const revenueByMonth = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      months.push(label);
      if (subscriptions.length) {
        const rev = subscriptions.reduce((sum, s) => {
          const d = s.renewed_at || s.start_date || s.created_at;
          const amt = Number(s.amount || s.price || 0);
          const active = (String(s.status || "").toLowerCase() === "active") || s.is_active === true;
          if (!d || !active) return sum;
          const m = new Date(d);
          const ml = `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`;
          return sum + (ml === label ? amt : 0);
        }, 0);
        revenueByMonth.push(rev);
      } else {
        revenueByMonth.push(0);
      }
    }

    // Recent registrations (businesses)
    const recent = [...businesses]
      .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0,5)
      .map(b => ({ name: b.name || "(unnamed)", tier: b.subscription_tier || "—", created_at: b.created_at || null }));

    // Churn rate best-effort from subscriptions: cancelled/total over last 30 days
    let churnRate = 0;
    if (subscriptions.length) {
      const cutoff = new Date(now.getFullYear(), now.getMonth()-1, now.getDate());
      const recentSubs = subscriptions.filter(s => (s.cancelled_at || s.renewed_at || s.created_at) ? new Date(s.cancelled_at || s.renewed_at || s.created_at) >= cutoff : true);
      const total = recentSubs.length || 1;
      const cancelled = recentSubs.filter(s => String(s.status || "").toLowerCase() === "cancelled").length;
      churnRate = Math.round((cancelled / total) * 100);
    }

    // Uptime (simple process uptime in hours)
    const uptimeHours = +(process.uptime() / 3600).toFixed(2);

    res.json(decryptDeep({
      cards: {
        totalBusinesses,
        totalRegistered,
        activeSubscriptions: activeSubs,
        monthlyRevenue
      },
      charts: {
        revenue: { labels: months, data: revenueByMonth },
        plans: { labels: Object.keys(planCounts), data: Object.values(planCounts) }
      },
      recent,
      churnRate,
      uptimeHours
    }));
  } catch (e) {
    console.error("Admin metrics error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === SaaS Admin: Subscription plan changes ===
app.post('/admin/subscription/upgrade', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    const { plan = 'pro', billing_cycle = 'monthly' } = req.body || {};
    let subs = [];
    try { subs = await fetchFromGrist(SUBSCRIPTIONS_TABLE); } catch {}
    const latest = subs.sort((a,b)=> new Date(b.updated_at||b.renewed_at||b.created_at||0) - new Date(a.updated_at||a.renewed_at||a.created_at||0))[0];
    const payload = {
      plan,
      billing_cycle,
      status: 'active',
      renewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true
    };
    if (latest && latest.id) {
      const r = await updateGristRecord(SUBSCRIPTIONS_TABLE, latest.id, payload);
      if (!r.success) return res.status(500).json({ error: 'Failed to update subscription' });
    } else {
      const add = await addToGrist(SUBSCRIPTIONS_TABLE, { ...payload, start_date: new Date().toISOString(), created_at: new Date().toISOString() });
      if (!add.success) return res.status(500).json({ error: 'Failed to create subscription' });
    }
    res.json(decryptDeep({ message: 'Subscription upgraded', plan, billing_cycle }));
  } catch (e) {
    console.error('Upgrade error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/subscription/downgrade', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    const { plan = 'starter', billing_cycle = 'monthly' } = req.body || {};
    let subs = [];
    try { subs = await fetchFromGrist(SUBSCRIPTIONS_TABLE); } catch {}
    const latest = subs.sort((a,b)=> new Date(b.updated_at||b.renewed_at||b.created_at||0) - new Date(a.updated_at||a.renewed_at||a.created_at||0))[0];
    const payload = {
      plan,
      billing_cycle,
      status: 'active',
      renewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true
    };
    if (latest && latest.id) {
      const r = await updateGristRecord('Subscription', latest.id, payload);
      if (!r.success) return res.status(500).json({ error: 'Failed to update subscription' });
    } else {
      const add = await addToGrist('Subscription', { ...payload, start_date: new Date().toISOString(), created_at: new Date().toISOString() });
      if (!add.success) return res.status(500).json({ error: 'Failed to create subscription' });
    }
    res.json(decryptDeep({ message: 'Subscription downgraded', plan, billing_cycle }));
  } catch (e) {
    console.error('Downgrade error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/subscription/edit', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    const { plan, billing_cycle, status } = req.body || {};
    let subs = [];
    try { subs = await fetchFromGrist(SUBSCRIPTIONS_TABLE); } catch {}
    const latest = subs.sort((a,b)=> new Date(b.updated_at||b.renewed_at||b.created_at||0) - new Date(a.updated_at||a.renewed_at||a.created_at||0))[0];
    const payload = {
      ...(plan ? { plan } : {}),
      ...(billing_cycle ? { billing_cycle } : {}),
      ...(status ? { status } : {}),
      updated_at: new Date().toISOString()
    };
    if (!latest || !latest.id) {
      const add = await addToGrist(SUBSCRIPTIONS_TABLE, { plan: plan || 'free', billing_cycle: billing_cycle || 'monthly', status: status || 'active', start_date: new Date().toISOString(), created_at: new Date().toISOString(), is_active: true });
      if (!add.success) return res.status(500).json({ error: 'Failed to create subscription' });
      return res.json(decryptDeep({ message: 'Subscription created' }));
    }
    const r = await updateGristRecord(SUBSCRIPTIONS_TABLE, latest.id, payload);
    if (!r.success) return res.status(500).json({ error: 'Failed to update subscription' });
    res.json(decryptDeep({ message: 'Subscription updated' }));
  } catch (e) {
    console.error('Edit subscription error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === SaaS Admin: Maintenance — Rehydrate Features (persist plaintext for name/code/description) ===
app.post('/admin/maintenance/features/rehydrate', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    if (!process.env.ENCRYPTION_KEY || String(process.env.ENCRYPTION_KEY).trim() === '') {
      return res.status(400).json({ error: 'ENCRYPTION_KEY is not set. Set it in .env and restart the server.' });
    }

    let features = [];
    try { features = await fetchFromGrist('Features'); } catch (e) {
      return res.status(500).json({ error: 'Failed to load Features' });
    }

    // If any field still looks encrypted, the key is likely wrong; bail to avoid persisting enc:v1 as plaintext
    const looksEncrypted = (v) => typeof v === 'string' && v.startsWith('enc:v1:');
    const anyEncrypted = features.some(f => looksEncrypted(f?.name) || looksEncrypted(f?.code));
    if (anyEncrypted) {
      return res.status(400).json({ error: 'Decryption failed. Ensure ENCRYPTION_KEY is correct before running rehydrate.' });
    }

    let updated = 0; const errors = [];
    for (const f of features) {
      try {
        const fields = {};
        if (typeof f.name !== 'undefined') fields.name = f.name;
        if (typeof f.code !== 'undefined') fields.code = f.code;
        if (typeof f.description !== 'undefined') fields.description = f.description;
        if (Object.keys(fields).length === 0) continue;
        const r = await updateGristRecord('Features', f.id, fields);
        if (!r.success) { errors.push({ id: f.id, error: r.error || 'update failed' }); }
        else { updated += 1; }
      } catch (e) { errors.push({ id: f?.id, error: e?.message || 'update threw' }); }
    }

    return res.json(decryptDeep({ message: 'Rehydrated Features (plaintext persisted for name/code/description)', total: features.length, updated, errors }));
  } catch (e) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// === SaaS Admin: Subscriptions list & creation (for admin UI) ===
app.get('/admin/subscriptions', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    // Optional filters ignored for now; return decrypted rows
    let rows = [];
    try { rows = await fetchFromGrist(SUBSCRIPTIONS_TABLE); } catch {}
    return res.json(decryptDeep(rows));
  } catch (e) { res.status(500).json({ error: 'Failed to load subscriptions' }); }
});

app.post('/admin/subscriptions', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    const { business_id, owner_email, plan, billing_cycle = 'monthly', start_date, amount } = req.body || {};
    if (!business_id || !owner_email) return res.status(400).json({ error: 'business_id and owner_email are required' });
    const payload = {
      business_id,
      owner_email,
      plan: plan || 'starter',
      billing_cycle,
      start_date: start_date || new Date().toISOString(),
      amount: typeof amount === 'number' ? amount : 0,
      status: 'active',
      created_at: new Date().toISOString()
    };
    const result = await addToGrist(SUBSCRIPTIONS_TABLE, payload);
    if (!result.success) return res.status(500).json({ error: result.error || 'Failed to create subscription' });
    return res.json(decryptDeep(result.data));
  } catch (e) { res.status(500).json({ error: 'Failed to create subscription' }); }
});

// === SaaS Admin: My Subscription (summary) ===
app.get('/admin/subscription', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    let subscriptions = [];
    try { subscriptions = await fetchFromGrist('Subscription'); } catch {}
    const businesses = await fetchFromGrist('Businesses');
    const latest = subscriptions.sort((a,b)=> new Date(b.updated_at||b.renewed_at||b.created_at||0) - new Date(a.updated_at||a.renewed_at||a.created_at||0))[0];
    const plan = latest?.plan || latest?.subscription_plan || latest?.tier || (businesses[0]?.subscription_tier) || 'free';
    const cycle = latest?.billing_cycle || 'monthly';
    const renews_on = latest?.renewed_at || latest?.end_date || null;
    res.json(decryptDeep({ plan, cycle, renews_on }));
  } catch (e) {
    console.error('Subscription error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === SaaS Admin: Invoices & Payments ===
app.get('/admin/invoices', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    let invoices = [];
    try { invoices = await fetchFromGrist('Invoices'); } catch {}
    if (!Array.isArray(invoices) || invoices.length === 0) {
      invoices = [
        { id: 'INV-001', date: new Date().toISOString(), amount: 49, status: 'paid' },
        { id: 'INV-002', date: new Date(Date.now()-86400000*30).toISOString(), amount: 49, status: 'paid' },
      ];
    }
    res.json(decryptDeep(invoices));
  } catch (e) {
    console.error('Invoices fetch error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email an invoice (placeholder)
app.post('/admin/invoices/:id/email', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const email = req.user?.email || 'admin@example.com';
    const html = `<p>Your invoice <b>${id}</b> is attached.</p>`;
    try { await sendMail(email, `Invoice ${id}`, html); } catch (e) { console.warn('Email send failed:', e?.message); }
    res.json(decryptDeep({ message: `Invoice ${id} sent to ${email}` }));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === SaaS Admin: Manage Features (add-ons) ===
app.post('/admin/features', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    const { features = {} } = req.body || {};
    res.json(decryptDeep({ message: 'Features saved', features }));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === SaaS Admin: Per-Business Feature Overrides ===
app.get('/admin/business-feature-flags/:business_id', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    const business_id = String(req.params.business_id || '').trim();
    if (!business_id) return res.status(400).json({ error: 'business_id required' });
    const all = readBizSettings();
    const record = all[business_id] || { features: [] };
    res.json(decryptDeep(record));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/business-feature-flags/:business_id', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    const business_id = String(req.params.business_id || '').trim();
    if (!business_id) return res.status(400).json({ error: 'business_id required' });
    const { features } = req.body || {};
    if (!Array.isArray(features)) return res.status(400).json({ error: 'features must be an array of feature codes' });
    const all = readBizSettings();
    all[business_id] = { features: features.map(String) };
    if (!writeBizSettings(all)) return res.status(500).json({ error: 'Failed to persist settings' });
    res.json(decryptDeep({ message: 'Business features saved', business_id, features: all[business_id].features }));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === Current User: Effective Features ===
app.get('/me/features', authenticateToken, async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const business_id = req.user?.business_id || null;
    // SaaS Admins do not directly use business features
    if (role === 'saas admin') {
      return res.json(decryptDeep({ features: [] }));
    }
    // 1) Role baseline
    let roleBaseline = [];
    if (role === 'owner') roleBaseline = ['inventory','sales','reports'];
    else if (role === 'accountant') roleBaseline = ['reports'];
    else if (role === 'attendant') roleBaseline = ['sales'];

    // 2) Plan-feature mapping for the business (if any)
    let planCodes = [];
    if (business_id) {
      try {
        const businesses = await fetchFromGrist('Businesses');
        const biz = (businesses||[]).find(b => String(b.business_id||b.id||'') === String(business_id) || String(b.id||'') === String(business_id));
        const subscription_id = biz?.subscription_id;
        if (subscription_id){
          const maps = await fetchFromGrist('Subscription_Features');
          const features = await fetchFromGrist('Features');
          const byId = new Map((features||[]).map(f=>[String(f.id), f]));
          planCodes = (maps||[])
            .filter(m => String(m.subscription_id) === String(subscription_id))
            .map(m => byId.get(String(m.feature_id))?.code)
            .filter(Boolean);
        }
      } catch (e) { /* fallback silently */ }
    }

    // 3) Business overrides (if present) take precedence (exact set)
    let effective = [];
    if (business_id) {
      const all = readBizSettings();
      const rec = all[business_id];
      if (rec && Array.isArray(rec.features) && rec.features.length) {
        effective = rec.features;
      }
    }

    // 4) If no overrides, prefer planCodes if available; else roleBaseline
    if (!effective.length) effective = planCodes.length ? planCodes : roleBaseline;

    res.json(decryptDeep({ features: effective }));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === Current User: Profile (safe) ===
app.get('/me/profile', authenticateToken, async (req, res) => {
  try {
    const users = await fetchFromGrist(USERS_TABLE);
    const me = (users || []).find(u => String(u.id) === String(req.user?.id) || String(u.email) === String(req.user?.email));
    if (!me) return res.status(404).json({ error: 'User not found' });
    const { password_hash, password, ...safe } = me;
    res.json(decryptDeep(safe));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === SaaS Admin: Renewal / Trial Status ===
app.get('/admin/renewal-status', ...withAuthAndAbility, requireRole(['SaaS Admin']), async (req, res) => {
  try {
    let subscriptions = [];
    try { subscriptions = await fetchFromGrist(SUBSCRIPTIONS_TABLE); } catch {}
    const now = Date.now();
    let status = { state: 'trial', days_left: 14 };
    if (subscriptions.length) {
      const s = subscriptions[0];
      const end = new Date(s.renewed_at || s.end_date || Date.now()+86400000*30).getTime();
      const days = Math.max(0, Math.ceil((end - now)/86400000));
      status = { state: 'active', renews_on: new Date(end).toISOString(), days_left: days };
    }
    res.json(decryptDeep(status));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === SaaS Admin: Payment Methods (static list) ===
app.get('/admin/payment-methods', ...withAuthAndAbility, requireRole(['SaaS Admin']), (req, res) => {
  res.json([
    { id: 'cash', name: 'Cash' },
    { id: 'mobile_money', name: 'Mobile Money' },
    { id: 'card', name: 'Visa / MasterCard' }
  ]);
});

// Helper: generate 6-digit OTP
function generateOTP() {
  return ("" + Math.floor(100000 + Math.random() * 900000));
}

// Helper: generate a temporary password
function generateTempPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let out = '';
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function makeBizCodeBase(name){
  const cleaned = String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const base = cleaned.slice(0, 4) || 'BIZ';
  return base;
}

function getEmailContent(locale, { ownerFname, businessName, businessId, tempPassword, otp, loginUrl }){
  const loc = (locale || process.env.DEFAULT_LOCALE || 'en-US').toLowerCase();
  if (loc.startsWith('lg')){
    const subject = `Akatabo ko kusettinga akawandiikiddwa - ${businessName}`;
    const html = `
      <p>Gyebale ko ${ownerFname},</p>
      <p>Akasawo ko ak'Obusuubuzi <b>${businessName}</b> kakolebwa.</p>
      <p><b>Business ID:</b> ${businessId}</p>
      <p><b>Temporary Password:</b> ${tempPassword}</p>
      <p>Kozesa OTP eno okusobola okuteeka akasimu aka passwaadi emu empya: <b>${otp}</b> (ezaalawo mu masaa 24).</p>
      <p>Weyingire wano: <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Olina okusabibwa okuddamu okuteeka passwaadi empya oluvannyuma lw’okuyingira okusooka.</p>
      <p>Webale,<br/>SaaS Admin</p>
    `;
    return { subject, html };
  }
  if (loc.startsWith('sw')){
    const subject = `Akaunti ya biashara imeundwa - ${businessName}`;
    const html = `
      <p>Habari ${ownerFname},</p>
      <p>Akaunti ya biashara <b>${businessName}</b> imeundwa.</p>
      <p><b>Business ID:</b> ${businessId}</p>
      <p><b>Nenosiri la muda:</b> ${tempPassword}</p>
      <p>Tumia OTP hii kuweka nenosiri jipya kabla ya kuingia mara ya kwanza: <b>${otp}</b> (inaisha baada ya saa 24).</p>
      <p>Kiungo cha akaunti: <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Kwa usalama, utahitajika kuweka nenosiri jipya mara ya kwanza unapojaribu kuingia.</p>
      <p>Asante,<br/>SaaS Admin</p>
    `;
    return { subject, html };
  }
  const subject = `Your business account is ready - ${businessName}`;
  const html = `
    <p>Hello ${ownerFname},</p>
    <p>Your business <b>${businessName}</b> has been provisioned.</p>
    <p><b>Business ID:</b> ${businessId}</p>
    <p><b>Temporary Password:</b> ${tempPassword}</p>
    <p>Use this One-Time Password (OTP) to set your password before first login: <b>${otp}</b> (expires in 24 hours).</p>
    <p>Account link: <a href="${loginUrl}">${loginUrl}</a></p>
    <p>For security, you will be required to reset your password when you first sign in.</p>
    <p>Regards,<br/>SaaS Admin</p>
  `;
  return { subject, html };
}

// === SaaS Admin: create tenant (business + owner, email OTP) ===
app.post(["/admin/create-tenant", "/admin/provision-tenant"], ...withAuthAndAbility, requireRole(["SaaS Admin"]), async (req, res) => {
  try {
    const { business, owner } = req.body || {};
    if (!business?.name) return res.status(400).json({ error: "Business name is required" });
    if (!owner?.email || !owner?.fname || !owner?.lname) {
      return res.status(400).json({ error: "owner.email, owner.fname, owner.lname are required" });
    }

    // 0) Generate unique Business ID (tenant code)
    const businesses = await fetchFromGrist("Businesses");
    const users = await fetchFromGrist(USERS_TABLE);
    const taken = new Set([
      ...(Array.isArray(businesses) ? businesses.map(b => String(b.business_id || '')) : []),
      ...(Array.isArray(users) ? users.map(u => String(u.business_id || '')) : [])
    ].filter(Boolean));
    const base = makeBizCodeBase(business.name);
    let candidate = `${base}-001`;
    let i = 1;
    while (taken.has(candidate)) { i++; candidate = `${base}-${String(i).padStart(3,'0')}`; if (i > 9999) break; }

    // 1) Create business
    const bizPayload = {
      name: business.name,
      business_id: candidate,
      subscription_id: business.subscription_id || null,
      start_date: business.start_date || null,
      end_date: business.end_date || null,
      logo_url: business.logo_url || null,
      fiscal_year_start: business.fiscal_year_start || null,
      fiscal_year_end: business.fiscal_year_end || null,
      is_active: true,
      created_at: new Date().toISOString()
    };
    const bizRes = await addToGrist("Businesses", bizPayload);
    if (!bizRes.success) return res.status(500).json({ error: "Failed to create business" });

    // 2) Create owner with temporary password and forced reset
    const existing = await fetchFromGrist(USERS_TABLE);
    if (existing.find(u => u.email === owner.email)) {
      return res.status(409).json({ error: "Owner email already exists" });
    }
    const tempPassword = generateTempPassword(12);
    const password_hash = await bcrypt.hash(tempPassword, 12);
    const otp = generateOTP();
    const otp_expires = new Date(Date.now() + 24*60*60*1000).toISOString();
    const ownerPayload = {
      email: owner.email,
      password_hash,
      password: password_hash, // compatibility
      role: "Owner",
      fname: owner.fname,
      mname: owner.mname || "",
      lname: owner.lname,
      phone_number: owner.phone_number || "",
      business_id: candidate,
      business_name: business.name,
      is_active: true,
      created_at: new Date().toISOString(),
      force_password_reset: true,
      otp_code: otp,
      otp_expires
    };
    const userRes = await addToGrist(USERS_TABLE, ownerPayload);
    if (!userRes.success) return res.status(500).json({ error: "Failed to create owner" });

    // 2b) Update business with owner_id
    try {
      const ownerId = userRes.data?.id;
      if (ownerId) {
        await updateGristRecord("Businesses", bizRes.data?.id, { owner_id: ownerId, subscription_id: business.subscription_id || null });
      }
    } catch (e) { console.warn('Failed to patch business with owner_id:', e?.message); }

    // 3) Email Owner with account details and next steps
    const frontUrl = (process.env.FRONTEND_ORIGIN || process.env.APP_URL || process.env.PUBLIC_URL || '').trim() || `http://localhost:${PORT}`;
    const loginUrl = `${frontUrl}/`;
    const { subject, html } = getEmailContent(owner.locale || business.locale || process.env.DEFAULT_LOCALE, {
      ownerFname: owner.fname,
      businessName: business.name,
      businessId: candidate,
      tempPassword,
      otp,
      loginUrl
    });
    try { await sendMail(owner.email, subject, html); } catch (e) { console.warn("Email send failed:", e?.message); }

    res.status(201).json(decryptDeep({ message: "Tenant provisioned", business: bizPayload, owner: { email: owner.email }, business_id: candidate }));
  } catch (e) {
    console.error("Provision tenant error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === Auth: reset password with OTP ===
app.post("/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, new_password } = req.body || {};
    if (!email || !otp || !new_password) return res.status(400).json({ error: "email, otp, new_password required" });
    const users = await fetchFromGrist(USERS_TABLE);
    const u = users.find(x => x.email === email);
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!u.otp_code || !u.otp_expires) return res.status(400).json({ error: "No OTP requested for this account" });
    const now = Date.now();
    if (String(u.otp_code) !== String(otp) || new Date(u.otp_expires).getTime() < now) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }
    const password_hash = await bcrypt.hash(new_password, 12);
    const updated = {
      password_hash,
      password: password_hash,
      force_password_reset: false,
      otp_code: null,
      otp_expires: null
    };
    const updRes = await updateGristRecord(USERS_TABLE, u.id, updated);
    if (!updRes.success) return res.status(500).json({ error: "Failed to update password" });
    res.json(decryptDeep({ message: "Password updated. You can now log in." }));
  } catch (e) {
    console.error("Reset password error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mount generic CRUD for SaaS Admin with plaintext guarantee
app.use('/admin/crud', ...withAuthAndAbility, requireRole(['SaaS Admin']), (req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (data) => sendJson(decryptDeep(data));
  next();
}, crudRouter);

app.listen(PORT,()=>console.log(`Backend running on http://localhost:${PORT}`));
