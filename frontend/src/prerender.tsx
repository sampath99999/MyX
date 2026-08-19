import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppRoutes } from "@/App";
import { PAGES, SITE_URL } from "@/lib/seo";
import { FAQS } from "@/pages/EmiCalculator";

/*
  Build-time render of every public route (see scripts/prerender.mjs).

  MyX is a client-rendered SPA, so without this a crawler's first response is an
  empty <div id="root">. Google will execute the JavaScript eventually, but Bing
  and every social-card scraper will not, and content that arrives in a second
  request ranks worse than content in the HTML.

  Each route is rendered separately and written to its own file. The first
  version produced only dist/index.html, which Pages then served for every path
  — so /privacy and /terms both answered with the landing page's markup and
  title, which reads as duplicate content of the home page.

  The tree mirrors main.tsx exactly, with MemoryRouter standing in for
  BrowserRouter, which needs a window. Any structural difference makes React
  discard the markup on hydration, which costs more than prerendering saves.
*/

export function renderRoute(path: string): string {
  return renderToString(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

/** Routes to prerender, with the metadata each page's HTML head needs. */
export function routesToPrerender() {
  return PAGES;
}

/**
 * Extra JSON-LD for a route, beyond the site-wide WebApplication block.
 *
 * The calculator's questions are marked up as a FAQPage so they can surface as
 * rich results — the same copy the page renders, not a parallel version that
 * drifts, which is both a maintenance trap and against Google's guidelines.
 */
export function structuredDataFor(path: string): string | null {
  if (path !== "/emi-calculator") return null;

  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "WebApplication",
        name: "MyX EMI Calculator",
        url: `${SITE_URL}/emi-calculator`,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Any",
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      },
    ],
  });
}

/** The sitemap, generated from the same list so it cannot fall out of step. */
export function sitemapXml(lastmod: string): string {
  const urls = PAGES.filter((p) => p.sitemap)
    .map(
      (p) => `  <url>
    <loc>${SITE_URL}${p.path === "/" ? "/" : p.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.sitemap!.changefreq}</changefreq>
    <priority>${p.sitemap!.priority}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
