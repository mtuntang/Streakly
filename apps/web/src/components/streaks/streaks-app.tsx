"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragPendingEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TodaySummary } from "./today-summary";
import type { ReorderPreview } from "./today-ribbon";
import { RefreshButton } from "./refresh-button";
import { GoalCard } from "./goal-card";
import { GoalFormDialog } from "./goal-form-dialog";
import { GoalDetailSheet } from "./goal-detail-sheet";
import { EmptyState } from "./empty-state";
import type { GoalDTO } from "@streakly/shared";
import { useToast } from "@/hooks/use-toast";
import { useGoals } from "@/hooks/use-goals";
import { useIsDeck } from "@/hooks/use-deck-focus";
import { useFlip } from "@/hooks/use-flip";
import { moveGoal } from "@/lib/goal-list";
import { prefersReducedMotion } from "@/lib/motion";
import { ReorderTip, finishReorderTip } from "./reorder-tip";
import { GOAL_DRAG_INSTRUCTIONS, goalDragAnnouncements } from "./drag-announcements";
import { signOut } from "@/lib/session";
import { buzzForTouch } from "@/lib/haptics";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenu } from "@/components/auth/account-menu";
import { InstallGuide } from "@/components/install/install-guide";
import { InstallTip } from "@/components/install/install-tip";
import { apiGoalsClient } from "@/lib/goals-client";
import { createDemoGoalsClient } from "@/lib/demo-goals";

// Drag sensor options live outside the component: dnd-kit rebuilds its
// context whenever an options object is new, and that re-renders every
// card on every render of this page.
// The whole card drags. A mouse starts after 5px of movement, so a click on
// the card's buttons is still a click; a finger starts after a short press,
// so a swipe over the cards still scrolls the page. The press forgives 12px
// of drift, because a held finger (or a mouse in a browser's touch
// emulation) is never perfectly still. There is no keyboard sensor:
// keyboard users reorder from each card's menu.
const MOUSE_DRAG = { activationConstraint: { distance: 5 } };
const TOUCH_DRAG = { activationConstraint: { delay: 200, tolerance: 12 } };

/** Class a card carries while a finger is held on it, before it lifts. */
const PRESSING = "card-pressing";

/** Adds or removes the held-finger look on goal `id`'s card. */
function setPressing(id: UniqueIdentifier, on: boolean) {
  document.getElementById(`goal-${id}`)?.classList.toggle(PRESSING, on);
}

/**
 * Shows that a press is arming a drag. A touch drag waits for a short hold,
 * and with no sign of it people start moving too soon, which scrolls the
 * page instead. The card dips while the finger is held and lifts the moment
 * it can move. Set on the card's element directly, so the hold re-renders
 * nothing. Mouse drags start on movement and get no dip.
 */
function handleDragPending({ id, constraint }: DragPendingEvent) {
  if ("delay" in constraint) setPressing(id, true);
}

/** Clears the held-finger look when a press ends without a drag. */
function handleDragAbort({ id }: { id: UniqueIdentifier }) {
  setPressing(id, false);
}

/** How long the deck takes to zoom back in after a drop (globals.css). */
const DECK_SETTLE_MS = 340;

/**
 * Gives every deck card its distance from card `heldId` (-1 = just before
 * it), which the zoomed-out deck uses to pull the cards toward it. Set on
 * the elements directly, so a pass re-renders no card.
 */
function setDeckOffsets(deck: HTMLElement | null, heldId: string) {
  if (!deck) return;
  const cards = Array.from(deck.querySelectorAll<HTMLElement>("[data-goal-id]"));
  const held = cards.findIndex((c) => c.dataset.goalId === heldId);
  cards.forEach((card, i) => card.style.setProperty("--deck-offset", String(i - held)));
}

/** Keeps the same preview object when nothing changed, so React can skip the render. */
function samePreview(next: ReorderPreview | null) {
  return (prev: ReorderPreview | null) =>
    prev?.activeId === next?.activeId && prev?.overId === next?.overId ? prev : next;
}

/** Swaps the dip for the lift, with a tap of vibration where supported. */
function handleDragStart({ active, activatorEvent }: DragStartEvent) {
  setPressing(active.id, false);
  buzzForTouch(activatorEvent, 10);
}

/**
 * Renders the app: stats, the sortable goal grid, and its dialogs. Signed
 * in, the goals come from the api. With `demo`, they are the demo
 * account's goals kept in memory for this visit: the header marks the
 * demo, leads back to sign-in instead of the account menu, and drops
 * Refresh, which has no server to ask.
 */
export function StreaksApp({ demo = false }: { demo?: boolean }) {
  const { toast } = useToast();
  // Created once per visit, so the demo's changes last until the page is left.
  const [client] = React.useState(() => (demo ? createDemoGoalsClient() : apiGoalsClient));
  const {
    goals,
    loading,
    refreshing,
    refresh,
    toggleToday,
    reorder,
    move,
    saveGoal,
    deleteGoal,
  } = useGoals(client);

  const [formOpen, setFormOpen] = React.useState(false);
  // Changes on every open, so the form remounts with fresh fields.
  const [formKey, setFormKey] = React.useState(0);
  const [editingGoal, setEditingGoal] = React.useState<GoalDTO | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // The detail sheet always shows the goal as it is in the list now, so a
  // check-in or edit shows up in the open sheet without any syncing.
  const detailGoal = React.useMemo(
    () => goals.find((g) => g.id === detailId) ?? null,
    [goals, detailId],
  );

  // The phone deck. The summary tracks which card is in front of it, so a
  // swipe re-renders the summary and its ribbon, not this whole page.
  const deckRef = React.useRef<HTMLDivElement>(null);
  const isDeck = useIsDeck();

  // A reorder in progress: a card dragged on a wider screen, or a pill held
  // on the phone's wheel. The ribbon (wider screens) or the deck (phones)
  // shows the order the drop would make, so the pill and the card move
  // together. The dragged side moves itself: dnd-kit shifts the cards on a
  // wider screen and the pills on the wheel.
  const [preview, setPreview] = React.useState<ReorderPreview | null>(null);
  const handlePreview = React.useCallback(
    (next: ReorderPreview | null) => setPreview(samePreview(next)),
    [],
  );
  const shownGoals = React.useMemo(
    () => (isDeck && preview && moveGoal(goals, preview.activeId, preview.overId)) || goals,
    [goals, isDeck, preview],
  );

  // The sortable ids change only when the order or the set of goals does.
  // A new array on every render would reach every card through dnd-kit's
  // context and re-render them all on each check-in.
  const idOrder = shownGoals.map((g) => g.id).join(",");
  const sortableIds = React.useMemo(() => (idOrder ? idOrder.split(",") : []), [idOrder]);

  // On the phone the card of the held pill lifts and comes to the front of
  // the deck, wherever the pill was picked up. As the pill passes others,
  // that card holds still in front while the other cards slide around it,
  // and it stays in front after the drop or after the pill is put back.
  // The wheel and deck are unlinked meanwhile (see PhoneRibbonBar), so the
  // wheel turning under the pill doesn't pull the deck away.
  const movingId = isDeck ? (preview?.activeId ?? null) : null;
  // The card kept in front: the moving one, and for the render that ends
  // the move, the one just let go.
  const frontCard = React.useRef<string | null>(null);

  /** Scrolls the deck so card `id` sits in the middle. */
  const centreCard = React.useCallback((id: string, smooth: boolean) => {
    const deck = deckRef.current;
    const card = document.getElementById(`goal-${id}`);
    if (!deck || !card) return;
    deck.scrollTo({
      left: card.offsetLeft + card.offsetWidth / 2 - deck.clientWidth / 2,
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    });
  }, []);

  // Deck cards slide to their new places as a held pill passes them; the
  // deck re-centres on the held card in the same frame, so it never moves.
  // The grid is left to dnd-kit, which already moves the cards being passed.
  useFlip(deckRef, "data-goal-id", idOrder, isDeck, () => {
    if (!frontCard.current) return;
    setDeckOffsets(deckRef.current, frontCard.current);
    centreCard(frontCard.current, false);
  });

  // Ends the zoom-out after a drop: zooms back in, then lets the deck turn.
  const settling = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(settling.current), []);

  React.useEffect(() => {
    if (!movingId) {
      frontCard.current = null;
      return;
    }
    frontCard.current = movingId;
    // The lift: the card glides to the front and the deck zooms out around
    // it, so the cards before and after it are in view (see .is-reordering
    // in globals.css).
    const deck = deckRef.current;
    const card = document.getElementById(`goal-${movingId}`);
    clearTimeout(settling.current);
    setDeckOffsets(deck, movingId);
    centreCard(movingId, true);
    card?.classList.add("card-lifted");
    if (deck) {
      // Two steps: first stop the deck's turn at full size, then zoom out.
      // Chrome starts no transition on a property whose animation is
      // removed in the same style change, so the zoom would snap.
      deck.classList.add("is-reordering", "is-settling");
      void deck.offsetWidth;
      deck.classList.remove("is-settling");
    }
    return () => {
      card?.classList.remove("card-lifted");
      if (!deck) return;
      deck.classList.add("is-settling");
      settling.current = setTimeout(
        () => deck.classList.remove("is-reordering", "is-settling"),
        prefersReducedMotion() ? 0 : DECK_SETTLE_MS,
      );
    };
  }, [movingId, centreCard]);

  // Phones swipe the deck with a finger, so cards don't pick up on touch
  // there; the ribbon's bars reorder instead. Tablets and touch laptops
  // drag the cards themselves after a short press.
  const mouseSensor = useSensor(MouseSensor, MOUSE_DRAG);
  const touchSensor = useSensor(TouchSensor, TOUCH_DRAG);
  const sensors = useSensors(...(isDeck ? [mouseSensor] : [mouseSensor, touchSensor]));

  // Screen readers hear goal names, not ids, while a card is dragged.
  const dragAccessibility = React.useMemo(() => {
    const names = new Map(goals.map((g) => [g.id, g.name]));
    return {
      announcements: goalDragAnnouncements((id) => names.get(id) ?? "Goal"),
      screenReaderInstructions: GOAL_DRAG_INSTRUCTIONS,
    };
  }, [goals]);

  /** Reorders from a drag (cards or ribbon) and retires the reorder tip. */
  const reorderByDrag = React.useCallback(
    (activeId: string, overId: string) => {
      finishReorderTip();
      void reorder(activeId, overId);
    },
    [reorder],
  );

  const openForm = React.useCallback((goal: GoalDTO | null) => {
    setEditingGoal(goal);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }, []);

  function handleCreate() {
    openForm(null);
  }

  // Clears the session cookie and returns to the login screen; local
  // state is dropped with the navigation, nothing else to clean up.
  async function handleSignOut() {
    try {
      await signOut();
      window.location.href = "/sign-in";
    } catch {
      toast({ title: "Could not sign out", variant: "destructive" });
    }
  }

  // The card handlers keep their identity across renders, so memoized cards
  // skip re-rendering when another goal changes.
  const handleEdit = React.useCallback(
    (goal: GoalDTO) => {
      openForm(goal);
      setDetailOpen(false);
    },
    [openForm],
  );

  const handleOpenDetail = React.useCallback((goal: GoalDTO) => {
    setDetailId(goal.id);
    setDetailOpen(true);
  }, []);

  // Wider screens: the ribbon follows the dragged card. On the phone the
  // deck is not reordered by card drags (the wheel does that), so no preview.
  function handleCardDragStart(event: DragStartEvent) {
    handleDragStart(event);
    const id = String(event.active.id);
    if (!isDeck) handlePreview({ activeId: id, overId: id });
  }

  function handleCardDragOver({ active, over }: DragOverEvent) {
    if (!isDeck) handlePreview({ activeId: String(active.id), overId: String(over?.id ?? active.id) });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    handlePreview(null);
    if (!over || active.id === over.id) return;
    reorderByDrag(String(active.id), String(over.id));
  }

  return (
    // On phones the ribbon bar floats over the bottom of the screen; padding
    // by the height it covers keeps the last card clear of it.
    <div className="flex min-h-screen flex-col bg-background max-sm:pb-[var(--ribbon-bar-h,0px)]">
      {/* Header */}
      {/* Phones skip the header's backdrop blur for the same reason as the
          ribbon bar: the deck turns under it on every swipe. */}
      <header className="app-header sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md max-sm:bg-background/95 max-sm:backdrop-blur-none">
        <div className="mx-auto flex h-16 max-w-6xl short:h-14 shortest:h-12 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {demo ? (
              // Back sits where a back button is expected, before the
              // mark; the label shows once there is room for it.
              <Button
                asChild
                variant="ghost"
                className="tap-44 -ml-2 h-10 w-10 shrink-0 rounded-full px-0 sm:h-9 sm:w-auto sm:px-3"
              >
                <Link href="/sign-in" aria-label="Leave the demo and go back to sign in">
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline" aria-hidden>Sign in</span>
                </Link>
              </Button>
            ) : null}
            <h1>
              <BrandMark />
            </h1>
            {demo ? (
              // Under 360px the header has no room left for it; the back
              // button's name still says this is the demo.
              <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold max-[359px]:sr-only">
                Demo<span className="sr-only">: changes are not saved</span>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {demo ? null : <RefreshButton refreshing={refreshing} onRefresh={refresh} />}
            <ThemeToggle />
            {demo ? null : <AccountMenu onSignOut={handleSignOut} />}
            {/* Under 380px the label is read out but not shown, so the
                header's controls still fit on one row at 320px. */}
            <Button
              onClick={handleCreate}
              className="tap-44 ml-1 h-10 gap-1.5 max-[379px]:w-10 max-[379px]:px-0 sm:h-9"
              aria-label="New goal"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline" aria-hidden>New goal</span>
              <span className="max-[379px]:hidden sm:hidden" aria-hidden>New</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-6 short:pt-3 shortest:pt-2 max-sm:pb-0 sm:px-6 sm:py-8">
        {loading || goals.length === 0 ? (
          <div className="mb-6 flex flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting()}
            </h2>
            <p className="text-sm text-muted-foreground sm:text-base">
              {loading ? "Loading your streaks…" : "Let's build some momentum."}
            </p>
          </div>
        ) : (
          <TodaySummary
            goals={goals}
            greeting={greeting()}
            onReorder={isDeck ? reorderByDrag : undefined}
            preview={isDeck ? null : preview}
            onPreview={handlePreview}
            deckRef={deckRef}
          />
        )}

        {loading ? (
          <LoadingState />
        ) : goals.length === 0 ? (
          <EmptyState onCreate={handleCreate} />
        ) : (
          <>
            {/* Tablets and other touch screens wider than a phone: invite
                adding the app to the Home Screen first, then say how to
                move a card, since nothing on it looks draggable. One line
                at a time. Hidden on phones (the ribbon has its own tip)
                and with a mouse. */}
            <InstallTip
              className="mb-3 hidden sm:flex"
              fallback={
                <ReorderTip className="mb-3 hidden sm:flex [@media(pointer:fine)]:hidden">
                  Press and hold a card until it lifts, then drag it to reorder.
                </ReorderTip>
              }
            />
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              accessibility={dragAccessibility}
              onDragPending={handleDragPending}
              onDragAbort={handleDragAbort}
              onDragStart={handleCardDragStart}
              onDragOver={handleCardDragOver}
              onDragCancel={() => handlePreview(null)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortableIds}
                strategy={rectSortingStrategy}
              >
                {/* Phones: a swipeable deck, one card centred with its
                    neighbours peeking (see .deck in globals.css). Wider
                    screens: the grid. */}
                <div
                  ref={deckRef}
                  className="deck relative -mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[9vw] pt-3 pb-2 shorter:pt-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:p-0 lg:grid-cols-3"
                >
                  {shownGoals.map((goal, i) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      onToggleToday={toggleToday}
                      onEdit={handleEdit}
                      onDelete={deleteGoal}
                      onOpenDetail={handleOpenDetail}
                      onMove={move}
                      isFirst={i === 0}
                      isLast={i === shownGoals.length - 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </main>

      {/* Dialogs */}
      <GoalFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editingGoal}
        onSave={saveGoal}
      />
      <GoalDetailSheet
        goal={detailGoal}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
      />
      <InstallGuide />
    </div>
  );
}

/** Returns a greeting for the current local hour. */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Renders placeholder cards while goals load. */
function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-xl bg-muted/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-xl bg-muted/60"
          />
        ))}
      </div>
    </div>
  );
}
