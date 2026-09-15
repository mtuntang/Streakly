"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Flame, MoreHorizontal, Pencil, Trash2, Trophy, Check, GripHorizontal } from "lucide-react";
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
import { getColor, type GoalDTO } from "@streakly/shared";
import {
  cadenceLabel,
  cardCheckinState,
  toggleButtonStyle,
} from "@streakly/shared";

import { GoalIcon } from "./goal-icon";
import { Heatmap } from "./heatmap";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface GoalCardProps {
  goal: GoalDTO;
  onToggleToday: (goal: GoalDTO) => void;
  onEdit: (goal: GoalDTO) => void;
  onDeleted: (goal: GoalDTO) => void;
  onOpenDetail: (goal: GoalDTO) => void;
}

export function GoalCard({
  goal,
  onToggleToday,
  onEdit,
  onDeleted,
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
      const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Goal deleted", description: goal.name });
      onDeleted(goal);
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
  const buttonStyle = toggleButtonStyle(cardState, doneToday);
  const isWeekly = goal.schedule?.type === "weekly";

  // Status message for daily/weekdays cards — honest states, never reuse empty-state copy.
  const cardStatusMessage = () => {
    if (cardState.kind === "rest") return `Rest day — back ${cardState.nextDayShort}`;
    if (doneToday) return "Completed today";
    if (goal.stats.current > 0) {
      return goal.stats.active ? "Streak alive — check in today!" : "Current streak";
    }
    if (cardState.brokenStreak) return "Streak broken — start again today";
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
          "group relative gap-0 overflow-hidden py-2 transition-shadow hover:shadow-md",
          "border-border/70",
          isDragging && "z-10 opacity-80 shadow-xl",
        )}
      >
        {/* color accent strip */}
        <div className={cn("absolute inset-x-0 top-0 h-1", colorCfg.bg)} />

        {/* Drag handle bar at the top of the card */}
        <div className="flex items-center justify-center border-b border-border/50 py-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-10 cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripHorizontal className="h-4 w-4" />
          </Button>
        </div>

        <CardContent className="pt-4">
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
                <Badge variant="outline" className="mt-1.5 w-fit text-[10px] font-medium">
                  {cadenceLabel(goal.schedule)}
                </Badge>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    aria-label="Goal actions"
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

          {/* Streak display — branches per cadence */}
          {isWeekly ? (
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-2">
                  <Flame
                    className={cn(
                      "h-7 w-7",
                      goal.stats.current > 0 ? colorCfg.text : "text-muted-foreground/50",
                    )}
                  />
                  <span className="text-4xl font-bold tabular-nums leading-none">
                    {goal.stats.current}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    week{goal.stats.current === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {goal.stats.week?.met
                    ? "Quota met this week"
                    : `${Math.max((goal.stats.week?.quota ?? 0) - (goal.stats.week?.done ?? 0), 0)} to go this week`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="secondary" className="gap-1 font-medium">
                  <Trophy className="h-3 w-3" />
                  Best {goal.stats.longest}w
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {goal.stats.total} total
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-2">
                  <Flame
                    className={cn(
                      "h-7 w-7",
                      goal.stats.current > 0 ? colorCfg.text : "text-muted-foreground/50",
                    )}
                  />
                  <span className="text-4xl font-bold tabular-nums leading-none">
                    {goal.stats.current}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    day{goal.stats.current === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{cardStatusMessage()}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="secondary" className="gap-1 font-medium">
                  <Trophy className="h-3 w-3" />
                  Best {goal.stats.longest}d
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {goal.stats.total} total
                </span>
              </div>
            </div>
          )}

          {/* Weekly: quota progress dots — one dot per required check-in */}
          {isWeekly ? (
            <WeekDots
              done={goal.stats.week?.done ?? 0}
              quota={goal.stats.week?.quota ?? 0}
              dotOn={colorCfg.bg}
              met={goal.stats.week?.met ?? false}
            />
          ) : null}

          {/* Today toggle — on rest days: voluntary "did it anyway" action */}
          {cardState.kind === "rest" ? (
            <Button
              onClick={() => onToggleToday(goal)}
              variant={buttonStyle.variant}
              aria-pressed={doneToday}
              className={cn(
                "mt-4 w-full",
                buttonStyle.filled
                  ? cn(colorCfg.bg, "text-white hover:opacity-90")
                  : "border-dashed opacity-70 hover:opacity-100",
              )}
            >
              {doneToday ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Checked in on a rest day
                </>
              ) : (
                `Do it anyway (Rest Day - back ${cardState.nextDayShort})`
              )}
            </Button>
          ) : (
            <Button
              onClick={() => onToggleToday(goal)}
              className={cn(
                "mt-4 w-full",
                buttonStyle.filled
                  ? cn(colorCfg.bg, "text-white hover:opacity-90")
                  : "border border-dashed border-border bg-transparent text-foreground hover:bg-accent",
              )}
              variant={buttonStyle.variant}
              aria-pressed={doneToday}
            >
              {doneToday ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Completed today
                </>
              ) : (
                "Mark done today"
              )}
            </Button>
          )}

          {/* Mini heatmap */}
          <button
            onClick={() => onOpenDetail(goal)}
            className="mt-4 w-full overflow-x-auto text-left"
            aria-label="View full history"
          >
            <Heatmap
              dateKeys={goal.checkIns.map((c) => c.date)}
              color={goal.color}
              weeks={14}
              cellSize={11}
              showMonths={false}
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
              onClick={handleDelete}
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

/** 7-dot this-week row for weekly goals (Sun start, matching buildHeatmap). */
/** Quota progress dots for weekly goals: one dot per required check-in. */
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
    <div className="mt-3 flex gap-1.5" aria-label={`${done} of ${quota} check-ins this week`}>
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
