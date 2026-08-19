import { useRef, useState, type ReactNode } from "react";
import { Upload, Loader2, FileWarning, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api, ApiError, formatMoney } from "@/lib/api";
import { parseStatement, guessCategory, type ParsedRow } from "@/lib/csv";

/*
  Import a bank statement.

  The file is read and parsed in the browser and never uploaded — only the rows
  the user keeps are sent, as ordinary transactions. That is worth being
  deliberate about: a statement is the most sensitive file most people own, and
  nothing about this feature requires a server to see it.

  Everything is reviewed before anything is written. Bank exports are messy
  enough that a silent import would be a great way to corrupt a year of data.
*/

interface Reviewable extends ParsedRow {
  category: string;
  include: boolean;
}

const MAX_ROWS = 500;

export default function ImportStatementDialog({
  onImported,
  trigger,
}: {
  onImported?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Reviewable[]>([]);
  const [skipped, setSkipped] = useState<{ line: number; reason: string }[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setRows([]);
    setSkipped([]);
    setFileName("");
    setError(null);
    setImported(null);
  }

  async function onFile(file: File) {
    setError(null);
    setImported(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const result = parseStatement(text);

      if (result.rows.length === 0) {
        setRows([]);
        setSkipped(result.skipped);
        setError(
          "No transactions could be read from that file. It may not be a CSV export, or the columns may be named unusually.",
        );
        return;
      }

      setRows(
        result.rows.slice(0, MAX_ROWS).map((r) => ({
          ...r,
          category: guessCategory(r.description, r.type ?? "expense"),
          include: true,
        })),
      );
      setSkipped(result.skipped);
    } catch {
      setError("Could not read that file.");
    }
  }

  async function onImport() {
    const keep = rows.filter((r) => r.include);
    if (keep.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const res = await api.importTransactions(
        keep.map((r) => ({
          type: r.type ?? "expense",
          amount: r.amount ?? 0,
          category: r.category,
          note: r.description || undefined,
          occurred_on: r.date ?? "",
        })),
      );
      setImported(res.imported);
      onImported?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const keeping = rows.filter((r) => r.include);
  const totalIn = keeping.filter((r) => r.type === "income").reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalOut = keeping.filter((r) => r.type === "expense").reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import a bank statement</DialogTitle>
          <DialogDescription>
            The file is read in your browser and never uploaded — only the rows you keep are saved.
          </DialogDescription>
        </DialogHeader>

        {imported !== null ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-6 w-6 text-emerald-300" />
            </div>
            <p className="text-lg font-semibold">
              {imported} transaction{imported === 1 ? "" : "s"} imported
            </p>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="space-y-4">
            <button
              onClick={() => fileInput.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 transition-colors hover:border-primary/50"
            >
              <Upload className="h-7 w-7 text-primary" />
              <span className="font-medium">Choose a CSV file</span>
              <span className="max-w-sm text-center text-xs text-muted-foreground">
                Export "statement as CSV" from your bank. HDFC, ICICI, SBI, Axis and Kotak layouts
                are all understood — columns are detected automatically.
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
                // Reset, so choosing the same file twice still fires a change.
                e.target.value = "";
              }}
            />
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {fileName} · {keeping.length} of {rows.length} selected
              </span>
              <span className="tabular-nums">
                <span className="text-emerald-300">+{formatMoney(totalIn)}</span>{" "}
                <span className="text-muted-foreground">/</span>{" "}
                <span className="text-rose-300">−{formatMoney(totalOut)}</span>
              </span>
            </div>

            {skipped.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-xs text-amber-200">
                <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {skipped.length} line{skipped.length === 1 ? "" : "s"} skipped (headers, balances
                  or unreadable rows) — lines {skipped.slice(0, 8).map((s) => s.line).join(", ")}
                  {skipped.length > 8 ? "…" : ""}
                </span>
              </div>
            )}

            <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-medium">
                      <input
                        type="checkbox"
                        checked={keeping.length === rows.length}
                        onChange={(e) =>
                          setRows((prev) => prev.map((r) => ({ ...r, include: e.target.checked })))
                        }
                        className="h-4 w-4 accent-primary"
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.line}
                      className={`border-b border-border/30 last:border-0 ${
                        r.include ? "" : "opacity-40"
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((row, j) =>
                                j === i ? { ...row, include: e.target.checked } : row,
                              ),
                            )
                          }
                          className="h-4 w-4 accent-primary"
                          aria-label={`Include ${r.description}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                        {r.date}
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-1.5" title={r.description}>
                        {r.description || "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={r.category}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((row, j) =>
                                j === i ? { ...row, category: e.target.value } : row,
                              ),
                            )
                          }
                          className="w-28 rounded border border-input bg-transparent px-2 py-1 text-xs outline-none focus:border-ring"
                        />
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums ${
                          r.type === "income" ? "text-emerald-300" : "text-foreground/80"
                        }`}
                      >
                        {r.type === "income" ? "+" : "−"}
                        {formatMoney(r.amount ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={reset}>
                Choose another file
              </Button>
              <Button className="flex-1" onClick={onImport} disabled={busy || keeping.length === 0}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Import ${keeping.length} transaction${keeping.length === 1 ? "" : "s"}`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
