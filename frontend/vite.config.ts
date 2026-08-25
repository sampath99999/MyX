import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

/**
 * Stamps a build id into the service worker.
 *
 * public/sw.js is copied verbatim, so before this existed it shipped the same
 * bytes on every deploy — and a browser only installs a new worker when those
 * bytes differ. The consequence was not a stale cache but a dead update path:
 * `updatefound` never fired, so the SKIP_WAITING / controllerchange / reload
 * dance in src/lib/pwa.ts never ran, and a tab open across a deploy went on
 * running old JS against new assets until the user reloaded by hand. That is
 * the "Failed to fetch dynamically imported module" screen.
 *
 * The id is derived from the emitted filenames rather than a timestamp, so a
 * rebuild that changes nothing produces the same worker and clients are not
 * churned for free. Change any chunk and every client updates and reloads once.
 */
function stampServiceWorker(): Plugin {
  const PLACEHOLDER = "__BUILD_ID__";

  return {
    name: "myx-stamp-sw",
    apply: "build",
    writeBundle(options, bundle) {
      const swPath = path.join(options.dir ?? "dist", "sw.js");
      if (!fs.existsSync(swPath)) return;

      const buildId = crypto
        .createHash("sha256")
        .update(Object.keys(bundle).sort().join("|"))
        .digest("hex")
        .slice(0, 12);

      const source = fs.readFileSync(swPath, "utf8");
      // Failing loudly matters more than it looks: a silent no-op here puts the
      // placeholder itself into production as a constant string, which is
      // exactly the never-changing worker this plugin exists to prevent.
      if (!source.includes(PLACEHOLDER)) {
        throw new Error(
          `sw.js has no ${PLACEHOLDER} to stamp — the service worker would never update.`,
        );
      }
      fs.writeFileSync(swPath, source.replaceAll(PLACEHOLDER, buildId));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stampServiceWorker()],
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
