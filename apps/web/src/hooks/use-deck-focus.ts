"use client";

import * as React from "react";

/** Below Tailwind's `sm` breakpoint the goal grid is a swipeable deck. */
export const DECK_QUERY = "(max-width: 639.98px)";

/** Phones under 600px tall, the `shortest` variant in globals.css. */
const SHORTEST_PHONE_QUERY = "(max-width: 639.98px) and (max-height: 600px)";

/** Whether the page is narrow enough to show the deck. False on the server. */
export function useIsDeck(): boolean {
  return useMediaQuery(DECK_QUERY);
}

/**
 * Whether the screen is a phone under 600px tall, where every row of the
 * front card counts toward fitting it above the ribbon bar.
 */
export function useIsShortestPhone(): boolean {
  return useMediaQuery(SHORTEST_PHONE_QUERY);
}

/**
 * Returns the id of the goal card centred in the deck, or null when the
 * page is wide enough to show the grid instead.
 *
 * The today ribbon uses it to mark which card is in front. A card counts as
 * in front once most of it is inside the deck, read by an
 * IntersectionObserver rather than a scroll handler, so swiping costs
 * nothing per frame. `ids` re-runs the observer when cards are added,
 * removed or reordered.
 */
export function useDeckFocus(
  deckRef: React.RefObject<HTMLElement | null>,
  ids: string[],
): string | null {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const isDeck = useIsDeck();

  React.useEffect(() => {
    const deck = deckRef.current;
    if (!isDeck || !deck) {
      setActiveId(null);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId((entry.target as HTMLElement).dataset.goalId ?? null);
          }
        }
      },
      { root: deck, threshold: 0.6 },
    );
    deck.querySelectorAll<HTMLElement>("[data-goal-id]").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [deckRef, ids, isDeck]);

  return activeId;
}

/** Tracks whether a media query matches, updating when it starts or stops. */
function useMediaQuery(query: string): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
