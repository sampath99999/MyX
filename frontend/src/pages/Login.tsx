import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Wallet,
  CheckCircle2,
  StickyNote,
  Brain,
  ListChecks,
  Sparkles,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

const features = [
  { icon: Wallet, label: "Money", desc: "Income, expenses & balance" },
  { icon: CheckCircle2, label: "Tasks", desc: "Stay on top of your day" },
  { icon: StickyNote, label: "Notes", desc: "Capture every thought" },
  { icon: Brain, label: "Memories", desc: "Keep moments forever" },
  { icon: ListChecks, label: "Checklists", desc: "Reusable routines" },
];

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  // The landing page's "Get started free" links here with ?mode=register, so
  // the visitor lands on the sign-up form rather than having to find the toggle.
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" ? "register" : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, name, password);
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh w-full lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* ---------- Brand / showcase panel ---------- */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between p-12 xl:p-16">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">MyX</span>
        </div>

        <div className="max-w-lg animate-in-up">
          <h1 className="text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight text-gradient">
            Your whole life,
            <br />
            in one place.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Money, tasks, notes, memories and daily checklists — private, fast, and beautifully
            organized. Just for you.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3 max-w-md">
            {features.map((f) => (
              <div
                key={f.label}
                className="glass rounded-xl p-4 transition-transform duration-300 hover:-translate-y-1"
              >
                <f.icon className="h-5 w-5 text-primary" />
                <div className="mt-2.5 text-sm font-semibold">{f.label}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} MyX · Built on Cloudflare
        </p>
      </aside>

      {/* ---------- Auth form panel ---------- */}
      <main className="flex min-h-dvh items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-in-up">
          {/* Mobile brand */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">MyX</span>
          </div>

          <h2 className="text-3xl font-bold tracking-tight">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login"
              ? "Sign in to continue to your dashboard."
              : "Start organizing your life in minutes."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Sampath"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "register" && (
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {mode === "login" ? "Sign in" : "Create account"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
              className="font-semibold text-primary hover:underline underline-offset-4"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
