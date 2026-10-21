"use client";

import * as React from "react";
import { CircleAlert, Flame, Pencil, X as XIcon } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  cadenceLabel,
  cardCheckinState,
  fromKey,
  getColor,
  isScheduledDay,
  lastNDays,
  prettyDate,
  todayKey,
  weekdayShort,
  type GoalDTO,
} from "@streakly/shared";
import { GoalIcon } from "./goal-icon";
import { Heatmap } from "./heatmap";
import { goalStatus, TONE_TEXT } from "./goal-status";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/plural";

interface GoalDetailSheetProps {
  goal: GoalDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (goal: GoalDTO) => void;
}

/**
 * Renders the side sheet with a goal's history. It reads top to bottom
 * from now to long ago: the current streak and what today needs, then
 * the last 14 days, then the half-year heatmap. Memoized, so a closed
 * sheet does not re-render on every list change.
 */
export const GoalDetailSheet = React.memo(function GoalDetailSheet({
  goal,
  open,
  onOpenChange,
  onEdit,
}: GoalDetailSheetProps) {
  if (!goal) return null;
  const colorCfg = getColor(goal.color);
  const now = new Date();
  const status = goalStatus(goal, cardCheckinState(goal.schedule, goal.stats, now), now);

  const isWeekly = goal.stats.unit === "week";
  const unitShort = isWeekly ? "w" : "d";
  const unitLong = isWeekly ? "week" : "day";

  // The all-time numbers beside the current streak. Weekly goals swap the
  // total for this week's quota, which is what their card counts in.
  const allTime = [
    { label: "Best", value: `${goal.stats.longest}${unitShort}` },
    isWeekly
      ? { label: "This week", value: `${goal.stats.week?.done ?? 0}/${goal.stats.week?.quota ?? 0}` }
      : { label: "Check-ins", value: String(goal.stats.total) },
    { label: isWeekly ? "4-week rate" : "30-day rate", value: `${goal.stats.rate30}%` },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        hideClose
        // Opens on the sheet itself rather than on Edit: focus moves into
        // the sheet for screen readers, and Edit doesn't open with a focus
        // ring the user never asked for.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        className="w-full gap-0 overflow-y-auto overscroll-contain outline-none px-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:max-w-xl sm:px-7"
      >
        {/* On phones the header stays pinned while the history scrolls, so
            Close and Edit are always one tap away. */}
        <SheetHeader className="z-10 border-b border-border/60 bg-inherit px-0 pt-5 pb-4 max-sm:sticky max-sm:top-0 max-sm:-mx-5 max-sm:px-5 max-sm:pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                  colorCfg.bgSoft,
                  colorCfg.text,
                )}
              >
                <GoalIcon name={goal.icon} className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-xl leading-tight">{goal.name}</SheetTitle>
                <Badge variant="outline" className="mt-1.5 w-fit text-[11px] font-medium">
                  {cadenceLabel(goal.schedule)}
                </Badge>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(goal)}
                className="tap-44 h-10 gap-1.5 rounded-full px-4 max-[379px]:w-10 max-[379px]:px-0 sm:h-8 sm:px-3"
                aria-label={`Edit ${goal.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
                {/* Under 380px the label is read out but not shown, so a
                    long goal name keeps room for two lines, not three. */}
                <span className="max-[379px]:sr-only" aria-hidden>
                  Edit
                </span>
              </Button>
              <SheetClose className="tap-44 ring-offset-background focus:ring-ring inline-flex size-10 items-center sm:size-8 justify-center rounded-full border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
                <XIcon className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </div>
          </div>
          {goal.description ? (
            <SheetDescription className="mt-3 max-w-prose">{goal.description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">History for {goal.name}</SheetDescription>
          )}
        </SheetHeader>

        {/* Now: the streak and what today needs, then the all-time numbers. */}
        <section aria-label="Current streak" className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <Flame
                className={cn(
                  "h-7 w-7 shrink-0",
                  goal.stats.current > 0 ? colorCfg.text : "text-muted-foreground/50",
                )}
                aria-hidden
              />
              <span className="font-display text-5xl font-semibold leading-none tracking-tight tabular-nums">
                {goal.stats.current}
              </span>
              <span className="self-end pb-1 text-base text-muted-foreground">
                {plural(goal.stats.current, unitLong)}
              </span>
            </p>
            <p className={cn("mt-2 flex items-center gap-1 text-sm", TONE_TEXT[status.tone])}>
              {status.tone === "risk" ? (
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
              ) : null}
              {status.text}
            </p>
          </div>
          <dl className="flex gap-x-7">
            {allTime.map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <RecentDays goal={goal} />

        {/* Long-term: the half-year heatmap. */}
        <section aria-labelledby="activity-heading" className="mt-9">
          <h3 id="activity-heading" className="text-sm font-semibold">
            Last 6 months
          </h3>
          {/* On narrow screens the grid scrolls sideways; it opens on the
              newest weeks, which sit at the right end. */}
          <div
            ref={(el) => {
              if (el) el.scrollLeft = el.scrollWidth;
            }}
            className="mt-3 overflow-x-auto rounded-xl bg-muted/50 p-4"
          >
            <Heatmap
              dateKeys={goal.checkIns.map((c) => c.date)}
              color={goal.color}
              weeks={26}
              cellSize={13}
              showMonths
              // As wide as the grid, so the count line underneath can stay
              // pinned to the visible left edge across the whole scroll.
              className="w-max"
            />
          </div>
        </section>
      </SheetContent>
    </Sheet>
  );
});

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Returns a compact date range, e.g. "Oct 7 – 13" or "Sep 28 – Oct 4". */
function rangeLabel(fromKeyStr: string, toKeyStr: string): string {
  const a = fromKey(fromKeyStr);
  const b = fromKey(toKeyStr);
  const start = `${MONTH_SHORT[a.getMonth()]} ${a.getDate()}`;
  return a.getMonth() === b.getMonth()
    ? `${start} – ${b.getDate()}`
    : `${start} – ${MONTH_SHORT[b.getMonth()]} ${b.getDate()}`;
}

/**
 * Renders the last 14 days, oldest first like the heatmap, as two rows of
 * seven, each headed by its date range so every day reads as an exact
 * date: weekday above, day of the month in the circle. Each day says done, missed, or rest (a day the cadence
 * doesn't schedule), so a gap on a rest day never reads as a miss.
 */
function RecentDays({ goal }: { goal: GoalDTO }) {
  const colorCfg = getColor(goal.color);
  const doneSet = new Set(goal.checkIns.map((c) => c.date));
  const today = todayKey();
  const days = lastNDays(14).map((key) => {
    const weekday = fromKey(key).getDay();
    const done = doneSet.has(key);
    const scheduled = isScheduledDay(goal.schedule, weekday);
    return { key, weekday, done, rest: !scheduled && !done, isToday: key === today };
  });

  const doneCount = days.filter((d) => d.done).length;
  const scheduledCount = days.filter((d) => isScheduledDay(goal.schedule, d.weekday)).length;
  // Weekly goals have no missed days, only a count; the others compare
  // against the days their cadence asked for.
  const summary =
    goal.schedule?.type === "weekly"
      ? `${doneCount} ${plural(doneCount, "check-in")}`
      : scheduledCount === 14
        ? `${doneCount} of 14 days`
        : `${days.filter((d) => d.done && isScheduledDay(goal.schedule, d.weekday)).length} of ${scheduledCount} scheduled days`;

  return (
    <section aria-labelledby="recent-heading" className="mt-9">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="recent-heading" className="text-sm font-semibold">
          Last 14 days
        </h3>
        <p className="text-sm text-muted-foreground tabular-nums">{summary}</p>
      </div>
      <div className="mt-3 space-y-4">
        {[days.slice(0, 7), days.slice(7)].map((week) => (
          <div key={week[0].key}>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {rangeLabel(week[0].key, week[week.length - 1].key)}
            </p>
            <ol className="grid grid-cols-7 gap-1">
              {week.map((d) => (
                <li
                  key={d.key}
                  title={prettyDate(d.key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg py-1.5",
                    d.isToday && "bg-muted/70",
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] leading-none",
                      d.isToday ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {weekdayShort(d.weekday)}
                  </span>
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                      d.done
                        ? colorCfg.fill
                        : d.rest
                          ? "border border-dashed border-foreground/30 font-medium text-muted-foreground"
                          : "font-medium text-muted-foreground ring-[1.5px] ring-inset ring-foreground/25",
                    )}
                    aria-hidden
                  >
                    {fromKey(d.key).getDate()}
                  </span>
                  <span
                    className={cn(
                      "h-3 text-[11px] leading-3",
                      d.isToday ? "font-semibold text-foreground" : "text-transparent",
                    )}
                    aria-hidden
                  >
                    {d.isToday ? "Today" : ""}
                  </span>
                  <span className="sr-only">
                    {prettyDate(d.key)}
                    {d.isToday ? " (today)" : ""}: {d.done ? "done" : d.rest ? "rest day" : "not done"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full", colorCfg.cellOn)} /> Done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full ring-[1.5px] ring-inset ring-foreground/25" /> Not done
        </span>
        {goal.schedule?.type === "weekdays" ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-foreground/40" /> Rest day
          </span>
        ) : null}
      </p>
    </section>
  );
}
