import { createContext, useCallback, useContext, useEffect, useState } from "react";

/*
  Light mode.

  MyX was dark-only, which is a real barrier rather than a taste question: a lot
  of people cannot comfortably read light-on-dark, and anyone opening the app
  outdoors is fighting it. The tokens were already CSS variables, so the whole
  palette swaps by putting one class on <html> — see the `.light` block in
  index.css.

  Three settings, not two. "System" is the default and the honest one: the
  device already knows whether it is night, and most people set that once and
  never think about it again.
*/

export type Theme = "system" | "light" | "dark";

export const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const STORAGE_KEY = "myx.theme";

/** Never throws: Safari in private mode makes localStorage a landmine. */
export function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // No storage — fall through to the system preference.
  }
  return "system";
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/**
 * Puts the resolved theme on <html> and keeps the browser chrome in step.
 *
 * theme-color is not cosmetic on a phone: it colours the status bar behind an
 * installed PWA, and leaving it at the dark value paints a black bar over a
 * white app.
 */
export function applyTheme(theme: Theme): "light" | "dark" {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle("light", resolved === "light");
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "light" ? "#ffffff" : "#0a0a0a");
  return resolved;
}

interface ThemeContextValue {
  /** What the user chose, including "system". */
  theme: Theme;
  /** What that currently means. */
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "dark",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  /*
    Read from storage during the first render rather than in an effect. The
    inline script in index.html has already put the right class on <html> before
    paint; starting from "system" here and correcting afterwards would make the
    provider briefly disagree with the document it is describing.
  */
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? "system" : readStoredTheme(),
  );
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    typeof window === "undefined" ? "dark" : resolveTheme(readStoredTheme()),
  );

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolved(applyTheme(next));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies to this tab; it just will not survive a reload.
    }
  }, []);

  // On "system", follow the device if it changes while the app is open — at
  // sunset, or when someone flips the switch in another window.
  useEffect(() => {
    if (theme !== "system" || typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setResolved(applyTheme("system"));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
