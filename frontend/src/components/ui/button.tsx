import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Buttons used to be h-11 with a violet halo on the default variant, which meant
  every screen had a glowing purple slab on it and the eye had nowhere to rest.
  The default is now monochrome — white on near-black, inverted in light mode —
  and 36px tall, which is the height a dense app can put in a toolbar without
  the toolbar becoming the page.
*/
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-sm font-medium transition-all outline-none",
    "focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/30",
        link: "text-foreground underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        /*
          `sm` is 32px, which is right in a desktop toolbar and too small under
          a thumb. Most of the app's primary page actions — New note, New
          memory, New checklist — are this size, so on a phone the main thing
          you came to do was the smallest control on screen. 36px below sm,
          unchanged above it.
        */
        sm: "h-9 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-[0.8125rem] sm:h-8",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        xl: "h-11 rounded-lg px-7 text-[0.9375rem]",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Swaps the leading content for a spinner and blocks the click. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    // `asChild` hands rendering to the child, so injecting a spinner would give
    // Slot two children and crash. Loading state is the caller's job there.
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
