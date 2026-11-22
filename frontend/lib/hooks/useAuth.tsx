"use client";

/**
 * Client-side auth/session context.
 *
 * Session state is derived from `GET /auth/me` — we never read tokens in JS
 * (they're HTTP-only cookies). Mount <AuthProvider> once in the root layout,
 * then read the current user anywhere with useAuth().
 *
 * See `context/frontend/04-api-integration.md` §6.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/api";
import { clearAllExamDrafts } from "@/lib/exam-draft";
import type { ApiSuccess, User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  /** True until the first /auth/me resolves. */
  loading: boolean;
  /** Re-fetch the current user (e.g. after login or profile edit). */
  refresh: () => Promise<void>;
  /** Clear the session on the backend and locally. */
  logout: () => Promise<void>;
  /** Convenience: is this user one of the given roles? */
  hasRole: (...roles: User["role"][]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<ApiSuccess<User>>("/auth/me");
      setUser(res.data);
    } catch (err) {
      // 401/404 → not signed in; anything else we also treat as no session.
      if (!(err instanceof ApiError)) console.error(err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      clearAllExamDrafts(); // the next person on this device must not find the last one's unsent answers
      setUser(null);
    }
  }, []);

  const hasRole = useCallback(
    (...roles: User["role"][]) => !!user && roles.includes(user.role),
    [user],
  );

  useEffect(() => {
    // Intentional: sync session state from the backend (/auth/me) on mount.
    // This is the canonical "fetch on mount" effect; the setState happens after
    // an await inside refresh(), not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>.");
  }
  return ctx;
}
