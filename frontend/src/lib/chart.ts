import { useTheme } from "@/lib/theme";

/*
  Chart colours, resolved from the theme rather than hardcoded.

  Every Recharts call in Money used literal hex — `stroke="oklch(0.68 0.02 275)"`
  for the axes, `#8b5cf6` for the series — which was fine while the app was
  dark-only and became a bug the day light mode shipped: pale grey axis labels on
  a white card are invisible, and a grid drawn at 35% white disappears entirely.

  The categorical ramp is chosen for the two things a spending breakdown needs:
  neighbouring slices must be tellable apart (so the hues step by ~50°, not by
  brightness), and no slice may read as an alert — nothing in a category donut
  means "over budget", so the reds are damped.
*/

export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  cursor: string;
  income: string;
  expense: string;
  net: string;
  /** Categorical ramp for pies and stacked series. */
  palette: string[];
}

const DARK: ChartTheme = {
  grid: "oklch(1 0 0 / 0.07)",
  axis: "oklch(0.706 0.008 285)",
  tooltipBg: "oklch(0.196 0.004 285)",
  tooltipBorder: "oklch(1 0 0 / 0.12)",
  cursor: "oklch(1 0 0 / 0.05)",
  income: "oklch(0.75 0.16 163)",
  expense: "oklch(0.68 0.18 18)",
  net: "oklch(0.72 0.14 258)",
  palette: [
    "oklch(0.72 0.14 258)",
    "oklch(0.75 0.16 163)",
    "oklch(0.8 0.15 78)",
    "oklch(0.7 0.17 12)",
    "oklch(0.74 0.13 212)",
    "oklch(0.72 0.15 305)",
    "oklch(0.78 0.13 128)",
    "oklch(0.7 0.05 285)",
  ],
};

const LIGHT: ChartTheme = {
  grid: "oklch(0.2 0.01 285 / 0.08)",
  axis: "oklch(0.53 0.008 285)",
  tooltipBg: "oklch(1 0 0)",
  tooltipBorder: "oklch(0.2 0.01 285 / 0.12)",
  cursor: "oklch(0.2 0.01 285 / 0.04)",
  income: "oklch(0.58 0.14 163)",
  expense: "oklch(0.56 0.19 18)",
  net: "oklch(0.55 0.16 258)",
  palette: [
    "oklch(0.55 0.16 258)",
    "oklch(0.58 0.14 163)",
    "oklch(0.65 0.15 78)",
    "oklch(0.57 0.19 12)",
    "oklch(0.57 0.13 212)",
    "oklch(0.55 0.18 305)",
    "oklch(0.6 0.14 128)",
    "oklch(0.55 0.03 285)",
  ],
};

export function useChartTheme(): ChartTheme {
  const { resolved } = useTheme();
  return resolved === "light" ? LIGHT : DARK;
}
