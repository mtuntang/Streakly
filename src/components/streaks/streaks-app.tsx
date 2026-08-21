"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { Flame, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatsBar } from "./stats-bar";
import { GoalCard } from "./goal-card";
import { GoalFormDialog } from "./goal-form-dialog";
import { GoalDetailSheet } from "./goal-detail-sheet";
import { EmptyState } from "./empty-state";
import type { GoalDTO } from "@/lib/goal-config";
import { useToast } from "@/hooks/use-toast";
import { todayKey } from "@/lib/streaks";

export function StreaksApp() {
  const { toast } = useToast();
  const [goals, setGoals] = React.useState<GoalDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingGoal, setEditingGoal] = React.useState<GoalDTO | null>(null);
  const [detailGoal, setDetailGoal] = React.useState<GoalDTO | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const today = todayKey();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const fetchGoals = React.useCallback(
    async (silent = false, retries = 2) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch("/api/goals", { cache: "no-store" });
          if (!res.ok) throw new Error(`Server responded with ${res.status}`);
          const data: GoalDTO[] = await res.json();
          if (!Array.isArray(data)) throw new Error("Invalid response format");
          setGoals(data);
          setLoading(false);
          setRefreshing(false);
          return; // Success — exit early
        } catch (err) {
          lastError = err instanceof Error ? err : new Error("Unknown error");
          if (attempt < retries) {
            // Wait a bit before retrying (exponential backoff)
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }
      // All retries exhausted
      toast({
        title: "Could not load goals",
        description:
          lastError?.message === "Failed to fetch"
            ? "Network error — check your connection."
            : lastError?.message ?? "An unexpected error occurred.",
        variant: "destructive",
      });
      if (!silent) setGoals([]);
      setLoading(false);
      setRefreshing(false);
    },
    [toast],
  );

  React.useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Keep detail view in sync with the latest goal data.
  React.useEffect(() => {
    if (detailGoal) {
      const updated = goals.find((g) => g.id === detailGoal.id);
      if (updated && updated !== detailGoal) setDetailGoal(updated);
    }
  }, [goals, detailGoal]);

  function handleCreate() {
    setEditingGoal(null);
    setFormOpen(true);
  }

  function handleEdit(goal: GoalDTO) {
    setEditingGoal(goal);
    setFormOpen(true);
    setDetailOpen(false);
  }

  function handleOpenDetail(goal: GoalDTO) {
    setDetailGoal(goal);
    setDetailOpen(true);
  }

  function handleSaved(saved: GoalDTO) {
    setGoals((prev) => {
      const exists = prev.some((g) => g.id === saved.id);
      return exists
        ? prev.map((g) => (g.id === saved.id ? saved : g))
        : [...prev, saved];
    });
  }

  function handleDeleted(goal: GoalDTO) {
    setGoals((prev) => prev.filter((g) => g.id !== goal.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setGoals((prev) => {
      const oldIndex = prev.findIndex((g) => g.id === active.id);
      const newIndex = prev.findIndex((g) => g.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });

    // Persist the new order to the database.
    try {
      const ids = goals.map((g) => g.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(ids, oldIndex, newIndex);
      const res = await fetch("/api/goals/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
    } catch {
      toast({
        title: "Could not save order",
        description: "Your changes may not persist after refresh.",
        variant: "destructive",
      });
    }
  }

  async function handleToggleToday(goal: GoalDTO) {
    // Optimistic update.
    const wasDone = goal.stats.doneToday;
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goal.id) return g;
        const checkIns = wasDone
          ? g.checkIns.filter((c) => c.date !== today)
          : [...g.checkIns, { date: today }];
        return { ...g, checkIns };
      }),
    );

    try {
      const res = await fetch(`/api/goals/${goal.id}/checkins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      const data = await res.json();
      if (data.goal) {
        setGoals((prev) =>
          prev.map((g) => (g.id === data.goal.id ? data.goal : g)),
        );
      }
      if (!wasDone) {
        toast({
          title: "Nice work! 🔥",
          description: `Checked in for ${goal.name}`,
        });
      }
    } catch {
      // Revert on failure.
      setGoals((prev) =>
        prev.map((g) => (g.id === goal.id ? goal : g)),
      );
      toast({
        title: "Could not check in",
        variant: "destructive",
      });
    }
  }

  const doneTodayCount = goals.filter((g) => g.stats.doneToday).length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-sm">
              <Flame className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-bold tracking-tight sm:text-lg">
                Streakly
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Stay consistent, one day at a time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => fetchGoals(true)}
              aria-label="Refresh"
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
            <ThemeToggle />
            <Button onClick={handleCreate} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New goal</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Hero / greeting */}
        <div className="mb-6 flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {greeting()}
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            {loading
              ? "Loading your streaks…"
              : goals.length === 0
                ? "Let's build some momentum."
                : doneTodayCount === goals.length
                  ? "All goals done today. You're on fire! 🔥"
                  : `${doneTodayCount}/${goals.length} goals completed today — keep the chain alive.`}
          </p>
        </div>

        {loading ? (
          <LoadingState />
        ) : goals.length === 0 ? (
          <EmptyState onCreate={handleCreate} />
        ) : (
          <>
            <StatsBar goals={goals} />

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={goals.map((g) => g.id)}
                strategy={rectSortingStrategy}
              >
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {goals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      onToggleToday={handleToggleToday}
                      onEdit={handleEdit}
                      onDeleted={handleDeleted}
                      onOpenDetail={handleOpenDetail}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/70 bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            Streakly — don&apos;t break the chain
          </p>
          <p>
            {goals.length} {goals.length === 1 ? "goal" : "goals"} tracked
          </p>
        </div>
      </footer>

      {/* Dialogs */}
      <GoalFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editingGoal}
        onSaved={handleSaved}
      />
      <GoalDetailSheet
        goal={detailGoal}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
      />
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl bg-muted/60"
          />
        ))}
      </div>
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
