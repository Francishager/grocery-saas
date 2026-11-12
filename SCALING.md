# Production scaling

The backend is being prepared for multiple Railway replicas. Replica count is intentionally not set in source until the Railway PostgreSQL connection budget and observed traffic are checked.

## Replica-safe behavior

- Runtime schema bootstrap is serialized by a PostgreSQL advisory lock.
- Trash expiry, rent automation, and planner reminders use separate advisory locks so only one replica runs each scheduled task at a time.
- SIGTERM stops new HTTP requests, drains in-flight requests and scheduled work, then closes Prisma.
- Railway readiness checks require a live database connection. Deployment overlap and drain windows allow a healthy replacement to start before an old replica exits.
- Backend routes and ESM services share one Prisma client per process to avoid unnecessary connection pools.

## Before increasing replicas

- Login and other API rate-limit buckets are process-local; use a shared store or edge-enforced policy before relying on them as global protection.
- Confirm Railway PostgreSQL connection limits and current peak usage. Each replica adds database connections.
- Start with two replicas in Railway's backend service settings, observe API latency, error rates, database connections, and compute usage, then scale gradually.
- Railway distributes requests among enabled replicas; enabling replicas is a Railway service setting and is not performed by this repository change.

## Low-volume readiness smoke check

The repository includes a small readiness-only k6 check. It does not establish a supported maximum user count or substitute for controlled endpoint capacity tests.

```powershell
k6 run -e BASE_URL=http://localhost:3000 k6-smoke.js
```
