"use client";

/** শান্ত প্রাঙ্গণ নকশা: authentication state শান্ত, সরল ও উচ্চ-স্পষ্টতার; role তথ্য কেবল token থেকেই আসে। */

import { firebaseAuth } from "@/lib/firebase/client";
import { onIdTokenChanged, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type SessionRole = "super_admin" | "admin" | "teacher" | "mufti" | "student" | "visitor" | null;
export type ProfileStatus = "pending_approval" | "active" | "inactive" | "deleted" | "archived" | null;

type AuthSession = {
  user: User | null;
  role: SessionRole;
  profileStatus: ProfileStatus;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSession | null>(null);

async function readSession(user: User | null) {
  if (!user) return { user: null, role: null as SessionRole, profileStatus: null as ProfileStatus };
  const token = await user.getIdTokenResult();
  const role = typeof token.claims.role === "string" ? token.claims.role as SessionRole : null;
  const idToken = await user.getIdToken();
  const response = await fetch("/api/internal/profile-status", { headers: { authorization: `Bearer ${idToken}` } });
  const payload = response.ok ? await response.json() as { status?: unknown } : {};
  const status = payload.status;
  return {
    user,
    role,
    profileStatus: typeof status === "string" ? status as ProfileStatus : null,
  };
}

export function AuthSessionProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, setSession] = useState<Omit<AuthSession, "loading" | "refresh">>({ user: null, role: null, profileStatus: null });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSession(await readSession(firebaseAuth.currentUser)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => onIdTokenChanged(firebaseAuth, async (nextUser) => {
    try { setSession(await readSession(nextUser)); }
    finally { setLoading(false); }
  }), []);

  const value = useMemo<AuthSession>(() => ({ ...session, loading, refresh }), [session, loading, refresh]);
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error("useAuthSession must be used within AuthSessionProvider.");
  return context;
}
