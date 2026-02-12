import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Role = "admin" | "user" | string | null;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: Role;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const parseEnvList = (value?: string) =>
      (value ?? "")
        .split(/[,;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean);

    const adminEmails = new Set(
      ["luizfop.31@gmail.com", ...parseEnvList(import.meta.env.VITE_ADMIN_EMAILS)].map(
        (email) => email.toLowerCase(),
      ),
    );

    const adminUserIds = new Set([
      "78c55456-cd4e-472f-bcdc-4ef5add49de6",
      ...parseEnvList(import.meta.env.VITE_ADMIN_USER_IDS),
    ]);

    const resolveRole = async (currentUser: User | null) => {
      if (!currentUser) {
        setRole(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", currentUser.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!error && data?.role) {
          setRole(data.role);
          return;
        }

        if (adminUserIds.has(currentUser.id)) {
          setRole("admin");
          return;
        }

        if (currentUser.email && adminEmails.has(currentUser.email.toLowerCase())) {
          setRole("admin");
          return;
        }

        setRole(
          (currentUser.app_metadata as any)?.role ??
            (currentUser.user_metadata as any)?.role ??
            null,
        );
      } catch {
        setRole(
          (currentUser.app_metadata as any)?.role ??
            (currentUser.user_metadata as any)?.role ??
            null,
        );
      }
    };

    const applySession = async (nextSession: Session | null) => {
      if (!mounted) return;
      setLoading(true);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      await resolveRole(nextSession?.user ?? null);
      if (mounted) setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      applySession(newSession ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = useMemo(() => role === "admin", [role]);

  const signOut = async () => {
    // Fast local sign-out to update UI immediately
    setSession(null);
    setUser(null);
    setRole(null);
    setLoading(false);

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Ignore local sign-out errors; we'll still attempt global sign-out.
    }

    // Best-effort global sign-out (do not block UI).
    supabase.auth.signOut({ scope: "global" }).catch(() => {});
  };

  const value = useMemo(
    () => ({ session, user, role, isAdmin, loading, signOut }),
    [session, user, role, isAdmin, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider />");
  }
  return ctx;
}
