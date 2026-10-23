"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  Flame,
  History,
  MoreHorizontal,
  Pencil,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  cadenceLabel,
  cardCheckinState,
  getColor,
  toggleButtonStyle,
  type GoalDTO,
} from "@streakly/shared";

import { GoalIcon } from "./goal-icon";
import { Heatmap } from "./heatmap";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/plural";
import { toast } from "@/hooks/use-toast";
import { useChangeCount } from "@/hooks/use-change-count";
import { useSwallowClickAfterDrag } from "@/hooks/use-swallow-click-after-drag";
import { useIsShortestPhone } from "@/hooks/use-deck-focus";
import { goalStatus, TONE_TEXT } from "./goal-status";
import { CHECKIN_EVENT } from "@/components/brand-mark";

/**
 * Cards being passed by a dragged card glide aside on the app's ease-out,
 * the same motion as the ribbon pills, instead of the library's default.
 */
const CARD_SHIFT = { duration: 280, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };

/** Status line color per tone: only a risk borrows the warning color. */
interface GoalCardProps {
  goal: GoalDTO;
  onToggleToday: (goal: GoalDTO) => void;
  onEdit: (goal: GoalDTO) => void;
  /** Deletes the goal; rejects on failure so the dialog can stay open. */
  onDelete: (id: string) => Promise<void>;
  onOpenDetail: (goal: GoalDTO) => void;
  /** Moves the goal one place earlier (-1) or later (1) in the list. */
  onMove: (id: string, offset: -1 | 1) => void;
  /** Whether the goal is first or last, so the menu disables a move that can't happen. */
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Renders one goal: its streak, check-in button, and edit/move/delete menu.
 * Memoized: the list keeps unchanged goals as the same objects and the
 * handlers keep their identity, so a check-in re-renders only its own card.
 */
export const GoalCard = React.memo(function GoalCard({
  goal,
  onToggleToday,
  onEdit,
  onDelete,
  onOpenDetail,
  onMove,
  isFirst,
  isLast,
}: GoalCardProps) {
  const colorCfg = getColor(goal.color);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const {
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goal.id, transition: CARD_SHIFT });

  // Dropping a card must never check it in or open its history.
  useSwallowClickAfterDrag(isDragging);

  // The menu opens on press for a mouse, like any menu. A finger opens it on
  // the tap instead: the menu library opens on touch-down, so a swipe of
  // the deck that happened to start on the ⋯ button popped the menu open.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const touchOpensOnTap = React.useMemo(() => {
    let touched = false;
    return {
      onPointerDown: (e: React.PointerEvent) => {
        touched = e.pointerType !== "mouse";
        if (touched) e.preventDefault();
      },
      onClick: () => {
        if (touched) setMenuOpen((open) => !open);
      },
    };
  }, []);

  // On the shortest phones the heatmap shows more weeks, which makes its
  // cells smaller and the grid shorter, so the card fits without scrolling.
  const heatmapWeeks = useIsShortestPhone() ? 22 : 18;

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(goal.id);
      toast({ title: "Goal deleted", description: goal.name });
    } catch {
      toast({
        title: "Could not delete goal",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const doneToday = goal.stats.doneToday;
  const today = new Date();
  const cardState = cardCheckinState(goal.schedule, goal.stats, today);
  const buttonStyle = toggleButtonStyle(doneToday);
  const isWeekly = goal.schedule?.type === "weekly";
  const unitShort = isWeekly ? "w" : "d";
  const unitLong = isWeekly ? "week" : "day";
  const status = goalStatus(goal, cardState, today);
  const unitCount = plural(goal.stats.current, unitLong);
  // A stable array, so the heatmap's grid is rebuilt only when check-ins change.
  const dateKeys = React.useMemo(() => goal.checkIns.map((c) => c.date), [goal.checkIns]);

  // Counts check-ins made while this card is on screen; each one plays the
  // reward once.
  const rewards = useChangeCount(doneToday, (done) => done);

  // Tell the header's flame, which flares for every check-in.
  React.useEffect(() => {
    if (rewards > 0) window.dispatchEvent(new Event(CHECKIN_EVENT));
  }, [rewards]);

  return (
    <>
      {/* The whole card is the drag surface: a mouse drags after moving
          5px (so clicks on its buttons still land), a finger after a short
          press (so the page still scrolls). Keyboard and screen-reader
          users reorder from the ⋯ menu instead. */}
      <Card
        ref={setNodeRef}
        id={`goal-${goal.id}`}
        data-goal-id={goal.id}
        style={{
          transform: CSS.Translate.toString(transform),
          transition,
        }}
        className={cn(
          "deck-card group relative w-[82vw] shrink-0 cursor-grab touch-manipulation snap-center snap-always gap-0 overflow-hidden py-0 select-none [-webkit-touch-callout:none] sm:w-auto",
          isDragging && "card-lifted z-10 cursor-grabbing",
        )}
        {...listeners}
      >
        {/* color accent strip */}
        <div className={cn("absolute inset-x-0 top-0 h-1", colorCfg.bg)} />

        {/* Short phones tighten the spacing, never the controls, so the
            whole card fits above the ribbon bar. */}
        <CardContent className="px-5 pt-6 pb-5 shorter:pt-4 shorter:pb-3 shortest:pt-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  colorCfg.bgSoft,
                  colorCfg.text,
                )}
              >
                <GoalIcon name={goal.icon} className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-semibold leading-tight">
                  {goal.name}
                </h3>
                {goal.description ? (
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground shortest:hidden">
                    {goal.description}
                  </p>
                ) : null}
                <Badge variant="outline" className="mt-1.5 w-fit text-[11px] font-medium">
                  {cadenceLabel(goal.schedule)}
                </Badge>
              </div>
            </div>

            <div className="-mt-1.5 -mr-2 flex shrink-0 items-center">
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="tap-44 size-10 sm:size-9 text-muted-foreground hover:text-foreground"
                    aria-label={`Actions for ${goal.name}`}
                    {...touchOpensOnTap}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(goal)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  {/* The card itself drags; these are the same reorder for
                      keyboard and screen-reader users, or anyone who would
                      rather not drag. */}
                  <DropdownMenuItem disabled={isFirst} onClick={() => onMove(goal.id, -1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Move earlier
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={isLast} onClick={() => onMove(goal.id, 1)}>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Move later
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmDelete(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Streak: the unit is the one the cadence counts in */}
          <div className="mt-5 flex items-end justify-between gap-3 shorter:mt-3 shortest:mt-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Flame
                  // A new key replays the flicker for each check-in in a row.
                  key={rewards}
                  className={cn(
                    "card-flame h-6 w-6 shrink-0",
                    rewards > 0 && "is-flickering",
                    goal.stats.current > 0 ? colorCfg.text : "text-muted-foreground/50",
                  )}
                />
                <StreakNumber value={goal.stats.current} />
                <span className="self-end pb-0.5 text-sm text-muted-foreground">
                  {unitCount}
                </span>
              </div>
              <p className={cn("mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs", TONE_TEXT[status.tone])}>
                {status.tone === "risk" ? (
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : null}
                {status.text}
                {/* Weekly: quota progress dots, one per required check-in.
                    They sit in the status line, so a weekly card keeps the
                    same rows as its neighbours and their buttons line up. */}
                {isWeekly ? (
                  <WeekDots
                    done={goal.stats.week?.done ?? 0}
                    quota={goal.stats.week?.quota ?? 0}
                    dotOn={colorCfg.bg}
                    met={goal.stats.week?.met ?? false}
                  />
                ) : null}
              </p>
            </div>
            <div className="shrink-0 space-y-0.5 text-right text-xs text-muted-foreground">
              <p className="flex items-center justify-end gap-1">
                <Trophy className="h-3 w-3" aria-hidden />
                Best{" "}
                <span className="font-display font-medium tabular-nums text-foreground">
                  {goal.stats.longest}
                  {unitShort}
                </span>
              </p>
              <p>
                <span className="font-display font-medium tabular-nums text-foreground">
                  {goal.stats.total}
                </span>{" "}
                total
              </p>
            </div>
          </div>

          {/* Today toggle; on rest days a voluntary check-in */}
          <div className="relative mt-4 shorter:mt-3">
            {/* Three looks, by what the button asks: due = an edge and label
                in the goal color, done = a quiet tint of it, rest = dashed
                and neutral, since nothing is due. */}
            <Button
              onClick={() => onToggleToday(goal)}
              variant={buttonStyle.variant}
              aria-pressed={doneToday}
              data-checkin
              className={cn(
                "h-11 w-full border-0 text-[15px] shadow-none transition-[background-color,color,box-shadow,transform] duration-200 active:translate-y-px",
                buttonStyle.filled
                  ? colorCfg.fillSoft
                  : cardState.kind === "rest"
                    ? "h-auto min-h-11 border border-dashed border-foreground/50 bg-transparent dark:border-foreground/45 px-4 py-2 whitespace-normal text-muted-foreground hover:bg-accent dark:bg-transparent"
                    : colorCfg.action,
              )}
            >
              {doneToday ? (
                <>
                  <Check
                    className={cn("h-4 w-4", rewards > 0 && "check-draw")}
                    strokeWidth={2.5}
                  />
                  {cardState.kind === "rest" ? "Checked in on a rest day" : "Completed today"}
                </>
              ) : cardState.kind === "rest" ? (
                // Two parts that share a line when they fit and wrap to two
                // centred lines on narrow cards, so the text never runs into
                // the dashed edge.
                <span className="flex flex-wrap items-baseline justify-center gap-x-1.5 leading-tight">
                  <span>Do it anyway</span>
                  <span className="text-[13px]">(rest day — back {cardState.nextDayShort})</span>
                </span>
              ) : (
                <>
                  <Circle className="h-4 w-4 opacity-70" />
                  Mark done today
                </>
              )}
            </Button>
            {rewards > 0 ? (
              <CheckinReward key={rewards} text={colorCfg.text} />
            ) : null}
            {/* The rewards are visual only; this says the same thing to screen readers. */}
            <span className="sr-only" aria-live="polite">
              {rewards > 0 && doneToday
                ? `${goal.name} checked in. Streak: ${goal.stats.current} ${unitCount}.`
                : ""}
            </span>
          </div>

          {/* Mini heatmap. Clicking the grid opens the full history for
              pointer users; the History button is the labelled way in for
              everyone, so the grid itself stays out of the tab order. */}
          <div
            onClick={() => onOpenDetail(goal)}
            className="history-zone mt-4 -mx-2 shorter:mt-2 shortest:mt-1 cursor-pointer rounded-lg px-2 pt-2 transition-colors hover:bg-muted/50"
          >
            <Heatmap
              dateKeys={dateKeys}
              color={goal.color}
              weeks={heatmapWeeks}
              fluid
              showMonths={false}
              action={
                // A card-white pill with a goal-colored edge and clock, so it
                // reads as a button and never as one more heatmap cell.
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail(goal);
                  }}
                  className={cn(
                    "history-btn tap-44 -mr-1 h-9 gap-1.5 rounded-full bg-card pr-2.5 pl-3 text-xs font-semibold text-foreground shadow-xs ring-1 ring-inset hover:bg-card sm:h-8 dark:bg-card dark:hover:bg-accent",
                    colorCfg.ring,
                  )}
                  aria-label={`View full history for ${goal.name}`}
                >
                  <History className={cn("history-clock h-3.5 w-3.5", colorCfg.text)} aria-hidden />
                  History
                  <ChevronRight className="history-arrow h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{goal.name}</strong> and all{" "}
              {goal.stats.total} of its check-ins. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              // Radix closes the dialog on click unless the event is
              // cancelled. Keep it open so "Deleting…" shows until the request
              // settles; handleDelete closes it when done.
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

/**
 * Renders the current streak number. When the number changes after the
 * first render (a check-in landed), it rolls in from below; on first render
 * it is static, so a page load doesn't animate every card at once.
 */
function StreakNumber({ value }: { value: number }) {
  const changes = useChangeCount(value);
  return (
    <span
      key={changes}
      className={cn(
        "streak-num font-display text-4xl font-semibold leading-none tracking-tight tabular-nums",
        changes > 0 && "is-changed",
      )}
    >
      {value}
    </span>
  );
}

/**
 * Plays the check-in reward over the button: a soft ripple in the goal's
 * color. It is decorative and dropped under reduced motion; screen readers
 * get the live announcement and the button's pressed state instead.
 */
function CheckinReward({ text }: { text: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      <span className={cn("checkin-ripple absolute inset-0 rounded-md bg-current", text)} />
    </span>
  );
}

/** Renders quota progress dots for a weekly goal: one dot per required check-in. */
function WeekDots({
  done,
  quota,
  dotOn,
  met,
}: {
  done: number;
  quota: number;
  dotOn: string;
  met: boolean;
}) {
  return (
    <span
      className="ml-1.5 inline-flex gap-1.5"
      role="img"
      aria-label={`${done} of ${quota} check-ins this week`}
    >
      {Array.from({ length: quota }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            // Open dots are outlined like the today ribbon's empty pills, so
            // the quota still left stays visible at 3:1 in both themes.
            i < done ? dotOn : "ring-[1.5px] ring-inset ring-foreground/55",
          )}
          aria-current={i === done && !met ? "step" : undefined}
        />
      ))}
    </span>
  );
}
