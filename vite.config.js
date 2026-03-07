import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("@tanstack/react-query")) return "vendor-query";
          if (id.includes("@supabase/supabase-js")) return "vendor-supabase";
          if (id.includes("framer-motion") || id.includes("lucide-react")) return "vendor-ui-motion";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";

          return "vendor-misc";
        },
      },
    },
  },
});
