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
          if (id.includes("@tanstack/")) return "vendor-query";
          if (id.includes("@supabase/")) return "vendor-supabase";
          if (id.includes("framer-motion") || id.includes("lucide-react") || id.includes("motion-dom") || id.includes("motion-utils") || id.includes("use-sidecar") || id.includes("aria-hidden")) return "vendor-ui-motion";
          if (id.includes("@radix-ui") || id.includes("@floating-ui")) return "vendor-radix";
          if (id.includes("recharts") || id.includes("/d3-")) return "vendor-charts";
          if (id.includes("embla-carousel") || id.includes("/autoplay/")) return "vendor-carousel";
          if (id.includes("date-fns")) return "vendor-date";
          if (id.includes("axios") || id.includes("socket.io") || id.includes("engine.io") || id.includes("@base44/sdk")) return "vendor-network";
          if (id.includes("tailwind-merge") || id.includes("class-variance-authority") || id.includes("clsx") || id.includes("next-themes") || id.includes("uuid") || id.includes("tslib")) return "vendor-ui-utils";
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";

          return "vendor-misc";
        },
      },
    },
  },
});
