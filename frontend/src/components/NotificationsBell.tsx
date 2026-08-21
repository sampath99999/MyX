import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, CheckCircle2, Wallet, PiggyBank, Loader2, CheckCheck } from "lucide-react";
import { api, type Notification } from "@/lib/api";
import { Menu, useMenuClose } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

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
  const { pathname } = useLocation();
  const [items, setItems] = useState<Notification[]>([]);
  const [urgent, setUrgent] = useState(0);
  const [loading, setLoading] = useState(true);

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

  return (
    <Menu
      align="end"
      contentClassName="w-80 p-0 overflow-hidden"
      trigger={
        <button
          aria-label={items.length ? `Notifications, ${items.length} items` : "Notifications"}
          /* `tap` for the hit area and size-9 below md: this sits in a row of
             adjacent controls on a phone, where 32px is a coin toss. */
          className="tap relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bell className="size-[1.05rem]" />
          {items.length > 0 && (
            /*
              A dot, not a count. The count was a red circle with a number in
              it on a bell that is never zero for long, which is the shape of a
              social app demanding attention — this app's job is to be quiet
              until something is actually late. Red only when something is.
            */
            <span
              className={cn(
                "absolute right-1 top-1 size-2 rounded-full ring-2 ring-background",
                urgent > 0 ? "bg-rose-500" : "bg-amber-500",
              )}
            />
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <p className="text-sm font-semibold">Needs you</p>
        {items.length > 0 && (
          <span className="tnum text-xs text-muted-foreground">{items.length}</span>
        )}
      </div>

      <NotificationList items={items} loading={loading} />
    </Menu>
  );
}

/** Split out so it can call useMenuClose(), which only exists inside the menu. */
function NotificationList({ items, loading }: { items: Notification[]; loading: boolean }) {
  const close = useMenuClose();
  return (
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <CheckCheck className="mb-2.5 size-5 text-emerald-400" />
            <p className="text-sm font-medium">All clear</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing overdue, nothing due. Enjoy it.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const Icon = ICONS[item.kind];
            return (
              <Link
                key={item.id}
                to={item.to}
                onClick={close}
                className="flex w-full items-start gap-3 border-b border-border/60 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-accent"
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[item.severity])} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  {item.detail && (
                    <span className="block text-xs text-muted-foreground">{item.detail}</span>
                  )}
                </span>
              </Link>
            );
          })
        )}
      </div>
  );
}
