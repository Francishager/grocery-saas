Grocery Shop SaaS
Project Overview

This is a SaaS-based Grocery Shop Management System built with Node.js, Express, Grist, HTML, CSS/Bootstrap, JS, and Chart.js.

It allows multiple businesses to manage their operations under one system with role-based access:

SaaS Admin – Full access to all businesses.

Owner – Full access to their business, including inventory, sales, reports.

Accountant – Access to reports and financial summaries only.

Attendant – Access to sales, selling, receipt printing, and inventory updates (restricted).

The system integrates with Grist as the backend database and keeps API keys hidden on the backend.

Features
Inventory Management

Track product quantities, low stock alerts, and manage inventory.

Add, edit, and remove products.

Sales & Receipt Printing

Create sales transactions.

Automatically calculate totals, discounts, taxes, and profit.

Generate printable receipts for customers.

Dashboard

Live Top 5 Products chart.

Staff Leaderboard for sales performance.

KPI cards: Total Sales, Total Profit, Discounts, Taxes.

Low stock alerts.

Daily & Monthly summary charts.

Reports

Daily, Monthly, and Product/Staff reports.

Export-ready structure for Excel/PDF (placeholder implemented, can extend).

Profit/Loss, Discounts, and Taxes calculations included.

Role-Based Access

Users only see and modify data they are permitted to.

SaaS Admins can manage all businesses without accessing detailed user data.

Owners and staff access restricted to their business.

---

## Environment Variables (.env)
The server validates these on startup.

```
# Server
PORT=3000
JWT_SECRET=your_jwt_secret_here

# Grist
GRIST_API_KEY=your_grist_api_key
GRIST_DOC_ID=your_grist_document_id
```

Keep `.env` out of version control.

## Run

- Install deps:
  - `npm install`
- Dev:
  - `npm run dev` (nodemon)
- Prod:
  - `npm start`
- Health check:
  - GET `http://localhost:3000/health`

Static frontend is served from `public/` (open `.html` in a browser or serve via any static server). Frontend scripts call backend endpoints on `http://localhost:3000`.

## API Overview
All protected endpoints require `Authorization: Bearer <JWT>` header obtained via `/login`.

- Auth
  - POST `/register` — Create user (email, password, fname, lname, role, optional business_id/name)
  - POST `/login` — Returns `{ token, user }`
  - GET `/validate-token` — Validates token
  - POST `/logout` — Client-side token removal helper
  - GET `/health` — Service status

- Dashboard
  - GET `/dashboard/kpis` — KPIs and low stock
    - Query: `businessId` (optional; SaaS Admin only). Others inferred from token.

- Reports
  - GET `/reports/products` — Top products
  - GET `/reports/staff` — Staff leaderboard
  - GET `/reports/daily` — Daily profit trend
  - GET `/reports/monthly` — Monthly profit trend
  - GET `/reports/export` — Placeholder `?type=pdf|excel`

- Inventory
  - GET `/inventory` — List inventory (Owner, SaaS Admin). Optional query: `q` to search by name, `businessId` (SaaS Admin only).
  - GET `/inventory/:businessId` — Compatibility route for search with `?q=` (Owner forced to their own business; SaaS Admin can query any business).

- Sales
  - POST `/sales` — Create sale (Owner, Attendant, SaaS Admin)
    - Body: `product_id, product_name, quantity, unit_price, discount?, tax?, cost_of_goods?, notes?, business_id? (SaaS Admin only)`
  - POST `/sales/checkout` — Create multiple sale records from a `cart` (Owner, Attendant, SaaS Admin)
    - Body: `{ business_id?, cart: [{ id|product_id, name|product_name, qty|quantity, selling_price|unit_price, discount?, tax?, cost_of_goods?|cost_price? }...], payment_mode? }`
    - Returns: `{ message, count, total, sales }`

Protected endpoints must include `Authorization: Bearer <JWT>` obtained from `/login`. Multi-tenancy: `business_id` is derived from JWT for non-admin roles; SaaS Admin may override with `businessId` (query) or `business_id` (body) where applicable.

## Data Model (Grist tables)
- Businesses: id, name, subscription_tier, limits, created_at
- Users: id, email, password_hash, role, fname, lname, business_id, business_name, is_active, created_at
- Inventory: id, business_id, product_id, product_name, quantity, unit_price, low_stock_alert, cost_price, updated_at
- Sales: id, business_id, product_id, product_name, quantity, unit_price, discount, tax, total, cost_of_goods, staff_name, date, notes

Ensure all rows include `business_id` for multi-tenant isolation.