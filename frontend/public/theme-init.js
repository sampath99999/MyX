/*
  Resolves the theme onto <html> before the page paints.

  Loaded synchronously from <head> (see index.html). It must agree exactly with
  applyTheme() in src/lib/theme.tsx — this runs first, that one runs on every
  later change, and if the two disagree the app flips colour a moment after load.
*/
(function () {
  try {
    var stored = localStorage.getItem("myx.theme") || "system";
    var light =
      stored === "light" ||
      (stored === "system" && matchMedia("(prefers-color-scheme: light)").matches);

    var root = document.documentElement;
    root.classList.toggle("light", light);
    root.classList.toggle("dark", !light);
    // Tells the browser which way to paint form controls, scrollbars and the
    // canvas behind the page, none of which our CSS variables reach.
    root.style.colorScheme = light ? "light" : "dark";

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", light ? "#ffffff" : "#0a0a0a");
  } catch (e) {
    // Storage blocked (Safari private mode) — the dark class already on <html>
    // stands, which is the pre-existing behaviour.
  }
})();
