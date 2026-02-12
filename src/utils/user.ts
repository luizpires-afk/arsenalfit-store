import type { User } from "@supabase/supabase-js";

const toFirstName = (value?: string | null) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
};

const normalizeFromEmail = (email?: string | null) => {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[0-9._-]+/g, " ").trim();
  const first = cleaned.split(/\s+/)[0] || local;
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
};

export const getFirstName = (user?: User | null) => {
  if (!user) return "";
  const direct =
    (user as any).name ||
    (user as any).fullName ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "";
  const name = toFirstName(String(direct || ""));
  if (name) return name;
  return normalizeFromEmail(user.email);
};
