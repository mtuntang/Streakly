"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Flame, LogOut, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatsBar } from "./stats-bar";
import { GoalCard } from "./goal-card";
import { GoalFormDialog } from "./goal-form-dialog";
import { GoalDetailSheet } from "./goal-detail-sheet";
import { EmptyState } from "./empty-state";
import type { GoalDTO } from "@streakly/shared";
import { useToast } from "@/hooks/use-toast";
import { useGoals } from "@/hooks/use-goals";
import { signOut } from "@/lib/session";

/** Renders the signed-in app: stats, the sortable goal grid, and its dialogs. */
export function StreaksApp() {
  const { toast } = useToast();
  const {
    goals,
    loading,
    refreshing,
    refresh,
    toggleToday,
    reorder,
    saveGoal,
    deleteGoal,
  } = useGoals();

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    // Space picks up the focused drag handle, arrows move it, Space drops.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function openForm(goal: GoalDTO | null) {
    setEditingGoal(goal);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

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

  function handleEdit(goal: GoalDTO) {
    openForm(goal);
    setDetailOpen(false);
  }

  function handleOpenDetail(goal: GoalDTO) {
    setDetailId(goal.id);
    setDetailOpen(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    reorder(String(active.id), String(over.id));
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
              onClick={refresh}
              aria-label="Refresh"
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={handleSignOut}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
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
              : todayProgressMessage(doneTodayCount, goals.length)}
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
                      onToggleToday={toggleToday}
                      onEdit={handleEdit}
                      onDelete={deleteGoal}
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

/** Returns the line under the greeting that sums up today's progress. */
function todayProgressMessage(done: number, total: number): string {
  if (total === 0) return "Let's build some momentum.";
  if (done === total) return "All goals done today. You're on fire! 🔥";
  return `${done}/${total} goals completed today — keep the chain alive.`;
}

/** Renders placeholder cards while goals load. */
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
