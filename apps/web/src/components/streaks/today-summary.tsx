"use client";

import * as React from "react";
import { cardCheckinState, getColor, type GoalDTO } from "@streakly/shared";
import { cn } from "@/lib/utils";
import { useChangeCount } from "@/hooks/use-change-count";
import { DECK_QUERY, useDeckFocus } from "@/hooks/use-deck-focus";
import { prefersReducedMotion } from "@/lib/motion";
import { moveGoal } from "@/lib/goal-list";
import { TodayRibbon, PhoneRibbonBar, type ReorderPreview } from "./today-ribbon";
import { ReorderTip } from "./reorder-tip";
import { InstallTip } from "@/components/install/install-tip";

/**
 * Returns the best value per streak unit, e.g. "12d · 3w". Weekly goals count
 * streaks in weeks, so their numbers are never mixed into a day maximum.
 */
function bestByUnit(goals: GoalDTO[], pick: (g: GoalDTO) => number): string {
  const best = (unit: "day" | "week") =>
    goals.filter((g) => g.stats.unit === unit).reduce((m, g) => Math.max(m, pick(g)), 0);
  const parts: string[] = [];
  if (goals.some((g) => g.stats.unit === "day")) parts.push(`${best("day")}d`);
  if (goals.some((g) => g.stats.unit === "week")) parts.push(`${best("week")}w`);
  return parts.length > 0 ? parts.join(" · ") : "0d";
}

/**
 * Scrolls a goal's card into view, moves focus to its check-in button, and
 * gives the card a brief halo so the eye lands on the right one. On phones
 * the card is dealt to the front of the deck (`inline: "center"`) and the
 * page only scrolls as far as it must to show the deck. With `dealt`, the
 * ribbon wheel is already turning the deck to the card, so only the page
 * scrolls.
 */
function jumpToGoal(id: string, dealt = false) {
  const card = document.getElementById(`goal-${id}`);
  if (!card) return;
  const reduce = prefersReducedMotion();
  const deck = window.matchMedia(DECK_QUERY).matches;
  const behavior = reduce ? "auto" : "smooth";
  if (dealt) {
    card.parentElement?.scrollIntoView({ behavior, block: "nearest" });
  } else {
    card.scrollIntoView({ behavior, block: deck ? "nearest" : "center", inline: "center" });
  }
  card.querySelector<HTMLButtonElement>("[data-checkin]")?.focus({ preventScroll: true });
  card.classList.remove("card-spotlight");
  // Reading layout restarts the animation when the same chip is used twice.
  void card.offsetWidth;
  card.classList.add("card-spotlight");
  card.addEventListener("animationend", () => card.classList.remove("card-spotlight"), {
    once: true,
  });
}

/** The wheel's tap: the wheel turns the deck, the page brings it on screen. */
function jumpFromWheel(id: string) {
  jumpToGoal(id, true);
}

/**
 * Renders the page's summary: the greeting, how many goals are done today
 * with the today ribbon (one pill per goal), the all-time numbers in a
 * quieter row beside it, and what is still due as chips that jump to
 * their card. Each ribbon pill is also a button to its card; on phones it
 * deals that card to the front of the deck, the front card's pill is marked, and
 * (with `onReorder`) the pills reorder the cards. While a card or pill is
 * being moved, the ribbon and the cards show the order a drop would make.
 */
export function TodaySummary({
  goals,
  greeting,
  onReorder,
  preview = null,
  onPreview,
  deckRef,
}: {
  goals: GoalDTO[];
  greeting: string;
  /** Set on phones, where the ribbon is how cards are reordered. */
  onReorder?: (activeId: string, overId: string) => void;
  /** A card being dragged on a wider screen; its pill moves along with it. */
  preview?: ReorderPreview | null;
  /** Where a held phone pill would land, so its card can move along with it. */
  onPreview?: (preview: ReorderPreview | null) => void;
  /** The phone card deck: the ribbon marks its front card and turns with it. */
  deckRef: React.RefObject<HTMLElement | null>;
}) {
  // The card in front of the phone deck (null on wider screens). Tracked
  // here rather than in the page, so a swipe re-renders only the summary.
  const idOrder = goals.map((g) => g.id).join(",");
  const ids = React.useMemo(() => (idOrder ? idOrder.split(",") : []), [idOrder]);
  const frontId = useDeckFocus(deckRef, ids);

  const total = goals.length;
  const done = goals.filter((g) => g.stats.doneToday).length;
  const allDone = total > 0 && done === total;
  const now = new Date();
  // Goals resting today are not due, so they never count as left to do.
  const due = goals.filter(
    (g) => !g.stats.doneToday && cardCheckinState(g.schedule, g.stats, now).kind !== "rest",
  );
  const dayClear = total > 0 && due.length === 0;

  // Checking off the last goal due today plays the ribbon once; loading a
  // finished day stays still.
  const finishes = useChangeCount(dayClear, (clear) => clear);

  // The status line sits under the ribbon, except on phones, where the
  // ribbon is the bottom bar and the line follows the numbers directly. On
  // short phones it is dropped: the count and the bar's pills already say
  // what is done, and a pill jumps to its card like a chip does.
  const statusGap = onReorder ? "mt-3 short:hidden" : "mt-0.5";

  const secondary = [
    { label: "Streaks", value: goals.filter((g) => g.stats.active).length },
    { label: "Best now", value: bestByUnit(goals, (g) => g.stats.current) },
    { label: "Record", value: bestByUnit(goals, (g) => g.stats.longest) },
    { label: "Check-ins", value: goals.reduce((s, g) => s + g.stats.total, 0) },
  ];

  return (
    <section aria-labelledby="today-heading" className="mb-6 max-sm:mb-4 shorter:mb-3 shortest:mb-2">
      {/* On short phones the greeting and the all-time numbers are read
          out but not shown, so the front card fits above the ribbon bar
          without scrolling. */}
      <h2
        id="today-heading"
        className="text-2xl font-semibold tracking-tight text-balance short:sr-only sm:text-3xl"
      >
        {greeting}
      </h2>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-3 short:mt-0">
        <p className="flex items-baseline gap-2">
          <span
            className={cn(
              "font-display text-5xl font-semibold shortest:text-4xl tracking-tight tabular-nums transition-colors duration-500",
              dayClear && "text-ring",
            )}
          >
            {done}
          </span>
          <span className="text-base text-muted-foreground">
            of {total} done today
          </span>
        </p>

        {/* Under 380px: two columns, each label beside its value on one
            line, so "35d · 4w" never wraps mid-value and the block stays
            two lines tall instead of four. */}
        <dl className="short:sr-only grid grid-cols-2 gap-x-6 gap-y-1 text-left min-[380px]:grid-cols-4 min-[380px]:gap-y-2 sm:flex sm:gap-x-8">
          {secondary.map((item) => (
            <div key={item.label} className="min-w-0 max-[379px]:flex max-[379px]:items-baseline max-[379px]:gap-1.5">
              <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 font-display text-sm font-medium whitespace-nowrap tabular-nums max-[379px]:mt-0">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {onReorder ? (
        <PhoneRibbonBar
          key={finishes}
          goals={goals}
          frontId={frontId}
          done={done}
          onJump={jumpFromWheel}
          onReorder={onReorder}
          onPreview={onPreview}
          deckRef={deckRef}
          className={cn(finishes > 0 && dayClear && "ribbon-complete")}
          caption={
            // The install invitation and the reorder tip share the line
            // above the pills: one at a time, install first.
            <InstallTip
              className="shortest:text-xs"
              fallback={<ReorderTip className="shortest:text-xs">Hold a bar, lift it out, and slide it to reorder.</ReorderTip>}
            />
          }
        />
      ) : (
        <TodayRibbon
          key={finishes}
          goals={(preview && moveGoal(goals, preview.activeId, preview.overId)) || goals}
          movingId={preview?.activeId ?? null}
          frontId={frontId}
          done={done}
          onJump={jumpToGoal}
          className={cn("mt-2", finishes > 0 && dayClear && "ribbon-complete")}
        />
      )}

      {allDone ? (
        <p className={cn(statusGap, "text-sm text-muted-foreground")}>All done for today. See you tomorrow.</p>
      ) : due.length === 0 ? (
        <p className={cn(statusGap, "text-sm text-muted-foreground")}>Everything due today is done.</p>
      ) : (
        // On phones the chips stay on one line and scroll sideways, so a
        // long to-do list never pushes the cards down the screen.
        <div
          className={cn(
            statusGap,
            "flex items-center gap-1.5",
            onReorder
              ? "-mx-4 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "flex-wrap",
          )}
        >
          <span className="mr-1 shrink-0 text-sm whitespace-nowrap text-muted-foreground">Still to do</span>
          <ul className="contents">
            {due.map((g) => (
              <li key={g.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => jumpToGoal(g.id)}
                  className="inline-flex h-8 max-w-56 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-medium shadow-[var(--card-shadow)] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                  aria-label={`Go to ${g.name}`}
                >
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", getColor(g.color).cellOn)}
                    aria-hidden
                  />
                  <span className="truncate">{g.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
