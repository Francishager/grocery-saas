# SaaS Admin Tenant Visibility Guide

## 🎯 What's New

SaaS admins now have **complete visibility into how tenants are using the platform** and their behavior patterns. You can see:

- ✅ **How many users** each tenant has (active vs. total)
- ✅ **What each tenant is doing** (sales, inventory operations, reports, features used)
- ✅ **How often** they're using the platform (active users, operation frequency)
- ✅ **Revenue impact** (sales volume and amount per tenant)
- ✅ **Tenant health** (engagement trends, activity patterns)
- ✅ **All admin actions** (who did what, when, to which tenant)

---

## 🚀 Quick Start

### 1. Check Overall Platform Health
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/metrics?days=30
```

**You'll see:**
- Total number of tenants
- Total active users
- Total sales revenue in the last 30 days
- Top 10 most active tenants
- Recent critical platform events (password resets, subscriptions, etc.)

### 2. Monitor a Specific Tenant
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/activity/tenant-123?days=30
```

**You'll see:**
- Tenant name, plan, and status
- Number of users (active vs. total)
- Recent user operations (last 20 activities)
- Sales statistics (count, average amount, total)

### 3. View What's Changed
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/audit-trail/tenant-123?severity=critical&limit=50
```

**You'll see:**
- Every important action taken in that tenant
- Who did it, when, and what changed
- Sensitive operations marked as "critical"
- Failed operations (helpful for debugging)

### 4. Compare All Tenants Side-by-Side
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/comparison?days=30
```

**You'll see:**
- All 45 tenants ranked by sales revenue
- Active user counts per tenant
- Feature usage (operations logged)
- Plan tier and status

### 5. See All Your Admin Actions
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/admin-actions?severity=critical
```

**You'll see:**
- Every time you reset a password
- Every subscription upgrade
- Every tenant provisioning
- Full audit trail for compliance

---

## 📊 Real-World Use Cases

### Identify At-Risk Tenants
**Problem**: Which tenants might churn?
```bash
# Get comparison to see inactive tenants
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/comparison?days=30
```
Look for tenants with `activeUsers: 0` or very low operation counts.

### Find Revenue Opportunities
**Problem**: Which tenants should we upsell to?
```bash
# Compare all tenants - sorted by highest revenue
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/comparison?days=30
```
The top tenants by sales revenue are your best candidates for upsell to higher plans.

### Debug Customer Issues
**Problem**: "We're getting an error when creating sales"
```bash
# Get audit trail filtered by failures
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/audit-trail/tenant-123?model=Sale&limit=100
```
Then check for entries with `statusCode: 400` or higher.

### Audit Account Changes
**Problem**: "Ensure we track all password resets for security"
```bash
# Get all admin actions for the last month
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/admin-actions?severity=critical&days=30
```
All password resets, subscription changes, and tenant provisioning are logged with full context.

### Monitor Feature Adoption
**Problem**: "Are customers using the inventory management feature?"
```bash
# Get tenant activity
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.com/api/platform/tenants/activity/tenant-123?days=30
```
Check if `model: "Product"` operations appear in recent activities.

---

## 🔍 How It Works Behind the Scenes

### Automatic Tracking
- **Every API call** a tenant makes is automatically logged
- **Success and failures** are both tracked
- **User information** (email, ID) is captured for accountability
- **Request data** is saved for audit purposes

### Admin Actions
Every platform-level operation you perform is logged:
- 🔐 Password resets → `severity: "critical"`
- 📈 Subscription upgrades → `severity: "critical"`, includes old/new plan
- 🆕 Tenant provisioning → `severity: "critical"`, includes business details
- ✏️ Tenant modifications → Full change history

### Tenant Activity
Every operation within a tenant is recorded:
- 📦 Creating products
- 💰 Recording sales
- 🛍️ Customer transactions
- 📊 Report generation
- 👥 User management

---

## 📈 Key Metrics Explained

### Active Users
Users who have performed any action in the last N days.
```
Insight: If active users = 0, the tenant hasn't used the system recently.
```

### Total Sales
Number of transactions + total revenue.
```
Insight: Indicates business volume and revenue potential.
```

### Operations Logged
Total number of API calls made by that tenant.
```
Insight: Higher = more engaged tenant. Lower = at-risk tenant.
```

### Average Sale Amount
Total revenue ÷ Number of sales.
```
Insight: Indicates transaction value and business type.
```

---

## 🔒 Security & Compliance

- **All access is logged**: When you use these endpoints, it's logged in the audit trail
- **Role-based access**: Only SaaS admins (`role: "saas_admin"`) can access
- **Encrypted data**: All sensitive fields are stored securely
- **Timestamps**: Every entry includes exact UTC timestamp
- **IP tracking**: Request IP is logged for security analysis
- **Status codes**: Failed operations are marked distinctly

---

## 💡 Pro Tips

1. **Set up alerts** for `severity: "critical"` events
2. **Monitor "active users"** to detect churn early
3. **Compare month-to-month** metrics to identify trends
4. **Use audit trail** to investigate customer complaints
5. **Track "operations logged"** as a health indicator
6. **Regular compliance audits** using the admin-actions endpoint

---

## 🛠️ Available API Endpoints

| Endpoint | Purpose | Common Query |
|----------|---------|--------------|
| `/api/platform/tenants/activity/:tenantId` | Single tenant overview | `?days=30` |
| `/api/platform/tenants/audit-trail/:tenantId` | Detailed operation history | `?severity=critical&limit=50` |
| `/api/platform/tenants/metrics` | Platform-wide health | `?days=30` |
| `/api/platform/tenants/admin-actions` | Your admin operations | `?severity=critical` |
| `/api/platform/tenants/comparison` | Compare all tenants | `?days=30` |

---

## 📝 Example Dashboard Queries

### Morning Report
```bash
# Platform health + top tenants
curl -H "Authorization: Bearer TOKEN" \
  https://your-api.com/api/platform/tenants/metrics?days=1

# Recent critical events
curl -H "Authorization: Bearer TOKEN" \
  https://your-api.com/api/platform/tenants/admin-actions?severity=critical
```

### Weekly Performance Review
```bash
# Compare all tenants
curl -H "Authorization: Bearer TOKEN" \
  https://your-api.com/api/platform/tenants/comparison?days=7
```

### Monthly Audit
```bash
# All admin actions
curl -H "Authorization: Bearer TOKEN" \
  https://your-api.com/api/platform/tenants/admin-actions?days=30

# Focus on critical severity
# (all password resets, subscription changes, provisioning)
```

### Customer Support Investigation
```bash
# Get their audit trail
curl -H "Authorization: Bearer TOKEN" \
  https://your-api.com/api/platform/tenants/audit-trail/tenant-id?limit=50

# See what they were doing
curl -H "Authorization: Bearer TOKEN" \
  https://your-api.com/api/platform/tenants/activity/tenant-id?days=7
```

---

## ❓ FAQ

**Q: Can I see what specific products they created?**
A: Yes, the audit trail shows the full request data including product names, quantities, prices.

**Q: How far back can I look?**
A: Queries support any `days` parameter. Common: 1, 7, 30, 90, 365 days.

**Q: Are deleted records tracked?**
A: Yes, deletion operations are logged with `action: "delete"` and show what was deleted.

**Q: Can I export this data?**
A: The API returns JSON. You can easily export to CSV, Excel, or your reporting tool.

**Q: What if a tenant has no activity?**
A: They'll show `activeUsers: 0` and low `operationsLogged` count. This indicates inactive/at-risk status.

**Q: How real-time is this?**
A: Operations are logged immediately. Queries reflect data within seconds.

---

## 🎓 Next Steps

1. **Set up monitoring**: Create a dashboard with the metrics endpoint
2. **Configure alerts**: Alert on low activity or critical events
3. **Build reports**: Monthly reports using the comparison endpoint
4. **Investigate issues**: Use audit trails to debug customer problems
5. **Track trends**: Compare month-to-month to identify patterns

**Full API Documentation**: See `TENANT_VISIBILITY_API.md` for detailed endpoint specifications.
