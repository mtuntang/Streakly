"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Window event a check-in fires; the logo flares in answer. */
export const CHECKIN_EVENT = "streakly:checkin";

const WORD = "Streakly";

/**
 * Flame and title are drawn as equals: the flame stands exactly as tall as
 * the S. The viewBox is cropped to the flame's ink (stroke included), so
 * the svg box is the visible flame. Its height is the S's measured height
 * in Figtree ExtraBold (top 0.719em above the baseline, overshoot 0.016em
 * below), and the negative bottom margin drops it by that overshoot so the
 * flame's tip meets the S's top and its base meets the S's bottom.
 */
const S_HEIGHT = "0.7344em";
const S_OVERSHOOT = "-0.0156em";

/** Flame ink box in viewBox units: the contour plus half the stroke. */
const STROKE = 3.2;
const INK = { x: 4.7 - STROKE / 2, y: 2.2 - STROKE / 2, w: 14.6 + STROKE, h: 19.8 + STROKE };

const SIZES = {
  // 24px on phones keeps the header's four controls on one row at 375px.
  md: "text-[24px] sm:text-[32px]",
  lg: "text-[44px]",
} as const;

/**
 * Renders the Streakly mark: a flame (outline plus a solid core) and the
 * wordmark, built as one typographic lockup.
 *
 * Motion, all of it quick: on page load the flame ignites from its base
 * with a spring and its core pops a beat later, and the letters rise into
 * place in a fast stagger as the flame peaks (about 0.75s in all). On
 * hover the flame gives a short flicker and a ripple runs through the
 * letters; each check-in does the same with a bigger flare. Nothing loops
 * while idle, and reduced motion removes the movement.
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
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const [flares, setFlares] = React.useState(0);

  React.useEffect(() => {
    const flare = () => setFlares((n) => n + 1);
    window.addEventListener(CHECKIN_EVENT, flare);
    return () => window.removeEventListener(CHECKIN_EVENT, flare);
  }, []);

  return (
    <span
      // A new key replays the flare for each check-in in a row.
      key={flares}
      className={cn(
        "brand-mark group/brand inline-flex w-fit items-baseline gap-[0.09em] leading-none select-none",
        flares > 0 && "is-flaring",
        SIZES[size],
        className,
      )}
      role="img"
      aria-label="Streakly"
    >
      <svg
        viewBox={`${INK.x} ${INK.y} ${INK.w} ${INK.h}`}
        fill="none"
        className="brand-flame shrink-0 self-baseline overflow-visible"
        style={{
          height: S_HEIGHT,
          width: `calc(${S_HEIGHT} * ${INK.w / INK.h})`,
          marginBottom: S_OVERSHOOT,
        }}
        aria-hidden
      >
        <defs>
          <linearGradient id={`${uid}-ink`} x1="0.3" y1="1" x2="0.65" y2="0">
            <stop offset="0" style={{ stopColor: "var(--flame-lo)" }} />
            <stop offset="1" style={{ stopColor: "var(--flame-hi)" }} />
          </linearGradient>
        </defs>
        <path
          className="brand-flame-outline"
          d="M12 2.2c.7 3.3 2.7 5.2 4.4 7C18.1 11 19.3 13 19.3 15.4c0 3.8-3.2 6.6-7.3 6.6s-7.3-2.8-7.3-6.6c0-2.4 1.1-4.4 2.7-5.9.2 1.7 1.1 2.9 2.3 3.5C9.6 10 10.4 5.2 12 2.2Z"
          stroke={`url(#${uid}-ink)`}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />
        <path
          className="brand-flame-core"
          d="M12 19.6c-1.6 0-2.8-1.1-2.8-2.6 0-1.5 1.2-2.6 2.8-4.5 1.6 1.9 2.8 3 2.8 4.5 0 1.5-1.2 2.6-2.8 2.6Z"
          style={{ fill: "var(--flame-hi)" }}
        />
      </svg>
      {compact ? null : (
        <span className="brand-word font-display font-extrabold tracking-[-0.035em]" aria-hidden>
          {WORD.split("").map((ch, i) => (
            <span key={i} className="brand-letter" style={{ "--i": i } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
