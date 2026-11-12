# JibuSales load testing

Use this procedure only against a staging deployment with a staging database. Never point a stress test at production. The initial script sends read-only GET requests and defaults to `/api/health` and `/api/health/ready`.

## Prerequisites

- A staging deployment sized and configured like the intended production setup.
- A disposable staging tenant with representative, synthetic data.
- k6 installed locally or run from a controlled CI/load-test runner.
- Optional short-lived staging user token for authenticated read routes. Do not commit tokens or put them in source control.

## Baseline

Start with health-only traffic, then increase gradually. Example PowerShell:

```powershell
$env:BASE_URL = "https://<staging-api-host>"
$env:VUS_1 = "25"
$env:VUS_2 = "100"
k6 run backend/tests/jibusales-readonly-load.js
```

Only after the health baseline is stable, add specific authenticated GET routes that have been verified read-only and safe for the staging tenant:

```powershell
$env:AUTH_TOKEN = "<short-lived-staging-token>"
$env:READ_PATHS = "/api/health,/api/health/ready,<verified-read-only-route>"
k6 run backend/tests/jibusales-readonly-load.js
```

The default profile ramps from 1 to 25 virtual users over 2 minutes, then to 100 over 3 minutes, holds for 5 minutes, and cools down over 2 minutes. Thresholds are initial guardrails (less than 1% failed requests, p95 below 1 second, p99 below 2.5 seconds), not a capacity certification. Stop the run if error rates, latency, database connections, CPU, memory, or database load exceed the staging safety limits.

## Capacity campaign

1. Confirm the exact target: concurrent signed-in users, active-user ratio, request rate, workflow mix, and latency/error objectives.
2. Establish a quiet baseline and capture API and PostgreSQL metrics.
3. Test health, then authenticated reads, then carefully designed synthetic write workflows on an isolated staging tenant. Make writes idempotent and clean up only disposable test data.
4. Before adding API replicas, deploy exactly one worker service using `npm run start:worker`, then set `RUN_BACKGROUND_JOBS=false` on every API replica. The worker handles scheduled rent automation, planner reminders, and trash cleanup. Do not run more than one worker replica until those jobs have distributed locking/idempotency guarantees.
5. Calculate the database connection budget across all API replicas and workers. Set `PRISMA_CONNECTION_LIMIT` per process so the total remains below PostgreSQL's safe connection capacity, leaving room for migrations, administration, and monitoring.
6. Increase load and replicas in controlled steps; record the first saturation point and bottleneck for each run.
7. Change one variable at a time (API replicas/resources, database resources/pooling, query/index work, polling/cache behavior) and rerun.
8. Run a soak test and a recovery test after the target load is achieved.

Report virtual users, request rate, endpoint mix, p50/p95/p99 latency, error rate, API resource use, PostgreSQL connection count/query latency, and the load level at which saturation began. Do not infer capacity from Railway or Cloudflare platform limits alone.
