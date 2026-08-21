import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  A preference toggle.

  The digest setting was a bare `<input type="checkbox">` with `accent-primary`
  on it — a 16px browser control in a 20px-tall row, which is both the smallest
  target in the app and the only place its native widget shows through. On a
  phone that row was a fifth of the height a thumb needs.

  This is still a real checkbox underneath, so it keeps the label association,
  the keyboard behaviour and the form semantics for free. The input is made
  transparent rather than hidden with `display: none`, which would take it out
  of the tab order and out of reach of a screen reader.
*/
export default function Switch({
  checked,
  onChange,
  disabled,
  label,
  description,
  id,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  id?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg py-2.5 transition-colors",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        )}
      </span>

      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-10 items-center rounded-full p-0.5 transition-colors",
            "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/30",
            checked ? "bg-brand" : "bg-input",
          )}
        >
          <span
            className={cn(
              "size-5 rounded-full bg-white shadow-sm transition-transform",
              checked ? "translate-x-4" : "translate-x-0",
            )}
          />
        </span>
      </span>
    </label>
  );
}

/*
  The tick beside a checklist item.

  Presentational on purpose. Every place it appears, it sits inside a <button>
  that already owns the toggle and is already labelled by the item's text — so
  a second focusable control in there would be invalid markup and a second stop
  for anyone using a keyboard, announcing nothing the row does not already say.
  The row is the control; this is the state.
*/
export function Checkbox({
  checked,
  className,
}: {
  checked: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked
          ? "border-brand bg-brand text-white"
          : "border-input bg-transparent",
        className,
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}
