"use client";

import * as React from "react";
import {
  buildHeatmap,
  getColor,
  prettyDate,
  toKey,
  type HeatmapCell,
} from "@streakly/shared";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/plural";
import { useChangeCount } from "@/hooks/use-change-count";

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

/** The day under the pointer, as the footer reads it. */
interface HoveredDay {
  key: string;
  on: boolean;
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
  const countText = `${doneInWindow} ${plural(doneInWindow, "check-in")}`;

  const [hover, setHover] = React.useState<HoveredDay | null>(null);

  // Today's cell lands with a small pop when a check-in fills it while the
  // grid is on screen, never on page load.
  const landings = useChangeCount(dateKeys.includes(today), (on) => on);

  const step = cellSize + gap;
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
      <HeatmapGrid
        grid={grid}
        color={color}
        weeks={weeks}
        cellSize={cellSize}
        fluid={fluid}
        today={today}
        landings={landings}
        label={`${countText} in the last ${weeks} weeks`}
        onHover={setHover}
      />
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", action ? "mt-2.5 min-h-8 pb-2 shorter:mt-1.5 shorter:pb-0" : "sticky left-0 mt-2 h-4 w-fit")}>
        <span>
          {hover
            ? `${prettyDate(hover.key)} — ${hover.on ? "done" : "not done"}`
            : `${countText} · last ${weeks} weeks`}
        </span>
        {action ? <span className="ml-auto">{action}</span> : null}
      </div>
    </div>
  );
}

/**
 * Renders the grid of day cells. It is memoized apart from the footer, so
 * moving the pointer across the cells re-renders only the footer's label,
 * not every cell. One delegated listener reads the hovered day from the
 * cell's data attributes instead of two handlers per cell.
 */
const HeatmapGrid = React.memo(function HeatmapGrid({
  grid,
  color,
  weeks,
  cellSize,
  fluid,
  today,
  landings,
  label,
  onHover,
}: {
  grid: HeatmapCell[][];
  color: string;
  weeks: number;
  cellSize: number;
  fluid: boolean;
  today: string;
  landings: number;
  label: string;
  onHover: (day: HoveredDay | null) => void;
}) {
  const colorCfg = getColor(color);

  // The pointer over a gap between cells reads as no day, like leaving a cell.
  function handleOver(e: React.MouseEvent<HTMLDivElement>) {
    const cell = (e.target as HTMLElement).dataset;
    onHover(cell.key ? { key: cell.key, on: cell.on === "true" } : null);
  }

  return (
    <div
      className={fluid ? "grid gap-[3px]" : "flex gap-[3px]"}
      style={fluid ? { gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` } : undefined}
      role="img"
      aria-label={label}
      onMouseOver={handleOver}
      onMouseLeave={() => onHover(null)}
    >
      {grid.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-[3px]">
          {col.map((cell) => {
            const isToday = cell.key === today;
            const on = cell.count > 0;
            return (
              <div
                key={isToday ? `${cell.key}-${landings}` : cell.key}
                data-key={cell.key}
                data-on={on}
                className={cn(
                  "rounded-[var(--cell-radius)] transition-colors",
                  cell.inFuture
                    ? "bg-transparent"
                    : on
                      ? colorCfg.cellOn
                      : "bg-cell-empty",
                  // Today is outlined in the goal's own color, so it reads
                  // as "today" rather than as a focus or selection ring.
                  isToday &&
                    cn("outline-2 outline-offset-1 outline-current", colorCfg.text),
                  isToday && on && landings > 0 && "cell-land",
                )}
                style={fluid ? { aspectRatio: "1" } : { width: cellSize, height: cellSize }}
                title={`${prettyDate(cell.key)}${on ? " — done" : ""}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
});
