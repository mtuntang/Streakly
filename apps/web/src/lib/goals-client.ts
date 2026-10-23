"use client";

import { z } from "zod";
import {
  CheckInResponseSchema,
  GoalDTOSchema,
  type CreateGoalInput,
  type GoalDTO,
} from "@streakly/shared";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Where the goal list lives and how it changes. useGoals calls only these
 * methods, so the signed-in app (the api) and the demo (memory) share the
 * same hook, optimistic updates and all. Every method throws with a
 * message the user can read when the change didn't happen.
 */
export interface GoalsClient {
  /** Returns the goals in their saved order, with streak stats. */
  list(): Promise<GoalDTO[]>;
  /** Checks goal `id` in for `date`, or undoes that check-in; returns the goal. */
  toggle(id: string, date: string): Promise<GoalDTO>;
  /** Saves the order in `ids` and returns the reordered list. */
  reorder(ids: string[]): Promise<GoalDTO[]>;
  /** Creates a goal, or updates goal `id` when it is set; returns the saved goal. */
  save(id: string | null, input: CreateGoalInput): Promise<GoalDTO>;
  /** Deletes goal `id` and its check-ins. */
  remove(id: string): Promise<void>;
}

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

/** The signed-in user's goals, read and written through the api. */
export const apiGoalsClient: GoalsClient = {
  list: () => requestJson("/api/goals", GoalListSchema, { cache: "no-store" }),
  toggle: async (id, date) =>
    (
      await requestJson(
        `/api/goals/${id}/checkins`,
        CheckInResponseSchema,
        jsonBody("POST", { date }),
      )
    ).goal,
  reorder: (ids) =>
    requestJson("/api/goals/reorder", GoalListSchema, jsonBody("PATCH", { ids })),
  save: (id, input) =>
    requestJson(
      id ? `/api/goals/${id}` : "/api/goals",
      GoalDTOSchema,
      jsonBody(id ? "PATCH" : "POST", input),
    ),
  remove: async (id) => {
    await requestJson(`/api/goals/${id}`, OkSchema, { method: "DELETE" });
  },
};
