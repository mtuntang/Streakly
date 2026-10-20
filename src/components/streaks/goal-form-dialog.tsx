"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GripHorizontal } from "lucide-react";
import {
  CreateGoalSchema,
  DEFAULT_COLOR,
  DEFAULT_ICON,
  GOAL_COLORS,
  GOAL_ICONS,
  weekdayShort,
  type CreateGoalInput,
  type GoalDTO,
  type Schedule,
} from "@streakly/shared";
import { GoalIcon } from "./goal-icon";
import { cn } from "@/lib/utils";

/** Starting values for the cadence pickers when a goal doesn't set them. */
const DEFAULT_DAYS = [1, 3, 5];
const DEFAULT_TIMES_PER_WEEK = 3;

interface GoalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: GoalDTO | null;
  /** Saves the goal (create when `id` is null); rejects with the api's message. */
  onSave: (id: string | null, input: CreateGoalInput) => Promise<GoalDTO>;
}

/**
 * Renders the dialog that creates a goal, or edits one when `goal` is set.
 * Memoized, so a closed dialog does not re-render on every list change.
 */
export const GoalFormDialog = React.memo(function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  onSave,
}: GoalFormDialogProps) {
  const isEdit = !!goal;
  const { toast } = useToast();

  // The parent remounts this dialog (a new `key`) each time it opens, so
  // every field starts from `goal`, or from the defaults for a new goal.
  const schedule = goal?.schedule ?? { type: "daily" as const };
  const [name, setName] = React.useState(goal?.name ?? "");
  const [description, setDescription] = React.useState(goal?.description ?? "");
  const [color, setColor] = React.useState(goal?.color ?? DEFAULT_COLOR);
  const [icon, setIcon] = React.useState(goal?.icon ?? DEFAULT_ICON);
  const [mode, setMode] = React.useState<Schedule["type"]>(schedule.type);
  const [days, setDays] = React.useState<number[]>(
    schedule.type === "weekdays" ? schedule.days : DEFAULT_DAYS,
  );
  const [timesPerWeek, setTimesPerWeek] = React.useState(
    schedule.type === "weekly" ? schedule.timesPerWeek : DEFAULT_TIMES_PER_WEEK,
  );
  const [saving, setSaving] = React.useState(false);

  const currentSchedule: Schedule =
    mode === "daily"
      ? { type: "daily" }
      : mode === "weekdays"
        ? { type: "weekdays", days }
        : { type: "weekly", timesPerWeek };

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  }

  async function handleSave() {
    // Checked before the schema: its message for an empty day list is
    // generic, and this one tells the user what to do.
    if (mode === "weekdays" && days.length === 0) {
      toast({
        title: "Pick at least one day",
        variant: "destructive",
      });
      return;
    }
    // The same schema validates the request at the api.
    const parsed = CreateGoalSchema.safeParse({
      name,
      description,
      color,
      icon,
      schedule: currentSchedule,
    });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0]!.message, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const saved = await onSave(goal?.id ?? null, parsed.data);
      toast({
        title: isEdit ? "Goal updated" : "Goal created",
        description: saved.name,
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Something went wrong",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent draggable className="sm:max-w-[480px]">
        <DialogHeader
          data-dialog-drag-handle
          className="cursor-move select-none"
        >
          <DialogTitle>{isEdit ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details of your habit."
              : "Create a new habit to track."}
          </DialogDescription>
          <span className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 text-muted-foreground/40">
            <GripHorizontal className="h-4 w-4" />
          </span>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="goal-name">Name</Label>
            <Input
              id="goal-name"
              placeholder="e.g. Morning workout"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="goal-desc">Description (optional)</Label>
            <Textarea
              id="goal-desc"
              placeholder="What does success look like?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColor(c.key)}
                  aria-label={c.label}
                  aria-pressed={color === c.key}
                  className={cn(
                    "h-8 w-8 rounded-full transition-transform",
                    c.bg,
                    color === c.key
                      ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110"
                      : "hover:scale-110",
                  )}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Icon</Label>
            <div className="grid grid-cols-9 gap-1.5">
              {GOAL_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setIcon(name)}
                  aria-label={name}
                  aria-pressed={icon === name}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                    icon === name
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <GoalIcon name={name} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Cadence</Label>
            <div className="flex rounded-lg border border-border p-1">
              {(
                [
                  ["daily", "Every day"],
                  ["weekdays", "Specific days"],
                  ["weekly", "X per week"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-sm transition-colors",
                    mode === m
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "weekdays" && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-label={weekdayShort(d)}
                    aria-pressed={days.includes(d)}
                    className={cn(
                      "h-9 min-w-9 rounded-md border px-2 text-xs font-medium transition-colors",
                      days.includes(d)
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {weekdayShort(d)}
                  </button>
                ))}
              </div>
            )}

            {mode === "weekly" && (
              <div className="mt-1 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Fewer times per week"
                  onClick={() => setTimesPerWeek((t) => Math.max(1, t - 1))}
                  disabled={timesPerWeek <= 1}
                >
                  −
                </Button>
                <span className="min-w-16 text-center text-sm font-medium">
                  {timesPerWeek}× per week
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="More times per week"
                  onClick={() => setTimesPerWeek((t) => Math.min(7, t + 1))}
                  disabled={timesPerWeek >= 7}
                >
                  +
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
