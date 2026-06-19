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
import { GOAL_COLORS } from "@/lib/goal-config";
import { GOAL_ICONS } from "@/lib/goal-config";
import { GoalIcon } from "./goal-icon";
import type { GoalDTO } from "@/lib/goal-config";
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
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(goal?.name ?? "");
      setDescription(goal?.description ?? "");
      setColor(goal?.color ?? "emerald");
      setIcon(goal?.icon ?? "Flame");
    }
  }, [open, goal]);

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details of your habit."
              : "Create a new habit to track daily."}
          </DialogDescription>
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
