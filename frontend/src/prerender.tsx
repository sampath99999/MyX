import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { AppRoutes } from "@/App";

/*
  Build-time render of the public landing page (see scripts/prerender.mjs).

  MyX is a client-rendered SPA, so without this the crawler's first response is
  an empty <div id="root">. Google will execute the JavaScript eventually, but
  Bing and every social-card scraper will not, and a page whose content arrives
  in a second request ranks worse than one that ships it in the HTML.

  This mirrors main.tsx exactly — same StrictMode, same AuthProvider, same route
  tree — with MemoryRouter standing in for BrowserRouter, which needs a window.
  Any structural difference makes React discard the markup and re-render on
  hydration, which costs more than it saves. AuthProvider starts at user=null on
  both sides, so the logged-out landing page is what both produce.

  Only "/" is prerendered: it is the sole indexable route, and the only one
  whose markup does not depend on who is signed in.
*/
export function renderLanding(): string {
  return renderToString(
    <StrictMode>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </StrictMode>,
  );
}
