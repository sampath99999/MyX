/**
 * Service worker registration.
 *
 * Dev is deliberately excluded: a caching worker in front of Vite's HMR causes
 * stale-module confusion that looks like a code bug. Any worker left over from
 * a production visit on the same host is unregistered instead.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  if (!import.meta.env.PROD) {
    void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((reg) => {
      // A new worker means new hashed assets. Activate it as soon as it is
      // installed; the reload below then swaps the running app over.
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener("statechange", () => {
          if (next.state === "installed" && navigator.serviceWorker.controller) {
            next.postMessage("SKIP_WAITING");
          }
        });
      });
    });

    // Reload once when a new worker takes control, so the page is never left
    // running old JS against new assets. The guard stops a reload loop.
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}
