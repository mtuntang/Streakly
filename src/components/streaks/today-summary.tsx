"use client";

import * as React from "react";
import { cardCheckinState, getColor, type GoalDTO } from "@streakly/shared";
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

/**
 * Scrolls a goal's card into view, moves focus to its check-in button, and
 * gives the card a brief halo so the eye lands on the right one.
 */
function jumpToGoal(id: string) {
  const card = document.getElementById(`goal-${id}`);
  if (!card) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  card.querySelector<HTMLButtonElement>("[data-checkin]")?.focus({ preventScroll: true });
  card.classList.remove("card-spotlight");
  // Reading layout restarts the animation when the same chip is used twice.
  void card.offsetWidth;
  card.classList.add("card-spotlight");
  card.addEventListener("animationend", () => card.classList.remove("card-spotlight"), {
    once: true,
  });
}

/**
 * Renders the page's summary: the greeting, how many goals are done today
 * with the today ribbon (one pill per goal), the all-time numbers in a
 * quieter row beside it, and what is still due as chips that jump to
 * their card.
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
  const allDone = total > 0 && done === total;
  const now = new Date();
  // Goals resting today are not due, so they never count as left to do.
  const due = goals.filter(
    (g) => !g.stats.doneToday && cardCheckinState(g.schedule, g.stats, now).kind !== "rest",
  );
  const dayClear = total > 0 && due.length === 0;

  // Checking off the last goal due today plays the ribbon once. It is
  // derived during render, so loading a finished day stays still.
  const [shownClear, setShownClear] = React.useState(dayClear);
  const [finishes, setFinishes] = React.useState(0);
  if (dayClear !== shownClear) {
    setShownClear(dayClear);
    if (dayClear) setFinishes(finishes + 1);
  }

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
          <span
            className={cn(
              "font-display text-5xl font-semibold tracking-tight tabular-nums transition-colors duration-500",
              dayClear && "text-ring",
            )}
          >
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
              <dd className="mt-0.5 font-display text-sm font-medium tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* The today ribbon: one pill per goal, in card order, filled in the
          goal's own color once it is checked. */}
      <div
        key={finishes}
        className={cn("mt-4 flex gap-1.5", finishes > 0 && dayClear && "ribbon-complete")}
        role="progressbar"
        aria-label="Goals done today"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        {goals.map((g, i) => (
          <span
            key={g.id}
            title={`${g.name}: ${g.stats.doneToday ? "done" : "not done"}`}
            style={{ "--i": i } as React.CSSProperties}
            className={cn(
              "today-pill h-2 flex-1 rounded-full transition-colors duration-500 ease-out",
              // Empty pills are outlined at 3:1+ so they stay visible in sunlight.
              g.stats.doneToday
                ? cn("is-done", getColor(g.color).cellOn)
                : "ring-[1.5px] ring-inset ring-foreground/55",
            )}
          />
        ))}
      </div>

      {allDone ? (
        <p className="mt-2.5 text-sm text-muted-foreground">All done for today. See you tomorrow.</p>
      ) : due.length === 0 ? (
        <p className="mt-2.5 text-sm text-muted-foreground">Everything due today is done.</p>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted-foreground">Still to do</span>
          <ul className="contents">
            {due.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => jumpToGoal(g.id)}
                  className="inline-flex h-8 max-w-56 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-medium shadow-[var(--card-shadow)] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                  aria-label={`Go to ${g.name}`}
                >
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", getColor(g.color).cellOn)}
                    aria-hidden
                  />
                  <span className="truncate">{g.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
