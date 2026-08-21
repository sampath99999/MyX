import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
  Status pills. Every screen was rolling its own — a rounded span with a
  hand-picked `bg-emerald-400/10 text-emerald-300` — which drifted: three
  different greens, two different paddings, one that was unreadable in light
  mode. These are the five meanings the app actually has.
*/
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium leading-4 [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-400",
        warning: "border-amber-400/25 bg-amber-400/10 text-amber-400",
        danger: "border-rose-400/25 bg-rose-400/10 text-rose-400",
        info: "border-sky-400/25 bg-sky-400/10 text-sky-400",
        solid: "border-transparent bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants };
