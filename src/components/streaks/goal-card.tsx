"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronRight,
  Flame,
  GripVertical,
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
import { useToast } from "@/hooks/use-toast";

interface GoalCardProps {
  goal: GoalDTO;
  onToggleToday: (goal: GoalDTO) => void;
  onEdit: (goal: GoalDTO) => void;
  /** Deletes the goal; rejects on failure so the dialog can stay open. */
  onDelete: (id: string) => Promise<void>;
  onOpenDetail: (goal: GoalDTO) => void;
}

/** Renders one goal: its streak, check-in button, and edit/delete menu. */
export function GoalCard({
  goal,
  onToggleToday,
  onEdit,
  onDelete,
  onOpenDetail,
}: GoalCardProps) {
  const colorCfg = getColor(goal.color);
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goal.id });

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
  const atRisk = cardState.kind === "checkin" && cardState.urgency === "quota-at-risk";

  // Status line under the streak: honest per-cadence states, never the
  // empty-state copy.
  const statusMessage = () => {
    if (isWeekly) {
      const week = goal.stats.week;
      if (week?.met) return "Quota met this week";
      const left = Math.max((week?.quota ?? 0) - (week?.done ?? 0), 0);
      if (atRisk) {
        // Days left in the week counting today (the week ends Saturday).
        const daysLeft = 7 - today.getDay();
        return `${left} to go · ${daysLeft === 1 ? "last day" : `${daysLeft} days left`}`;
      }
      return `${left} to go this week`;
    }
    if (cardState.kind === "rest") return `Rest day — back ${cardState.nextDayShort}`;
    if (doneToday) return "Completed today";
    if (goal.stats.current > 0) {
      return goal.stats.active ? "Streak alive — check in today" : "Current streak";
    }
    if (cardState.kind === "checkin" && cardState.brokenStreak) {
      return "Streak broken — start again today";
    }
    return "No active streak yet";
  };

  return (
    <>
      <Card
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          willChange: "transform",
        }}
        className={cn(
          "group relative gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md",
          "border-border/70",
          isDragging && "z-10 opacity-80 shadow-xl",
        )}
      >
        {/* color accent strip */}
        <div className={cn("absolute inset-x-0 top-0 h-1", colorCfg.bg)} />

        <CardContent className="px-5 pt-6 pb-5">
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
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {goal.description}
                  </p>
                ) : null}
                <Badge variant="outline" className="mt-1.5 w-fit text-[11px] font-medium">
                  {cadenceLabel(goal.schedule)}
                </Badge>
              </div>
            </div>

            <div className="-mt-1.5 -mr-2 flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon"
                className="size-10 sm:size-9 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                aria-label={`Drag to reorder ${goal.name}`}
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 sm:size-9 text-muted-foreground hover:text-foreground"
                    aria-label={`Actions for ${goal.name}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(goal)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
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
          <div className="mt-5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Flame
                  className={cn(
                    "h-6 w-6 shrink-0",
                    goal.stats.current > 0 ? colorCfg.text : "text-muted-foreground/50",
                  )}
                />
                <StreakNumber value={goal.stats.current} />
                <span className="self-end pb-0.5 text-sm text-muted-foreground">
                  {unitLong}
                  {goal.stats.current === 1 ? "" : "s"}
                </span>
              </div>
              <p
                className={cn(
                  "mt-1.5 text-xs",
                  atRisk ? cn("font-medium", colorCfg.text) : "text-muted-foreground",
                )}
              >
                {statusMessage()}
              </p>
            </div>
            <div className="shrink-0 space-y-0.5 text-right text-xs text-muted-foreground">
              <p className="flex items-center justify-end gap-1">
                <Trophy className="h-3 w-3" aria-hidden />
                Best{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {goal.stats.longest}
                  {unitShort}
                </span>
              </p>
              <p>
                <span className="font-medium tabular-nums text-foreground">
                  {goal.stats.total}
                </span>{" "}
                total
              </p>
            </div>
          </div>

          {/* Weekly: quota progress dots, one per required check-in */}
          {isWeekly ? (
            <WeekDots
              done={goal.stats.week?.done ?? 0}
              quota={goal.stats.week?.quota ?? 0}
              dotOn={colorCfg.bg}
              met={goal.stats.week?.met ?? false}
            />
          ) : null}

          {/* Today toggle; on rest days a voluntary check-in */}
          <Button
            onClick={() => onToggleToday(goal)}
            variant={buttonStyle.variant}
            aria-pressed={doneToday}
            className={cn(
              "mt-4 h-10 w-full",
              buttonStyle.filled
                ? cn(colorCfg.fill, "border-transparent hover:opacity-90")
                : cn(
                    "border-dashed bg-transparent hover:bg-accent dark:bg-transparent",
                    cardState.kind === "rest" ? "text-muted-foreground" : "text-foreground",
                  ),
            )}
          >
            {doneToday ? (
              <>
                <Check className="h-4 w-4" />
                {cardState.kind === "rest" ? "Checked in on a rest day" : "Completed today"}
              </>
            ) : cardState.kind === "rest" ? (
              `Do it anyway (rest day — back ${cardState.nextDayShort})`
            ) : (
              "Mark done today"
            )}
          </Button>

          {/* Mini heatmap: opens the full history */}
          <button
            type="button"
            onClick={() => onOpenDetail(goal)}
            className="group/history mt-4 block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            aria-label={`View full history for ${goal.name}`}
          >
            <Heatmap
              dateKeys={goal.checkIns.map((c) => c.date)}
              color={goal.color}
              weeks={18}
              fluid
              showMonths={false}
              action={
                <span className="inline-flex items-center gap-0.5 transition-colors group-hover/history:text-foreground group-focus-visible/history:text-foreground">
                  History
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </span>
              }
            />
          </button>
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
}

/**
 * Renders the current streak number. When the number changes after the
 * first render (a check-in landed), it rolls in from below; on first render
 * it is static, so a page load doesn't animate every card at once.
 */
function StreakNumber({ value }: { value: number }) {
  const [shown, setShown] = React.useState(value);
  const [changes, setChanges] = React.useState(0);
  if (value !== shown) {
    setShown(value);
    setChanges(changes + 1);
  }
  return (
    <span
      key={changes}
      className={cn(
        "text-4xl font-semibold leading-none tracking-tight tabular-nums",
        changes > 0 &&
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none",
      )}
    >
      {value}
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
    <div
      className="mt-3 flex gap-1.5"
      role="img"
      aria-label={`${done} of ${quota} check-ins this week`}
    >
      {Array.from({ length: quota }, (_, i) => (
        <span
          key={i}
          className={cn("h-2.5 w-2.5 rounded-full", i < done ? dotOn : "bg-border")}
          aria-current={i === done && !met ? "step" : undefined}
        />
      ))}
    </div>
  );
}
