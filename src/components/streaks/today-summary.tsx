"use client";

import { cardCheckinState, type GoalDTO } from "@streakly/shared";
import { cn } from "@/lib/utils";

/**
 * Returns the best value per streak unit, e.g. "12d · 3w". Weekly goals count
 * streaks in weeks, so their numbers are never mixed into a day maximum.
 */
function bestByUnit(goals: GoalDTO[], pick: (g: GoalDTO) => number): string {
  const best = (unit: "day" | "week") =>
    goals.filter((g) => g.stats.unit === unit).reduce((m, g) => Math.max(m, pick(g)), 0);
  const parts: string[] = [];
  if (goals.some((g) => g.stats.unit === "day")) parts.push(`${best("day")}d`);
  if (goals.some((g) => g.stats.unit === "week")) parts.push(`${best("week")}w`);
  return parts.length > 0 ? parts.join(" · ") : "0d";
}

/** Returns the line under the progress bar: what is still due today. */
function remainingMessage(goals: GoalDTO[], now: Date): string {
  const done = goals.filter((g) => g.stats.doneToday).length;
  if (done === goals.length) return "All done for today. See you tomorrow.";
  // Goals resting today are not due, so they never count as left to do.
  const due = goals.filter(
    (g) =>
      !g.stats.doneToday &&
      cardCheckinState(g.schedule, g.stats, now).kind !== "rest",
  );
  if (due.length === 0) return "Everything due today is done.";
  return `Still to do: ${due.map((g) => g.name).join(", ")}`;
}

/**
 * Renders the page's summary: the greeting, how many goals are done today
 * with one progress segment per goal, and the all-time numbers in a quieter
 * row beside it.
 */
export function TodaySummary({
  goals,
  greeting,
}: {
  goals: GoalDTO[];
  greeting: string;
}) {
  const total = goals.length;
  const done = goals.filter((g) => g.stats.doneToday).length;

  const secondary = [
    { label: "Streaks", value: goals.filter((g) => g.stats.active).length },
    { label: "Best now", value: bestByUnit(goals, (g) => g.stats.current) },
    { label: "Record", value: bestByUnit(goals, (g) => g.stats.longest) },
    { label: "Check-ins", value: goals.reduce((s, g) => s + g.stats.total, 0) },
  ];

  return (
    <section aria-labelledby="today-heading" className="mb-6">
      <h2
        id="today-heading"
        className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
      >
        {greeting}
      </h2>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <p className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight tabular-nums">
            {done}
          </span>
          <span className="text-base text-muted-foreground">
            of {total} done today
          </span>
        </p>

        <dl className="grid grid-cols-4 gap-x-6 text-left sm:flex sm:gap-x-8">
          {secondary.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div
        className="mt-4 flex gap-1"
        role="progressbar"
        aria-label="Goals done today"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        {goals.map((g, i) => (
          <span
            key={g.id}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-500 ease-out",
              i < done ? "bg-brand" : "bg-foreground/10",
            )}
          />
        ))}
      </div>
      <p className="mt-2 truncate text-sm text-muted-foreground">
        {remainingMessage(goals, new Date())}
      </p>
    </section>
  );
}
