/*
  The escape hatch for an app that cannot start.

  src/lib/lazyWithRetry.ts recovers a *route* chunk that fails to load. Nothing
  recovered a failure in the entry's own import graph, and that is the worse
  case by far: React never mounts, so no application code runs at all — not the
  error boundary, not the service worker registration, nothing. The screen stays
  blank and every reload reproduces it.

  That is not hypothetical. A hashed asset requested during a deploy came back
  as the SPA fallback (index.html, status 200), the service worker cached it as
  though it were the script, and served it cache-first from then on. The app
  could not boot, so it could not update the worker that was breaking it.

  This file exists outside the bundle for exactly that reason: loaded straight
  from <head>, it runs whether or not the application does. It waits, and if
  nothing has mounted by then it clears the caches, drops the service worker and
  reloads once — the sequence a person would otherwise have to perform by hand
  through developer tools, which is not a repair anyone should need to know.

  Once only, guarded in sessionStorage. A genuinely broken build would otherwise
  reload for ever, and a boot loop is a worse failure than the one being fixed.
*/
(function () {
  var FLAG = "myx.boot-recovered";
  // Long enough for a cold load on a slow phone, short enough that a blank
  // screen is not left sitting there.
  var TIMEOUT_MS = 8000;

  function alreadyTried() {
    try {
      return sessionStorage.getItem(FLAG) === "1";
    } catch (e) {
      // Storage blocked (Safari private mode). Without the guard a reload could
      // loop, so the safer answer is to do nothing at all.
      return true;
    }
  }

  function markTried() {
    try {
      sessionStorage.setItem(FLAG, "1");
    } catch (e) {
      /* Nothing to mark with; the check above will have bailed out anyway. */
    }
  }

  /*
    Has React actually taken over?

    Counting children of #root is not enough, and the landing page is exactly
    why: it is prerendered, so the element is full of markup whether or not a
    line of JavaScript ever ran. On the one page most likely to be hit by a bad
    deploy, a child-count check reports success while the screen sits blank —
    the content is there, invisible, because its entrance animations never ran.

    React stamps a __reactContainer$ key on the host node when it mounts, so
    that is the honest signal.
  */
  function booted() {
    var root = document.getElementById("root");
    if (!root) return false;
    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("__reactContainer") === 0) return true;
    }
    return false;
  }

  window.addEventListener("load", function () {
    setTimeout(function () {
      if (booted()) {
        // A successful boot clears the flag, so a session that recovers can
        // recover again later — two bad deploys in one sitting is not unheard of.
        try {
          sessionStorage.removeItem(FLAG);
        } catch (e) {
          /* Nothing to clear. */
        }
        return;
      }

      if (alreadyTried()) return;
      markTried();

      console.warn("[boot-guard] nothing mounted; clearing caches and reloading once");

      var done = function () {
        window.location.reload();
      };

      /*
        Refetch the page's own scripts past the HTTP cache before reloading.

        Clearing the Cache Storage API does nothing to the browser's ordinary
        cache, and /assets/* is served immutable for a year — so a bad response
        stored there survives every reload and every cache.delete(). A fetch
        with cache:"reload" is the one thing that replaces those entries.
      */
      var refresh = [];
      var sources = document.querySelectorAll("script[src], link[rel=modulepreload]");
      for (var s = 0; s < sources.length; s++) {
        var url = sources[s].getAttribute("src") || sources[s].getAttribute("href");
        if (url && url.charAt(0) === "/") {
          refresh.push(fetch(url, { cache: "reload" }).catch(function () {}));
        }
      }

      // Caches first, then the worker. Unregistering alone leaves the poisoned
      // entries in place for the registration that replaces it.
      var work = [];
      if (window.caches && caches.keys) {
        work.push(
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          }),
        );
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        work.push(
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            return Promise.all(regs.map(function (r) { return r.unregister(); }));
          }),
        );
      }

      Promise.all(refresh.concat(work)).then(done, done);
    }, TIMEOUT_MS);
  });
})();
