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

  const normalizedPath = path.startsWith('/api')
    ? path
    : `/api${path.startsWith('/') ? path : '/' + path}`;

  const res = await fetch(`${BASE}${normalizedPath}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

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
    throw new Error(msg || `API error ${res.status}`);
  }

  return data as T;
}
