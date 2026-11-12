# Grocery SaaS Frontend

A modern React + TypeScript frontend for the Grocery SaaS multi-tenant grocery management platform.

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **React Router** - Client-side routing
- **Zustand** - State management
- **Radix UI** - Accessible UI components
- **Lucide React** - Icons

## Features

- **Authentication**: Login, Register, Forgot Password
- **Dashboard**: KPIs, low stock alerts
- **Sales**: Point of sale with cart functionality
- **Inventory**: Product management with CRUD operations
- **Purchases**: Record purchases from vendors
- **Reports**: Top products, staff leaderboard, daily/monthly summaries
- **Admin**: SaaS admin dashboard with platform metrics

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Backend API running (see backend README)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.development

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3000` |
| `VITE_APP_NAME` | Application name | `Grocery SaaS` |

## Project Structure

```
frontend/
├── public/              # Static assets
├── src/
│   ├── components/      # Reusable components
│   │   ├── layout/      # Layout components (sidebar, header)
│   │   └── ui/          # UI primitives (button, input, card)
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utilities and API client
│   ├── pages/           # Page components
│   │   ├── admin/       # Admin pages
│   │   └── auth/        # Auth pages
│   ├── stores/          # Zustand stores
│   ├── App.tsx          # Root component with routes
│   ├── index.css        # Global styles
│   └── main.tsx         # Entry point
├── .env.example         # Environment template
├── .env.development      # Development env
├── .env.production       # Production env
├── index.html           # HTML template
├── package.json         # Dependencies
├── tailwind.config.js   # Tailwind configuration
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Vite configuration
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## User Roles & Permissions

| Role | Dashboard | Sales | Inventory | Purchases | Reports | Admin |
|------|-----------|-------|-----------|-----------|---------|-------|
| SaaS Admin | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manager | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Accountant | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Attendant | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

## API Integration

The frontend communicates with the backend via REST API. All API calls are handled through the `src/lib/api.ts` module.

### Authentication

- JWT tokens stored in localStorage
- Automatic token refresh on 401 responses
- Protected routes redirect to login if unauthenticated

### API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/login` | POST | User login |
| `/register` | POST | User registration |
| `/validate-token` | GET | Validate JWT token |
| `/dashboard/kpis` | GET | Dashboard metrics |
| `/inventory` | GET/POST | Inventory CRUD |
| `/sales` | GET/POST | Sales operations |
| `/sales/checkout` | POST | Process sale |
| `/purchases/checkout` | POST | Record purchase |
| `/reports/*` | GET | Various reports |
| `/admin/*` | GET/POST | Admin operations |

## Deployment

### Build for Production

```bash
npm run build
```

The build output will be in the `dist/` directory.

### Deploy to Netlify

1. Connect repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Set environment variables in Netlify dashboard

### Deploy to Vercel

1. Connect repository to Vercel
2. Framework preset: Vite
3. Set environment variables in Vercel dashboard

## Development Notes

- The dev server proxies `/api` requests to the backend at `http://localhost:3000`
- Hot module replacement (HMR) is enabled
- TypeScript strict mode is enabled
- ESLint runs on save in most IDEs

## License

MIT
