import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Toasts.

  Until now a successful write said nothing at all and a failed one set an error
  string that the page rendered somewhere near the form — so deleting a
  transaction from a row menu gave no feedback whatsoever, and the only way to
  know it worked was that the row vanished. Worse, anything destructive had no
  way back: "Delete" meant gone.

  This is deliberately small — no dependency, one portal, one stack. The part
  that earns its place is `action`: an undo button lives in the toast, which is
  what lets a delete be immediate *and* reversible instead of hiding behind a
  confirm dialog nobody reads.
*/

type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds on screen. 0 keeps it until dismissed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
  id: number;
}

interface ToastApi {
  toast: (options: ToastOptions) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId++;
      // An error stays twice as long: it is the one the user has to read.
      const duration =
        options.duration ?? (options.action ? 7000 : options.tone === "error" ? 7000 : 4000);
      // Cap the stack. Five toasts is already a bug report; twenty is a wall.
      setToasts((list) => [...list.slice(-4), { ...options, id }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Clearing on unmount matters in tests, where the provider mounts and
  // unmounts far faster than any toast expires.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: "success" }),
      error: (title, description) => toast({ title, description, tone: "error" }),
      dismiss,
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(<ToastViewport toasts={toasts} onDismiss={dismiss} />, document.body)}
    </ToastContext.Provider>
  );
}

const TONE_ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const TONE_CLASS = {
  success: "text-emerald-400",
  error: "text-rose-400",
  info: "text-muted-foreground",
} as const;

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}) {
  return (
    /*
      Bottom-right on a desktop, top on a phone — where the bottom edge is the
      tab bar and the thumb, and a toast there covers the navigation.
      `pointer-events-none` on the stack so the empty column never eats clicks.
    */
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-auto sm:items-end"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const tone = t.tone ?? "info";
        const Icon = TONE_ICON[tone];
        return (
          <div
            key={t.id}
            role={tone === "error" ? "alert" : "status"}
            className="animate-in-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-popover p-3.5 shadow-pop"
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_CLASS[tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {t.description}
                </p>
              )}
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    onDismiss(t.id);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <Undo2 className="size-3" />
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Toast API. Safe to call outside a provider — it no-ops rather than throwing,
 * so a component rendered in a test harness without the provider still works.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  return (
    ctx ?? {
      toast: () => 0,
      success: () => 0,
      error: () => 0,
      dismiss: () => {},
    }
  );
}
