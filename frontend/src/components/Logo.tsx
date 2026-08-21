import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/*
  The brand mark, in one place.

  There were two marks before this, and they had been drifting apart for months.
  The favicon and the installed-app icon were a white sparkle on a violet
  rounded square; every mark inside the product was the letter M on a plain
  white (or black) square. So the icon on the home screen and the icon at the
  top of the page were unrelated, which is the one thing a logo cannot be.

  This is the sparkle version — the one on the home screen, the one people
  actually recognise — rebuilt so it can render at any size and, more
  importantly, so it takes its colour from `--brand` rather than from two hex
  values pasted in once. The token is `oklch(0.62 0.19 285)` in the dark theme
  and a deeper `oklch(0.54 0.2 285)` in the light one, so the mark carries the
  same weight against both backgrounds instead of glowing on one of them.

  The gradient is mixed from that single token rather than declared as a pair of
  stops: change the brand hue and the mark follows, along with the auroras, the
  focus rings and the links that already read from it.

  `public/icon.svg` is the same geometry with the token resolved to hex, since a
  file loaded as a favicon has no access to the page's custom properties.
  `scripts/icons.mjs` renders every PNG in the set from it, so the mark cannot
  drift again without someone noticing.
*/

/** Corner radius as a fraction of the square. Matches `public/icon.svg`. */
const RADIUS_RATIO = 0.26;
/** How much of the square the glyph fills. */
const GLYPH_RATIO = 0.58;

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative flex shrink-0 items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * RADIUS_RATIO,
        background: `linear-gradient(140deg,
          color-mix(in oklab, var(--brand) 78%, white) 0%,
          var(--brand) 48%,
          color-mix(in oklab, var(--brand) 84%, black) 100%)`,
        /* A one-pixel highlight along the top edge. It is what stops a flat
           rounded rectangle reading as a coloured div. */
        boxShadow: "inset 0 1px 0 0 rgb(255 255 255 / 0.3)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={Math.round(size * GLYPH_RATIO)}
        height={Math.round(size * GLYPH_RATIO)}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
        <path d="M4 17v2" />
        <path d="M5 18H3" />
      </svg>
    </span>
  );
}

/**
 * The mark plus the name. `to` is where it links; pass `null` for the rare
 * place that needs the lockup without a link (a mock of the app, a footer that
 * is already on the home page).
 */
export default function Logo({
  to = "/",
  size = 28,
  label = "MyX",
  showName = true,
  className,
  nameClassName,
}: {
  to?: string | null;
  size?: number;
  /** Accessible name for the link. The visible text is always "MyX". */
  label?: string;
  showName?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  const inner = (
    <>
      <LogoMark size={size} />
      {showName && (
        <span className={cn("text-[0.9375rem] font-semibold tracking-tight", nameClassName)}>
          MyX
        </span>
      )}
    </>
  );

  if (to === null) {
    return <span className={cn("flex items-center gap-2.5", className)}>{inner}</span>;
  }

  return (
    <Link to={to} aria-label={label} className={cn("flex items-center gap-2.5", className)}>
      {inner}
    </Link>
  );
}
