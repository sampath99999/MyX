import { useState, type ReactNode } from "react";
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
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#a855f7"];

export default function NewFolderDialog({
  onCreated,
  trigger,
}: {
  onCreated?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Name the notebook.");
    setLoading(true);
    try {
      await api.createFolder(name.trim(), color);
      setOpen(false);
      setName("");
      setColor(COLORS[0]);
      setError(null);
      onCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create folder.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New notebook</DialogTitle>
          <DialogDescription>Group related notes together.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">Name</Label>
            <Input id="folder-name" placeholder="Work, Ideas, Journal…" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((cHex) => (
                <button
                  key={cHex}
                  type="button"
                  onClick={() => setColor(cHex)}
                  className={cn("h-7 w-7 rounded-full transition-transform active:scale-90", color === cHex && "ring-2 ring-offset-2 ring-offset-background")}
                  style={{ backgroundColor: cHex, ...(color === cHex ? { ["--tw-ring-color" as string]: cHex } : {}) }}
                />
              ))}
            </div>
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create notebook"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
