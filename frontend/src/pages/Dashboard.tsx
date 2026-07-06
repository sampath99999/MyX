import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Wallet,
  CheckCircle2,
  ListChecks,
  ArrowDownLeft,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PageHeader from "@/components/PageHeader";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import LoadError from "@/components/LoadError";
import { useAuth } from "@/lib/auth";
import { api, formatMoney } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";

interface Summary {
  greeting: string;
  stats: {
    balance: number;
    monthSpend: number;
    openTasks: number;
    notes: number;
    checklists: number;
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    setSummary(await api.dashboardSummary());
  }, []);

  const { error, reload } = useAuthenticatedLoad(load);

  const firstName = user?.name?.split(" ")[0] ?? "there";

  const stats = [
    {
      label: "Current Balance",
      value: summary ? formatMoney(summary.stats.balance) : "—",
      icon: Wallet,
      hint: "Across all accounts",
      accent: "text-emerald-400",
      to: "/money",
    },
    {
      label: "Spent This Month",
      value: summary ? formatMoney(summary.stats.monthSpend) : "—",
      icon: ArrowDownLeft,
      hint: "So far this month",
      accent: "text-amber-400",
      to: "/money",
    },
    {
      label: "Open Tasks",
      value: summary ? summary.stats.openTasks : "—",
      icon: CheckCircle2,
      hint: "Coming soon",
      accent: "text-sky-400",
    },
    {
      label: "Checklists",
      value: summary ? summary.stats.checklists : "—",
      icon: ListChecks,
      hint: "Coming soon",
      accent: "text-violet-400",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      >
        <AddTransactionDialog
          onCreated={reload}
          trigger={
            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4" />
              Quick add
            </Button>
          }
        />
      </PageHeader>

      <div className="p-6 lg:p-8 space-y-8">
        {error && (
          <Card className="glass p-4">
            <LoadError message={error} onRetry={reload} />
          </Card>
        )}

        {/* Greeting */}
        <div className="animate-in-up">
          <h2 className="text-3xl font-bold tracking-tight">
            {summary?.greeting ?? `Welcome back, ${firstName}`} 👋
          </h2>
          <p className="mt-1.5 text-muted-foreground">
            Here's a snapshot of your life today. Modules light up as you add them.
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((s, i) => {
            const inner = (
              <Card
                className="glass p-5 h-full animate-in-up transition-transform duration-300 hover:-translate-y-1"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between">
                  <div className={`rounded-lg bg-background/40 p-2 ${s.accent}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  {s.to && <ArrowRight className="h-4 w-4 text-muted-foreground/50" />}
                </div>
                <div className="mt-4 text-2xl font-bold tracking-tight">{s.value}</div>
                <div className="mt-1 text-sm font-medium text-muted-foreground">{s.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground/70">{s.hint}</div>
              </Card>
            );
            return s.to ? (
              <Link key={s.label} to={s.to} className="block">
                {inner}
              </Link>
            ) : (
              <div key={s.label}>{inner}</div>
            );
          })}
        </div>

        {/* Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="glass lg:col-span-2 p-6 min-h-56">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Recent activity</h3>
              <Link
                to="/money"
                className="text-xs text-primary hover:underline underline-offset-4"
              >
                View money →
              </Link>
            </div>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                Head to the Money module to log income and expenses — your balance updates here
                instantly.
              </p>
            </div>
          </Card>

          <Card className="glass p-6 min-h-56">
            <h3 className="font-semibold">Before bed checklist</h3>
            <p className="text-xs text-muted-foreground">A preview of the Checklists module</p>
            <ul className="mt-4 space-y-2.5">
              {["Lock the door", "Set alarm", "Phone on charge", "Fill water bottle"].map((t) => (
                <li key={t} className="flex items-center gap-3 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md border border-border" />
                  <span className="text-muted-foreground">{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
