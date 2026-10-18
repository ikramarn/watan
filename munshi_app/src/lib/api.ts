import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('watan_munshi_token');
}

export async function setToken(t: string | null) {
  if (t) await AsyncStorage.setItem('watan_munshi_token', t);
  else await AsyncStorage.removeItem('watan_munshi_token');
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = await getToken();
  if (t && opts.auth !== false) {
    headers['Authorization'] = `Bearer ${t}`;
  }

  const res = await fetch(`${BASE}${path.startsWith('/') ? path : '/' + path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `API error ${res.status}`);
  }

  return res.json();
}
