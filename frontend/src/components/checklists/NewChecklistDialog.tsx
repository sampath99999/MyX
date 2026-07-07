import { useState, type ReactNode } from "react";
import { Loader2, ListChecks } from "lucide-react";
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
import { api, ApiError, type Checklist } from "@/lib/api";
import { cn } from "@/lib/utils";

const EMOJIS = ["✅", "🌙", "☀️", "🚪", "🎒", "🛒", "🧹", "💊", "📋", "🚿", "🧘", "🐾"];

export default function NewChecklistDialog({
  onCreated,
  trigger,
}: {
  onCreated?: (checklist: Checklist) => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setName("");
    setEmoji("✅");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give this checklist a name.");
      return;
    }
    setLoading(true);
    try {
      const { checklist } = await api.createChecklist({ name: name.trim(), emoji });
      setOpen(false);
      reset();
      onCreated?.(checklist);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create checklist.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New checklist</DialogTitle>
          <DialogDescription>
            A reusable list you tick off and reset each time — like a morning routine.
          </DialogDescription>
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

          <div className="space-y-2">
            <Label htmlFor="checklist-name">Name</Label>
            <Input
              id="checklist-name"
              placeholder="e.g. Before bed, Morning routine, Travel packing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
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
                <ListChecks className="h-4 w-4" />
                Create checklist
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
