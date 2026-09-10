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
import { GOAL_COLORS } from "@streakly/shared";
import { GOAL_ICONS } from "@streakly/shared";
import {
  ScheduleSchema,
  weekdayShort,
  type Schedule,
} from "@streakly/shared";
import { GoalIcon } from "./goal-icon";
import type { GoalDTO } from "@streakly/shared";
import { cn } from "@/lib/utils";

interface GoalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: GoalDTO | null;
  onSaved: (goal: GoalDTO) => void;
}

export function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  onSaved,
}: GoalFormDialogProps) {
  const isEdit = !!goal;
  const { toast } = useToast();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState("emerald");
  const [icon, setIcon] = React.useState("Flame");
  const [mode, setMode] = React.useState<"daily" | "weekdays" | "weekly">("daily");
  const [days, setDays] = React.useState<number[]>([1, 3, 5]);
  const [timesPerWeek, setTimesPerWeek] = React.useState(3);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(goal?.name ?? "");
      setDescription(goal?.description ?? "");
      setColor(goal?.color ?? "emerald");
      setIcon(goal?.icon ?? "Flame");
      const s = goal?.schedule ?? { type: "daily" as const };
      setMode(s.type);
      if (s.type === "weekdays") setDays(s.days);
      if (s.type === "weekly") setTimesPerWeek(s.timesPerWeek);
    }
  }, [open, goal]);

  const currentSchedule: Schedule | null =
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
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (mode === "weekdays" && days.length === 0) {
      toast({
        title: "Pick at least one day",
        variant: "destructive",
      });
      return;
    }
    const parsedSchedule = ScheduleSchema.safeParse(currentSchedule);
    if (!parsedSchedule.success) {
      toast({ title: "Invalid cadence", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = isEdit ? `/api/goals/${goal!.id}` : "/api/goals";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          icon,
          schedule: parsedSchedule.data,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to save goal");
      }
      const saved: GoalDTO = await res.json();
      toast({
        title: isEdit ? "Goal updated" : "Goal created",
        description: saved.name,
      });
      onSaved(saved);
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
              : "Create a new habit to track daily."}
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
                  {m === "daily" ? "Every day" : m === "weekdays" ? "Specific days" : "X per week"}
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
}
