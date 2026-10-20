"use client";

import * as React from "react";
import { z } from "zod";
import {
  CheckInResponseSchema,
  GoalDTOSchema,
  todayKey,
  type CreateGoalInput,
  type GoalDTO,
} from "@streakly/shared";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";
import {
  moveGoal,
  removeGoal,
  replaceGoal,
  restoreOrder,
  setCheckedOn,
  upsertGoal,
} from "@/lib/goal-list";

const GoalListSchema = z.array(GoalDTOSchema);
const OkSchema = z.object({ ok: z.literal(true) });

/**
 * Calls a data endpoint and returns its body checked against `schema`.
 * A non-2xx answer throws with the api's error message; a 2xx answer with
 * the wrong shape throws too, so callers never render a half-valid goal.
 */
async function requestJson<T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(url, init);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new Error(
      typeof message === "string" ? message : `Server responded with ${res.status}`,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Unexpected response from the server.");
  return parsed.data;
}

/** Request options for a JSON body. */
function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/**
 * Owns the signed-in user's goal list: loading it, keeping it fresh across
 * midnight, and every change to it (check-in, reorder, save, delete).
 * Components get the list plus one function per action and never call the
 * api themselves, so optimistic updates and their undo live in one place.
 */
export function useGoals() {
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

  const load = React.useCallback(
    async (silent = false, retries = 2) => {
      const loadId = ++latestLoad.current;
      if (!silent) setLoading(true);
      setRefreshing(true);
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const data = await requestJson("/api/goals", GoalListSchema, {
            cache: "no-store",
          });
          if (loadId !== latestLoad.current) return;
          setGoals(data);
          setLoading(false);
          setRefreshing(false);
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error("Unknown error");
          if (attempt < retries) {
            // Wait a bit longer before each retry.
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }
      if (loadId !== latestLoad.current) return;
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

  /** Reloads the list without the loading placeholder. */
  const refresh = React.useCallback(() => load(true), [load]);

  /**
   * Checks the goal in for today, or undoes today's check-in. The card
   * flips at once; the server's reply brings the recomputed streaks, and a
   * failure undoes only this click.
   */
  async function toggleToday(goal: GoalDTO) {
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
      const data = await requestJson(
        `/api/goals/${goal.id}/checkins`,
        CheckInResponseSchema,
        jsonBody("POST", { date: today }),
      );
      setGoals((prev) => replaceGoal(prev, data.goal));
      if (!wasDone) {
        toast({
          title: "Nice work! 🔥",
          description: `Checked in for ${goal.name}`,
        });
      }
    } catch {
      // Undo only this click, on the goal as it is now: restoring the
      // pre-click copy would also wipe anything that arrived since, such as
      // a refresh that brought newer data.
      setGoals((prev) => setCheckedOn(prev, goal.id, today, wasDone));
      toast({ title: "Could not check in", variant: "destructive" });
    } finally {
      togglesInFlight.current.delete(goal.id);
    }
  }

  /**
   * Moves goal `activeId` to the position of `overId` and saves the order.
   * On success the server's list replaces the local one; on failure the old
   * order comes back, keeping any goal data that changed meanwhile.
   */
  async function reorder(activeId: string, overId: string) {
    const before = goalsRef.current;
    const next = moveGoal(before, activeId, overId);
    if (!next) return;
    setGoals(next);

    try {
      const fresh = await requestJson(
        "/api/goals/reorder",
        GoalListSchema,
        jsonBody("PATCH", { ids: next.map((g) => g.id) }),
      );
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
  }

  /**
   * Creates a goal, or updates goal `id` when it is set, and returns the
   * saved goal. Throws with the api's message on failure, so the form can
   * show it and stay open.
   */
  async function saveGoal(id: string | null, input: CreateGoalInput) {
    const saved = await requestJson(
      id ? `/api/goals/${id}` : "/api/goals",
      GoalDTOSchema,
      jsonBody(id ? "PATCH" : "POST", input),
    );
    setGoals((prev) => upsertGoal(prev, saved));
    return saved;
  }

  /** Deletes a goal. Throws on failure, so the caller can keep its dialog open. */
  async function deleteGoal(id: string) {
    await requestJson(`/api/goals/${id}`, OkSchema, { method: "DELETE" });
    setGoals((prev) => removeGoal(prev, id));
  }

  return {
    goals,
    loading,
    refreshing,
    refresh,
    toggleToday,
    reorder,
    saveGoal,
    deleteGoal,
  };
}
