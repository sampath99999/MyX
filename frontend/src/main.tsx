import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from "./lib/pwa";
import { metaFor } from "./lib/seo";

const root = document.getElementById("root")!;
const tree = (
  <StrictMode>
    <App />
  </StrictMode>
);

/*
  The public pages ship with their markup already rendered into the HTML (see
  scripts/prerender.mjs), so those hydrate rather than throwing it away and
  painting the same thing again.

  Everything else falls back to the SPA shell in public/_redirects, which still
  carries the landing page's markup in the root. Hydrating that against a
  completely different tree would mismatch, so those clear the root first.
*/
if (metaFor(window.location.pathname) && root.firstChild) {
  hydrateRoot(root, tree);
} else {
  root.innerHTML = "";
  createRoot(root).render(tree);
}

registerServiceWorker();
