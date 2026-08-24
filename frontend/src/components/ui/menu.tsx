import * as React from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/*
  A dropdown menu, built here rather than pulled in.

  Radix's dropdown would be the obvious answer, but the app already ships Radix
  dialog + select + label and adding a fourth package for what is ~120 lines of
  focus handling was not worth the bundle on a phone. What this does have to get
  right, and does:

  - It portals to <body>. The previous hand-rolled menus rendered inline, so a
    menu inside a card with `overflow-hidden` was clipped, and one inside the
    header (a backdrop-filter, therefore its own stacking context) painted
    *under* the page.
  - It flips up when there is no room below, and clamps to the viewport.
  - Escape closes it, arrow keys move through it, Tab leaves it.
*/

interface MenuContextValue {
  close: () => void;
}
const MenuContext = React.createContext<MenuContextValue>({ close: () => {} });

export function Menu({
  trigger,
  children,
  align = "end",
  className,
  contentClassName,
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void; "aria-expanded"?: boolean }>;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const close = React.useCallback(() => setOpen(false), []);

  // Position against the trigger, in viewport coordinates (the menu is fixed).
  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      const menuWidth = menuRef.current?.offsetWidth ?? 224;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < menuHeight + 12 && rect.top > menuHeight + 12;
      const top = flipUp ? rect.top - menuHeight - 6 : rect.bottom + 6;
      let left = align === "end" ? rect.right - menuWidth : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      setPos({ top, left, width: rect.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !anchorRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = menuRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]");
      if (!items?.length) return;
      e.preventDefault();
      const list = Array.from(items);
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? at + 1 : at - 1;
      list[(next + list.length) % list.length]?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={anchorRef} className={cn("relative", className)}>
      {React.cloneElement(trigger, {
        onClick: (e: React.MouseEvent) => {
          trigger.props.onClick?.(e);
          setOpen((v) => !v);
        },
        "aria-expanded": open,
      })}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <MenuContext.Provider value={{ close }}>
            <div
              ref={menuRef}
              role="menu"
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
              className={cn(
                "animate-in-up fixed z-[90] min-w-56 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-pop",
                contentClassName,
              )}
            >
              {children}
            </div>
          </MenuContext.Provider>,
          document.body,
        )}
    </div>
  );
}

/*
  The same menu, opened at the pointer instead of under a trigger.

  Right-click needs a position, not an anchor, so this takes coordinates and
  reuses everything else — the portal, the viewport clamping, Escape, arrow
  keys, and MenuItem's "selecting closes it" behaviour, which only works
  because the context below is the same one `Menu` provides.

  A right-click menu can never be the only way to reach an action: it is
  invisible until tried, and a touchscreen has no right-click at all. Every
  caller pairs it with an ordinary button that opens the same items.
*/
export function useContextMenu() {
  const [at, setAt] = React.useState<{ x: number; y: number } | null>(null);
  const openAt = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAt({ x: e.clientX, y: e.clientY });
  }, []);
  const close = React.useCallback(() => setAt(null), []);
  return { at, openAt, close };
}

export function ContextMenu({
  at,
  onClose,
  children,
  className,
}: {
  at: { x: number; y: number } | null;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!at) {
      setPos(null);
      return;
    }
    const el = menuRef.current;
    const width = el?.offsetWidth ?? 224;
    const height = el?.offsetHeight ?? 0;
    // Clamp inside the viewport. Opening near the bottom-right corner would
    // otherwise put half the menu off-screen, which is where a list's last
    // row usually is.
    const left = Math.max(8, Math.min(at.x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(at.y, window.innerHeight - height - 8));
    setPos({ top, left });
  }, [at]);

  React.useEffect(() => {
    if (!at) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = menuRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]");
      if (!items?.length) return;
      e.preventDefault();
      const list = Array.from(items);
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? index + 1 : index - 1;
      list[(next + list.length) % list.length]?.focus();
    };
    // A second right-click elsewhere should move the menu, not leave two ideas
    // of where it is.
    document.addEventListener("mousedown", onDown);
    document.addEventListener("contextmenu", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("contextmenu", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [at, onClose]);

  if (!at || typeof document === "undefined") return null;

  return createPortal(
    <MenuContext.Provider value={{ close: onClose }}>
      <div
        ref={menuRef}
        role="menu"
        style={{ top: pos?.top ?? at.y, left: pos?.left ?? at.x }}
        className={cn(
          "animate-in-up fixed z-[90] min-w-56 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-pop",
          className,
        )}
      >
        {children}
      </div>
    </MenuContext.Provider>,
    document.body,
  );
}

export function MenuItem({
  icon: Icon,
  destructive,
  onSelect,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ElementType;
  destructive?: boolean;
  onSelect?: () => void;
}) {
  const { close } = React.useContext(MenuContext);
  return (
    <button
      role="menuitem"
      data-menu-item
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors",
        "hover:bg-accent focus-visible:bg-accent",
        destructive && "text-rose-400 hover:bg-rose-400/10 focus-visible:bg-rose-400/10",
        className,
      )}
      onClick={(e) => {
        props.onClick?.(e);
        onSelect?.();
        close();
      }}
      {...props}
    >
      {Icon && <Icon className="size-4 shrink-0 opacity-80" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

/** The same row, as a router link. A <Link> inside a <button> is invalid HTML
 *  and swallows the navigation, so navigation items need their own element. */
export function MenuLink({
  icon: Icon,
  to,
  className,
  children,
}: {
  icon?: React.ElementType;
  to: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { close } = React.useContext(MenuContext);
  return (
    <Link
      role="menuitem"
      data-menu-item
      to={to}
      onClick={close}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors",
        "hover:bg-accent focus-visible:bg-accent",
        className,
      )}
    >
      {Icon && <Icon className="size-4 shrink-0 opacity-80" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}

/** Lets a custom row inside a menu close it — e.g. a link with its own layout. */
export function useMenuClose() {
  return React.useContext(MenuContext).close;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">{children}</div>;
}

export function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />;
}
