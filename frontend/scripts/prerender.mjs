/*
  Injects the statically rendered landing page into dist/index.html after the
  normal Vite build.

  Runs the real component through Vite's SSR module loader rather than a second
  bundle, so there is no separate build config to keep in sync — the page that
  ships is the page that renders.

  A failure here is loud but not fatal: the SPA still works, it just falls back
  to client rendering, and breaking a deploy over a missing meta improvement
  would be the wrong trade.
*/
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(root, "dist/index.html");
const MARKER = '<div id="root"></div>';

try {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
    /*
      react-router-dom v7 is a CJS shim that re-exports react-router, and it
      breaks under SSR either way: externalised, Node cannot see its named
      exports; inlined, its dist references `module`. react-router itself ships
      real ESM with the same Link/MemoryRouter exports, so point at that. This
      alias applies only to this build-time render, never to the shipped app.
    */
    resolve: { alias: { "react-router-dom": "react-router" } },
    // This server never answers a browser request, so pre-bundling dependencies
    // buys nothing — and the scan is still running when close() is called,
    // which printed an alarming esbuild stack trace on every build.
    optimizeDeps: { noDiscovery: true },
  });

  let html;
  try {
    const { renderLanding } = await vite.ssrLoadModule("/src/prerender.tsx");
    html = renderLanding();
  } finally {
    await vite.close();
  }

  if (!html || html.length < 500) {
    throw new Error(`rendered markup looks empty (${html?.length ?? 0} chars)`);
  }

  const shell = readFileSync(htmlPath, "utf8");
  if (!shell.includes(MARKER)) {
    throw new Error(`could not find ${MARKER} in dist/index.html`);
  }

  writeFileSync(htmlPath, shell.replace(MARKER, `<div id="root">${html}</div>`), "utf8");
  console.log(`prerender: injected ${html.length} chars of landing markup into dist/index.html`);
} catch (err) {
  console.warn(`prerender: SKIPPED — ${err instanceof Error ? err.message : err}`);
  console.warn("prerender: dist/index.html still works, but ships without server-rendered content.");
}
