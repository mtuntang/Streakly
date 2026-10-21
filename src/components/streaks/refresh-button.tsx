"use client";

import * as React from "react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** How long the check mark stays after a refresh that worked. */
const DONE_MS = 1400;

/**
 * Renders the header's refresh button. While a load runs, the icon turns
 * in whole eased revolutions and stops only at the end of one, so it never
 * freezes at an odd angle. A refresh the user asked for that worked then
 * settles into a check mark for a moment; background loads (the midnight
 * rollover) turn the icon too but show no check, since nobody asked.
 */
export function RefreshButton({
  refreshing,
  onRefresh,
}: {
  /** True while any load of the goal list is running. */
  refreshing: boolean;
  /** Starts a load; resolves to whether it worked. */
  onRefresh: () => Promise<boolean>;
}) {
  const [turning, setTurning] = React.useState(false);
  const [done, setDone] = React.useState(false);
  // True from the click until its load settles; then whether it worked.
  const clickPending = React.useRef(false);
  const clickWorked = React.useRef(false);
  const doneTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(doneTimer.current), []);

  if (refreshing && !turning) setTurning(true);

  async function handleClick() {
    clearTimeout(doneTimer.current);
    setDone(false);
    setTurning(true);
    clickPending.current = true;
    clickWorked.current = await onRefresh();
    clickPending.current = false;
  }

  // Runs at the end of every revolution: the icon stops here once loading
  // is over, which is always back at its upright starting angle.
  function handleIteration() {
    if (refreshing || clickPending.current) return;
    setTurning(false);
    if (clickWorked.current) {
      clickWorked.current = false;
      setDone(true);
      doneTimer.current = setTimeout(() => setDone(false), DONE_MS);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="tap-44 size-10 rounded-full sm:size-9"
        onClick={handleClick}
        disabled={turning}
        aria-label={turning ? "Refreshing" : "Refresh"}
        title="Refresh"
      >
        {done ? (
          <Check className="refresh-done h-4 w-4" strokeWidth={2.5} aria-hidden />
        ) : (
          <RefreshCw
            className={cn("refresh-icon h-4 w-4", turning && "is-turning")}
            onAnimationIteration={handleIteration}
            aria-hidden
          />
        )}
      </Button>
      <span className="sr-only" aria-live="polite">
        {done ? "Goals are up to date." : ""}
      </span>
    </>
  );
}
