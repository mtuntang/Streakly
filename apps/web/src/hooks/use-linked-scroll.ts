"use client";

import * as React from "react";
import { mapScroll } from "@/lib/linked-scroll";

/** Class that turns scroll snapping off on the scroller being driven. */
const FOLLOWING = "is-scroll-following";

/** How long after the last scroll event a scroll counts as finished. */
const SETTLE_MS = 140;

/** How long the second row keeps driving after a pause ends. */
const RESUME_MS = 300;

/**
 * Returns the scroll position that centres each item, in item order.
 * It reads offsetLeft, which ignores transforms, so the wheel and deck
 * tilts (and a dragged item's transform) never shift the targets. Each
 * scroller must be the items' offset parent, i.e. positioned.
 */
function centres(scroller: HTMLElement, selector: string): number[] {
  const max = scroller.scrollWidth - scroller.clientWidth;
  return Array.from(scroller.querySelectorAll<HTMLElement>(selector), (el) =>
    Math.min(max, Math.max(0, el.offsetLeft + el.offsetWidth / 2 - scroller.clientWidth / 2)),
  );
}

/**
 * Links two sideways scrollers item for item, so scrolling either one
 * moves the other to the matching item as it goes. The phone uses it to
 * tie the ribbon wheel to the card deck.
 *
 * Whichever row the user touches (or, for a scroll started from code, the
 * first one that moves) drives until its scroll settles; the other follows
 * with snapping turned off, so it can sit between items mid-swipe, then
 * lands exactly on the matching item and snaps again. Items are matched by
 * index, so both rows must list the same goals in the same order.
 *
 * While `paused`, each row scrolls on its own: the phone pauses the link
 * while a pill is held, because the deck then follows the moving card, not
 * the wheel. On resume the second row (`b`) is the truth: the first is put
 * on its matching item, and nothing moves the second.
 */
export function useLinkedScroll(
  aRef: React.RefObject<HTMLElement | null>,
  aItems: string,
  bRef: React.RefObject<HTMLElement | null>,
  bItems: string,
  enabled: boolean,
  paused = false,
) {
  // Read by the listeners, so pausing doesn't rebuild them. `resume` is
  // set by the listening effect, which owns the drive state it resets.
  const pausedRef = React.useRef(paused);
  const resume = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    const wasPaused = pausedRef.current;
    pausedRef.current = paused;
    if (wasPaused && !paused) resume.current?.();
  }, [paused]);

  React.useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!enabled || !a || !b) return;

    let driver: HTMLElement | null = null;
    let touching = false;
    let settle: ReturnType<typeof setTimeout> | undefined;

    const other = (el: HTMLElement) => (el === a ? b : a);
    const items = (el: HTMLElement) => (el === a ? aItems : bItems);

    const follow = () => {
      if (!driver) return;
      const target = other(driver);
      target.scrollLeft = mapScroll(
        centres(driver, items(driver)),
        centres(target, items(target)),
        driver.scrollLeft,
      );
    };

    const release = () => {
      if (!driver || touching) return;
      // Paused, the follower has been placed by the caller; moving it to
      // match the driver would undo that.
      if (!pausedRef.current) follow();
      other(driver).classList.remove(FOLLOWING);
      driver = null;
    };

    const take = (el: HTMLElement) => {
      if (driver === el) return;
      if (driver) other(driver).classList.remove(FOLLOWING);
      driver = el;
      other(el).classList.add(FOLLOWING);
    };

    const onScroll = (el: HTMLElement) => () => {
      if (pausedRef.current) return;
      if (!driver) {
        // The follower's own scroll echoes back after a release; it only
        // takes over if it has really moved away from the matching spot.
        const target = other(el);
        const expected = mapScroll(centres(target, items(target)), centres(el, items(el)), target.scrollLeft);
        if (Math.abs(expected - el.scrollLeft) < 2) return;
        take(el);
      }
      if (driver !== el) return;
      follow();
      clearTimeout(settle);
      settle = setTimeout(release, SETTLE_MS);
    };

    const onTouchStart = (el: HTMLElement) => () => {
      if (pausedRef.current) return;
      touching = true;
      take(el);
    };
    const onTouchEnd = () => {
      touching = false;
      clearTimeout(settle);
      settle = setTimeout(release, SETTLE_MS);
    };

    const pairs = [a, b].map((el) => {
      const scroll = onScroll(el);
      const start = onTouchStart(el);
      el.addEventListener("scroll", scroll, { passive: true });
      el.addEventListener("touchstart", start, { passive: true });
      el.addEventListener("pointerdown", start, { passive: true });
      return { el, scroll, start };
    });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("pointerup", onTouchEnd, { passive: true });

    // Start matched: the wheel opens on the card the deck shows.
    const match = () => {
      a.scrollLeft = mapScroll(centres(b, bItems), centres(a, aItems), b.scrollLeft);
    };
    match();

    // After a pause, forget who was driving (a touch that began before the
    // pause may never have reported its end) and let the second row drive
    // for a moment: the first is lined up with it, and any glide the first
    // row still has running is ignored instead of dragging the second row
    // along. The usual release then lands it exactly.
    resume.current = () => {
      clearTimeout(settle);
      touching = false;
      if (driver) other(driver).classList.remove(FOLLOWING);
      driver = null;
      take(b);
      follow();
      settle = setTimeout(release, RESUME_MS);
    };

    return () => {
      clearTimeout(settle);
      resume.current = null;
      for (const { el, scroll, start } of pairs) {
        el.removeEventListener("scroll", scroll);
        el.removeEventListener("touchstart", start);
        el.removeEventListener("pointerdown", start);
        el.classList.remove(FOLLOWING);
      }
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("pointerup", onTouchEnd);
    };
  }, [aRef, aItems, bRef, bItems, enabled]);
}
