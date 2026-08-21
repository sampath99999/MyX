import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicHeader, { PUBLIC_HEADER_OFFSET } from "@/components/PublicHeader";
import { cn } from "@/lib/utils";

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
    <div className={cn("grain relative min-h-dvh overflow-hidden", PUBLIC_HEADER_OFFSET)}>
      <PublicHeader calculators={false} />

      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="aurora drift-b left-1/2 top-[-25%] size-[34rem] -translate-x-1/2"
          style={{ background: "color-mix(in oklab, var(--brand) 70%, transparent)" }}
        />
        <div className="grid-bg absolute inset-0" />
      </div>

      <main className="relative flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-5 py-12 text-center sm:px-6">
        <span className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card">
          <Compass className="size-5 text-muted-foreground" />
        </span>

        <p className="eyebrow mt-7">Error 404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          That page does not exist.
        </h1>
        <p className="mt-4 max-w-md text-muted-foreground">
          The link may be out of date, or the page may have moved. Everything MyX can do is one of
          these two doors.
        </p>

        <div className="mt-9 flex flex-col gap-2 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/dashboard">
              Open the app
              <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/">Back to the home page</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
