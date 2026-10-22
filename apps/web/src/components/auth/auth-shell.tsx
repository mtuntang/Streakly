import { Flame } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

const WEEKS = 24;
const STREAK_WEEKS = 5;

/**
 * Returns whether a cell of the decorative heatmap is checked. The pattern
 * is fixed (no randomness, so server and client render the same markup):
 * patchy weeks that slowly fill in, a missed day, then an unbroken run of
 * STREAK_WEEKS weeks, which is the story the product tells.
 */
function isOn(week: number, day: number): boolean {
  const streakStart = WEEKS - STREAK_WEEKS;
  if (week >= streakStart) return true;
  // The day before the streak began was missed: the run starts after a break.
  if (week === streakStart - 1 && day === 6) return false;
  const density = 2 + Math.floor((week / streakStart) * 4);
  return (week * 37 + day * 11 + week * day) % 10 < density;
}

/** Renders the brand panel's heatmap: a habit that became a streak. */
function BrandHeatmap() {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: WEEKS }, (_, week) => (
        <div key={week} className="flex flex-col gap-1">
          {Array.from({ length: 7 }, (_, day) => {
            const isToday = week === WEEKS - 1 && day === 6;
            return (
              <span
                key={day}
                className={cn(
                  "size-3.5 rounded-[3px]",
                  isOn(week, day) ? "bg-orange-500" : "bg-foreground/10",
                  isToday && "outline-2 outline-offset-1 outline-orange-500",
                )}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Lays out the signed-out pages: sign-in, sign-up and password reset.
 * Large screens get a brand panel beside the form; small screens get the
 * mark above it, so the form stays the first thing a thumb reaches.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between border-r border-border/70 bg-muted/40 p-12 lg:flex dark:bg-card">
        <BrandMark size="lg" />

        <div>
          <div data-slot="card" className="w-fit rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-6 text-sm">
              <span className="font-medium">Morning run</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Flame className="h-4 w-4 text-orange-500" aria-hidden />
                <span className="font-medium tabular-nums text-foreground">35</span> days
              </span>
            </div>
            <BrandHeatmap />
          </div>
          <p className="mt-10 max-w-md font-display text-3xl font-semibold tracking-tight text-balance">
            Don&apos;t break the chain.
          </p>
          <p className="mt-3 max-w-sm text-base text-muted-foreground text-pretty">
            Check in once a day and watch each habit fill in, one square at a
            time.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Daily, specific-day and weekly goals, each with its own history.
        </p>
      </aside>

      <div className="flex flex-col items-center justify-center px-5 py-12 sm:px-8">
        <BrandMark className="mb-10 lg:hidden" />
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
