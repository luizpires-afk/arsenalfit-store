import { createClient } from "@base44/sdk";

const appId = import.meta.env.VITE_BASE44_APP_ID as string | undefined;

if (!appId) {
  // Avoid hard crash during dev; SDK calls will still fail without a valid app id.
  console.warn("VITE_BASE44_APP_ID is not set. Base44 features may not work.");
}

export const base44 = createClient({
  appId: appId ?? "",
});

