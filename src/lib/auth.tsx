"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SUPABASE_CONFIGURED, getSupabase } from "./supabase";

export type Profile = {
  id: string;
  username: string | null; // 구글로 처음 들어온 사람은 아이디를 정할 때까지 비어 있다
  nickname: string;
  bio: string;
  avatar_url: string | null;
  is_private: boolean;
};

export const PROFILE_COLUMNS = "id, username, nickname, bio, avatar_url, is_private";

type AuthState = {
  status: "loading" | "out" | "in";
  user: User | null;
  profile: Profile | null;
  configured: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ status: AuthState["status"]; user: User | null }>(
    () => ({ status: SUPABASE_CONFIGURED ? "loading" : "out", user: null }),
  );
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await getSupabase()
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    const { data } = getSupabase().auth.onAuthStateChange((_event, s) => {
      const user = s?.user ?? null;
      setSession({ status: user ? "in" : "out", user });
      if (user) {
        // 콜백 안에서 바로 supabase를 부르면 멈출 수 있어서 한 박자 늦춘다.
        setTimeout(() => void loadProfile(user.id), 0);
      } else {
        setProfile(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session.user) await loadProfile(session.user.id);
  }, [session.user, loadProfile]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status: session.status,
      user: session.user,
      profile,
      configured: SUPABASE_CONFIGURED,
      refreshProfile,
      signOut,
    }),
    [session, profile, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}
