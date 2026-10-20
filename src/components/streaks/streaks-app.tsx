"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Flame, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TodaySummary } from "./today-summary";
import { RefreshButton } from "./refresh-button";
import { GoalCard } from "./goal-card";
import { GoalFormDialog } from "./goal-form-dialog";
import { GoalDetailSheet } from "./goal-detail-sheet";
import { EmptyState } from "./empty-state";
import type { GoalDTO } from "@streakly/shared";
import { useToast } from "@/hooks/use-toast";
import { useGoals } from "@/hooks/use-goals";
import { signOut } from "@/lib/session";
import { BrandMark } from "@/components/brand-mark";

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
    // The whole card drags. A mouse starts after 5px of movement, so a
    // click on the card's buttons is still a click; a finger starts after a
    // short press, so a swipe over the cards still scrolls the page.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="app-header sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <h1>
            <BrandMark />
          </h1>

          <div className="flex items-center gap-1 sm:gap-2">
            <RefreshButton refreshing={refreshing} onRefresh={refresh} />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="size-10 rounded-full sm:size-9"
              onClick={handleSignOut}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <Button onClick={handleCreate} className="ml-1 h-10 gap-1.5 sm:h-9">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New goal</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
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
          <TodaySummary goals={goals} greeting={greeting()} />
        )}

        {loading ? (
          <LoadingState />
        ) : goals.length === 0 ? (
          <EmptyState onCreate={handleCreate} />
        ) : (
          <>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={goals.map((g) => g.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <Flame className="h-3.5 w-3.5 text-brand" aria-hidden />
            Streakly — don&apos;t break the chain
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
