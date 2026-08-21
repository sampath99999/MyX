import { useState } from "react";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/*
  A number field you can actually type in.

  The calculators used `<input type="number" value={someNumber}>` bound straight
  to state, which desyncs in a way that looks like the page is fighting you:
  type a "0" in front of "15" and the DOM holds "015", React parses it to 15,
  compares that against the 15 it already had, concludes nothing changed and
  never rewrites the field. The stray zero is now unremovable — backspacing it
  produces "15", which React also considers unchanged. Clearing the field
  entirely is worse: "" parses to NaN and the whole result goes to pieces.

  The fix is to stop pretending the input holds a number. While the field is
  focused it holds whatever string was typed; the parsed value is published
  upward as you go, and the string is normalised on blur. So "015" shows as
  "015" while you are editing it and settles to "15" when you leave.

  `type="text"` with `inputMode="decimal"` rather than `type="number"`, which
  also removes the spinner arrows nobody wants on a ₹15,000 field and stops the
  scroll wheel silently changing the value when you scroll past the page.
*/

export interface NumberFieldProps {
  id: string;
  label: string;
  /** Unit or derived hint, shown small to the right of the label. */
  suffix?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** When present the field renders as a segmented control instead. */
  options?: { value: number; label: string }[];
}

export default function NumberField({
  id,
  label,
  suffix,
  value,
  min,
  max,
  step,
  onChange,
  options,
}: NumberFieldProps) {
  /** Non-null only while the user is mid-edit. */
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(Math.max(n, min), max);

  /*
    A handful of inputs are really a choice from a short list — the GST slab,
    whether an amount includes tax, how often interest compounds. Those were
    sliders showing a bare "4", which meant the field said `0` when it meant
    "before GST". They get buttons instead.
  */
  if (options) {
    return (
      <div>
        <label className="text-sm font-medium">{label}</label>
        <Segmented
          className="mt-2 flex w-full [&>button]:flex-1"
          size="sm"
          value={String(value)}
          onChange={(v) => onChange(Number(v))}
          options={options.map((o) => ({ value: String(o.value), label: o.label }))}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>

      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => {
          // Digits, one decimal point, and nothing else — so a stray letter
          // cannot put the field into a state the slider disagrees with.
          const raw = e.target.value.replace(/[^\d.]/g, "");
          setDraft(raw);
          const parsed = Number(raw);
          // An empty or half-typed value ("." on its own) is left alone rather
          // than published as NaN; the last good number stays in effect.
          if (raw !== "" && Number.isFinite(parsed)) onChange(parsed);
        }}
        onBlur={() => {
          const parsed = Number(draft);
          if (draft === "" || !Number.isFinite(parsed)) {
            // Nothing usable was left behind — fall back to the current value.
            setDraft(null);
            return;
          }
          onChange(clamp(parsed));
          setDraft(null);
        }}
        className={cn(
          "tnum mt-2 h-11 w-full rounded-md border border-input bg-transparent px-3 text-lg font-semibold shadow-sm outline-none",
          "transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        )}
      />

      <input
        type="range"
        value={clamp(value)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          // The slider is authoritative the moment it is touched, so any draft
          // the text field was holding is discarded rather than fighting it.
          setDraft(null);
          onChange(Number(e.target.value));
        }}
        aria-label={`${label} slider`}
        /* See `.range` in index.css: the native control is 16px tall, which
           is not a target you can reliably hit on a phone. */
        className="range mt-1"
      />
    </div>
  );
}
