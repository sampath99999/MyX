/*
  Per-page metadata, and the list of routes worth prerendering.

  One source of truth for three consumers: the build-time prerender writes a
  separate HTML file per route from this, the sitemap is generated from it, and
  the client updates document.title from it on navigation.

  It exists because the first prerender only ever produced dist/index.html.
  Cloudflare Pages then served that one file for every path, so a crawler asking
  for /privacy got the landing page's markup and the landing page's <title> —
  every route looked like duplicate content of the home page.
*/

import { CALCULATORS, pathFor } from "@/lib/calculators/registry";

export const SITE_URL = "https://myx.samchitech.com";

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  /** Sitemap hint. Omitted pages are still prerendered, just not advertised. */
  sitemap?: { changefreq: string; priority: string };
}

export const PAGES: PageMeta[] = [
  {
    path: "/",
    title: "MyX — Your Life, Organized",
    description:
      "MyX is a private personal life manager: money, tasks, notes, memories and daily checklists in one fast app. Free, installable, no ads or trackers.",
    sitemap: { changefreq: "weekly", priority: "1.0" },
  },
  {
    path: "/emi-calculator",
    title: "EMI Calculator — Home, Car & Personal Loan EMI with Full Schedule | MyX",
    description:
      "Free EMI calculator with the complete month-by-month amortization schedule. Reducing-balance interest calculated to the paise, the same way your bank does it. No signup.",
    sitemap: { changefreq: "monthly", priority: "0.9" },
  },
  {
    path: "/privacy",
    title: "Privacy — MyX",
    description:
      "What MyX stores, who can see it, and how to export or delete it. No analytics, no advertising pixels, no third-party trackers, and no bank connection.",
    sitemap: { changefreq: "yearly", priority: "0.3" },
  },
  {
    path: "/terms",
    title: "Terms of use — MyX",
    description:
      "The terms covering your MyX account and your data: free to use, yours to export or delete, and not financial advice. Written plainly.",
    sitemap: { changefreq: "yearly", priority: "0.3" },
  },
];

/*
  Every registry-driven calculator, as its own indexable page.

  Generated rather than hand-listed so that adding a calculator to the registry
  cannot leave it out of the sitemap, out of the prerender, or without a
  <title> — three separate ways the same omission used to be possible.

  Priority 0.8: below the home page and the EMI calculator (the flagship tool
  and the term most likely to bring anyone here at all), above the legal pages.
*/
const CALCULATOR_PAGES: PageMeta[] = CALCULATORS.map((c) => ({
  path: pathFor(c.slug),
  title: c.title,
  description: c.description,
  sitemap: { changefreq: "monthly", priority: "0.8" },
}));

PAGES.push(
  {
    path: "/calculators",
    title: "Free Financial Calculators — SIP, EMI, FD, PPF, GST & More | MyX",
    description:
      "Free financial calculators for India: SIP, lumpsum, EMI, FD, RD, PPF, compound interest, CAGR, GST and inflation. Each shows its formula and sources. No signup.",
    sitemap: { changefreq: "weekly", priority: "0.9" },
  },
  ...CALCULATOR_PAGES,
);

export function metaFor(pathname: string): PageMeta | undefined {
  return PAGES.find((p) => p.path === pathname);
}

/**
 * Keep the document head in step with client-side navigation.
 *
 * The prerendered file gets each page's title and canonical right on a cold
 * load, but a React route change touches neither — so clicking from the home
 * page to the calculator left the tab, and anything reading the canonical,
 * still describing the home page.
 */
export function syncDocumentMeta(pathname: string) {
  const page = metaFor(pathname);
  if (!page) return;

  document.title = page.title;

  const canonical = `${SITE_URL}${page.path === "/" ? "/" : page.path}`;
  const set = (selector: string, attr: string, value: string) => {
    const el = document.head.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  };
  set('link[rel="canonical"]', "href", canonical);
  set('meta[name="description"]', "content", page.description);
  set('meta[property="og:url"]', "content", canonical);
  set('meta[property="og:title"]', "content", page.title);
  set('meta[property="og:description"]', "content", page.description);
}
