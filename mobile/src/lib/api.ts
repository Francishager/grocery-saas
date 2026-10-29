import { clearSession, readSession, saveSession, type SessionTokens, type SessionUser } from './session';

export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://grocery-saas-production-e339.up.railway.app').replace(/\/$/, '');

export type DashboardKpis = {
  revenue: number | null;
  salesCount: number | null;
  expenses: number | null;
  operatingExpenses: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  productCount: number | null;
  lowStockCount: number | null;
  customerCount: number | null;
  receivablesOutstanding: number | null;
  receivablesCount: number | null;
  purchases: number | null;
};

export type FeatureMap = Record<string, { enabled: boolean; source?: string }>;
export type BusinessProfile = { name?: string; currency?: string };

type ApiResult<T> = { data?: T; error?: string; status: number };

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const type = response.headers.get('content-type') || '';
  const body: any = type.includes('application/json')
    ? await response.json().catch(() => ({}))
    : null;
  if (!response.ok) {
    const message = body?.message || body?.error;
    return { status: response.status, error: message || `Request failed (${response.status})` };
  }
  return { status: response.status, data: body as T };
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const result = await parseResponse<{ user: SessionUser; tokens: SessionTokens; forceReset?: boolean }>(response);
  if (result.data?.tokens?.accessToken && result.data.user?.id) {
    await saveSession(result.data.user, result.data.tokens);
  }
  return result;
}

let refreshPending: Promise<string | null> | null = null;

async function refreshAccessToken() {
  if (refreshPending) return refreshPending;
  refreshPending = (async () => {
    const session = await readSession();
    if (!session?.tokens.refreshToken) return null;
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
    });
    const result = await parseResponse<{ user?: SessionUser; tokens?: SessionTokens }>(response);
    if (!result.data?.tokens?.accessToken || !result.data.tokens.refreshToken) return null;
    await saveSession(result.data.user || session.user, result.data.tokens);
    return result.data.tokens.accessToken;
  })().finally(() => {
    refreshPending = null;
  });
  return refreshPending;
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const session = await readSession();
  if (!session) return { status: 401, error: 'Please sign in again.' };
  const request = (token: string) => fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  let response = await request(session.tokens.accessToken);
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      await clearSession();
      return { status: 401, error: 'Your session expired. Please sign in again.' };
    }
    response = await request(refreshed);
  }
  return parseResponse<T>(response);
}

export async function validateSession() {
  const result = await apiGet<{ user: SessionUser }>('/api/auth/me');
  if (result.data?.user?.id) {
    const current = await readSession();
    if (current) await saveSession(result.data.user, current.tokens);
  }
  return result;
}

export async function fetchDashboard() {
  const [kpis, features, profile] = await Promise.all([
    apiGet<DashboardKpis>('/api/dashboard/kpis'),
    apiGet<{ features: FeatureMap }>('/api/admin/me/features'),
    apiGet<BusinessProfile>('/api/settings/business-profile'),
  ]);
  return { kpis, features, profile };
}

export async function logoutRemote() {
  const session = await readSession();
  if (!session) return;
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${session.tokens.accessToken}` },
    });
  } catch {
    // Local logout must work when the network is unavailable.
  }
  await clearSession();
}
