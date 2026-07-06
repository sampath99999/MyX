import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Check,
  MoreHorizontal,
  Tag,
  // income icons
  Banknote,
  Laptop,
  Briefcase,
  PiggyBank,
  Gift,
  RotateCcw,
  LineChart,
  // expense icons
  ShoppingCart,
  UtensilsCrossed,
  Car,
  Home,
  ReceiptText,
  ShoppingBag,
  HeartPulse,
  Clapperboard,
  GraduationCap,
  Plane,
  Fuel,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Category {
  label: string;
  icon: LucideIcon;
}

export const CATEGORIES: Record<"income" | "expense", Category[]> = {
  income: [
    { label: "Salary", icon: Banknote },
    { label: "Freelance", icon: Laptop },
    { label: "Business", icon: Briefcase },
    { label: "Interest", icon: PiggyBank },
    { label: "Investment", icon: LineChart },
    { label: "Gift", icon: Gift },
    { label: "Refund", icon: RotateCcw },
  ],
  expense: [
    { label: "Groceries", icon: ShoppingCart },
    { label: "Food & Dining", icon: UtensilsCrossed },
    { label: "Transport", icon: Car },
    { label: "Fuel", icon: Fuel },
    { label: "Rent", icon: Home },
    { label: "Bills & Utilities", icon: ReceiptText },
    { label: "Shopping", icon: ShoppingBag },
    { label: "Health", icon: HeartPulse },
    { label: "Entertainment", icon: Clapperboard },
    { label: "Education", icon: GraduationCap },
    { label: "Travel", icon: Plane },
    { label: "Subscriptions", icon: Repeat },
  ],
};

/** Icon for a category label across both types; falls back to a generic tag. */
export function getCategoryIcon(label: string): LucideIcon {
  const all = [...CATEGORIES.income, ...CATEGORIES.expense];
  return all.find((c) => c.label.toLowerCase() === label.toLowerCase())?.icon ?? Tag;
}

export default function CategoryPicker({
  type,
  value,
  onChange,
}: {
  type: "income" | "expense";
  value: string;
  onChange: (v: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const customRef = useRef<HTMLInputElement>(null);

  // Reset picker state whenever the transaction type flips.
  useEffect(() => {
    setSearch("");
    setIsCustom(false);
  }, [type]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATEGORIES[type];
    return CATEGORIES[type].filter((c) => c.label.toLowerCase().includes(q));
  }, [type, search]);

  const showUseCustom =
    search.trim().length > 0 &&
    !CATEGORIES[type].some((c) => c.label.toLowerCase() === search.trim().toLowerCase());

  function pick(label: string) {
    setIsCustom(false);
    onChange(label);
  }

  function enableCustom(seed: string) {
    setIsCustom(true);
    onChange(seed);
    setTimeout(() => customRef.current?.focus(), 0);
  }

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search or type a category…"
          className="pl-9 h-10"
        />
      </div>

      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
        {filtered.map((c) => {
          const active = !isCustom && value === c.label;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => pick(c.label)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95",
                active
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <c.icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
              {c.label}
              {active && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          );
        })}

        {showUseCustom && (
          <button
            type="button"
            onClick={() => enableCustom(search.trim())}
            className="inline-flex items-center gap-2 rounded-full border border-dashed border-primary/50 px-3.5 py-2 text-sm font-medium text-primary transition-all hover:bg-primary/10 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Use "{search.trim()}"
          </button>
        )}

        <button
          type="button"
          onClick={() => enableCustom("")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95",
            isCustom
              ? "border-primary/50 bg-primary/15 text-foreground"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <MoreHorizontal className={cn("h-4 w-4", isCustom ? "text-primary" : "text-muted-foreground")} />
          Other
        </button>
      </div>

      {isCustom && (
        <Input
          ref={customRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter a custom category name"
          className="h-10 animate-in-up"
        />
      )}
    </div>
  );
}
