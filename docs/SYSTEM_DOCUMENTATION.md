# jibuSales — System Documentation

> **Version:** 2.0.0  
> **Last Updated:** June 2025  
> **Status:** Production-ready multi-tenant SaaS POS, Inventory & Business Management Platform with offline-first PWA capabilities

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Backend](#5-backend)
   - 5.1 [Express App](#51-express-app)
   - 5.2 [Prisma Schema](#52-prisma-schema)
   - 5.3 [Authentication & Authorization](#53-authentication--authorization)
   - 5.4 [Feature Access Control](#54-feature-access-control)
   - 5.5 [API Routes](#55-api-routes)
   - 5.6 [Middleware](#56-middleware)
   - 5.7 [Audit Logging](#57-audit-logging)
6. [Frontend](#6-frontend)
   - 6.1 [React App](#61-react-app)
   - 6.2 [Routing](#62-routing)
   - 6.3 [Authentication Context](#63-authentication-context)
   - 6.4 [Feature Access Service](#64-feature-access-service)
   - 6.5 [API Layer](#65-api-layer)
   - 6.6 [Pages](#66-pages)
   - 6.7 [Components](#67-components)
   - 6.8 [Layouts](#68-layouts)
7. [Offline-First PWA System](#7-offline-first-pwa-system)
   - 7.1 [Dexie IndexedDB Schema](#71-dexie-indexeddb-schema)
   - 7.2 [Sync Engine](#72-sync-engine)
   - 7.3 [Local Data Accessors](#73-local-data-accessors)
   - 7.4 [Hybrid Query Hook](#74-hybrid-query-hook)
   - 7.5 [Offline Hooks](#75-offline-hooks)
   - 7.6 [Sync Indicator](#76-sync-indicator)
   - 7.7 [Service Worker & PWA Configuration](#77-service-worker--pwa-configuration)
   - 7.8 [Offline Page Wiring](#78-offline-page-wiring)
8. [Notification System](#8-notification-system)
9. [Database Schema](#9-database-schema)
10. [Deployment](#10-deployment)
11. [Environment Variables](#11-environment-variables)

---

## 1. Overview

jibuSales is a **multi-tenant SaaS platform** for grocery, retail, pharmacy, hardware, restaurant, and service businesses. It provides POS (Point of Sale), inventory management, receivables/payables, accounting, HR, rentals, restaurant management, reporting, and offline-first PWA capabilities.

### Key Capabilities

- **Multi-tenant SaaS** — Each business is a tenant with isolated data, subscription plans, and feature access control
- **Multi-branch** — Tenants can have multiple branches with per-branch inventory and staff assignments
- **Role-based access control** — Granular per-user permissions (60+ permission flags)
- **Feature gating** — Subscription plans control which features each tenant can access
- **Offline-first PWA** — Full offline functionality via IndexedDB, service worker caching, and queued writes
- **POS & Sales** — Barcode scanning, multi-UOM, discounts, tax (URA VAT), mobile money, receipt printing
- **Inventory** — Products, services, rental items, categories, stock adjustments, multi-UOM, expiry tracking
- **Receivables** — Customer credit management, invoices, payments, aging reports
- **Payables** — Supplier management, purchase orders, supplier payments, balance tracking
- **Expenses** — Expense tracking with cash accounts and transactions
- **Accounting** — Double-entry bookkeeping, chart of accounts, journal entries, trial balance
- **HR** — Employee management, leave requests, payroll, attendance
- **Rentals** — Hire/rental bookings, return processing, overdue tracking, damage fees
- **Restaurant & Bar** — Tables, orders, waiters, reservations, recipes, combo meals, happy hours, deliveries
- **Reports** — 50+ report types across sales, inventory, financial, customers, suppliers, receivables, payables, performance, services, rentals
- **Notifications** — In-app notification bell with auto-generated job alerts (low-stock, overdue rentals, pending leaves, overdue payables)
- **Audit Log** — Full audit trail of all data mutations
- **Integrations** — Payment gateway integrations (Stripe, Flutterwave, Mobile Money, QR Payments)
- **Communication** — Broadcast messages to all staff, notification management

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Pages (Frontend)              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  React 18 + Vite 6 + TypeScript PWA                   │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │  UI Layer    │  │  State/Ctx   │  │  Offline DB  │ │  │
│  │  │  (Pages,     │  │  (JWTAuth,   │  │  (Dexie/     │ │  │
│  │  │  Components) │  │  FeatureAcc) │  │  IndexedDB)  │ │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │  │
│  │         │                 │                  │         │  │
│  │  ┌──────▼─────────────────▼──────────────────▼───────┐ │  │
│  │  │              API Layer (api.ts)                    │ │  │
│  │  │     REST calls + apiFetch (auth-injected fetch)    │ │  │
│  │  └──────────────────────┬─────────────────────────────┘ │  │
│  └─────────────────────────┼───────────────────────────────┘  │
│                            │ HTTPS                            │
│  ┌─────────────────────────▼───────────────────────────────┐  │
│  │           Service Worker (Workbox / PWA)                 │  │
│  │  Caches: App Shell, JS/CSS, Fonts, API (NetworkFirst)   │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Railway (Backend)                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Express 5 + Node.js                                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │    Auth   │ │   CRUD   │ │  Reports │ │ Platform │ │  │
│  │  │  Routes   │ │  Routes  │ │  Routes  │ │  Routes  │ │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │  │
│  │       │            │            │            │        │  │
│  │  ┌────▼────────────▼────────────▼────────────▼─────┐  │  │
│  │  │              Middleware Layer                    │  │  │
│  │  │  authenticateToken │ requirePermission │ audit   │  │  │
│  │  │  requireFeature (plan-based feature gating)      │  │  │
│  │  └──────────────────────┬───────────────────────────┘  │  │
│  └─────────────────────────┼───────────────────────────────┘  │
│                            │                                  │
│  ┌─────────────────────────▼───────────────────────────────┐  │
│  │  Prisma ORM → PostgreSQL (Railway / external)           │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | ≥18 | Runtime |
| Express | 5.1 | HTTP framework |
| Prisma | 5.22 | ORM / Database schema |
| PostgreSQL | — | Database (via Railway) |
| JSON Web Tokens | 9.0 | Authentication |
| bcryptjs | 3.0 | Password hashing |
| Multer | 2.2 | File uploads |
| Cloudinary | 2.10 | Image storage (logos, avatars) |
| Nodemailer / Resend | — | Email sending |
| PDFKit | 0.19 | PDF generation |
| CORS | 2.8 | Cross-origin support |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3 | UI framework |
| TypeScript | 5.6 | Type safety |
| Vite | 6.0 | Build tool / dev server |
| React Router | 6.26 | Client-side routing |
| TailwindCSS | 3.4 | Styling |
| shadcn/ui + Radix UI | — | Component library |
| Lucide React | 0.460 | Icons |
| Dexie | 4.4 | IndexedDB wrapper |
| dexie-react-hooks | 4.4 | Live queries |
| vite-plugin-pwa | 1.3 | PWA / Service Worker |
| Recharts / Chart.js | — | Charts & graphs |
| jsPDF + jspdf-autotable | — | PDF export |
| XLSX | 0.18 | Excel export |
| html5-qrcode | 2.3 | Barcode scanning |
| Zustand | 4.5 | State management |
| Redux Toolkit | 2.11 | State management (legacy) |

### Infrastructure

| Service | Purpose |
|---|---|
| Railway | Backend hosting |
| Cloudflare Pages | Frontend hosting |
| Railway PostgreSQL | Database |
| Cloudinary | Image/file storage |
| Resend / Nodemailer | Transactional email |

---

## 4. Project Structure

```
grocery-saas/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Full database schema (1728 lines)
│   │   ├── seed.js                # Database seeding
│   │   └── migrations/            # Prisma migrations
│   ├── src/
│   │   ├── app.js                 # Express app entry point
│   │   ├── db.js                  # Prisma client instance
│   │   ├── routes/                # Core API routes (16 files)
│   │   │   ├── auth.js            # Authentication (login, register, OTP, password reset)
│   │   │   ├── sales.js           # POS sales
│   │   │   ├── inventory.js       # Products, services, rentals, categories, stock
│   │   │   ├── purchases.js       # Legacy purchases
│   │   │   ├── dashboard.js       # Dashboard analytics
│   │   │   ├── reports.js         # 50+ report types (63K lines)
│   │   │   ├── admin.js           # SaaS admin operations
│   │   │   ├── invitations.js     # Business owner invitations
│   │   │   ├── tenants.js         # Tenant management
│   │   │   ├── crud.js            # Generic CRUD helper
│   │   │   ├── audit.js           # Audit log queries
│   │   │   ├── receipts.js        # Receipt generation & thermal printing
│   │   │   ├── branches.js        # Branch management
│   │   │   ├── staff.js           # Staff management & permissions schema
│   │   │   ├── settings.js        # Business settings
│   │   │   └── platform.js        # Legacy platform routes
│   │   └── utils/
│   │       └── audit.js           # Audit middleware
│   ├── routes/                    # Extended API routes (12 files)
│   │   ├── receivables.js         # Customer credit system
│   │   ├── payables.js            # Supplier management
│   │   ├── expenses.js            # Expenses + cash accounts
│   │   ├── rentals.js             # Rental/hire bookings
│   │   ├── returns.js             # Sale returns & refunds
│   │   ├── accounting.js          # Double-entry accounting
│   │   ├── hr.js                  # HR management
│   │   ├── transfers.js           # Branch stock transfers
│   │   ├── notifications.js       # In-app notifications & broadcasts
│   │   ├── integrations.js        # Payment gateway integrations
│   │   ├── restaurant.js          # Restaurant & bar module
│   │   └── platform-new.js        # Plans, features, subscriptions, analytics
│   ├── middleware/
│   │   ├── auth.js                # JWT authentication + permission checks
│   │   └── featureCheck.js        # Plan-based feature gating
│   ├── Dockerfile                 # Docker containerization
│   ├── mailer.js                  # Email service
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # Root component with all routes
│   │   ├── main.tsx               # App entry point
│   │   ├── index.css              # Global styles (Tailwind)
│   │   ├── vite-env.d.ts          # Vite type declarations
│   │   │
│   │   ├── pages/                 # All page components (41 files)
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── SalesPage.tsx
│   │   │   ├── InventoryPage.tsx
│   │   │   ├── ReportsPage.tsx
│   │   │   ├── BranchesPage.tsx
│   │   │   ├── StaffPage.tsx
│   │   │   ├── BusinessSettingsPage.tsx
│   │   │   ├── TaxManagementPage.tsx
│   │   │   ├── ReceiptSettingsPage.tsx
│   │   │   ├── RolesPermissionsPage.tsx
│   │   │   ├── TransfersPage.tsx
│   │   │   ├── RentalsPage.tsx
│   │   │   ├── ReturnsPage.tsx
│   │   │   ├── AccountingPage.tsx
│   │   │   ├── HRPage.tsx
│   │   │   ├── CommunicationPage.tsx
│   │   │   ├── IntegrationsPage.tsx
│   │   │   ├── RestaurantPage.tsx
│   │   │   ├── AuditLogPage.tsx
│   │   │   ├── UserProfilePage.tsx
│   │   │   ├── expenses/
│   │   │   │   └── ExpensesPage.tsx
│   │   │   ├── receivables/
│   │   │   │   ├── ReceivablesPage.tsx
│   │   │   │   └── PayablesPage.tsx
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   ├── RegisterPage.tsx
│   │   │   │   ├── ForgotPasswordPage.tsx
│   │   │   │   ├── AcceptInvitation.tsx
│   │   │   │   ├── SaaSAdminLoginPage.tsx
│   │   │   │   └── UnauthorizedPage.tsx
│   │   │   ├── admin/
│   │   │   │   ├── AdminPage.tsx
│   │   │   │   └── SaaSAdminDashboard.tsx
│   │   │   └── SaaSAdmin/
│   │   │       ├── Dashboard.tsx
│   │   │       ├── BusinessesPage.tsx
│   │   │       ├── ProvisionPage.tsx
│   │   │       ├── PlansPage.tsx
│   │   │       ├── FeaturesPage.tsx
│   │   │       ├── OwnersPage.tsx
│   │   │       ├── SubscriptionsPage.tsx
│   │   │       ├── InvitationsList.tsx
│   │   │       └── InviteBusinessOwnerModal.tsx
│   │   │
│   │   ├── components/            # Shared components
│   │   │   ├── NotificationBell.tsx       # Navbar notification bell with job alerts
│   │   │   ├── SyncIndicator.tsx         # Online/offline/sync status badge
│   │   │   ├── FeatureGuard.tsx          # Plan-based feature gating wrapper
│   │   │   ├── BarcodeScanner.tsx        # Barcode/QR scanning component
│   │   │   ├── ReceiptViewer.tsx         # Receipt preview & printing
│   │   │   ├── SessionMonitor.tsx        # Session timeout management
│   │   │   ├── UkoAvatar.tsx             # User avatar component
│   │   │   ├── LoadingScreen.tsx         # Full-screen loading spinner
│   │   │   ├── layout/                   # Layout components
│   │   │   │   ├── TenantLayout.tsx      # Main tenant layout (sidebar + navbar)
│   │   │   │   ├── SaaSAdminLayout.tsx   # SaaS admin layout
│   │   │   │   ├── DashboardLayout.tsx   # Generic dashboard layout (unused)
│   │   │   │   ├── DashboardNavbar.tsx   # Generic navbar (unused)
│   │   │   │   ├── MenuList.tsx          # Sidebar menu renderer
│   │   │   │   └── Popovers/             # Popover components (8 files)
│   │   │   ├── ui/                       # shadcn/ui primitives (37 files)
│   │   │   ├── forms/                    # Form components (26 files)
│   │   │   ├── modals/                   # Modal dialogs (3 files)
│   │   │   └── Constants/                # Constants & config (10 files)
│   │   │
│   │   ├── contexts/             # React contexts (12 files)
│   │   │   ├── JWTAuthContext.tsx        # JWT authentication state
│   │   │   ├── SettingsContext.tsx       # Business settings
│   │   │   ├── GlobalStoreContext.tsx    # Global store state
│   │   │   ├── DrawerContext.tsx         # Drawer state
│   │   │   ├── ModalDialogContext.tsx    # Modal dialog state
│   │   │   ├── TaskIndicatorContext.tsx  # Task progress indicator
│   │   │   ├── TitleContext.tsx          # Page title
│   │   │   ├── ConsentBoxContext.tsx     # Consent dialogs
│   │   │   ├── CurrenciesContext.tsx     # Currency formatting
│   │   │   ├── UserLocationContext.tsx   # User geolocation
│   │   │   ├── InstitutionContext.tsx    # Institution data
│   │   │   └── AuthContext.tsx           # Legacy auth context
│   │   │
│   │   ├── db/                   # Offline-first database layer
│   │   │   ├── index.ts                  # Dexie IndexedDB schema & interfaces
│   │   │   ├── sync.ts                   # Sync engine (pull/push/auto-sync)
│   │   │   ├── hybrid.ts                 # Hybrid query hooks & local data accessors
│   │   │   └── hooks.ts                  # React hooks for offline state
│   │   │
│   │   ├── guard/
│   │   │   └── RoleRoute.tsx             # Route-level role guard
│   │   │
│   │   ├── hooks/                # Custom React hooks (6 files)
│   │   │   ├── use-toast.ts              # Toast notifications
│   │   │   ├── useAuth.tsx               # Auth hook
│   │   │   ├── useLocalStorage.tsx       # LocalStorage hook
│   │   │   ├── useTitle.tsx              # Page title hook
│   │   │   ├── useCurrencies.tsx         # Currency hook
│   │   │   └── useInstitution.tsx        # Institution hook
│   │   │
│   │   ├── services/
│   │   │   ├── featureAccessService.ts   # Feature access singleton service
│   │   │   └── InviteService.ts          # Invitation service
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts                    # API client (38K lines, all endpoints)
│   │   │   ├── utils.ts                  # Utility functions (cn, formatters)
│   │   │   ├── exportUtils.ts            # PDF/Excel export utilities
│   │   │   └── thermalPrinter.ts         # Thermal printer integration
│   │   │
│   │   ├── stores/               # Zustand stores
│   │   └── icons/                # Custom icon components
│   │
│   ├── vite.config.ts            # Vite + PWA configuration
│   ├── package.json
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── netlify.toml                  # Netlify/Cloudflare Pages config
├── railway.toml                  # Railway backend config
├── package.json                  # Root package.json
└── .github/                      # CI/CD workflows
```

---

## 5. Backend

### 5.1 Express App

**File:** `backend/src/app.js`

The Express 5 application is the entry point for the backend API.

- **CORS:** Configurable via `ALLOWED_ORIGINS` env var, allows localhost for development and production frontend
- **Security headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
- **Audit middleware:** Captures all mutating requests (POST/PUT/DELETE/PATCH) on `/api` routes
- **JSON body parsing:** `express.json()` for all routes
- **Static files:** Serves uploaded files from `/uploads`
- **Health check:** `GET /` returns API status and version
- **404 handler:** Catches all unmatched routes
- **Global error handler:** Catches unhandled errors with proper status codes
- **Graceful shutdown:** Disconnects Prisma on SIGINT/SIGTERM

### 5.2 Prisma Schema

**File:** `backend/prisma/schema.prisma` (1728 lines)

The schema defines all database models for the multi-tenant SaaS platform:

#### Core Models

| Model | Description |
|---|---|
| `Tenant` | Business entity (tenant) with plan, subscription, settings |
| `User` | Platform user (SaaS admin, owner, manager, accountant, attendant) |
| `UserPermission` | Granular per-user permissions (60+ boolean flags) |
| `UserBranch` | Many-to-many user-branch assignments |
| `Branch` | Business branch/location |
| `Plan` | Subscription plan with features and limits |
| `PlanFeature` | Individual feature in a plan |
| `TenantFeature` | Feature overrides per tenant |
| `UsageLimit` | Usage limits (maxProducts, maxUsers, etc.) |
| `Invitation` | Business owner invitations |

#### Business Data Models

| Model | Description |
|---|---|
| `Product` | Products, services, rental items (via `ItemType` enum) |
| `ProductUnit` | Multi-UOM selling units (e.g., Crate = 24 pieces) |
| `Category` | Product/service/rental categories |
| `Sale` | POS sales (legacy) |
| `SaleItem` | Line items for legacy sales |
| `SaleRecord` | Credit sales with customer, payment status, balance |
| `SaleRecordItem` | Line items for sale records |
| `Customer` | Customer with credit limit, balance, trust score |
| `CustomerPayment` | Customer payments (cash, mobile money, bank) |
| `Invoice` | Customer invoices with status tracking |
| `Supplier` | Supplier with balance tracking |
| `SupplierPurchase` | Supplier purchase orders |
| `SupplierPurchaseItem` | Line items for supplier purchases |
| `SupplierPayment` | Supplier payments |
| `Purchase` | Legacy purchases |
| `PurchaseItem` | Legacy purchase items |
| `Expense` | Business expenses |
| `CashAccount` | Cash/mobile money/bank accounts |
| `CashTransaction` | Cash account transactions |
| `Rental` | Rental/hire bookings |
| `RentalItem` | Items in a rental booking |
| `SaleReturn` | Sale returns & refunds |
| `SaleReturnItem` | Items in a sale return |
| `StockTransfer` | Branch-to-branch stock transfers |
| `StockTransferItem` | Items in a stock transfer |
| `Account` | Chart of accounts (asset, liability, equity, revenue, expense) |
| `JournalEntry` | Journal entries with lines |
| `JournalLine` | Individual debit/credit lines |
| `Employee` | Employee records |
| `Attendance` | Employee attendance |
| `LeaveRequest` | Leave requests |
| `PayrollRecord` | Payroll records |
| `Notification` | In-app notifications |
| `IntegrationConfig` | Payment gateway integrations |
| `AuditLog` | Audit trail |
| `Setting` | Business settings (via Tenant fields) |

#### Restaurant Models

| Model | Description |
|---|---|
| `RestaurantTable` | Table management |
| `RestaurantOrder` | Restaurant orders |
| `RestaurantOrderItem` | Order line items |
| `Reservation` | Table reservations |
| `Recipe` | Recipes with ingredients |
| `RecipeIngredient` | Recipe ingredients |
| `Waiter` | Waiter assignments |
| `HappyHourRule` | Happy hour pricing rules |
| `ComboMeal` | Combo meal definitions |
| `ComboMealItem` | Items in combo meals |
| `Delivery` | Delivery tracking |
| `Tip` | Waiter tips |

#### Enums

| Enum | Values |
|---|---|
| `UserRole` | `saas_admin`, `owner`, `manager`, `accountant`, `attendant` |
| `TenantStatus` | `active`, `suspended`, `cancelled`, `trial` |
| `ItemType` | `product`, `service`, `rental` |
| `RentalPeriod` | `hourly`, `daily`, `weekly`, `weekend`, `monthly`, `custom` |
| `RentalStatus` | `active`, `returned`, `overdue`, `lost`, `cancelled` |
| `SaleStatus` | `pending`, `completed`, `cancelled`, `refunded` |
| `PaymentStatus` | `paid`, `partial`, `unpaid`, `overdue` |
| `CustomerStatus` | `active`, `inactive`, `blocked` |
| `SupplierStatus` | `active`, `inactive`, `blocked` |
| `InvoiceStatus` | `draft`, `sent`, `unpaid`, `partial`, `paid`, `cancelled`, `overdue` |
| `InvitationStatus` | `pending`, `accepted`, `expired`, `cancelled` |
| `DiscountPermission` | `none`, `lineItem`, `invoice`, `managerApproval` |
| `CategoryType` | `product`, `service`, `rental` |
| `ItemCondition` | `good`, `fair`, `damaged`, `broken` |

### 5.3 Authentication & Authorization

**File:** `backend/middleware/auth.js`

- **JWT-based authentication:** Access tokens + refresh tokens
- **`authenticateToken` middleware:** Validates JWT on every protected route, attaches `req.user` with `id`, `email`, `role`, `tenantId`
- **`requirePermission(permission)` middleware:** Checks user's `UserPermission` record for the specific permission flag
- **Password hashing:** bcryptjs with salt rounds
- **OTP support:** OTP codes for password reset and invitation acceptance
- **Token refresh:** Refresh token endpoint for obtaining new access tokens
- **Auto-redirect on 401:** Frontend detects 401/403 and redirects to login

**User roles:**

| Role | Scope | Description |
|---|---|---|
| `saas_admin` | Platform | Full platform access, manages tenants, plans, features |
| `owner` | Tenant | Full business access, manages branches, staff, settings |
| `manager` | Tenant | Operational access, limited settings |
| `accountant` | Tenant | Financial access, receivables, payables, accounting |
| `attendant` | Tenant | POS sales, limited inventory view |

### 5.4 Feature Access Control

**File:** `backend/middleware/featureCheck.js`

The platform uses a **plan-based feature gating** system:

1. **Plans** have a `features` JSON array and `PlanFeature` records
2. **Tenants** are assigned a plan and can have `TenantFeature` overrides
3. **`requireFeature(featureName)` middleware** checks if the tenant's plan includes the feature
4. Features are granular: `dashboard`, `sales`, `inventory`, `inventory.products`, `inventory.services`, `inventory.rentals`, `receivables`, `payables`, `expenses`, `rentals`, `restaurant`, `sales.returns`, `accounting`, `hr`, `inventory.transfers`, `communication`, `integrations`, `reports`, `reports.sales`, `reports.inventory`, `reports.financial`, `reports.customers`, `reports.suppliers`, `reports.performance`, `reports.services`, `reports.rentals`, `audit`, `multi_branch`, `settings`, `settings.users`, `settings.taxes`, `settings.roles`

### 5.5 API Routes

All routes are mounted under `/api`:

| Route | File | Description |
|---|---|---|
| `/api/auth` | `auth.js` | Login, register, OTP, password reset, avatar upload, profile update |
| `/api/sales` | `sales.js` | POS sales CRUD, receipt generation |
| `/api/inventory` | `inventory.js` | Products, services, rentals, categories, stock adjustments, multi-UOM |
| `/api/purchases` | `purchases.js` | Legacy purchase orders |
| `/api/dashboard` | `dashboard.js` | Dashboard analytics (sales, inventory, revenue stats) |
| `/api/reports` | `reports.js` | 50+ report types (sales, inventory, financial, customers, suppliers, etc.) |
| `/api/admin` | `admin.js` | SaaS admin: tenant management, user management, system config |
| `/api/invitations` | `invitations.js` | Business owner invitations with OTP |
| `/api/tenants` | `tenants.js` | Tenant CRUD, subscription management |
| `/api/admin/crud` | `crud.js` | Generic CRUD helper |
| `/api/audit` | `audit.js` | Audit log queries with filtering |
| `/api/receipts` | `receipts.js` | Receipt generation, thermal printing, PDF |
| `/api/branches` | `branches.js` | Branch CRUD, active branches |
| `/api/staff` | `staff.js` | Staff CRUD, permissions schema, role management |
| `/api/settings` | `settings.js` | Business settings get/update, logo upload |
| `/api/platform` | `platform-new.js` | Plans, features, subscriptions, analytics, provisioning |
| `/api/receivables` | `receivables.js` | Customers, sale records, payments, invoices |
| `/api/payables` | `payables.js` | Suppliers, supplier purchases, supplier payments |
| `/api/expenses` | `expenses.js` | Expenses, cash accounts, cash transactions |
| `/api/rentals` | `rentals.js` | Rental bookings, returns, overdue tracking |
| `/api/returns` | `returns.js` | Sale returns & refunds |
| `/api/accounting` | `accounting.js` | Accounts, journal entries, trial balance |
| `/api/hr` | `hr.js` | Employees, leave requests, payroll, attendance |
| `/api/transfers` | `transfers.js` | Branch stock transfers |
| `/api/notifications` | `notifications.js` | Notifications, unread count, broadcast, mark read |
| `/api/integrations` | `integrations.js` | Payment gateway integrations CRUD |
| `/api/restaurant` | `restaurant.js` | Tables, orders, waiters, reservations, recipes, combos, happy hours, deliveries |

### 5.6 Middleware

| Middleware | File | Description |
|---|---|---|
| `authenticateToken` | `auth.js` | JWT validation, attaches `req.user` |
| `requirePermission(perm)` | `auth.js` | Checks `UserPermission` flag |
| `requireFeature(feature)` | `featureCheck.js` | Checks tenant plan features |
| `auditMiddleware()` | `utils/audit.js` | Logs all mutations to `AuditLog` |

### 5.7 Audit Logging

**File:** `backend/src/utils/audit.js`

- All POST/PUT/DELETE/PATCH requests to `/api/*` are automatically logged
- Captures: tenant ID, user ID, user email, action, model, record ID, changes (before/after), IP address
- Stored in `AuditLog` table with indexes on `[tenantId, model]` and `[tenantId, createdAt]`
- Viewable via the Audit Log page with filtering by model and action

---

## 6. Frontend

### 6.1 React App

**File:** `frontend/src/App.tsx`

The root component sets up:
- `BrowserRouter` with all routes
- `Toaster` for toast notifications
- `initSync()` call on mount to initialize the offline sync engine
- `PublicRoute` wrapper that redirects authenticated users away from auth pages
- `RoleRoute` guard for role-based route protection
- `FeatureGuard` wrapper for plan-based feature gating

### 6.2 Routing

**Routes:**

| Path | Page | Guard |
|---|---|---|
| `/login` | LoginPage | Public |
| `/saas/login` | SaaSAdminLoginPage | Public |
| `/register` | RegisterPage | Public |
| `/forgot-password` | ForgotPasswordPage | Public |
| `/accept-invitation/:token` | AcceptInvitation | Public |
| `/unauthorized` | UnauthorizedPage | Public |
| `/saas/*` | SaaS Admin pages | `saas_admin` role |
| `/tenant/dashboard` | DashboardPage | Feature: `dashboard` |
| `/tenant/sales` | SalesPage | Feature: `sales` |
| `/tenant/inventory` | InventoryPage | Feature: `inventory` |
| `/tenant/receivables` | ReceivablesPage | Feature: `receivables` |
| `/tenant/payables` | PayablesPage | Feature: `payables` |
| `/tenant/expenses` | ExpensesPage | Feature: `expenses` |
| `/tenant/rentals` | RentalsPage | Feature: `rentals` |
| `/tenant/restaurant` | RestaurantPage | Feature: `restaurant` |
| `/tenant/returns` | ReturnsPage | Feature: `sales.returns` |
| `/tenant/accounting` | AccountingPage | Feature: `accounting` |
| `/tenant/hr` | HRPage | Feature: `hr` |
| `/tenant/transfers` | TransfersPage | Feature: `inventory.transfers` |
| `/tenant/communication` | CommunicationPage | Feature: `communication` |
| `/tenant/integrations` | IntegrationsPage | Feature: `integrations` |
| `/tenant/reports` | ReportsPage | Feature: `reports` |
| `/tenant/audit` | AuditLogPage | Feature: `audit` |
| `/tenant/branches` | BranchesPage | Feature: `multi_branch` |
| `/tenant/staff` | StaffPage | Feature: `settings.users` |
| `/tenant/settings` | BusinessSettingsPage | Feature: `settings` |
| `/tenant/tax` | TaxManagementPage | Feature: `settings.taxes` |
| `/tenant/receipt-settings` | ReceiptSettingsPage | Feature: `settings` |
| `/tenant/roles` | RolesPermissionsPage | Feature: `settings.roles` |
| `/tenant/profile` | UserProfilePage | Authenticated |

### 6.3 Authentication Context

**File:** `frontend/src/contexts/JWTAuthContext.tsx`

- `JWTAuthContext` provides: `user`, `tokens`, `isAuthenticated`, `loading`, `error`
- Methods: `login()`, `logout()`, `updateUser()`, `hasPermission()`, `isPlatformUser()`
- Tokens stored in `localStorage` as `auth_tokens` and `auth_user`
- Auto-redirect to `/login` on 401/403 responses
- `hasPermission(perm)` checks the user's permissions array

### 6.4 Feature Access Service

**File:** `frontend/src/services/featureAccessService.ts`

- Singleton service that fetches and caches the tenant's feature access
- `useFeatureAccess()` hook provides: `hasFeature(name)`, `features`, `loading`
- `FeatureGuard` component wraps pages and shows an upgrade plan UI if the feature is not enabled
- Features are fetched from `/api/platform/features` and cached in memory

### 6.5 API Layer

**File:** `frontend/src/lib/api.ts` (1092 lines)

- `API_URL` from `VITE_API_URL` env var, defaults to production backend
- `api.get/post/put/patch/delete` — typed request methods with auth injection
- `apiFetch(path, init)` — drop-in `fetch` replacement that prepends `API_URL` and adds `Authorization` header
- Auto-redirect to `/login` on 401/403 with "Invalid token" or "Token expired" message
- Exported API modules: `authApi`, `settingsApi`, `staffApi`, `branchesApi`, `auditApi`, `reportsApi`, and more

### 6.6 Pages

All 41 page components are in `frontend/src/pages/`. Each page follows the offline-first pattern (see section 7.8).

### 6.7 Components

| Component | File | Description |
|---|---|---|
| `NotificationBell` | `NotificationBell.tsx` | Navbar notification bell with API + offline + auto-generated job alerts |
| `SyncIndicator` | `SyncIndicator.tsx` | Online/offline/syncing status badge with manual sync button |
| `FeatureGuard` | `FeatureGuard.tsx` | Wraps pages, shows upgrade plan if feature not enabled |
| `BarcodeScanner` | `BarcodeScanner.tsx` | Camera-based barcode/QR scanning |
| `ReceiptViewer` | `ReceiptViewer.tsx` | Receipt preview and printing |
| `SessionMonitor` | `SessionMonitor.tsx` | Session timeout with warning dialog |
| `UkoAvatar` | `UkoAvatar.tsx` | User avatar with image/initials fallback |
| `LoadingScreen` | `LoadingScreen.tsx` | Full-screen loading spinner |
| UI primitives | `ui/` (37 files) | shadcn/ui components (Button, Card, Dialog, Input, Select, Table, Tabs, Toast, etc.) |

### 6.8 Layouts

| Layout | File | Description |
|---|---|---|
| `TenantLayout` | `TenantLayout.tsx` | Main layout for tenant pages — sidebar nav with collapsible sections (Inventory, Reports, Settings), navbar with SyncIndicator, NotificationBell, user avatar dropdown |
| `SaaSAdminLayout` | `SaaSAdminLayout.tsx` | Layout for SaaS admin pages |

---

## 7. Offline-First PWA System

### 7.1 Dexie IndexedDB Schema

**File:** `frontend/src/db/index.ts`

The IndexedDB database `jibuSalesDB` has two schema versions:

**Version 1 (core tables):**
- `products`, `sales`, `customers`, `categories`, `branches`, `settings`, `syncQueue`, `syncMeta`

**Version 2 (extended tables — added all remaining modules):**
- All v1 tables plus: `expenses`, `suppliers`, `purchases`, `payments`, `transfers`, `rentals`, `returns`, `accounts`, `journalEntries`, `employees`, `leaveRequests`, `payroll`, `notifications`, `auditLogs`, `staff`, `cashAccounts`, `cashTransactions`

Each table has typed TypeScript interfaces (e.g., `LocalProduct`, `LocalSale`, `LocalExpense`, etc.) defining the offline data shape.

Special tables:
- `syncQueue` — Stores queued mutations (create/update/delete) with attempts count and last error
- `syncMeta` — Key-value store for sync metadata (e.g., `lastPull` timestamp)

### 7.2 Sync Engine

**File:** `frontend/src/db/sync.ts`

The sync engine handles bidirectional synchronization between the API and IndexedDB.

#### Pull (API → IndexedDB)

`pullAll()` fetches all 22+ data types from the API and bulk-upserts them into IndexedDB:

| Table | API Endpoint | Map Function |
|---|---|---|
| products | `/api/inventory?limit=500` | Maps product fields |
| sales | `/api/sales?limit=500` | Maps sale fields |
| customers | `/api/receivables/customers?limit=500` | Maps customer fields |
| categories | `/api/inventory/categories` | Maps category fields |
| branches | `/api/branches` | Maps branch fields |
| expenses | `/api/expenses/expenses?limit=500` | Maps expense fields |
| suppliers | `/api/payables/suppliers?limit=500` | Maps supplier fields |
| purchases | `/api/payables/purchases?limit=500` | Maps purchase fields |
| transfers | `/api/transfers?limit=500` | Maps transfer fields |
| rentals | `/api/rentals?limit=500` | Maps rental fields |
| returns | `/api/returns?limit=500` | Maps return fields |
| accounts | `/api/accounting/accounts` | Maps account fields |
| journalEntries | `/api/accounting/journal?limit=500` | Maps journal entry fields |
| employees | `/api/hr?limit=500` | Maps employee fields |
| leaveRequests | `/api/hr/leave-requests` | Maps leave request fields |
| payroll | `/api/hr/payroll` | Maps payroll fields |
| notifications | `/api/notifications` | Maps notification fields |
| cashAccounts | `/api/expenses/cash-accounts` | Maps cash account fields |
| staff | `/api/staff` | Maps staff fields (custom handling) |
| settings | `/api/settings` | Maps business settings (single record) |

The `pullTable()` helper handles various API response shapes (array, nested object with `products`, `sales`, `data`, `records`, etc.).

#### Push (IndexedDB → API)

`pushQueue()` processes the `syncQueue` table:
1. Reads all queued mutations ordered by `createdAt`
2. For each item, resolves the correct API endpoint via `resolveEndpoint()`
3. Sends the HTTP request (POST/PUT/DELETE)
4. On success: removes from queue
5. On failure: increments `attempts` and records `lastError`

#### Auto-Sync

`initSync()` (called on app mount in `App.tsx`):
- Listens for `window.online` event → triggers `syncAll()`
- Listens for `window.offline` event → sets status to `offline`
- On initial load: syncs if online, sets offline if not

`syncAll()`:
1. Pushes queued mutations first
2. Then pulls latest data

#### Status Management

- `SyncStatus`: `'idle' | 'syncing' | 'offline' | 'error'`
- `getSyncStatus()` — returns current status
- `onSyncStatusChange(cb)` — subscribe to status changes
- `getSyncStats()` — returns `{ pending: number, lastPull: string | null }`

### 7.3 Local Data Accessors

**File:** `frontend/src/db/hybrid.ts`

20+ accessor functions for reading data from IndexedDB:

| Function | Description |
|---|---|
| `getLocalExpenses(search?, category?)` | Expenses with optional search/category filter |
| `getLocalCashAccounts()` | All cash accounts |
| `getLocalCashTransactions(accountId?)` | Cash transactions, optionally by account |
| `getLocalSuppliers(search?, status?)` | Suppliers with optional search/status filter |
| `getLocalPurchases(search?, paymentStatus?)` | Supplier purchases with optional filters |
| `getLocalPayablePayments(supplierId?)` | Supplier payments, optionally by supplier |
| `getLocalReceivableCustomers(search?)` | Customers with optional search |
| `getLocalReceivableSales(customerId?, paymentStatus?)` | Sale records with optional filters |
| `getLocalReceivablePayments(customerId?)` | Customer payments, optionally by customer |
| `getLocalTransfers(status?)` | Stock transfers, optionally by status |
| `getLocalBranches()` | All branches |
| `getLocalRentals(status?)` | Rentals, optionally by status |
| `getLocalReturns()` | All sale returns |
| `getLocalAccounts()` | All chart of accounts |
| `getLocalJournalEntries(search?)` | Journal entries with optional search |
| `getLocalEmployees(search?)` | Employees with optional search |
| `getLocalLeaveRequests(status?)` | Leave requests, optionally by status |
| `getLocalPayroll(employeeId?)` | Payroll records, optionally by employee |
| `getLocalNotifications()` | All notifications ordered by date |
| `getLocalStaff(search?)` | Staff with optional search |
| `getLocalSettings()` | Business settings (single record) |
| `getLocalAuditLogs(limit?)` | Audit logs with limit |
| `getLocalReportData(reportId, params?)` | Generates report data from local IndexedDB tables |

### 7.4 Hybrid Query Hook

**File:** `frontend/src/db/hybrid.ts`

`useHybridQuery<T>(apiFn, localFn, deps)` — React hook that:
1. If online: calls `apiFn()` first, falls back to `localFn()` on error
2. If offline: calls `localFn()` directly
3. Returns `{ data, loading, error, refetch }`

### 7.5 Offline Hooks

**File:** `frontend/src/db/hooks.ts`

| Hook | Description |
|---|---|
| `useOnlineStatus()` | Returns `true`/`false` based on `navigator.onLine`, listens to online/offline events |
| `useSyncStatus()` | Returns current `SyncStatus` |
| `useSyncStats()` | Returns `{ pending, lastPull }`, polls every 5 seconds |
| `useSyncNow()` | Returns `{ syncing, syncNow }` for manual sync trigger |
| `useLocalProducts(search?)` | Live query on `db.products` with optional search |
| `useLocalProduct(id)` | Live query for single product |
| `useLocalSales(limit)` | Live query on `db.sales` ordered by date |
| `useLocalCustomers(search?)` | Live query on `db.customers` with optional search |
| `useLocalCategories(type?)` | Live query on `db.categories` with optional type filter |
| `useLocalBranches()` | Live query on `db.branches` |

### 7.6 Sync Indicator

**File:** `frontend/src/components/SyncIndicator.tsx`

Displayed in the navbar, shows:
- **Online/Offline badge** — green "Online" or orange "Offline" with WiFi icon
- **Sync status button** — shows "Syncing...", "N pending", or "Synced" with appropriate icon
- **Manual sync** — click to trigger `syncNow()`
- **Tooltip** — shows last sync time

### 7.7 Service Worker & PWA Configuration

**File:** `frontend/vite.config.ts`

Uses `vite-plugin-pwa` with Workbox:

**Manifest:**
- Name: `jibuSales`
- Display: `standalone`
- Theme color: `#2563eb`
- Background: `#0f172a`
- Icons: 192x192 and 512x512 (maskable)
- Auto-update on new versions

**Runtime Caching:**
- **API calls** (`/api/*`): `NetworkFirst` strategy — tries network, falls back to cache (24h expiry, 100 entries)
- **Google Fonts**: `CacheFirst` strategy (7 day expiry, 10 entries)

**Precaching:**
- All `**/*.{js,css,html,ico,png,svg,woff2}` files are precached
- Max file size: 5MB

**Build Output:**
- Manual chunks: `vendor` (React), `ui` (Radix/Lucide), `db` (Dexie)
- Output: `dist/` directory
- Service worker: `dist/sw.js` + `dist/workbox-*.js`

### 7.8 Offline Page Wiring

All 18+ pages follow the **API-first, IndexedDB fallback** pattern:

```typescript
// Standard pattern used across all pages
const online = useOnlineStatus()

const loadData = async () => {
  try {
    if (online) {
      // Fetch from API
      const data = await apiModule.list()
      setData(data)
    } else {
      // Fallback to IndexedDB
      const local = await getLocalData()
      setData(local)
    }
  } catch (error) {
    // API failed even when online — fallback to local
    try {
      const local = await getLocalData()
      setData(local)
    } catch {
      toast({ variant: 'destructive', title: 'Failed to load', description: error.message })
    }
  } finally {
    setLoading(false)
  }
}
```

**Pages wired for offline:**

| Page | Local Accessors Used |
|---|---|
| ReportsPage | `getLocalReportData()` |
| ReceivablesPage | `getLocalReceivableCustomers()`, `getLocalReceivableSales()`, `getLocalReceivablePayments()`, `useLocalProducts()` |
| PayablesPage | `getLocalSuppliers()`, `getLocalPurchases()`, `getLocalPayablePayments()`, `useLocalProducts()` |
| ExpensesPage | `getLocalExpenses()`, `getLocalCashAccounts()`, `getLocalCashTransactions()` |
| BranchesPage | `getLocalBranches()` |
| StaffPage | `getLocalStaff()`, `getLocalBranches()` |
| TransfersPage | `getLocalTransfers()`, `getLocalBranches()`, `useLocalProducts()` |
| RentalsPage | `getLocalRentals()`, `getLocalBranches()`, `getLocalSettings()` |
| ReturnsPage | `getLocalReturns()`, `useLocalProducts()` |
| AccountingPage | `getLocalAccounts()`, `getLocalJournalEntries()` |
| HRPage | `getLocalEmployees()`, `getLocalLeaveRequests()`, `getLocalPayroll()` |
| BusinessSettingsPage | `getLocalSettings()` |
| TaxManagementPage | `getLocalSettings()` |
| ReceiptSettingsPage | `getLocalSettings()` |
| CommunicationPage | `getLocalNotifications()` |
| AuditLogPage | `getLocalAuditLogs()` |
| IntegrationsPage | Online-only fetch, graceful offline |
| RolesPermissionsPage | `getLocalStaff()`, `getLocalBranches()` |

**Offline write pattern:**

When a user creates/updates/deletes a record while offline:
1. The mutation is written to IndexedDB immediately
2. A `SyncQueueItem` is added to `syncQueue` via `queueMutation(table, operation, recordId, data)`
3. When back online, `pushQueue()` processes the queue and sends mutations to the API

---

## 8. Notification System

**File:** `frontend/src/components/NotificationBell.tsx`

The notification bell in the navbar provides real-time notifications from three sources:

### Data Sources

1. **API Notifications** — Fetched from `/api/notifications` when online (broadcasts, system alerts, manually created notifications)
2. **IndexedDB Notifications** — Local fallback from `db.notifications` when offline
3. **Auto-Generated Job Notifications** — Computed from local IndexedDB data every 60 seconds:

| Job Type | Trigger | Navigation Link |
|---|---|---|
| Low Stock | Product quantity ≤ minStock (default 10) | → `/tenant/inventory` |
| Out of Stock | Product quantity ≤ 0 | → `/tenant/inventory` |
| Overdue Rental | Active rental past expected return date | → `/tenant/rentals` |
| Pending Leave Request | Leave request with status "pending" | → `/tenant/hr` |
| Overdue Payable | Unpaid purchase past due date | → `/tenant/payables` |

### Features

- **Unread badge** — Red count badge on bell icon (99+ overflow)
- **Dropdown panel** — Portal-rendered, click-outside to close, max 8 visible
- **Mark as read** — Per-notification and "mark all" — updates API + IndexedDB
- **Click to navigate** — Marks read and navigates to linked page
- **Auto-refresh** — Polls every 60 seconds
- **Offline support** — Falls back to IndexedDB, job notifications always work from local data
- **Visual indicators** — Type-specific icons/colors, "auto" tag for job-generated, "offline" tag for local-only
- **Time stamps** — Relative time ("5m ago", "2h ago", etc.)

### Backend API

**File:** `backend/routes/notifications.js`

| Endpoint | Method | Description |
|---|---|---|
| `/api/notifications` | GET | List notifications for current user (or all-tenant) |
| `/api/notifications` | POST | Create notification (requires `communication` feature) |
| `/api/notifications/:id/read` | PUT | Mark single notification as read |
| `/api/notifications/read-all` | PUT | Mark all as read for current user |
| `/api/notifications/unread-count` | GET | Get unread count |
| `/api/notifications/broadcast` | POST | Broadcast to all tenant users (requires `canViewCommunication`) |

---

## 9. Database Schema

The complete Prisma schema is in `backend/prisma/schema.prisma` (1728 lines, 40+ models).

### Key Relationships

```
Tenant (Business)
├── Users (owner, manager, accountant, attendant)
│   └── UserPermission (60+ boolean flags)
├── Branches
│   ├── Products (product, service, rental)
│   │   └── ProductUnit (multi-UOM)
│   ├── Sales / SaleRecords
│   ├── Purchases / SupplierPurchases
│   ├── Expenses
│   ├── Rentals
│   ├── StockTransfers (from/to)
│   └── Restaurant Tables/Orders/Reservations
├── Customers
│   ├── SaleRecords (credit sales)
│   ├── CustomerPayments
│   ├── Invoices
│   └── Rentals
├── Suppliers
│   ├── SupplierPurchases
│   └── SupplierPayments
├── CashAccounts
│   └── CashTransactions
├── Accounts (Chart of Accounts)
│   └── JournalLines
├── JournalEntries
│   └── JournalLines (debit/credit)
├── Employees
│   ├── Attendance
│   ├── LeaveRequests
│   └── PayrollRecords
├── Notifications
├── IntegrationConfigs
├── AuditLogs
├── SaleReturns
│   └── SaleReturnItems
└── Plan (Subscription)
    └── PlanFeatures

SaaS Admin (Platform-level)
├── Tenants (all businesses)
├── Plans
│   └── PlanFeatures
├── Invitations
└── UsageLimits
```

---

## 10. Deployment

### Backend (Railway)

**File:** `backend/Dockerfile`, `railway.toml`

- Hosted on Railway with Docker
- PostgreSQL database on Railway
- `postinstall` runs `prisma generate`
- Start command: `node src/app.js`
- Port: `process.env.PORT || 3000`
- Health check: `GET /`

### Frontend (Cloudflare Pages)

**File:** `netlify.toml`, `frontend/package.json`

- Build command: `vite build`
- Output: `dist/`
- Deploy: `wrangler pages deploy dist`
- Environment variable: `VITE_API_URL` (API base URL)

### CI/CD

**File:** `.github/workflows/`

GitHub Actions workflows handle automated deployment on push to main branch.

---

## 11. Environment Variables

### Backend

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `PORT` | No | Server port (default: 3000) |
| `HOST` | No | Server host (default: 0.0.0.0) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |
| `FRONTEND_ORIGIN` | No | Frontend URL for CORS |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret |
| `RESEND_API_KEY` | No | Resend email API key |
| `SMTP_HOST` | No | SMTP host for Nodemailer |
| `SMTP_PORT` | No | SMTP port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |

### Frontend

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | API base URL (defaults to production backend) |

---

## Summary

jibuSales is a comprehensive, production-ready multi-tenant SaaS platform with:

- **40+ Prisma models** covering all business domains
- **28 API route files** with JWT auth, permission checks, and feature gating
- **41 page components** all wired for offline-first operation
- **22+ IndexedDB tables** with full sync engine (pull + push + auto-sync)
- **PWA with service worker** caching app shell, static assets, and API responses
- **Notification system** with auto-generated job alerts from local data
- **60+ granular permissions** per user with role-based defaults
- **Plan-based feature gating** at both API and frontend levels
- **50+ report types** across all business domains
- **Restaurant & bar module** with tables, orders, waiters, recipes, combos, happy hours, deliveries
- **Multi-UOM support** for products with conversion factors
- **Double-entry accounting** with chart of accounts and journal entries
- **Rental/hire system** with overdue tracking and damage fees
- **Multi-branch support** with stock transfers between branches
