/**
 * The single adapter between the test suite and the HTTP API: tests call
 * api.goals.create({...}) instead of hand-building requests.
 *
 * This module owns the mechanics — paths, methods, session cookie, JSON
 * encoding. Parameter types come from @streakly/shared, the same schemas
 * the server validates against, so a contract change breaks test
 * compilation instead of failing at runtime.
 */
export function createTestApi(
  app: { request(path: string, init?: RequestInit): Response | Promise<Response> },
  cookie: string,
) {
  const req = async (path: string, init: RequestInit = {}) =>
    await app.request(path, { ...init, headers: { cookie, ...(init.headers ?? {}) } });

  return {
    goals: {
      /** GET /goals — the user's goals with streak stats. */
      list: () => req("/api/goals"),

      /** POST /goals — create. Body shape = the server's real contract. */
      create: (body: import("@streakly/shared").CreateGoalInput) =>
        req("/api/goals", { method: "POST", body: JSON.stringify(body) }),

      /** GET /goals/:id — 404 if missing or owned by someone else. */
      get: (id: string) => req(`/api/goals/${id}`),

      /** PATCH /goals/:id — partial update. */
      update: (id: string, body: import("@streakly/shared").UpdateGoalInput) =>
        req(`/api/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

      /** DELETE /goals/:id — permanent. */
      remove: (id: string) => req(`/api/goals/${id}`, { method: "DELETE" }),

      /** POST /goals/:id/checkins — toggle; date optional (today). */
      toggle: (id: string, body: { date?: string } = {}) =>
        req(`/api/goals/${id}/checkins`, { method: "POST", body: JSON.stringify(body) }),

      /** DELETE /goals/:id/checkins — remove a check-in. */
      uncheck: (id: string, date?: string) =>
        req(`/api/goals/${id}/checkins${date ? `?date=${date}` : ""}`, { method: "DELETE" }),

      /** PATCH /goals/reorder — full order, index = position. */
      reorder: (ids: string[]) =>
        req("/api/goals/reorder", { method: "PATCH", body: JSON.stringify({ ids }) }),
    },
  };
}

export type TestApi = ReturnType<typeof createTestApi>;
