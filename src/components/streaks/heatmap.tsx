"use client";

import * as React from "react";
import {
  buildHeatmap,
  prettyDate,
  toKey,
  type HeatmapCell,
} from "@streakly/shared";
import { getColor } from "@streakly/shared";
import { cn } from "@/lib/utils";

interface HeatmapProps {
  dateKeys: string[];
  color: string;
  weeks?: number;
  cellSize?: number;
  gap?: number;
  showMonths?: boolean;
  /**
   * Size cells to fill the container's width instead of using `cellSize`.
   * Cards use it so the grid spans the card at every breakpoint.
   */
  fluid?: boolean;
  /** Right-hand footer content, e.g. a "History" hint on a clickable card heatmap. */
  action?: React.ReactNode;
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

/** Renders a goal's check-in heatmap from its date keys. */
export function Heatmap({
  dateKeys,
  color,
  weeks = 18,
  cellSize = 13,
  gap = 3,
  showMonths = true,
  fluid = false,
  action,
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

  // Check-ins inside the drawn window, for the screen-reader summary: the
  // grid is a wall of unlabeled cells that a screen reader cannot walk.
  const doneInWindow = React.useMemo(
    () => grid.flat().filter((cell) => !cell.inFuture && cell.count > 0).length,
    [grid],
  );

  const [hover, setHover] = React.useState<HeatmapCell | null>(null);

  const cellPx = cellSize;
  const step = cellPx + gap;
  const width = weeks * step;

  return (
    <div className={cn("relative", className)}>
      {showMonths && (
        <div
          className="relative mb-1 h-4 text-xs text-muted-foreground"
          style={{ width }}
          aria-hidden
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
      <div
        className={fluid ? "grid gap-[3px]" : "flex gap-[3px]"}
        style={fluid ? { gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` } : undefined}
        role="img"
        aria-label={`${doneInWindow} check-ins in the last ${weeks} weeks`}
      >
        {grid.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((cell) => {
              const isToday = cell.key === today;
              const isFuture = cell.inFuture;
              const on = cell.count > 0;
              return (
                <div
                  key={cell.key}
                  onMouseEnter={() => setHover(cell)}
                  onMouseLeave={() => setHover(null)}
                  className={cn(
                    "rounded-[3px] transition-colors",
                    isFuture
                      ? "bg-transparent"
                      : on
                        ? colorCfg.cellOn
                        : "bg-foreground/15 dark:bg-white/[0.13]",
                    // Today is outlined in the goal's own color, so it reads
                    // as "today" rather than as a focus or selection ring.
                    isToday &&
                      cn("outline-2 outline-offset-1 outline-current", colorCfg.text),
                  )}
                  style={fluid ? { aspectRatio: "1" } : { width: cellPx, height: cellPx }}
                  title={`${prettyDate(cell.key)}${on ? " — done" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex h-4 items-center gap-2 text-xs text-muted-foreground">
        <span>
          {hover
            ? `${prettyDate(hover.key)} — ${hover.count > 0 ? "done" : "not done"}`
            : `Last ${weeks} weeks`}
        </span>
        {action ? <span className="ml-auto">{action}</span> : null}
      </div>
    </div>
  );
}
