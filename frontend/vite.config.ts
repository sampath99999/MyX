import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        /*
          Third-party code changes far less often than app code, so stable
          vendor chunks mean a normal deploy doesn't re-download React.

          Every node_modules module is assigned explicitly. Leaving any of them
          unassigned lets Rollup hoist a shared one into whichever chunk it
          likes: clsx is used by both the app and recharts, and it landed inside
          the charts chunk — so opening Memories, Notes or even Login pulled the
          whole charting library down with it.
        */
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;

          /*
            recharts' own dependency tree. None of these are direct MyX
            dependencies — they arrive through recharts v3, which pulls in
            es-toolkit and an internal redux store. Without naming them they sit
            in the always-loaded vendor chunk, which costs every screen ~35 kB
            gzipped for charts only the Money dashboard renders. Worth a re-check
            when recharts is upgraded.
          */
          const chartDeps = [
            "recharts",
            "/d3-",
            "internmap",
            "es-toolkit",
            "decimal.js-light",
            "eventemitter3",
            "tiny-invariant",
            "@reduxjs/toolkit",
            "react-redux",
            "/redux",
            "reselect",
            "immer",
          ];
          if (chartDeps.some((dep) => id.includes(dep))) return "charts";

          // Only the note editor's markdown preview.
          if (id.includes("marked") || id.includes("dompurify")) return "markdown";
          // Used by every screen; one shared chunk beats ~40 per-icon files.
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("@radix-ui")) return "ui";
          /*
            The landing page's animation library. Named so its weight is visible
            in the build output rather than hidden inside `vendor` — the landing
            page is eagerly imported (it is the prerendered entry point), so
            anything it pulls in is paid for on every first load, and that is a
            cost worth being able to see.
          */
          if (id.includes("motion") || id.includes("framer-motion")) return "motion";
          // React, the router, and the small class-name helpers.
          return "vendor";
        },
      },
    },
  },
});
