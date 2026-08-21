import { Link } from "react-router-dom";
import Logo from "@/components/Logo";
import { ALL_CALCULATOR_LINKS, pathFor } from "@/lib/calculators/registry";

/*
  The signed-out footer.

  It carries every calculator, which is the point of it. Search engines weigh
  how many internal links reach a page and how few clicks it is from the home
  page; a footer that lists all of them makes every calculator one hop from
  every other page on the site, which is the cheapest internal-linking win
  available and the reason competitor calculator sites all have one.

  It was three links repeated in four different files before this.
*/

const COMPANY = [
  { to: "/", label: "Home" },
  { to: "/calculators", label: "All calculators" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/login", label: "Sign in" },
];

export default function PublicFooter() {
  // Two balanced columns rather than one very long one.
  const half = Math.ceil(ALL_CALCULATOR_LINKS.length / 2);
  const columns = [ALL_CALCULATOR_LINKS.slice(0, half), ALL_CALCULATOR_LINKS.slice(half)];

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6">
        {/*
          Two columns from the smallest screen up, not one.

          Stacked, thirteen calculator links plus the MyX column made the footer
          1,188px tall on a 812px phone — a screen and a half of footer under
          every page. Side by side it is roughly half that, and the brand and
          MyX blocks span both columns so nothing looks orphaned.
        */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-1">
            <Logo to="/" label="MyX home" size={28} nameClassName="text-sm" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Money, tasks, notes and the days worth remembering — in one private app. Free, with
              nothing tracking you.
            </p>
          </div>

          {columns.map((column, i) => (
            <nav key={i} aria-label={i === 0 ? "Calculators" : undefined}>
              {/* The second column is a continuation of the first, so it gets a
                  spacer rather than a heading — the lists have to start on the
                  same line or the columns look misaligned. */}
              {i === 0 ? (
                <p className="eyebrow mb-4">Calculators</p>
              ) : (
                <p className="eyebrow mb-4 invisible" aria-hidden="true">
                  Calculators
                </p>
              )}
              {/* Padding rather than the `.tap` trick: these are stacked, and
                  overlapping invisible hit areas mean tapping the wrong link. */}
              <ul>
                {column.map((c) => (
                  <li key={c.slug}>
                    <Link
                      to={pathFor(c.slug)}
                      className="block py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {c.name} calculator
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav className="col-span-2 lg:col-span-1">
            <p className="eyebrow mb-4">MyX</p>
            <ul>
              {COMPANY.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="block py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} MyX</span>
          <span>
            Calculators are for planning and are not financial advice.
          </span>
        </div>
      </div>
    </footer>
  );
}
