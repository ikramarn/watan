import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setToken, setRefreshToken, getToken, getRefreshToken } from './api';

export type Role = 'passenger' | 'driver';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string;
  rating?: number;
  vehicle_make?: string;
  vehicle_plate?: string;
  vehicle_type?: string;
}

interface AuthCtx {
  user: User | null;
  role: Role | null;
  ready: boolean;
  setRole: (r: Role) => Promise<void>;
  login: (email: string, password: string, role: Role) => Promise<User>;
  loginWithGoogle: (idToken: string, role: Role, extra?: any) => Promise<User>;
  register: (payload: any) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const r = (await AsyncStorage.getItem('rs_role')) as Role | null;
        if (!cancelled && r) setRoleState(r);
        const t = await getToken();
        if (t) {
          try {
            const me = await api<User>('/auth/me');
            if (!cancelled) {
              setUser(me);
              if (!r) {
                setRoleState(me.role);
                await AsyncStorage.setItem('rs_role', me.role);
              }
            }
          } catch {
            await setToken(null);
          }
        }
      } catch (e) {
        console.warn('auth init error', e);
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  const setRole = useCallback(async (r: Role) => {
    setRoleState(r);
    await AsyncStorage.setItem('rs_role', r);
  }, []);

  const login = useCallback(async (email: string, password: string, rrole: Role) => {
    const data = await api<{ token: string; access_token?: string; refresh_token?: string; user: User }>('/auth/login', {
      body: { email, password, role: rrole },
    });
    await setToken(data.access_token || data.token);
    await setRefreshToken(data.refresh_token || null);
    setUser(data.user);
    setRoleState(data.user.role);
    await AsyncStorage.setItem('rs_role', data.user.role);
    return data.user;
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string, rrole: Role, extra: any = {}) => {
    const data = await api<{ token: string; access_token?: string; refresh_token?: string; user: User }>('/auth/google', {
      body: { id_token: idToken, role: rrole, ...extra },
    });
    await setToken(data.access_token || data.token);
    await setRefreshToken(data.refresh_token || null);
    setUser(data.user);
    setRoleState(data.user.role);
    await AsyncStorage.setItem('rs_role', data.user.role);
    return data.user;
  }, []);

  const register = useCallback(async (payload: any) => {
    const data = await api<{ token: string; access_token?: string; refresh_token?: string; user: User }>('/auth/register', {
      body: payload,
    });
    await setToken(data.access_token || data.token);
    await setRefreshToken(data.refresh_token || null);
    setUser(data.user);
    setRoleState(data.user.role);
    await AsyncStorage.setItem('rs_role', data.user.role);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      const refresh = await getRefreshToken();
      if (refresh) {
        await api('/auth/logout', { body: { refresh_token: refresh } });
      }
    } catch {}
    await setToken(null);
    await setRefreshToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
    } catch {}
  }, []);

  return (
    <Ctx.Provider value={{ user, role, ready, setRole, login, loginWithGoogle, register, logout, refreshUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
