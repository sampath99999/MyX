import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

/*
  A real 404 screen. The route used to redirect unknown paths to "/", which
  answered every wrong URL with a 200 and the home page — a soft 404. Search
  engines treat that as duplicate content and it hides broken links from you.
  Pages still serves the SPA shell with a 200 (see public/_redirects), so the
  noindex tag below is what keeps these out of the index.
*/
export default function NotFound() {
  useEffect(() => {
    // index.html ships `index, follow` for the landing page. Flip the existing
    // tag rather than adding a second one — two robots metas is an ambiguous
    // signal, and crawlers resolve conflicts by guessing.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = meta?.content;
    if (meta) meta.content = "noindex";
    return () => {
      if (meta && previous !== undefined) meta.content = previous;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold tracking-tight">MyX</span>
      </Link>

      <p className="mt-12 text-sm font-semibold uppercase tracking-widest text-primary">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        That page does not exist.
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        The link may be out of date, or the page may have moved.
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          to="/"
          className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground glow"
        >
          Go home
        </Link>
        <Link
          to="/dashboard"
          className="rounded-xl border border-border/60 px-6 py-3 font-medium transition-colors hover:bg-accent"
        >
          Open the app
        </Link>
      </div>
    </div>
  );
}
