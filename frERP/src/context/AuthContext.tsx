import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "../api/client.js";
import { clearScanCache } from "../lib/scanCache.js";

const STORAGE_KEY = "evolution_erp_token";
const USER_KEY = "evolution_erp_user";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  hasAdminAccess?: boolean;
  warehouseIds: string[] | null;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as AuthUser;
    if (!u?.id || !u.email) return null;
    return u;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

  const refreshMe = useCallback(async (activeToken: string) => {
    try {
      const me = await apiGet<AuthUser>("/auth/me", activeToken);
      if (me?.id && me.email) {
        const nextJson = JSON.stringify(me);
        const stored = localStorage.getItem(USER_KEY);
        if (stored !== nextJson) {
          localStorage.setItem(USER_KEY, nextJson);
          setUser(me);
        }
      }
    } catch {
      /* ignore transient network errors */
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void refreshMe(token);
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void refreshMe(token);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [token, refreshMe]);

  const login = useCallback(async (username: string, password: string) => {
    clearScanCache();
    localStorage.removeItem("evolution_erp_warehouse");
    const data = await apiPost<LoginResponse>("/auth/login", { username, password });
    localStorage.setItem(STORAGE_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    clearScanCache();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("evolution_erp_warehouse");
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, login, logout }),
    [token, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
