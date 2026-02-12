import { createClient } from "@base44/sdk";

const appId = import.meta.env.VITE_BASE44_APP_ID as string | undefined;

let warned = false;
const warnMissingAppId = () => {
  if (warned) return;
  warned = true;
  console.warn("VITE_BASE44_APP_ID is not set. Base44 features are disabled.");
};

const createEntityStub = () => ({
  list: async () => [],
  filter: async () => [],
  create: async () => null,
  update: async () => null,
  delete: async () => null,
});

const createDisabledClient = () => ({
  auth: {
    isAuthenticated: async () => {
      warnMissingAppId();
      return false;
    },
    me: async () => {
      warnMissingAppId();
      return null;
    },
    signUp: async () => {
      warnMissingAppId();
      return { error: { message: "Base44 não configurado." } };
    },
    redirectToLogin: () => {
      warnMissingAppId();
    },
  },
  entities: new Proxy(
    {},
    {
      get: () => createEntityStub(),
    }
  ),
  integrations: {
    Core: {
      InvokeLLM: async () => {
        warnMissingAppId();
        throw new Error("Base44 não configurado.");
      },
    },
  },
});

export const base44 = appId
  ? createClient({ appId })
  : (createDisabledClient() as ReturnType<typeof createClient>);

