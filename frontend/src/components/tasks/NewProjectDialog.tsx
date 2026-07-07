import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
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
import { api, ApiError, type Space } from "@/lib/api";
import { cn } from "@/lib/utils";

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#a855f7"];

export default function NewProjectDialog({
  spaces,
  defaultSpaceId,
  onCreated,
  trigger,
}: {
  spaces: Space[];
  defaultSpaceId?: number;
  onCreated?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [spaceId, setSpaceId] = useState<number | undefined>(defaultSpaceId);
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setSpaceId(defaultSpaceId ?? spaces[0]?.id);
      setColor(COLORS[0]);
      setError(null);
    }
  }, [open, defaultSpaceId, spaces]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the project a name.");
    if (!spaceId) return setError("Pick a space.");
    setLoading(true);
    try {
      await api.createProject({ space_id: spaceId, name: name.trim(), color });
      setOpen(false);
      onCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create project.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Group related tasks under a project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              placeholder="Client Website"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Space</Label>
            <div className="flex flex-wrap gap-1.5">
              {spaces.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSpaceId(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors",
                    spaceId === s.id
                      ? "border-primary/40 bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <span>{s.icon}</span>
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((cHex) => (
                <button
                  key={cHex}
                  type="button"
                  onClick={() => setColor(cHex)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-transform active:scale-90",
                    color === cHex ? "ring-2 ring-offset-2 ring-offset-background" : "",
                  )}
                  style={{ backgroundColor: cHex, ...(color === cHex ? { ["--tw-ring-color" as string]: cHex } : {}) }}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create project"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
