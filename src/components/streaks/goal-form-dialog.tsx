"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GripHorizontal, Minus, Plus, X as XIcon } from "lucide-react";
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
import { useIsDeck } from "@/hooks/use-deck-focus";

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

  // Phones get a bottom sheet: the form scrolls between a fixed header
  // and fixed buttons, so the title, close and Create stay in reach however
  // short the screen or however much of it the keyboard takes. Wider
  // screens keep the centred dialog, which can be dragged by its header.
  const isPhone = useIsDeck();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        draggable={!isPhone}
        showCloseButton={false}
        // Phones open on the sheet itself, not on its first button: focus
        // still moves into the dialog for screen readers, without a focus
        // ring appearing on Close before the user has done anything.
        onOpenAutoFocus={(e) => {
          if (!isPhone) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        className={cn(
          "outline-none sm:max-w-[480px]",
          "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:flex max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:gap-0 max-sm:rounded-none max-sm:rounded-t-[1.5rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:p-0",
          "max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom max-sm:duration-300",
        )}
      >
        <DialogHeader
          data-dialog-drag-handle={isPhone ? undefined : true}
          className="relative flex-row items-start justify-between gap-3 text-left sm:cursor-move sm:select-none max-sm:border-b max-sm:border-border/60 max-sm:px-5 max-sm:pt-5 max-sm:pb-4"
        >
          <div className="grid min-w-0 gap-1.5">
            <DialogTitle>{isEdit ? "Edit goal" : "New goal"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the details of your habit."
                : "Create a new habit to track."}
            </DialogDescription>
          </div>
          <DialogClose className="tap-44 -mt-1.5 -mr-1.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:size-9">
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
          <span className="pointer-events-none absolute -top-3 left-1/2 hidden -translate-x-1/2 text-muted-foreground/40 sm:block">
            <GripHorizontal className="h-4 w-4" />
          </span>
        </DialogHeader>

        <div className="grid gap-5 py-2 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:px-5 max-sm:py-5">
          <div className="grid gap-2">
            <Label htmlFor="goal-name">Name</Label>
            <Input
              id="goal-name"
              placeholder="e.g. Morning workout"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              // On phones the keyboard would cover half the form before the
              // user has seen it; they tap the field when ready.
              autoFocus={!isPhone}
              enterKeyHint="next"
              className="max-sm:h-11 max-sm:text-base"
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
              className="max-sm:text-base"
            />
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm leading-none font-medium">Color</legend>
            {/* One row of eight at every width: each swatch takes an equal
                share, capped at 40px. */}
            <div className="grid grid-cols-8 gap-2">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColor(c.key)}
                  aria-label={c.label}
                  aria-pressed={color === c.key}
                  className={cn(
                    "aspect-square w-full max-w-10 justify-self-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    c.bg,
                    color === c.key
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      : "hover:scale-110",
                  )}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm leading-none font-medium">Icon</legend>
            {/* As many 44px columns as fit (seven on most phones, nine in
                the dialog), so the buttons never overlap. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 sm:grid-cols-9">
              {GOAL_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setIcon(name)}
                  aria-label={name}
                  aria-pressed={icon === name}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-9 sm:w-9 sm:rounded-md",
                    icon === name
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <GoalIcon name={name} className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm leading-none font-medium">Cadence</legend>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-border p-1">
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
                    "min-h-11 rounded-lg px-1.5 text-sm leading-tight text-balance transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9",
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
              <div className="mt-1 grid grid-cols-7 gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-label={weekdayShort(d)}
                    aria-pressed={days.includes(d)}
                    className={cn(
                      "h-11 rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:rounded-md",
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
                  className="size-11 rounded-full sm:size-9"
                  aria-label="Fewer times per week"
                  onClick={() => setTimesPerWeek((t) => Math.max(1, t - 1))}
                  disabled={timesPerWeek <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="min-w-24 text-center text-sm font-medium tabular-nums" aria-live="polite">
                  {timesPerWeek}× per week
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 rounded-full sm:size-9"
                  aria-label="More times per week"
                  onClick={() => setTimesPerWeek((t) => Math.min(7, t + 1))}
                  disabled={timesPerWeek >= 7}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </fieldset>
        </div>

        <DialogFooter className="max-sm:flex-row max-sm:gap-3 max-sm:border-t max-sm:border-border/60 max-sm:px-5 max-sm:pt-3 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="max-sm:h-11 max-sm:flex-1"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="max-sm:h-11 max-sm:flex-[2]">
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
