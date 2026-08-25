import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ListChecks,
  Brain,
  StickyNote,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addLink } from "@/lib/addIntent";

/*
  What do you want to add?

  The Add button used to go straight to a transaction form, which was right when
  Money was most of the app and is not any more: there are six things worth
  recording now and only one of them was reachable from the button labelled Add.

  It is a chooser rather than a menu of forms because each module's add form
  belongs to its own screen — it needs that screen's spaces, notebooks and
  categories loaded to be useful. So this navigates and asks the destination to
  open its own form (see lib/addIntent.ts), which also means you land somewhere
  you can carry on working instead of being dropped back where you started.

  Ordered by how often each is actually used, not alphabetically. The first item
  is where the thumb already is.
*/

interface AddTarget {
  label: string;
  hint: string;
  icon: typeof Wallet;
  path: string;
}

export const ADD_TARGETS: AddTarget[] = [
  { label: "Transaction", hint: "Money in or out", icon: Wallet, path: "/money/transactions" },
  { label: "Task", hint: "Something to do", icon: CheckCircle2, path: "/tasks" },
  { label: "Meal", hint: "What you ate", icon: UtensilsCrossed, path: "/meals" },
  { label: "Note", hint: "Write something down", icon: StickyNote, path: "/notes" },
  { label: "Memory", hint: "Worth keeping", icon: Brain, path: "/memories" },
  { label: "Checklist", hint: "A list you reuse", icon: ListChecks, path: "/checklists" },
];

export default function AddMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  function choose(target: AddTarget) {
    onOpenChange(false);
    navigate(addLink(target.path));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add</DialogTitle>
          <DialogDescription>What would you like to record?</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {ADD_TARGETS.map((target) => (
            <button
              key={target.label}
              type="button"
              onClick={() => choose(target)}
              className="flex items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                <target.icon className="size-4 text-muted-foreground" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{target.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{target.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
