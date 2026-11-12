# SaaS Admin Tenant Visibility API Documentation

## Overview
SaaS admins now have complete visibility into how each tenant is using the platform, their behavior, activity patterns, and all administrative actions taken.

---

## API Endpoints

### 1. **Get Tenant Activity Summary**
Retrieve activity overview for a specific tenant.

```http
GET /api/platform/tenants/activity/:tenantId?days=30
Authorization: Bearer <jwt_token>
```

**Parameters:**
- `tenantId` (path): The tenant ID
- `days` (query, optional): Number of days to look back (default: 30)

**Response:**
```json
{
  "tenant": {
    "id": "tenant-123",
    "name": "Fresh Mart",
    "slug": "fresh-mart",
    "plan": "Professional",
    "status": "active",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "activity": {
    "period": "30 days",
    "totalUsers": 12,
    "activeUsers": 8,
    "totalSales": 245,
    "totalSalesAmount": 45890.50,
    "avgSalesAmount": 187.51,
    "recentActivities": [
      {
        "id": "log-123",
        "tenantId": "tenant-123",
        "userId": "user-456",
        "userEmail": "manager@freshmart.com",
        "action": "create",
        "model": "Sale",
        "recordId": "sale-789",
        "details": { "quantity": 5, "amount": 250 },
        "createdAt": "2024-07-10T14:30:00Z"
      }
    ]
  }
}
```

**Use Cases:**
- Monitor tenant engagement
- Track sales velocity
- Identify active vs. inactive tenants
- Assess feature adoption

---

### 2. **Get Tenant Audit Trail**
Get detailed audit log for a specific tenant's operations.

```http
GET /api/platform/tenants/audit-trail/:tenantId?action=create&model=Sale&severity=critical&limit=50&offset=0
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `action` (optional): Filter by action (create, update, delete, reset, etc.)
- `model` (optional): Filter by model (Product, Sale, User, etc.)
- `severity` (optional): Filter by severity (info, warning, critical)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "tenantId": "tenant-123",
  "total": 1250,
  "limit": 50,
  "offset": 0,
  "auditLogs": [
    {
      "id": "audit-123",
      "tenantId": "tenant-123",
      "targetTenantId": null,
      "userId": "user-456",
      "userEmail": "manager@freshmart.com",
      "action": "create",
      "model": "Sale",
      "recordId": "sale-789",
      "changes": {
        "data": {
          "items": [{ "productId": "prod-123", "quantity": 5 }],
          "totalAmount": 250
        },
        "statusCode": 200
      },
      "ip": "192.168.1.100",
      "statusCode": 200,
      "severity": "info",
      "createdAt": "2024-07-10T14:30:00Z"
    }
  ]
}
```

**Use Cases:**
- Audit specific tenant's operations
- Track changes to important records
- Compliance and regulatory audits
- Investigate issues with specific actions

---

### 3. **Get Platform-Wide Metrics**
Get aggregated metrics across all tenants for SaaS overview.

```http
GET /api/platform/tenants/metrics?days=30
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `days` (optional): Number of days to look back (default: 30)

**Response:**
```json
{
  "period": "30 days",
  "tenants": {
    "total": 45
  },
  "users": {
    "total": 523,
    "active": 387
  },
  "sales": {
    "total": 12450,
    "totalAmount": 1245890.50
  },
  "topTenants": [
    {
      "id": "tenant-123",
      "businessName": "Fresh Mart",
      "slug": "fresh-mart",
      "activityCount": 2156
    },
    {
      "id": "tenant-456",
      "businessName": "City Supermarket",
      "slug": "city-supermarket",
      "activityCount": 1890
    }
  ],
  "criticalEvents": [
    {
      "id": "audit-123",
      "tenantId": "platform",
      "targetTenantId": "tenant-789",
      "userId": "admin-001",
      "userEmail": "admin@company.com",
      "action": "upgrade_sensitive",
      "model": "Subscription",
      "recordId": "tenant-789",
      "severity": "critical",
      "createdAt": "2024-07-10T09:15:00Z"
    }
  ]
}
```

**Use Cases:**
- Get SaaS platform health overview
- Monitor total revenue
- Identify top-performing tenants
- Track critical system events

---

### 4. **Get SaaS Admin Actions**
View all platform-level admin operations (password resets, subscription changes, tenant provisioning).

```http
GET /api/platform/tenants/admin-actions?severity=critical&limit=50&offset=0
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `severity` (optional): Filter by severity (info, warning, critical)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "total": 342,
  "limit": 50,
  "offset": 0,
  "adminActions": [
    {
      "id": "audit-456",
      "tenantId": "platform",
      "targetTenantId": "tenant-123",
      "userId": "admin-001",
      "userEmail": "admin@company.com",
      "action": "reset_sensitive",
      "model": "User",
      "recordId": "user-789",
      "changes": {
        "data": {
          "action": "password_reset",
          "targetTenant": "tenant-123"
        }
      },
      "statusCode": 200,
      "severity": "critical",
      "createdAt": "2024-07-10T11:45:00Z"
    },
    {
      "id": "audit-457",
      "tenantId": "platform",
      "targetTenantId": "tenant-456",
      "userId": "admin-002",
      "userEmail": "support@company.com",
      "action": "upgrade_sensitive",
      "model": "Subscription",
      "recordId": "tenant-456",
      "changes": {
        "data": {
          "planId": "plan-professional",
          "status": "active"
        },
        "oldPlanId": "plan-starter"
      },
      "statusCode": 200,
      "severity": "critical",
      "createdAt": "2024-07-10T10:20:00Z"
    }
  ]
}
```

**Use Cases:**
- Compliance auditing
- Track all sensitive operations
- Accountability tracking
- Security incident investigation

---

### 5. **Compare Tenant Metrics**
Compare performance metrics across all tenants side-by-side.

```http
GET /api/platform/tenants/comparison?days=30
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `days` (optional): Number of days to look back (default: 30)

**Response:**
```json
{
  "period": "30 days",
  "totalTenants": 45,
  "comparison": [
    {
      "tenantId": "tenant-123",
      "tenantName": "Fresh Mart",
      "slug": "fresh-mart",
      "plan": "Professional",
      "status": "active",
      "users": {
        "total": 12,
        "active": 8
      },
      "sales": {
        "count": 245,
        "totalAmount": 45890.50
      },
      "operationsLogged": 1250
    },
    {
      "tenantId": "tenant-456",
      "tenantName": "City Supermarket",
      "slug": "city-supermarket",
      "plan": "Enterprise",
      "status": "active",
      "users": {
        "total": 28,
        "active": 24
      },
      "sales": {
        "count": 890,
        "totalAmount": 187640.00
      },
      "operationsLogged": 4560
    }
  ]
}
```

**Use Cases:**
- Identify high-value tenants
- Benchmark tenant performance
- Plan marketing/support interventions
- Revenue analysis

---

## Field Explanations

### Activity Log Fields

| Field | Description |
|-------|-------------|
| `tenantId` | The tenant ID (or "platform" for SaaS admin operations) |
| `targetTenantId` | Which tenant was affected by an operation (for cross-tenant ops) |
| `userId` | User who performed the action |
| `userEmail` | Email of the user for accountability |
| `action` | What was done (create, update, delete, reset_sensitive, upgrade_sensitive) |
| `model` | What was affected (Product, Sale, User, Subscription, Tenant, etc.) |
| `recordId` | ID of the affected record |
| `changes` | Before/after data or request data |
| `statusCode` | HTTP response code (200 success, 400+ errors) |
| `severity` | Importance level (info, warning, critical) |
| `createdAt` | Timestamp of the action |

---

## Query Examples

### Example 1: Find all failed operations for a tenant
```http
GET /api/platform/tenants/audit-trail/tenant-123?limit=100
```
Then filter client-side for `statusCode >= 400`

### Example 2: Get all password resets in the last 7 days
```http
GET /api/platform/tenants/admin-actions?severity=critical
```
Then filter for `action` containing "reset"

### Example 3: Compare top 5 tenants by sales
```http
GET /api/platform/tenants/comparison?days=30
```
The response is already sorted by `sales.totalAmount` descending

### Example 4: Monitor tenant activity in real-time
```http
GET /api/platform/tenants/activity/tenant-123?days=1
```
Poll every minute for live updates

---

## Security & Access Control

- **Authentication**: All endpoints require valid JWT token
- **Authorization**: Only users with `role: "saas_admin"` can access these endpoints
- **Audit Trail**: All admin access to this API is logged in the audit trail
- **Rate Limiting**: Consider implementing per-admin limits to prevent abuse

---

## Database Tables

### `audit_logs`
Captures all administrative and system operations at the platform level.
- Indexes: `[tenantId, model]`, `[tenantId, createdAt]`, `[tenantId, severity]`, `[severity]`, `[targetTenantId]`

### `tenant_activity_logs`
Captures business operations for each tenant.
- Indexes: `[tenantId, createdAt]`, `[tenantId, action]`, `[tenantId, userId]`

### `tenant_metrics`
Daily snapshots of tenant metrics (can be generated via cronjob).
- Indexes: `[tenantId]`, `[date]`

---

## Best Practices

1. **Monitor Critical Events**: Set up alerts for `severity: "critical"` events
2. **Regular Audits**: Run monthly audit reports for compliance
3. **Performance Tracking**: Use `metrics` endpoint to track SaaS health
4. **Tenant Health**: Monitor `activeUsers` to identify at-risk tenants
5. **Churn Analysis**: Compare month-to-month activity for early churn detection
6. **Revenue Insights**: Use `comparison` endpoint to identify upsell opportunities

---

## Frontend Integration Example

```typescript
// Get tenant overview
async function getTenantOverview(tenantId: string) {
  const response = await fetch(
    `/api/platform/tenants/activity/${tenantId}?days=30`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  return response.json();
}

// Get admin actions for audit trail
async function getAdminActions(severity?: string, page = 0) {
  const params = new URLSearchParams({
    limit: '20',
    offset: String(page * 20),
  });
  if (severity) params.append('severity', severity);
  
  const response = await fetch(
    `/api/platform/tenants/admin-actions?${params}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  return response.json();
}

// Compare all tenants
async function compareTenants(days = 30) {
  const response = await fetch(
    `/api/platform/tenants/comparison?days=${days}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  return response.json();
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 404 on tenant activity | Verify tenantId exists and is active |
| Empty activity logs | Check date range and filter parameters |
| Missing audit entries | Verify user role and operations are being performed |
| Slow queries | Use limit/offset for pagination, reduce date range |

---

## Schema Extensions

The following new/modified Prisma models support this functionality:

```prisma
model AuditLog {
  targetTenantId String?  // NEW: track which tenant was affected
  statusCode Int          // NEW: HTTP status code
  severity String         // NEW: info, warning, critical
  // ... other fields
}

model TenantActivityLog {  // NEW
  tenantId String
  userId String
  userEmail String
  action String
  model String
  recordId String?
  details Json?
  createdAt DateTime
}

model TenantMetrics {      // NEW
  tenantId String
  date DateTime
  activeUsers Int
  totalUsers Int
  totalProducts Int
  totalSales Int
  totalSalesAmount Float
  featuresUsed String[]
  lastActivityAt DateTime?
}
```
