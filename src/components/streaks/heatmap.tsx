"use client";

import * as React from "react";
import {
  buildHeatmap,
  prettyDate,
  toKey,
  type HeatmapCell,
} from "@/lib/streaks";
import { getColor } from "@/lib/goal-config";
import { cn } from "@/lib/utils";

interface HeatmapProps {
  dateKeys: string[];
  color: string;
  weeks?: number;
  cellSize?: number;
  gap?: number;
  showMonths?: boolean;
  className?: string;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function Heatmap({
  dateKeys,
  color,
  weeks = 18,
  cellSize = 13,
  gap = 3,
  showMonths = true,
  className,
}: HeatmapProps) {
  const grid = React.useMemo(
    () => buildHeatmap(dateKeys, weeks),
    [dateKeys, weeks],
  );
  const colorCfg = getColor(color);
  const today = toKey(new Date());

  // Month labels positioned above columns where the month changes.
  const monthLabels = React.useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    grid.forEach((col, ci) => {
      // Use the first day (Sunday) of each column for the label.
      const first = col[0];
      const m = first.date.getMonth();
      if (m !== lastMonth && ci > 0) {
        labels.push({ col: ci, label: MONTHS[m] });
        lastMonth = m;
      } else if (m !== lastMonth) {
        lastMonth = m;
      }
    });
    return labels;
  }, [grid]);

  const [hover, setHover] = React.useState<HeatmapCell | null>(null);

  const cellPx = cellSize;
  const step = cellPx + gap;
  const width = weeks * step;
  const height = 7 * step;

  return (
    <div className={cn("relative", className)}>
      {showMonths && (
        <div
          className="relative mb-1 h-3 text-[10px] text-muted-foreground"
          style={{ width }}
        >
          {monthLabels.map((m) => (
            <span
              key={`${m.col}-${m.label}`}
              className="absolute"
              style={{ left: m.col * step, top: 0 }}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-[3px]">
        {grid.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((cell) => {
              const isToday = cell.key === today;
              const isFuture = cell.inFuture;
              const on = cell.count > 0;
              return (
                <div
                  key={cell.key}
                  role="presentation"
                  onMouseEnter={() => setHover(cell)}
                  onMouseLeave={() => setHover(null)}
                  className={cn(
                    "rounded-[3px] transition-colors",
                    isFuture
                      ? "bg-transparent"
                      : on
                        ? colorCfg.cellOn
                        : "bg-muted/60 dark:bg-muted/40",
                    isToday && "ring-2 ring-offset-1 ring-offset-background ring-foreground/40",
                  )}
                  style={{ width: cellPx, height: cellPx }}
                  title={`${prettyDate(cell.key)}${on ? " — done" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex h-4 items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Less</span>
        <div className={cn("h-2.5 w-2.5 rounded-[2px] bg-muted/60")} />
        <div className={cn("h-2.5 w-2.5 rounded-[2px]", colorCfg.cellOn, "opacity-40")} />
        <div className={cn("h-2.5 w-2.5 rounded-[2px]", colorCfg.cellOn, "opacity-70")} />
        <div className={cn("h-2.5 w-2.5 rounded-[2px]", colorCfg.cellOn)} />
        <span>More</span>
        <span className="ml-auto hidden sm:inline">
          {hover
            ? `${prettyDate(hover.key)}${hover.count > 0 ? " — done" : " — not done"}`
            : `${dateKeys.length} check-ins`}
        </span>
      </div>
    </div>
  );
}
