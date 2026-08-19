/*
  Writes a prerendered HTML file per public route after the normal Vite build.

  Runs the real components through Vite's SSR module loader rather than a second
  bundle, so there is no separate build config to keep in sync — the page that
  ships is the page that renders.

  Each route gets its own file (dist/emi-calculator.html and so on) with
  its own <title>, description and canonical. Cloudflare Pages serves those
  ahead of the SPA fallback in public/_redirects, so a crawler asking for
  /emi-calculator gets that page's content rather than the home page's.

  A failure here is loud but not fatal: the SPA still works, it just falls back
  to client rendering, and breaking a deploy over a missing meta improvement
  would be the wrong trade.
*/
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shellPath = resolve(root, "dist/index.html");
const MARKER = '<div id="root"></div>';

/** Replace the value of a meta/link tag that already exists in the shell. */
function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`prerender: could not find ${pattern} in the shell`);
  return html.replace(pattern, replacement);
}

function documentFor(shell, page, markup, siteUrl) {
  const canonical = `${siteUrl}${page.path === "/" ? "/" : page.path}`;
  let html = shell;

  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${page.title}</title>`);
  html = replaceTag(
    html,
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${page.description}" />`,
  );
  html = replaceTag(
    html,
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${canonical}" />`,
  );
  // Social cards should describe the page that was shared, not the home page.
  html = replaceTag(
    html,
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${canonical}" />`,
  );
  html = replaceTag(
    html,
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${page.title}" />`,
  );
  html = replaceTag(
    html,
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${page.description}" />`,
  );
  html = replaceTag(
    html,
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${page.title}" />`,
  );
  html = replaceTag(
    html,
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${page.description}" />`,
  );

  return html.replace(MARKER, `<div id="root">${markup}</div>`);
}

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
      real ESM with the same exports, so point at that. This alias applies only
      to this build-time render, never to the shipped app.
    */
    resolve: { alias: { "react-router-dom": "react-router" } },
    // This server never answers a browser request, so pre-bundling dependencies
    // buys nothing — and the scan is still running when close() is called,
    // which printed an alarming esbuild stack trace on every build.
    optimizeDeps: { noDiscovery: true },
  });

  let pages;
  let renderRoute;
  try {
    const mod = await vite.ssrLoadModule("/src/prerender.tsx");
    renderRoute = mod.renderRoute;
    pages = mod.routesToPrerender();
    var structuredDataFor = mod.structuredDataFor;
    var sitemapXml = mod.sitemapXml;
    const seo = await vite.ssrLoadModule("/src/lib/seo.ts");
    var siteUrl = seo.SITE_URL;

    const shell = readFileSync(shellPath, "utf8");
    if (!shell.includes(MARKER)) throw new Error(`could not find ${MARKER} in dist/index.html`);

    for (const page of pages) {
      const markup = renderRoute(page.path);
      if (!markup || markup.length < 500) {
        throw new Error(`${page.path} rendered ${markup?.length ?? 0} chars — looks empty`);
      }

      let html = documentFor(shell, page, markup, siteUrl);

      // Page-specific JSON-LD (the calculator's FAQ), appended to the head.
      const extra = structuredDataFor(page.path);
      if (extra) {
        html = html.replace(
          "</head>",
          `    <script type="application/ld+json">${extra}</script>\n  </head>`,
        );
      }
      /*
        "/" overwrites the shell itself; every other route is written as
        <route>.html rather than <route>/index.html.

        Pages resolves /emi-calculator against emi-calculator.html directly, but
        against emi-calculator/index.html only after a 308 to the trailing-slash
        form — which left every canonical pointing at a URL that redirects.
      */
      const out =
        page.path === "/" ? shellPath : join(root, "dist", `${page.path.slice(1)}.html`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, html, "utf8");
      console.log(`prerender: ${page.path} → ${markup.length} chars`);
    }

    // Generated from the same PAGES list, so a new page cannot be prerendered
    // and then quietly left out of the sitemap.
    const lastmod = new Date().toISOString().slice(0, 10);
    writeFileSync(join(root, "dist", "sitemap.xml"), sitemapXml(lastmod), "utf8");
    console.log(`prerender: sitemap.xml → ${pages.filter((p) => p.sitemap).length} urls`);
  } finally {
    await vite.close();
  }
} catch (err) {
  console.warn(`prerender: SKIPPED — ${err instanceof Error ? err.message : err}`);
  console.warn("prerender: dist still works, but ships without server-rendered content.");
}
