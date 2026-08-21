import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

/*
  The theme picker, shared by the app header and the marketing page.

  It lived inside AppHeader, which meant a signed-out visitor had no way to
  change the theme at all — the landing page is the first thing anyone sees and
  it was locked to whatever their OS said, with no affordance to say otherwise.
  Since both places need exactly the same control, it lives here rather than
  being written twice and drifting.

  Three explicit choices rather than a button that cycles. The cycle needed a
  tooltip to explain itself and always made you pass through the mode you did
  not want on the way to the one you did. "System" is a real answer, not a
  fallback: most people set it once and never think about it again.
*/

const OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolved, setTheme } = useTheme();
  // The icon shows what you are *looking at*, not what you picked — on
  // "system" a monitor glyph tells you nothing about the screen in front of you.
  const Icon = resolved === "light" ? Sun : Moon;

  return (
    <Menu
      align="end"
      contentClassName="min-w-44"
      trigger={
        <button
          aria-label={`Theme: ${theme}`}
          title="Theme"
          className={cn(
            "tap flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-8",
            className,
          )}
        >
          <Icon className="size-[1.05rem]" />
        </button>
      }
    >
      <MenuLabel>Appearance</MenuLabel>
      {OPTIONS.map((o) => (
        <MenuItem key={o.value} icon={o.icon} onSelect={() => setTheme(o.value)}>
          <span className="flex items-center justify-between gap-2">
            {o.label}
            {theme === o.value && <Check className="size-3.5 opacity-70" />}
          </span>
        </MenuItem>
      ))}
    </Menu>
  );
}
