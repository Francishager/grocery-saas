# Grocery SaaS - Deployment Guide

## Project Structure

```
grocery-saas/
├── backend/           # Node.js Express API (deploy to Railway)
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/          # React + Vite (Cloudflare Worker Static Assets)
│   ├── src/
│   ├── package.json
│   └── wrangler.toml
└── railway.toml       # Railway configuration
```

## Backend Deployment (Railway)

### 1. Push to GitHub
```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### 2. Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your `grocery-saas` repository
5. Railway will auto-detect the `railway.toml` config

### 3. Set Environment Variables
In Railway dashboard, add these variables:

| Variable | Description |
|----------|-------------|
| `GRIST_API_KEY` | Your Grist API key |
| `GRIST_DOC_ID` | Your Grist document ID |
| `JWT_SECRET` | Secret key for JWT (min 32 chars) |
| `FRONTEND_ORIGIN` | Your Cloudflare Worker URL |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins |

### 4. Deploy
Railway will automatically build and deploy. The backend will be available at:
```
https://your-app.railway.app
```

---

## Frontend Deployment (Cloudflare Worker Static Assets)

### 1. Connect the Worker Build
1. Open the `jibusales` Worker in Cloudflare and connect the `grocery-saas` repository using Workers Builds.
2. Set the repository root directory to `frontend`.

### 2. Configure Build Settings
| Setting | Value |
|---------|-------|
| **Production branch** | `main` |
| **Build command** | `npm run build` |
| **Root directory** | `frontend` |
| **Deploy command** | `npm run deploy` |

The Wrangler config declares `./dist` as the Worker Static Assets directory and enables SPA fallback. The deploy script runs `npx wrangler deploy`. Do not use `wrangler pages deploy` for this Worker.

### 3. Set Environment Variables
In the Worker Builds environment variables, add:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-app.railway.app` |

### 4. Deploy
Cloudflare will build and deploy. Your frontend will be at:
```
https://jibusales.<your-workers-subdomain>.workers.dev
```

---

## Environment Variables Summary

### Backend (Railway)
```env
GRIST_API_KEY=xxx
GRIST_DOC_ID=xxx
JWT_SECRET=your-secret-key-min-32-chars
FRONTEND_ORIGIN=https://jibusales.<your-workers-subdomain>.workers.dev
ALLOWED_ORIGINS=https://jibusales.<your-workers-subdomain>.workers.dev
```

### Frontend (Cloudflare Worker)
```env
VITE_API_URL=https://your-backend.railway.app
```

---

## Post-Deployment

1. Update `FRONTEND_ORIGIN` in Railway with your Cloudflare URL
2. Update `VITE_API_URL` in Cloudflare with your Railway URL
3. Test login at `https://jibusales.<your-workers-subdomain>.workers.dev/login`
4. SaaS Admin login at `https://jibusales.<your-workers-subdomain>.workers.dev/saas/login`

---

## Troubleshooting

### Backend won't start
- Check Railway logs for errors
- Verify all required env vars are set
- Ensure `GRIST_API_KEY` and `GRIST_DOC_ID` are valid

### Frontend shows blank page
- Check browser console for errors
- Verify `VITE_API_URL` is set correctly
- Check Cloudflare Workers Builds logs

### CORS errors
- Add frontend URL to `ALLOWED_ORIGINS` in Railway
- Ensure `FRONTEND_ORIGIN` matches your Cloudflare URL
