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
    const adminEmails = ["luizfop.31@gmail.com"];

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

        if (currentUser.email && adminEmails.includes(currentUser.email)) {
          setRole("admin");
          return;
        }

        setRole((currentUser.user_metadata as any)?.role ?? null);
      } catch {
        setRole((currentUser.user_metadata as any)?.role ?? null);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const s = data.session ?? null;
      setSession(s);
      setUser(s?.user ?? null);
      resolveRole(s?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      resolveRole(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = useMemo(() => role === "admin", [role]);

  const signOut = async () => {
    await supabase.auth.signOut();
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
