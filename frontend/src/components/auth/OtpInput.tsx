import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/*
  Six boxes rather than one field with letter-spacing.

  The old code field was a single input with `tracking-[0.5em]`, which looks
  like six boxes until you use it: there is no indication of how many digits are
  expected, the caret sits in the wrong place because the spacing is applied
  after the glyph, and a half-entered code gives no sense of progress. Separate
  boxes say "six" without a word of instruction.

  What makes this worth the extra code is the paste path. Most people arrive
  here having copied the code out of the mail app, and a naive six-input
  component drops five of the six characters. `onPaste` is handled explicitly,
  and a browser autofilling `one-time-code` into the first box is treated as the
  same event, because that is what it looks like from here.
*/

const LENGTH = 6;

export default function OtpInput({
  value,
  onChange,
  disabled,
  invalid,
  autoFocus,
  focusSignal,
}: {
  /** Digits only, up to six. Shorter means partially entered. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /**
   * Bumped by the caller to put the caret back in the first box — after a wrong
   * code is cleared, or a fresh one is sent. Without it, rejecting a code left
   * six empty boxes and no focus anywhere, so the next attempt began with a
   * hunt for where to click.
   */
  focusSignal?: number;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focus = (i: number) => refs.current[Math.min(Math.max(i, 0), LENGTH - 1)]?.focus();

  useEffect(() => {
    if (focusSignal) refs.current[0]?.focus();
  }, [focusSignal]);

  /** Overwrite from `start` with whatever digits arrived, then park the caret. */
  function fill(start: number, digits: string) {
    if (!digits) return;
    const slots = Array.from({ length: LENGTH }, (_, k) => value[k] ?? "");
    for (let k = 0; k < digits.length && start + k < LENGTH; k += 1) {
      slots[start + k] = digits[k];
    }
    onChange(slots.join(""));
    focus(start + digits.length);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        // Clear this box and stay — deleting the digit you are looking at.
        onChange(value.slice(0, i) + value.slice(i + 1));
        return;
      }
      // Already empty: step back and take that one with it.
      onChange(value.slice(0, Math.max(i - 1, 0)) + value.slice(i));
      focus(i - 1);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!digits) return;
    e.preventDefault();
    onChange(digits);
    focus(digits.length);
  }

  return (
    <div className="flex gap-2 sm:gap-2.5">
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          // A single field split six ways: only the first box advertises
          // `one-time-code`, or Safari offers the same code six times over.
          autoComplete={i === 0 ? "one-time-code" : "off"}
          inputMode="numeric"
          // Not `maxLength={1}`: an autofill drops the whole code into the first
          // box, and a cap would silently throw away five digits of it.
          value={value[i] ?? ""}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => fill(i, e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => onKeyDown(e, i)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "tnum h-14 min-w-0 flex-1 rounded-lg border bg-transparent text-center text-xl font-semibold shadow-sm outline-none",
            "transition-[border-color,box-shadow,background-color] disabled:opacity-50",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
            invalid ? "border-destructive/50 bg-destructive/[0.06]" : "border-input",
          )}
        />
      ))}
    </div>
  );
}
