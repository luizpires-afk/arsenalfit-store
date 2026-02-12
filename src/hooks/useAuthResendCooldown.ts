import { useCallback, useEffect, useState } from "react";
import {
  type AuthResendKind,
  getAuthResendCooldown,
  startAuthResendCooldown,
} from "@/lib/authResendCooldown";

export const useAuthResendCooldown = (
  kind: AuthResendKind,
  email?: string | null,
) => {
  const readCooldown = useCallback(() => getAuthResendCooldown(kind, email), [kind, email]);
  const [cooldown, setCooldown] = useState<number>(() => readCooldown());

  useEffect(() => {
    setCooldown(readCooldown());
    const intervalId = window.setInterval(() => {
      setCooldown(readCooldown());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [readCooldown]);

  const startCooldown = useCallback(
    (seconds?: number) => {
      startAuthResendCooldown(kind, email, seconds);
      setCooldown(readCooldown());
    },
    [kind, email, readCooldown],
  );

  return {
    cooldown,
    startCooldown,
    syncCooldown: () => setCooldown(readCooldown()),
  };
};

