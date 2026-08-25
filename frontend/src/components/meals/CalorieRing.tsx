import { cn } from "@/lib/utils";
import type { Macros } from "@/lib/api";

/*
  The day at a glance: one ring and three bars.

  The ring shows what is *left*, not what has been eaten. That choice is the
  whole point of the component. "1,240 eaten" is a fact you do nothing with;
  "760 left" is the number that decides what dinner looks like, and it is what
  someone opens the app at 8pm to find out.

  Over target is shown as over target — red, negative, and stated. A tracker
  that clamps at zero and says "0 remaining" whether you are on the line or 900
  past it has stopped being a measuring instrument.
*/

const SIZE = 168;
const STROKE = 13;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ fraction, over }: { fraction: number; over: boolean }) {
  // The arc stops at full even when intake does not, because a ring that wraps
  // past its own start reads as "nearly none left" at exactly the wrong moment.
  const shown = Math.max(0, Math.min(fraction, 1));

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="-rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-muted/40"
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - shown)}
        className={cn(
          "transition-[stroke-dashoffset] duration-500",
          over ? "stroke-destructive" : "stroke-primary",
        )}
      />
    </svg>
  );
}

function MacroBar({
  label,
  eaten,
  target,
  tone,
}: {
  label: string;
  eaten: number;
  target: number;
  tone: string;
}) {
  const fraction = target > 0 ? eaten / target : 0;
  const over = fraction > 1;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="tnum text-xs">
          <span className={cn("font-semibold", over && "text-destructive")}>
            {Math.round(eaten)}
          </span>
          <span className="text-muted-foreground"> / {Math.round(target)} g</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", over ? "bg-destructive" : tone)}
          style={{ width: `${Math.max(0, Math.min(fraction, 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function CalorieRing({
  totals,
  targets,
  remaining,
}: {
  totals: Macros;
  targets: Macros;
  remaining: Macros;
}) {
  const over = remaining.kcal < 0;
  const fraction = targets.kcal > 0 ? totals.kcal / targets.kcal : 0;

  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-border/60 p-6 sm:flex-row sm:gap-8">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <ProgressRing fraction={fraction} over={over} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "tnum text-3xl font-semibold tracking-tight",
              over && "text-destructive",
            )}
          >
            {Math.abs(remaining.kcal).toLocaleString("en-IN")}
          </span>
          <span className="mt-0.5 text-xs font-medium text-muted-foreground">
            {over ? "over" : "left"}
          </span>
        </div>
      </div>

      <div className="w-full min-w-0 flex-1 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="tnum text-xl font-semibold">
              {totals.kcal.toLocaleString("en-IN")}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                of {targets.kcal.toLocaleString("en-IN")} kcal
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <MacroBar
            label="Protein"
            eaten={totals.protein}
            target={targets.protein}
            tone="bg-emerald-500"
          />
          <MacroBar label="Carbs" eaten={totals.carbs} target={targets.carbs} tone="bg-sky-500" />
          <MacroBar label="Fat" eaten={totals.fat} target={targets.fat} tone="bg-amber-500" />
        </div>
      </div>
    </div>
  );
}
