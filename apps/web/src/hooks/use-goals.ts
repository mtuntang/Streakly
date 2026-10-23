"use client";

import * as React from "react";
import { todayKey, type CreateGoalInput, type GoalDTO } from "@streakly/shared";
import { apiGoalsClient, type GoalsClient } from "@/lib/goals-client";
import { useToast } from "@/hooks/use-toast";
import {
  moveGoal,
  neighborId,
  removeGoal,
  replaceGoal,
  restoreOrder,
  setCheckedOn,
  upsertGoal,
} from "@/lib/goal-list";

/**
 * Owns the goal list: loading it, keeping it fresh across midnight, and
 * every change to it (check-in, reorder, save, delete). Components get the
 * list plus one function per action and never call the api themselves, so
 * optimistic updates and their undo live in one place. `client` is where
 * the goals live: the api by default, memory on the demo page. It must
 * keep its identity across renders.
 * The action functions keep their identity across renders, so memoized
 * goal cards skip re-rendering when only another goal changed.
 */
export function useGoals(client: GoalsClient = apiGoalsClient) {
  const { toast } = useToast();
  const [goals, setGoals] = React.useState<GoalDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  // The list as of the last render, for handlers that must read it outside
  // a setGoals updater (reorder sends the new order to the server).
  const goalsRef = React.useRef(goals);
  React.useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  // Only the newest load may write the list: a slow response from an older
  // refresh must not overwrite a newer one.
  const latestLoad = React.useRef(0);

  // Goal ids with a check-in request in flight (see toggleToday).
  const togglesInFlight = React.useRef(new Set<string>());

  // Resolves true when the list was loaded (or a newer load took over),
  // false when every attempt failed and the error toast was shown.
  const load = React.useCallback(
    async (silent = false, retries = 2): Promise<boolean> => {
      const loadId = ++latestLoad.current;
      if (!silent) setLoading(true);
      setRefreshing(true);
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const data = await client.list();
          if (loadId !== latestLoad.current) return true;
          setGoals(data);
          setLoading(false);
          setRefreshing(false);
          return true;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error("Unknown error");
          if (attempt < retries) {
            // Wait a bit longer before each retry.
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }
      if (loadId !== latestLoad.current) return true;
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
      return false;
    },
    [client, toast],
  );

  React.useEffect(() => {
    load();
  }, [load]);

  // "Done today" and the streaks are computed for a date, so reload them when
  // the local date changes while the page is open. The minute check also
  // catches up after a laptop sleeps, and returning to the tab checks at once.
  React.useEffect(() => {
    let day = todayKey();
    const refreshIfNewDay = () => {
      const now = todayKey();
      if (now !== day) {
        day = now;
        load(true);
      }
    };
    const timer = setInterval(refreshIfNewDay, 60_000);
    document.addEventListener("visibilitychange", refreshIfNewDay);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfNewDay);
    };
  }, [load]);

  /** Reloads the list without the loading placeholder; resolves to whether it worked. */
  const refresh = React.useCallback(() => load(true), [load]);

  /**
   * Checks the goal in for today, or undoes today's check-in. The card
   * flips at once; the server's reply brings the recomputed streaks, and a
   * failure undoes only this click.
   */
  const toggleToday = React.useCallback(async (goal: GoalDTO) => {
    // The endpoint is a toggle, so a second click while the first request is
    // in flight would undo it. Ignore clicks until the goal's request settles.
    if (togglesInFlight.current.has(goal.id)) return;
    togglesInFlight.current.add(goal.id);
    // Read the date at click time: a tab left open past midnight must check
    // in for the new day, not the day the page last rendered.
    const today = todayKey();
    const wasDone = goal.stats.doneToday;
    setGoals((prev) => setCheckedOn(prev, goal.id, today, !wasDone));

    try {
      const saved = await client.toggle(goal.id, today);
      setGoals((prev) => replaceGoal(prev, saved));
    } catch {
      // Undo only this click, on the goal as it is now: restoring the
      // pre-click copy would also wipe anything that arrived since, such as
      // a refresh that brought newer data.
      setGoals((prev) => setCheckedOn(prev, goal.id, today, wasDone));
      toast({ title: "Could not check in", variant: "destructive" });
    } finally {
      togglesInFlight.current.delete(goal.id);
    }
  }, [client, toast]);

  /**
   * Moves goal `activeId` to the position of `overId` and saves the order.
   * On success the server's list replaces the local one; on failure the old
   * order comes back, keeping any goal data that changed meanwhile.
   */
  const reorder = React.useCallback(async (activeId: string, overId: string) => {
    const before = goalsRef.current;
    const next = moveGoal(before, activeId, overId);
    if (!next) return;
    setGoals(next);

    try {
      const fresh = await client.reorder(next.map((g) => g.id));
      setGoals(fresh);
    } catch {
      const oldOrder = before.map((g) => g.id);
      setGoals((prev) => restoreOrder(prev, oldOrder));
      toast({
        title: "Could not save order",
        description: "The previous order was restored.",
        variant: "destructive",
      });
    }
  }, [client, toast]);

  /**
   * Moves goal `id` one place earlier (-1) or later (1) and saves the order:
   * the menu way to reorder, for keyboard and screen-reader users and anyone
   * who would rather not drag. Does nothing at either end of the list.
   */
  const move = React.useCallback(
    (id: string, offset: -1 | 1) => {
      const target = neighborId(goalsRef.current, id, offset);
      if (target) void reorder(id, target);
    },
    [reorder],
  );

  /**
   * Creates a goal, or updates goal `id` when it is set, and returns the
   * saved goal. Throws with the api's message on failure, so the form can
   * show it and stay open.
   */
  const saveGoal = React.useCallback(async (id: string | null, input: CreateGoalInput) => {
    const saved = await client.save(id, input);
    setGoals((prev) => upsertGoal(prev, saved));
    return saved;
  }, [client]);

  /** Deletes a goal. Throws on failure, so the caller can keep its dialog open. */
  const deleteGoal = React.useCallback(async (id: string) => {
    await client.remove(id);
    setGoals((prev) => removeGoal(prev, id));
  }, [client]);

  return {
    goals,
    loading,
    refreshing,
    refresh,
    toggleToday,
    reorder,
    move,
    saveGoal,
    deleteGoal,
  };
}
