import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, type Memory } from "@/lib/api";
import { cn } from "@/lib/utils";

const EMOJIS = ["✨", "❤️", "🎉", "✈️", "📸", "🎓", "🏡", "👨‍👩‍👧", "🐾", "🌅", "🎂", "🙏"];

export default function NewMemoryDialog({
  memory,
  onSaved,
  trigger,
  open: controlledOpen,
  onOpenChange: onControlledChange,
}: {
  memory?: Memory;
  onSaved?: () => void;
  trigger?: ReactNode;
  /** Controlled open. Omit to let the dialog manage itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
/*
  `open`/`onOpenChange` are optional. Left out, the dialog owns its own state and
  is driven by its trigger, which is how every existing caller uses it. Passed
  in, the caller drives it and the trigger becomes optional — which is what lets
  the app-wide Add menu open this form on arrival (see lib/addIntent.ts) without
  every page growing a hidden button to click.
*/
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onControlledChange?.(next);
  };
  const [title, setTitle] = useState(memory?.title ?? "");
  const [emoji, setEmoji] = useState(memory?.emoji ?? "✨");
  const [date, setDate] = useState(memory?.occurred_on ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(memory?.note ?? "");
  const [tags, setTags] = useState(memory?.tags.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(memory?.title ?? "");
      setEmoji(memory?.emoji ?? "✨");
      setDate(memory?.occurred_on ?? new Date().toISOString().slice(0, 10));
      setNote(memory?.note ?? "");
      setTags(memory?.tags.join(", ") ?? "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Give this memory a title.");
      return;
    }
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    setLoading(true);
    try {
      if (memory) {
        await api.updateMemory(memory.id, {
          title: title.trim(),
          note,
          emoji,
          occurred_on: date || null,
          tags: tagList,
        });
      } else {
        await api.createMemory({
          title: title.trim(),
          note,
          emoji,
          occurred_on: date || null,
          tags: tagList,
        });
      }
      setOpen(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save memory.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{memory ? "Edit memory" : "New memory"}</DialogTitle>
          <DialogDescription>Jot down a moment worth keeping.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-all active:scale-90",
                    emoji === e
                      ? "border-primary/50 bg-primary/15"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="mem-title">Title</Label>
              <Input
                id="mem-title"
                placeholder="e.g. First trip to Goa"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="mem-date">Date</Label>
              <Input id="mem-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mem-note">Note</Label>
            <Textarea
              id="mem-note"
              placeholder="What happened? Who was there?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-28"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mem-tags">Tags (comma-separated)</Label>
            <Input
              id="mem-tags"
              placeholder="family, trip, funny"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {memory ? "Save changes" : "Save memory"}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
