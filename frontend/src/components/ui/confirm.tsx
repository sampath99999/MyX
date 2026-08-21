import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/*
  Destructive confirmation.

  Half the delete buttons in the app called window.confirm(), which is a native
  modal that looks like a 2004 browser alert, blocks the whole tab, and cannot
  say what is about to be deleted. The other half deleted immediately with no
  confirmation at all.

  Rule now: anything recoverable (a transaction, a task) deletes immediately and
  offers Undo in the toast — an undo is faster than a confirm and safer, because
  a confirm is dismissed reflexively. Anything genuinely unrecoverable (an
  account, a whole checklist) comes through here.
*/

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy || loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            loading={busy || loading}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `const confirm = useConfirm()` → `if (await confirm({ title })) { … }`.
 *
 * Reads like window.confirm at the call site, which is the point: replacing it
 * should not mean restructuring the handler around a piece of dialog state.
 */
export function useConfirm() {
  const [state, setState] = React.useState<{
    props: Omit<React.ComponentProps<typeof ConfirmDialog>, "open" | "onOpenChange" | "onConfirm">;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = React.useCallback(
    (props: Omit<React.ComponentProps<typeof ConfirmDialog>, "open" | "onOpenChange" | "onConfirm">) =>
      new Promise<boolean>((resolve) => setState({ props, resolve })),
    [],
  );

  const element = state ? (
    <ConfirmDialog
      {...state.props}
      open
      onOpenChange={(open) => {
        if (!open) {
          state.resolve(false);
          setState(null);
        }
      }}
      onConfirm={() => {
        state.resolve(true);
        setState(null);
      }}
    />
  ) : null;

  return { confirm, confirmDialog: element };
}
