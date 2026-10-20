import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders the Streakly mark: the flame tile and, unless `compact`, the
 * wordmark. The app header and the sign-in pages share it, so the product
 * looks like one product from the first screen on.
 */
export function BrandMark({
  compact = false,
  size = "md",
  className,
}: {
  compact?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-sm",
          size === "lg" ? "h-11 w-11" : "h-9 w-9",
        )}
        aria-hidden
      >
        <Flame className={cn("text-white", size === "lg" ? "h-6 w-6" : "h-5 w-5")} />
      </div>
      {compact ? null : (
        <span
          className={cn(
            "font-semibold tracking-tight",
            size === "lg" ? "text-xl" : "text-base sm:text-lg",
          )}
        >
          Streakly
        </span>
      )}
    </div>
  );
}
