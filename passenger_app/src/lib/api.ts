import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.getchum.co.uk';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('rs_token');
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem('rs_refresh_token');
}

export async function setToken(t: string | null) {
  if (t) await AsyncStorage.setItem('rs_token', t);
  else await AsyncStorage.removeItem('rs_token');
}

export async function setRefreshToken(t: string | null) {
  if (t) await AsyncStorage.setItem('rs_refresh_token', t);
  else await AsyncStorage.removeItem('rs_refresh_token');
}

let refreshingPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshingPromise) return refreshingPromise;
  refreshingPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      await setToken(null);
      await setRefreshToken(null);
      return null;
    }
    const data = await res.json();
    await setToken(data.access_token || data.token || null);
    await setRefreshToken(data.refresh_token || null);
    return data.access_token || data.token || null;
  })();

  try {
    return await refreshingPromise;
  } finally {
    refreshingPromise = null;
  }
}

async function requestOnce(path: string, opts: { method?: string; body?: any; auth?: boolean } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  return fetch(`${BASE}/api${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  let res = await requestOnce(path, opts);
  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await requestOnce(path, opts);
    }
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = (data && data.detail) || res.statusText;
    const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
    const err: any = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export async function getWsBaseUrl(): Promise<string> {
  if (!BASE) throw new Error('EXPO_PUBLIC_BACKEND_URL is missing');
  if (BASE.startsWith('https://')) return `wss://${BASE.slice(8)}`;
  if (BASE.startsWith('http://')) return `ws://${BASE.slice(7)}`;
  return BASE;
}

export const BACKEND_URL = BASE;
