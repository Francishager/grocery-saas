# JibuSales staging snapshot

This folder is a deployable copy of the current project source for staging validation. It deliberately excludes `.env` files, Git metadata, dependency folders, build output, and generated local audit artifacts. Configure all secrets as staging-only Railway or Cloudflare variables.

## Railway

- Use a separate Railway `staging` environment and a separate PostgreSQL service. Never connect this backend to the production database.
- Configure the staging API service to use the repository config file `/staging/railway.toml`. It builds from `staging/backend` and uses the API health check. Set its `DATABASE_URL` to the staging PostgreSQL service reference.
- After the API deployment has prepared the schema, add a single-replica worker service using config file `/staging/railway-worker.toml`.
- Set `RUN_BACKGROUND_JOBS=false` on the API service so scheduled jobs run only in the worker. Keep exactly one worker replica unless distributed locking is implemented.
- Set `PRISMA_CONNECTION_LIMIT` separately on API and worker services. Keep the sum across all replicas below the staging database's safe connection capacity.
- Set email/payment integrations to test mode or disable them. Use synthetic data only.

## Cloudflare (optional for the first API test)

For a full browser-to-API path, deploy the Worker from `staging/frontend` as `jibusales-staging`. Replace the placeholder `API_ORIGIN` in `frontend/wrangler.toml` with the staging Railway API domain before deploying. Do not point this Worker at production.

## k6

Run the read-only test from the repository root after setting `BASE_URL` to the staging API URL:

```powershell
$env:BASE_URL = "https://<staging-api-domain>"
$env:VUS_1 = "25"
$env:VUS_2 = "100"
k6 run staging/backend/tests/jibusales-readonly-load.js
```

The test defaults to `/api/health` and `/api/health/ready`. Add authenticated routes only after confirming they are read-only and use a short-lived staging token. See `docs/LOAD_TESTING.md` for the campaign and safety checks.
