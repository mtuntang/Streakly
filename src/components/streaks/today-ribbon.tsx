"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  defaultDropAnimationSideEffects,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DropAnimation,
  type DragPendingEvent,
  type Modifier,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getColor, type GoalDTO } from "@streakly/shared";
import { cn } from "@/lib/utils";
import { buzzForTouch } from "@/lib/haptics";
import { prefersReducedMotion } from "@/lib/motion";
import { useSwallowClickAfterDrag } from "@/hooks/use-swallow-click-after-drag";
import { useLinkedScroll } from "@/hooks/use-linked-scroll";
import { GOAL_DRAG_INSTRUCTIONS, goalDragAnnouncements } from "./drag-announcements";

// A finger picks a pill up after a short hold, so a tap still jumps to the
// card and a swipe along the wheel still turns it. Module constants,
// because dnd-kit rebuilds its state for new option objects.
const PILL_TOUCH = { activationConstraint: { delay: 200, tolerance: 8 } };
const PILL_MOUSE = { activationConstraint: { distance: 4 } };

/**
 * A lifted pill moves at 0.6× the finger's speed, so each slot on the wheel
 * takes about 80px of travel instead of 50 and the user can stop on the
 * one they want.
 */
const DRAG_GEARING = 0.6;
const GEARED: Modifier[] = [({ transform }) => ({ ...transform, x: transform.x * DRAG_GEARING })];

/**
 * Turns the wheel slowly when a lifted pill is held near either end:
 * about two slots a second at the very edge, instead of the drag library's
 * default (dozens), which flung the pill past the slot the user was aiming
 * for. Only the outer 18% of the wheel turns it.
 */
const WHEEL_AUTO_SCROLL = { acceleration: 1.5, interval: 16, threshold: { x: 0.18, y: 0 } };

/** The app's ease-out (globals.css `--ease-out`), for motion set from script. */
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/** The other pills glide aside to open the slot, rather than snap. */
const PILL_SHIFT = { duration: 260, easing: EASE_OUT };

/**
 * On release the lifted chip glides down into its new slot and shrinks into
 * the pill, while the pill itself stays hidden until the chip arrives, so
 * there is only ever one of it on screen.
 */
const SETTLE: DropAnimation = {
  duration: 260,
  easing: EASE_OUT,
  sideEffects: defaultDropAnimationSideEffects({
    className: { dragOverlay: "pill-dropping" },
    styles: { active: { opacity: "0" } },
  }),
};

/** How far the lifted chip leans into a move, per pixel of travel, and at most. */
const LEAN_PER_PX = 0.5;
const MAX_LEAN = 7;

/** CSS variable the page pads its bottom by, so the bar never hides content. */
const BAR_HEIGHT_VAR = "--ribbon-bar-h";

/** The wheel's items and the deck's cards, matched index for index. */
const PILL_SELECTOR = "[data-pill-id]";
const CARD_SELECTOR = "[data-goal-id]";

interface RibbonProps {
  goals: GoalDTO[];
  /** The goal whose card is at the front of the phone deck, if any. */
  frontId: string | null;
  done: number;
  /**
   * Brings a goal's card into view. On the phone bar the wheel turns the
   * deck itself, so this only needs to bring the deck on screen.
   */
  onJump: (id: string) => void;
  /** Extra classes for the pill row, e.g. the day-cleared finish. */
  className?: string;
}

/**
 * Renders the today ribbon for tablets and desktops: one pill per goal, in
 * card order, filled in the goal's own color once it is checked. Each pill
 * is a button to its card, with a 24px-tall hit area around the 8px pill.
 */
export function TodayRibbon({ goals, frontId, done, onJump, className }: RibbonProps) {
  return (
    <div
      className={cn("flex gap-1.5", className)}
      role="group"
      aria-label={`Goals done today: ${done} of ${goals.length}`}
    >
      {goals.map((g, i) => (
        <Pill key={g.id} goal={g} index={i} front={g.id === frontId} onJump={onJump} />
      ))}
    </div>
  );
}

/**
 * Renders the phone version of the ribbon: a scroll wheel in a bar fixed
 * near the bottom of the screen, where a thumb reaches it. The wheel and
 * the card deck turn together. Sliding the wheel deals the matching card,
 * swiping the deck turns the wheel, and the pill in the middle is always
 * the card in front. Tapping a pill brings its card to the front. Holding a
 * pill lifts it out of the wheel; sliding it along and letting go moves
 * its card to that place.
 *
 * It is portalled to the end of the page, so it also comes last in the tab
 * order, matching where it sits on screen. `caption` is the line above the
 * pills (the reorder tip); while a pill is held it names the moving goal.
 */
export function PhoneRibbonBar({
  goals,
  frontId,
  done,
  onJump,
  onReorder,
  deckRef,
  caption,
  className,
}: RibbonProps & {
  /** Moves goal `activeId` to the place of `overId`. */
  onReorder: (activeId: string, overId: string) => void;
  /** The card deck the wheel turns with. */
  deckRef: React.RefObject<HTMLElement | null>;
  caption?: React.ReactNode;
}) {
  const sensors = useSensors(useSensor(MouseSensor, PILL_MOUSE), useSensor(TouchSensor, PILL_TOUCH));
  const ids = React.useMemo(() => goals.map((g) => g.id), [goals]);
  const [movingId, setMovingId] = React.useState<string | null>(null);
  const moving = goals.find((g) => g.id === movingId);
  const accessibility = React.useMemo(() => {
    const names = new Map(goals.map((g) => [g.id, g.name]));
    return {
      announcements: goalDragAnnouncements((id) => names.get(id) ?? "Goal"),
      screenReaderInstructions: GOAL_DRAG_INSTRUCTIONS,
    };
  }, [goals]);

  const barRef = React.useRef<HTMLDivElement>(null);
  const wheelRef = React.useRef<HTMLDivElement>(null);

  useLinkedScroll(wheelRef, PILL_SELECTOR, deckRef, CARD_SELECTOR, true);

  // A tap turns the wheel to that pill, and the deck follows it there. The
  // deck is never scrolled directly here: the wheel would pull it back to
  // the pill the finger left.
  const turnTo = React.useCallback(
    (id: string) => {
      const wheel = wheelRef.current;
      const pill = wheel?.querySelector<HTMLElement>(`[data-pill-id="${id}"]`);
      if (wheel && pill) {
        wheel.scrollTo({
          left: pill.offsetLeft + pill.offsetWidth / 2 - wheel.clientWidth / 2,
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      }
      onJump(id);
    },
    [onJump],
  );

  // Publishes how much of the screen's bottom the bar covers (its height
  // plus the gap under it), so the page pads by that much.
  React.useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const measure = () => {
      const covered = window.innerHeight - bar.getBoundingClientRect().top;
      root.style.setProperty(BAR_HEIGHT_VAR, `${Math.max(0, Math.round(covered))}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    // The safe-area gap changes with rotation and browser toolbars, which
    // resize the window, not the bar.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty(BAR_HEIGHT_VAR);
    };
  }, []);

  // A held finger is about to lift a pill: it swells a little over the hold,
  // so the user waits for the lift instead of turning the wheel.
  function handleDragPending({ id, constraint }: DragPendingEvent) {
    if ("delay" in constraint) setArming(id, true);
  }

  // While a pill is held the wheel stops snapping. The edge auto-turn moves
  // it a pixel or so per frame, and a snapping wheel turns each of those
  // nudges into a whole slot, which flung the pill dozens of slots a second.
  function setReordering(on: boolean) {
    wheelRef.current?.classList.toggle("is-reordering", on);
  }

  // After a drop the wheel glides to the nearest slot before it snaps
  // again; switching snapping back on mid-slot would jump it there.
  function settleWheel() {
    const wheel = wheelRef.current;
    if (!wheel) return;
    const centre = wheel.scrollLeft + wheel.clientWidth / 2;
    let target = wheel.scrollLeft;
    let best = Infinity;
    wheel.querySelectorAll<HTMLElement>(PILL_SELECTOR).forEach((pill) => {
      const mid = pill.offsetLeft + pill.offsetWidth / 2;
      if (Math.abs(mid - centre) < best) {
        best = Math.abs(mid - centre);
        target = mid - wheel.clientWidth / 2;
      }
    });
    wheel.scrollTo({ left: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    window.setTimeout(() => setReordering(false), 320);
  }

  // The chip leans into the direction it is moving and rights itself when
  // the finger stops, so it reads as carried rather than teleported.
  const lastX = React.useRef(0);
  const unlean = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function lean(deg: number) {
    const chip = document.querySelector<HTMLElement>(".pill-lifted");
    if (chip) chip.style.rotate = `${deg}deg`;
  }
  function handleDragMove({ delta }: DragMoveEvent) {
    const step = delta.x - lastX.current;
    lastX.current = delta.x;
    lean(Math.max(-MAX_LEAN, Math.min(MAX_LEAN, step * LEAN_PER_PX)));
    clearTimeout(unlean.current);
    unlean.current = setTimeout(() => lean(0), 90);
  }

  function handleDragStart({ active, activatorEvent }: DragStartEvent) {
    lastX.current = 0;
    setArming(active.id, false);
    setReordering(true);
    setMovingId(String(active.id));
    buzzForTouch(activatorEvent, 10);
  }

  // A short tick each time the lifted pill passes a slot, so the user can
  // feel where it is without watching the wheel under their thumb.
  function handleDragOver({ over }: DragOverEvent) {
    if (over) navigator.vibrate?.(4);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    clearTimeout(unlean.current);
    lean(0);
    settleWheel();
    setMovingId(null);
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  // The bar floats a little above the bottom edge (or above the home
  // indicator, whichever is higher), so the pills stay clear of the system
  // gesture area and the thumb doesn't have to reach the very edge. It is
  // near-opaque rather than blurred: a backdrop blur over the turning deck
  // would redraw every frame of a swipe on low-end phones.
  const bar = (
    <div
      ref={barRef}
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-[1.375rem] bg-card/95 px-3 py-1 shadow-[var(--card-shadow)] ring-1 ring-foreground/[0.06] sm:hidden"
    >
      {moving ? (
        <p className="py-1.5 text-sm font-medium" aria-hidden>
          Moving {moving.name}
        </p>
      ) : (
        caption
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={accessibility}
        onDragPending={handleDragPending}
        onDragAbort={({ id }) => setArming(id, false)}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragMove={handleDragMove}
        onDragCancel={() => {
          clearTimeout(unlean.current);
          settleWheel();
          setMovingId(null);
        }}
        modifiers={GEARED}
        autoScroll={WHEEL_AUTO_SCROLL}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className="relative -mx-3">
            {/* The wheel's lens: whatever pill sits in it is the card in front. */}
            <span
              aria-hidden
              className="wheel-lens pointer-events-none absolute top-1/2 left-1/2 h-8 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full"
            />
            <div
              ref={wheelRef}
              className="ribbon-wheel relative snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div
                // Half the wheel's width either side, so the first and last
                // pills can turn into the lens.
                className={cn("flex w-max gap-1.5 px-[calc(50vw-0.75rem-1.375rem)]", className)}
                role="group"
                aria-label={`Goals done today: ${done} of ${goals.length}`}
              >
                {goals.map((g, i) => (
                  <SortablePill
                    key={g.id}
                    goal={g}
                    index={i}
                    front={g.id === frontId}
                    onJump={turnTo}
                    tall
                  />
                ))}
              </div>
            </div>
          </div>
        </SortableContext>
        {/* The held pill rides above the wheel, clear of the thumb, with its
            goal's name, while its slot stays open in the wheel. It is
            portalled out of the bar: the bar's backdrop blur would otherwise
            become the overlay's frame of reference and misplace it. */}
        {createPortal(
          <DragOverlay dropAnimation={prefersReducedMotion() ? null : SETTLE} zIndex={50}>
            {moving ? <LiftedPill goal={moving} /> : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </div>
  );

  return createPortal(bar, document.body);
}

/** Adds or removes the held-finger swell on goal `id`'s wheel pill. */
function setArming(id: UniqueIdentifier, on: boolean) {
  document.querySelector(`[data-pill-id="${id}"]`)?.classList.toggle("pill-arming", on);
}

/**
 * Renders the pill being moved, lifted above the wheel with its goal's
 * name. The overlay box keeps the pill's own size, so where it is dropped
 * is measured from the pill, not from the label floating over it.
 */
function LiftedPill({ goal }: { goal: GoalDTO }) {
  const color = getColor(goal.color);
  return (
    <div className="relative h-11 w-11">
      {/* The outer box centres the chip over the pill; the chip inside is
          free to rise, lean and settle without losing its centring. */}
      <div className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2">
        <div className="pill-lifted flex origin-bottom items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-medium whitespace-nowrap shadow-lg ring-1 ring-foreground/10">
          <span className={cn("h-2 w-5 rounded-full", color.cellOn)} aria-hidden />
          <span className="max-w-40 truncate">{goal.name}</span>
        </div>
      </div>
    </div>
  );
}

interface PillProps {
  goal: GoalDTO;
  index: number;
  front: boolean;
  onJump: (id: string) => void;
  /** A 44px-tall hit area, for the thumb-driven phone bar. */
  tall?: boolean;
}

/**
 * A wheel pill that can be held and moved to reorder. While it is held, the
 * lifted copy follows the finger and this one marks the open slot.
 * Memoized: turning the deck changes only which pill is in front, so only
 * the two pills whose `front` flips re-render, not the whole wheel.
 */
const SortablePill = React.memo(function SortablePill(props: PillProps) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: props.goal.id,
    transition: PILL_SHIFT,
  });
  useSwallowClickAfterDrag(isDragging);
  return (
    <Pill
      {...props}
      ref={setNodeRef}
      dragging={isDragging}
      // The other pills only ever make room sideways.
      style={{ transform: CSS.Translate.toString(transform && { ...transform, y: 0 }), transition }}
      dragListeners={listeners}
    />
  );
});

/** One pill: a button to its goal's card, labelled with the goal's state. */
function Pill({
  goal,
  index,
  front,
  onJump,
  tall = false,
  ref,
  dragging = false,
  style,
  dragListeners,
}: PillProps & {
  ref?: React.Ref<HTMLButtonElement>;
  dragging?: boolean;
  style?: React.CSSProperties;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
}) {
  const state = goal.stats.doneToday ? "done" : "not done";
  return (
    <button
      ref={ref}
      type="button"
      data-pill-id={goal.id}
      onClick={() => onJump(goal.id)}
      aria-label={`${goal.name}: ${state}. Show card`}
      aria-current={front ? "true" : undefined}
      title={`${goal.name}: ${state}`}
      style={style}
      className={cn(
        "group/pill relative flex touch-manipulation items-center rounded-full select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        // On the wheel every pill is one thumb wide and snaps into the lens.
        tall ? "h-11 w-11 shrink-0 snap-center justify-center" : "h-6 flex-1",
        dragging && "is-held",
      )}
      {...dragListeners}
    >
      {/* The wheel tilts this wrapper as it turns; the pill inside keeps
          its own day-cleared animation. */}
      <span className={cn("flex w-full items-center justify-center", tall && "wheel-item")}>
        <span
          style={{ "--i": index } as React.CSSProperties}
          className={cn(
            "today-pill rounded-full transition-[width,height,background-color,box-shadow,opacity] duration-300 ease-out",
            tall ? (dragging ? "w-4" : "w-8") : "w-full",
            // While held, the pill shrinks into a faint gap: the slot it
            // will drop back into if released here.
            dragging ? "h-1.5 opacity-30" : front ? "h-3" : "h-2 group-hover/pill:h-2.5",
            // Empty pills are outlined at 3:1+ so they stay visible in sunlight.
            goal.stats.doneToday
              ? cn("is-done", getColor(goal.color).cellOn)
              : "ring-[1.5px] ring-inset ring-foreground/55",
          )}
        />
      </span>
    </button>
  );
}
