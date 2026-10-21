"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "streakly:reorder-tip-done";
const TIP_EVENT = "streakly:reorder-tip-done";

/**
 * Tracks whether to show the reorder tip. It shows until the user reorders
 * once or dismisses it, then stays hidden on this device. It starts hidden,
 * so the server render and the first client render agree.
 */
function useReorderTip() {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    try {
      setShow(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      // Private mode without storage: the tip just shows each visit.
      setShow(true);
    }
    // Every tip on the page hides together.
    const hide = () => setShow(false);
    window.addEventListener(TIP_EVENT, hide);
    return () => window.removeEventListener(TIP_EVENT, hide);
  }, []);

  return show;
}

/** Hides the reorder tip for good: after a reorder, or when dismissed. */
export function finishReorderTip() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage unavailable; the tip hides for this visit only.
  }
  window.dispatchEvent(new Event(TIP_EVENT));
}

/** Renders a one-line reorder tip with a dismiss button. */
export function ReorderTip({ children, className }: { children: React.ReactNode; className?: string }) {
  const show = useReorderTip();
  if (!show) return null;
  return (
    <p className={cn("flex items-center gap-1 text-sm text-muted-foreground", className)}>
      <span className="min-w-0 flex-1">{children}</span>
      <button
        type="button"
        onClick={finishReorderTip}
        aria-label="Dismiss tip"
        className="tap-44 -my-2 -mr-2 inline-flex size-10 shortest:-my-3 shrink-0 items-center justify-center rounded-full hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </p>
  );
}
