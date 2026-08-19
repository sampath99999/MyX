import { useCallback, useEffect, useState } from "react";
import { Sparkles, Plus, X, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api, formatMoney, type RecurringSuggestion } from "@/lib/api";

/*
  Bills the transactions already imply.

  After importing a bank statement the recurring ones are sitting right there in
  the data — rent on the 1st, the same subscription every month, the SIP. Asking
  the user to spot them and retype them is asking for work the data has already
  done. The detection is in the backend (lib/detect.ts); this is the offer.

  Two rules for something that volunteers suggestions: it must be easy to say no
  (dismissing is permanent, and one click), and it must never claim more than it
  knows — hence the "seen N times" line rather than a bare assertion.
*/

const CADENCE = (s: RecurringSuggestion) => {
  const unit = { weekly: "week", monthly: "month", yearly: "year" }[s.frequency];
  return s.interval === 1 ? `every ${unit}` : `every ${s.interval} ${unit}s`;
};

export default function DetectedRecurring({ onAdded }: { onAdded: () => void }) {
  const [suggestions, setSuggestions] = useState<RecurringSuggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.recurringSuggestions();
      setSuggestions(res.suggestions);
    } catch {
      // A suggestion panel that fails has nothing to say. It is an extra, and
      // an error box here would be louder than the feature is important.
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function accept(s: RecurringSuggestion) {
    setBusy(s.signature);
    try {
      await api.createRecurring({
        name: s.name,
        type: s.type,
        amount: s.amount,
        category: s.category,
        frequency: s.frequency,
        interval: s.interval,
        next_due: s.next_due,
      });
      /*
        Dismissed as well as created. The rule now exists, so the server would
        filter this signature out anyway — but only after a round trip, and
        recording it means a later edit to the rule's name cannot make the same
        suggestion reappear.
      */
      await api.dismissRecurringSuggestion(s.signature).catch(() => {});
      setSuggestions((list) => list.filter((x) => x.signature !== s.signature));
      onAdded();
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(s: RecurringSuggestion) {
    // Optimistic: this is the "no thanks" button, and making someone wait to be
    // rid of a suggestion is its own small insult.
    setSuggestions((list) => list.filter((x) => x.signature !== s.signature));
    await api.dismissRecurringSuggestion(s.signature).catch(() => {});
  }

  if (suggestions.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Found in your transactions</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        These look like they repeat. Add one and MyX will track it as a bill.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {suggestions.map((s) => (
          <Card
            key={s.signature}
            className="glass flex items-center gap-3 border-dashed p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMoney(s.amount)} {CADENCE(s)} · {s.category} · seen {s.occurrences} times
              </p>
              <p className="text-xs text-muted-foreground/70">Next due {s.next_due}</p>
            </div>

            <button
              onClick={() => accept(s)}
              disabled={busy === s.signature}
              title="Add as a recurring bill"
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary/15 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
            >
              {busy === s.signature ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add
            </button>
            <button
              onClick={() => dismiss(s)}
              title="Not a bill — stop suggesting this"
              aria-label={`Dismiss ${s.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </Card>
        ))}
      </div>
    </section>
  );
}
