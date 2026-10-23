"use client";

import * as React from "react";
import { SquarePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { startInstall, useInstall } from "@/hooks/use-install";

// Session storage, not local: hiding the tip lasts for this visit only.
// It comes back on the next visit, on every phone and tablet, until
// Streakly is installed.
const STORAGE_KEY = "streakly:install-tip-hidden";
const TIP_EVENT = "streakly:install-tip-hidden";

/**
 * Whether the install tip was hidden during this visit. Starts true, so
 * the server render and the first client render agree and the tip never
 * flashes in and out.
 */
function useTipHidden() {
  const [hidden, setHidden] = React.useState(true);

  React.useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage unavailable: the tip shows until hidden on this page.
      setHidden(false);
    }
    const hide = () => setHidden(true);
    window.addEventListener(TIP_EVENT, hide);
    return () => window.removeEventListener(TIP_EVENT, hide);
  }, []);

  return hidden;
}

/** Hides the install tip until the next visit. */
export function hideInstallTip() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage unavailable; the tip hides on this page only.
  }
  window.dispatchEvent(new Event(TIP_EVENT));
}

/**
 * Renders a one-line invitation to add Streakly to the Home Screen, on
 * every phone and tablet that hasn't installed it. Dismissing it, or
 * finishing the guide, hides it for this visit; it is back on the next
 * one, and the account menu offers the same action at any time. Where the
 * tip isn't shown, `fallback` takes its place, so it shares one line with
 * the reorder tip instead of adding a second.
 */
export function InstallTip({ fallback = null, className }: { fallback?: React.ReactNode; className?: string }) {
  const { available, canPrompt } = useInstall();
  const hidden = useTipHidden();
  if (!available || hidden) return fallback;

  return (
    <p className={cn("install-tip flex items-center gap-1 text-sm text-muted-foreground", className)}>
      <button
        type="button"
        onClick={() => {
          if (canPrompt) hideInstallTip();
          startInstall();
        }}
        className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <SquarePlus className="install-tip-icon h-4 w-4 shrink-0 text-brand" aria-hidden />
        <span className="truncate">
          {canPrompt ? "Install Streakly as an app" : "Add Streakly to your Home Screen"}
        </span>
      </button>
      <button
        type="button"
        onClick={hideInstallTip}
        aria-label="Dismiss install tip"
        className="tap-44 -my-2 -mr-2 inline-flex size-10 shortest:-my-3 shrink-0 items-center justify-center rounded-full hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </p>
  );
}
