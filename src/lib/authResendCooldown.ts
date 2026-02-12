export type AuthResendKind = "signup" | "recovery";

const DEFAULT_COOLDOWN_SECONDS = 60;
const KEY_PREFIX = "arsenalfit:auth:resend:";

const normalizeEmail = (email?: string | null) => String(email || "").trim().toLowerCase();

const getStorageKey = (kind: AuthResendKind, email?: string | null) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return `${KEY_PREFIX}${kind}:${normalized}`;
};

export const startAuthResendCooldown = (
  kind: AuthResendKind,
  email?: string | null,
  seconds = DEFAULT_COOLDOWN_SECONDS,
) => {
  if (typeof window === "undefined") return;
  const key = getStorageKey(kind, email);
  if (!key) return;
  const safeSeconds = Math.max(1, Math.floor(seconds));
  try {
    const payload = {
      expiresAt: Date.now() + safeSeconds * 1000,
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage errors.
  }
};

export const getAuthResendCooldown = (
  kind: AuthResendKind,
  email?: string | null,
) => {
  if (typeof window === "undefined") return 0;
  const key = getStorageKey(kind, email);
  if (!key) return 0;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt ?? 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      window.localStorage.removeItem(key);
      return 0;
    }
    const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
    if (remaining <= 0) {
      window.localStorage.removeItem(key);
      return 0;
    }
    return remaining;
  } catch {
    return 0;
  }
};

