import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from "./lib/pwa";

const root = document.getElementById("root")!;
const tree = (
  <StrictMode>
    <App />
  </StrictMode>
);

/*
  "/" ships with the landing page already rendered into the HTML (see
  scripts/prerender.mjs), so hydrate it rather than throwing that markup away
  and painting the same thing again.

  Every other path gets the *same* file — public/_redirects serves the SPA shell
  for all routes — so the prerendered landing markup is sitting in the root on
  /money and /login too. Hydrating there would mismatch against a completely
  different tree, so those clear the root and render from scratch.
*/
if (window.location.pathname === "/" && root.firstChild) {
  hydrateRoot(root, tree);
} else {
  root.innerHTML = "";
  createRoot(root).render(tree);
}

registerServiceWorker();
