"use client";

import * as React from "react";
import {
  Flame,
  Trophy,
  CalendarCheck,
  Target,
  Pencil,
  X as XIcon,
} from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getColor, type GoalDTO } from "@streakly/shared";
import { cadenceLabel } from "@streakly/shared";
import { GoalIcon } from "./goal-icon";
import { Heatmap } from "./heatmap";
import { lastNDays, prettyDate } from "@streakly/shared";
import { cn } from "@/lib/utils";

interface GoalDetailSheetProps {
  goal: GoalDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (goal: GoalDTO) => void;
}

export function GoalDetailSheet({
  goal,
  open,
  onOpenChange,
  onEdit,
}: GoalDetailSheetProps) {
  if (!goal) return null;
  const colorCfg = getColor(goal.color);

  const last30 = lastNDays(30);
  const doneSet = new Set(goal.checkIns.map((c) => c.date));
  const doneLast30 = last30.filter((d) => doneSet.has(d)).length;
  const rate30 = Math.round((doneLast30 / 30) * 100);

  const recent = lastNDays(14).reverse();

  const isWeekly = goal.stats.unit === "week";
  const unitSuffix = isWeekly ? "w" : "d";
  const stats = isWeekly
    ? [
        {
          label: "Current streak",
          value: `${goal.stats.current}${unitSuffix}`,
          icon: Flame,
          highlight: goal.stats.current > 0,
        },
        { label: "Longest streak", value: `${goal.stats.longest}${unitSuffix}`, icon: Trophy },
        {
          label: "This week",
          value: `${goal.stats.week?.done ?? 0}/${goal.stats.week?.quota ?? 0}`,
          icon: CalendarCheck,
        },
        { label: "30-day rate", value: `${rate30}%`, icon: Target },
      ]
    : [
        {
          label: "Current streak",
          value: `${goal.stats.current}${unitSuffix}`,
          icon: Flame,
          highlight: goal.stats.current > 0,
        },
        { label: "Longest streak", value: `${goal.stats.longest}${unitSuffix}`, icon: Trophy },
        { label: "Total check-ins", value: goal.stats.total, icon: CalendarCheck },
        { label: "30-day rate", value: `${rate30}%`, icon: Target },
      ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        hideClose
        className="w-full overflow-y-auto px-5 pb-8 sm:max-w-2xl sm:px-7"
      >
        <SheetHeader className="border-b border-border/60 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3 pr-1">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                  colorCfg.bgSoft,
                  colorCfg.text,
                )}
              >
                <GoalIcon name={goal.icon} className="h-6 w-6" />
              </div>
              <div>
                <SheetTitle className="text-xl">{goal.name}</SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {cadenceLabel(goal.schedule)}
                </p>
                {goal.description ? (
                  <SheetDescription className="mt-1">
                    {goal.description}
                  </SheetDescription>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(goal)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <SheetClose className="ring-offset-background focus:ring-ring inline-flex h-8 w-8 items-center justify-center rounded-full border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
                <XIcon className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-7">
          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className={cn(
                  "min-w-0 rounded-xl border px-4 pb-3.5 pt-4 shadow-sm transition-colors",
                  s.highlight
                    ? cn(colorCfg.border, colorCfg.bgSoft)
                    : "border-border bg-muted/30",
                )}
              >
                <s.icon
                  className={cn(
                    "h-4 w-4",
                    s.highlight ? colorCfg.text : "text-muted-foreground",
                  )}
                />
                <div className="mt-2 text-2xl font-bold tabular-nums">
                  {s.value}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Full heatmap */}
          <div>
            <h4 className="mb-2 text-sm font-medium">Activity</h4>
            <div className="overflow-x-auto rounded-xl border border-border/70 p-4">
              <Heatmap
                dateKeys={goal.checkIns.map((c) => c.date)}
                color={goal.color}
                weeks={26}
                cellSize={13}
                showMonths
              />
            </div>
          </div>

          {/* Recent days */}
          <div>
            <h4 className="mb-2 text-sm font-medium">Last 14 days</h4>
            <div className="grid grid-cols-7 gap-1.5">
              {recent.map((key) => {
                const done = doneSet.has(key);
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2 text-center",
                      done
                        ? cn(colorCfg.border, colorCfg.bgSoft)
                        : "border-border bg-muted/30",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
                        done
                          ? cn(colorCfg.bg, "text-white")
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {done ? "✓" : "·"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {prettyDate(key).split(",")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
