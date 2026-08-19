import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, CheckCircle2, Wallet, PiggyBank, Loader2 } from "lucide-react";
import { api, type Notification } from "@/lib/api";

/*
  The bell.

  Deliberately not a feed of things that happened. The server answers with what
  is true right now — an overdue task, a bill due in two days, a budget already
  spent — so there is no read state to keep, nothing to mark, and no way to make
  an overdue bill disappear by tapping an icon. Dealing with it is what clears
  it.

  Refetched when the route changes rather than on a timer: paying a bill or
  ticking a task navigates, and a badge that still shows the thing you just did
  is worse than one that updates a moment late.
*/

const ICONS = { task: CheckCircle2, bill: Wallet, budget: PiggyBank };

const TONE: Record<Notification["severity"], string> = {
  urgent: "text-rose-400",
  warning: "text-amber-400",
  info: "text-muted-foreground",
};

export default function NotificationsBell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [urgent, setUrgent] = useState(0);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    api
      .notifications()
      .then((res) => {
        if (!current) return;
        setItems(res.items);
        setUrgent(res.urgent);
      })
      // A failed bell must stay quiet. It is the least important thing on the
      // page and has no business showing an error over the app.
      .catch(() => current && setItems([]))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [pathname]);

  // Close on an outside click or Escape — the two things every popover owes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={items.length ? `Notifications, ${items.length} items` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-[1.15rem] w-[1.15rem]" />
        {items.length > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
              urgent > 0 ? "bg-rose-500" : "bg-amber-500"
            }`}
          >
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-2xl"
        >
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-sm font-semibold">Needs you</p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing overdue, nothing due. Enjoy it.
              </p>
            ) : (
              items.map((item) => {
                const Icon = ICONS[item.kind];
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setOpen(false);
                      navigate(item.to);
                    }}
                    className="flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 text-left last:border-0 hover:bg-accent"
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[item.severity]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      {item.detail && (
                        <span className="block text-xs text-muted-foreground">{item.detail}</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
