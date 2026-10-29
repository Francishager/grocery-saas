import * as SecureStore from 'expo-secure-store';

export type SessionUser = {
  id: string;
  name?: string;
  email: string;
  role: string;
  tenantId?: string | null;
  permissions?: string[];
};

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

const SESSION_KEY = 'jibusales.session.v1';

export async function readSession(): Promise<{ user: SessionUser; tokens: SessionTokens } | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.tokens?.accessToken && value?.tokens?.refreshToken && value?.user?.id) return value;
  } catch {
    // Discard malformed secure storage and return to sign-in.
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
  return null;
}

export async function saveSession(user: SessionUser, tokens: SessionTokens) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ user, tokens }));
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
