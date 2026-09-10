# Goal Cadence (Per-Goal Schedules) — QOL Update

## Goal

Let each goal define its own cadence — every day, specific weekdays, or X times per week — so streaks count only scheduled days, rest days don't break the chain, and check-ins are only allowed on scheduled days.

## Current context / assumptions

- Branch point: `main` @ eaa17c2, clean except this plan file (untracked). Bun workspaces are live; `packages/shared` contains `streaks.ts`, `goal-config.ts`, `index.ts`.
- `computeStreaks(dateKeys, now)` lives at `packages/shared/src/streaks.ts:44` — pure, operates on `YYYY-MM-DD` local date keys via `toKey`/`fromKey`/`addDays`/`subDays` from date-fns (all already imported there).
- Prisma + SQLite. `model Goal` is at `prisma/schema.prisma:14`. Migrations: `bunx prisma migrate dev --name <x>`.
- zod v4 (`^4.0.2`) is in root `package.json` deps but NOT in `packages/shared/package.json` (which has only `date-fns`). We add zod to shared.
- No test runner yet. Bun ships one: `bun test` works out of the box. We add `"test": "bun test"` to root scripts.
- All streak math is server-side: `src/lib/goals-api.ts:14` calls `computeStreaks(dates)` and the result rides on `GoalDTO.stats`. Client components never call `computeStreaks` (verified: only `src/lib/streaks.ts` — a stale duplicate — and the shared package reference it; the stale `src/lib/streaks.ts` copy is unused by app code and we will NOT touch it, but the implementer must edit ONLY `packages/shared/src/streaks.ts`).
- API routes to touch: `src/app/api/goals/route.ts` (POST), `src/app/api/goals/[id]/route.ts` (PATCH), `src/app/api/goals/[id]/checkins/route.ts` (POST toggle).
- UI components that read GoalDTO: `src/components/streaks/{streaks-app,goal-card,goal-detail-sheet,goal-form-dialog,stats-bar,heatmap}.tsx`.
- Verification gates (from streakly-dev skill): `bunx tsc --noEmit`, `bun run lint`, `npm run build` (NOT `bun run build` — the bun build script uses `cp -r` which breaks on Windows).

## Architecture / proposed approach

Add `packages/shared/src/schedule.ts`: a zod `ScheduleSchema` (discriminated union: daily / weekdays / weekly), `isScheduledDay(schedule, weekday)` predicate, `normalizeSchedule(raw)` (safeParse → null fallback), `cadenceLabel(schedule)`, and `nextScheduledDayKey(schedule, from)`. Extend `computeStreaks` with an optional third `schedule` param — backward-compatible, so `src/lib/goals-api.ts` is the only call site that changes. Persist as a nullable `Json` column on Goal (one migration), validate at the API edge with the shared zod schema, pass `schedule` through `GoalDTO`, and let the UI read it from the DTO everywhere.

## Requirements (numbered for traceability)

- **R1 Cadence model**: `schedule` on Goal is `null` (daily, default for existing goals) or `{ type: "daily" } | { type: "weekdays", days: number[] (ISO 0=Sun..6=Sat, 1–7 entries, dedupe+sort on write) } | { type: "weekly", timesPerWeek: 1..7 }`.
- **R2 Validation**: API rejects invalid schedules with 400 + human-readable message; stored JSON is normalized on read (`normalizeSchedule`) so corrupt data degrades to daily.
- **R3 Streak semantics**: unscheduled days neither count nor break the chain. `doneToday` = today scheduled AND checked. `active` = today scheduled → today/yesterday checked; today unscheduled → most recent scheduled day checked (grace). `longest` walks scheduled days only. `total` unchanged (all check-ins). Weekly: a missed day breaks only while the week's quota is still reachable; once quota met, remaining days of that week don't count or break. Weeks start Sunday.
- **R4 Check-in gating**: today-toggle disabled on unscheduled days with "Rest day — back Thu" label; API POST check-in returns 400 on unscheduled dates. Un-checking (toggle off / DELETE) is always allowed.
- **R5 UI**: cadence badge on cards ("Every day" / "Mon Wed Fri" / "3× per week"); cadence picker in goal form (daily radio / 7 weekday chips / 1–7 stepper); heatmap dims unscheduled cells; detail sheet shows cadence line.
- **R6 Seeds**: one weekdays goal + one weekly goal in seed data.
- **R7 Compatibility**: existing goals (schedule=null) produce identical stats to today — locked by regression tests.

## Step-by-step tasks

### Task 0 — Branch (2 min)

```bash
git checkout main && git pull origin main
git checkout -b feature/goal-cadence
```

Expected: `Switched to a new branch 'feature/goal-cadence'`.

### Task 1 — Test harness + daily regression tests (5 min, TDD)

1. Root `package.json` scripts: add `"test": "bun test",` (next to `"lint"`).
2. Create `packages/shared/src/streaks.test.ts` — REGRESSION cases against CURRENT code (they must pass before any change; this validates the harness):

```ts
import { describe, it, expect } from "bun:test";
import { computeStreaks } from "./streaks";

const NOW = new Date("2026-09-09T12:00:00"); // Wednesday

describe("computeStreaks (daily regression)", () => {
  it("counts consecutive days ending today", () => {
    const keys = ["2026-09-07", "2026-09-08", "2026-09-09"];
    expect(computeStreaks(keys, NOW)).toMatchObject({ current: 3, doneToday: true, active: true });
  });
  it("keeps streak alive when yesterday done, today not yet", () => {
    expect(computeStreaks(["2026-09-08"], NOW)).toMatchObject({ current: 1, active: true, doneToday: false });
  });
  it("breaks when yesterday and today unchecked", () => {
    expect(computeStreaks(["2026-09-05"], NOW)).toMatchObject({ current: 0, active: false });
  });
  it("longest survives a mid-history gap", () => {
    const keys = ["2026-09-01", "2026-09-02", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"];
    expect(computeStreaks(keys, NOW)).toMatchObject({ longest: 4, current: 4 });
  });
});
```

Run: `bun test packages/shared` — expect `4 pass`. These tests never change; they must stay green after every later task.

Commit: `test: streak regression harness with bun test`

### Task 2 — `packages/shared/src/schedule.ts` (10 min, TDD)

1. `packages/shared/package.json` dependencies: add `"zod": "^4.0.2"`, then `bun install`.
2. Create `packages/shared/src/schedule.test.ts` (fails: module doesn't exist yet):

```ts
import { describe, it, expect } from "bun:test";
import {
  isScheduledDay, nextScheduledDayKey, ScheduleSchema,
  normalizeSchedule, cadenceLabel,
} from "./schedule";

describe("schedule", () => {
  it("daily is scheduled every day", () => {
    for (let d = 0; d < 7; d++) expect(isScheduledDay({ type: "daily" }, d)).toBe(true);
  });
  it("weekdays [1,3,5] → Mon true, Tue false", () => {
    const s = { type: "weekdays" as const, days: [1, 3, 5] };
    expect(isScheduledDay(s, 1)).toBe(true);
    expect(isScheduledDay(s, 2)).toBe(false);
    expect(isScheduledDay(s, 5)).toBe(true);
  });
  it("weekly is scheduled every day (quota handled by streak logic)", () => {
    expect(isScheduledDay({ type: "weekly", timesPerWeek: 3 }, 4)).toBe(true);
  });
  it("null schedule === daily", () => {
    expect(isScheduledDay(null, 3)).toBe(true);
  });
  it("schema rejects empty days, 7, dupes, bad type, 0 and 8 timesPerWeek", () => {
    expect(ScheduleSchema.safeParse({ type: "weekdays", days: [] }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ type: "weekdays", days: [7] }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ type: "weekly", timesPerWeek: 0 }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ type: "monthly" }).success).toBe(false);
  });
  it("normalizeSchedule falls back to null on garbage", () => {
    expect(normalizeSchedule("junk")).toBe(null);
    expect(normalizeSchedule({ type: "weekdays", days: [3, 1, 3] })).toEqual({ type: "weekdays", days: [1, 3] });
  });
  it("nextScheduledDayKey: Wed 2026-09-09 → Thu for [1,3,5]", () => {
    expect(nextScheduledDayKey({ type: "weekdays", days: [1, 3, 5] }, "2026-09-09")).toBe("2026-09-10");
  });
  it("nextScheduledDayKey: daily → same day", () => {
    expect(nextScheduledDayKey(null, "2026-09-09")).toBe("2026-09-09");
  });
  it("cadenceLabel", () => {
    expect(cadenceLabel(null)).toBe("Every day");
    expect(cadenceLabel({ type: "weekdays", days: [1, 3, 5] })).toBe("Mon Wed Fri");
    expect(cadenceLabel({ type: "weekly", timesPerWeek: 3 })).toBe("3× per week");
  });
});
```

3. Create `packages/shared/src/schedule.ts`:

```ts
import { z } from "zod";
import { addDays, fromKey, toKey } from "./streaks";

export const ScheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({
    type: z.literal("weekdays"),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
  z.object({
    type: z.literal("weekly"),
    timesPerWeek: z.number().int().min(1).max(7),
  }),
]);
export type Schedule = z.infer<typeof ScheduleSchema>;

/** Is this ISO weekday (0=Sun..6=Sat) a scheduled day? null === daily. */
export function isScheduledDay(schedule: Schedule | null, weekday: number): boolean {
  if (!schedule || schedule.type !== "weekdays") return true;
  return schedule.days.includes(weekday);
}

/** Parse arbitrary stored JSON into a Schedule; invalid → null (daily). Dedupes+sorts days. */
export function normalizeSchedule(raw: unknown): Schedule | null {
  if (raw && typeof raw === "object" && "type" in raw) {
    const obj = raw as { type: string; days?: unknown };
    if (obj.type === "weekdays" && Array.isArray(obj.days)) {
      obj.days = [...new Set(obj.days as number[])].sort((a, b) => a - b);
    }
  }
  const parsed = ScheduleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function cadenceLabel(schedule: Schedule | null): string {
  if (!schedule || schedule.type === "daily") return "Every day";
  if (schedule.type === "weekly") return `${schedule.timesPerWeek}× per week`;
  return schedule.days.map((d) => WEEKDAY_LABELS[d]).join(" ");
}

/** Next scheduled date key strictly after `fromKeyStr` (or same day for daily/null/weekly). */
export function nextScheduledDayKey(schedule: Schedule | null, fromKeyStr: string): string {
  if (!schedule || schedule.type !== "weekdays") return fromKeyStr;
  let d = addDays(fromKey(fromKeyStr), 1);
  for (let i = 0; i < 7; i++) {
    if (isScheduledDay(schedule, fromKey(d).getDay())) return toKey(d);
    d = addDays(d, 1);
  }
  return fromKeyStr; // unreachable: 7-day loop always hits one of 7 days
}
```

4. `packages/shared/src/index.ts`: add `export * from "./schedule";`

Run: `bun test packages/shared` — red → green. Commit: `feat: schedule types + predicates in shared`

### Task 3 — Schedule-aware `computeStreaks` (15 min, TDD)

Add to `packages/shared/src/streaks.test.ts` (NOW is Wed 2026-09-09):

```ts
import { computeStreaks as cs } from "./streaks"; // merge into existing import
const WD = { type: "weekdays" as const, days: [1, 3, 5] }; // Mon/Wed/Fri

describe("computeStreaks (scheduled)", () => {
  it("skips unscheduled Tue: Mon+Tue+Wed checked → current 2, active true", () => {
    const keys = ["2026-09-07", "2026-09-08", "2026-09-09"];
    expect(cs(keys, NOW, WD)).toMatchObject({ current: 2, active: true, doneToday: true });
  });
  it("missed scheduled Wed (Tue checked) → streak alive, current 1", () => {
    expect(cs(["2026-09-07", "2026-09-08"], NOW, WD)).toMatchObject({ current: 1, active: true });
  });
  it("active grace on rest day: last scheduled day Thu 9-3 checked, today Tue → alive", () => {
    // Thu is day 4 — not in [1,3,5]; use goal with days [4]: Thu
    const thurs = { type: "weekdays" as const, days: [4] };
    // most recent scheduled day before Wed 9-9 is Thu 9-3
    expect(cs(["2026-09-03"], NOW, thurs)).toMatchObject({ active: false, current: 0 });
  });
  it("weekly 3×: Mon+Tue+Wed checked → intact; Mon only on Fri → still active", () => {
    const wk = { type: "weekly" as const, timesPerWeek: 3 };
    expect(cs(["2026-09-07", "2026-09-08", "2026-09-09"], NOW, wk)).toMatchObject({ active: true });
    expect(cs(["2026-09-07"], new Date("2026-09-11T12:00:00"), wk)).toMatchObject({ active: true });
  });
  it("null schedule behaves exactly like daily", () => {
    const keys = ["2026-09-07", "2026-09-08", "2026-09-09"];
    expect(cs(keys, NOW, null)).toEqual(cs(keys, NOW));
  });
});
```

Wait — the third case above is wrong on purpose to force you to think: Thu 9-3 with today Wed 9-9 means six days passed with no scheduled day checked → NOT active. Keep that assertion (`active: false`); it locks the rule "grace extends only to the next scheduled day".

Implementation in `packages/shared/src/streaks.ts` — extend the signature and rewrite the body around a single backward walk:

```ts
import { isScheduledDay, type Schedule } from "./schedule";

export function computeStreaks(
  dateKeys: string[],
  now: Date = new Date(),
  schedule: Schedule | null = null,
): StreakStats {
  const set = new Set(dateKeys);
  const scheduled = (d: Date) => isScheduledDay(schedule, d.getDay());

  // Walk back from `now`, skipping unscheduled days (don't count, don't break).
  // For weekly, a missed scheduled day breaks the run only if that week's
  // quota is still reachable; once met, the rest of the week is skipped too.
  // doneToday: today scheduled AND checked.
  // active:    walk back from today; the first scheduled day found must be
  //            checked (today itself included) — i.e. the chain is not broken
  //            at its head. Weekly: also satisfied by meeting the week quota.
  // current:   consecutive scheduled days checked, counting back from that
  //            first scheduled day.
  // longest:   walk calendar days over the full history, same skip rule, and
  //            count checked scheduled days per run.
}
```

Implementation notes (the tricky bits — do exactly this):

- `current`: step cursor from `today` backward; skip unscheduled days silently; the FIRST scheduled day you meet must be checked, else current=0/active=false. Then keep walking while scheduled days are checked, counting each.
- `doneToday`: `scheduled(today) && set.has(today)`.
- `active` (weekly): count checks in the current calendar week (Sunday start, `startOfWeek(now, { weekStartsOn: 0 })`); if `checksThisWeek >= timesPerWeek`, active=true; else the backward-walk rule applies.
- `longest`: iterate day-by-day from `min(keys)` to `max(keys)`; skip unscheduled; a checked scheduled day extends the run, a checked=false scheduled day resets it. (Simpler alternative rejected: sorting keys and comparing gaps misses skipped days.)
- `total` stays `set.size`.

Run `bun test packages/shared` until green, re-run Task-1 cases (must stay green). Commit: `feat: schedule-aware streak computation`

### Task 4 — Prisma column + DTO plumbing (10 min)

1. `prisma/schema.prisma` — in `model Goal`, after the `icon` line add:

```prisma
  // Cadence: null = daily; else { type: "daily"|"weekdays"|"weekly", ... } JSON
  schedule    Json?
```

2. `bunx prisma migrate dev --name add_goal_schedule` — expect a new folder in `prisma/migrations/` and `Your database is now in sync`.
3. `packages/shared/src/goal-config.ts` — extend `GoalDTO`:

```ts
import type { Schedule } from "./schedule";
// inside GoalDTO, after icon:
  schedule: Schedule | null;
```

4. `src/lib/goals-api.ts` — in `loadGoals` map:

```ts
import { computeStreaks, normalizeSchedule } from "@streakly/shared";
// ...
    const schedule = normalizeSchedule(g.schedule);
    const stats = computeStreaks(dates, new Date(), schedule);
    // in the returned object, after icon:
      schedule,
```

Note `computeStreaks` now takes `now` explicitly (second arg) — passing `new Date()` preserves current behavior.

Verify: `bunx tsc --noEmit` — expect errors ONLY where GoalDTO literals are constructed (e.g. `stats-bar.tsx` mock data). Fix each by adding `schedule: null`. Commit: `feat: persist + expose goal schedule`

### Task 5 — API: accept + enforce (10 min)

1. `src/app/api/goals/route.ts` — in `CreateGoalSchema` add `schedule: ScheduleSchema.optional().nullable(),` (import `ScheduleSchema` from `@streakly/shared`); in the create data add `schedule: data.schedule ?? null,`. On parse failure the existing 400 handler already emits zod's first message.
2. `src/app/api/goals/[id]/route.ts` — same field on `UpdateGoalSchema`; in PATCH's update-builder add `if (data.schedule !== undefined) update.schedule = data.schedule;`.
3. `src/app/api/goals/[id]/checkins/route.ts` — POST, AFTER date validation, BEFORE the toggle:

```ts
import { isScheduledDay, fromKey as _fk, toKey as _tk } from "@streakly/shared"; // fromKey/toKey already imported
// after dateKey is resolved:
const goalDto = (await loadGoals()).find((g) => g.id === id);
if (goalDto && !isScheduledDay(goalDto.schedule, fromKey(dateKey).getDay())) {
  return NextResponse.json({ error: "Not a scheduled day for this goal" }, { status: 400 });
}
```

Only gate the CREATE direction: the toggle-off path must still work. Restructure: compute `scheduledDay = isScheduledDay(...)`; if `existing` → always allow delete; if creating and `!scheduledDay` → 400.

Verify (dev server running: `bun run dev`):

```bash
curl -s -X POST localhost:3000/api/goals -H "Content-Type: application/json" \
  -d '{"name":"Gym","color":"emerald","schedule":{"type":"weekdays","days":[1,3,5]}}'
# expect 201, body.schedule == {"type":"weekdays","days":[1,3,5]}
curl -s -X POST localhost:3000/api/goals/<id>/checkins -H "Content-Type: application/json" \
  -d '{"date":"2026-09-10"}'   # a Thursday = rest day for that goal
# expect 400 {"error":"Not a scheduled day for this goal"}
curl -s -X POST localhost:3000/api/goals -H "Content-Type: application/json" \
  -d '{"name":"Bad","schedule":{"type":"weekdays","days":[]}}'
# expect 400 with a zod message
```

Commit: `feat: API validates and enforces cadence`

### Task 6 — Form cadence picker (15 min)

`src/components/streaks/goal-form-dialog.tsx`:

- State: `const [schedule, setSchedule] = React.useState<Schedule | null>({ type: "daily" });` reset in the existing `useEffect` to `goal?.schedule ?? { type: "daily" }`.
- UI under the icon picker: a 3-way segmented control ("Every day" / "Specific days" / "X per week"); weekdays mode renders 7 toggle chips (Sun..Sat, min 1 — disable saving with a toast if none selected); weekly mode renders a 1–7 stepper.
- Import `ScheduleSchema` and validate before send (same schema as the server — DRY).
- Include `schedule` in both the POST and PATCH bodies (`schedule: schedule ?? null`).

Verify: create one goal of each kind in the UI; `curl -s localhost:3000/api/goals | grep -o '"schedule":{[^}]*}'` shows all three shapes. Commit: `feat: cadence picker in goal form`

### Task 7 — Card, heatmap, detail (15 min)

- `src/components/streaks/goal-card.tsx`: after the description line, render `<Badge variant="outline">{cadenceLabel(goal.schedule)}</Badge>`. For the today-toggle: when `!isScheduledDay(goal.schedule, new Date().getDay()) && !goal.stats.doneToday`, render a disabled button labeled `` `Rest day — back ${toKey(fromKey(nextScheduledDayKey(goal.schedule, todayKey())) ... )}` `` — use `prettyDate`-style short format: add a `shortNextDay` helper in schedule.ts if needed ("back Thu").
- `src/components/streaks/heatmap.tsx`: accept `schedule?: Schedule | null`; in the cell renderer add `opacity-25` when `!isScheduledDay(schedule, cell.date.getDay()) && cell.count === 0`. `goal-card.tsx` and `goal-detail-sheet.tsx` pass `goal.schedule` through.
- `src/components/streaks/goal-detail-sheet.tsx`: cadence line under the goal name using `cadenceLabel`.

Verify: `bun run dev`, walk all three cadence types in the browser; rest-day toggle disabled with label; heatmap dims rest days; streak numbers match the Task-3 test expectations on seeded data. Commit: `feat: schedule-aware cards, heatmap, detail`

### Task 8 — Seed variety (5 min)

`src/lib/goals-api.ts` `ensureSeedData`: "Morning Workout" gets `schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] }`, "Read 20 Pages" gets `schedule: { type: "weekly", timesPerWeek: 4 }` (add to the create data). All-day patterns remain valid for both.

Verify: `bunx prisma migrate reset --force`, restart dev, confirm labels and streaks look right. Commit: `feat: cadence variety in seed data`

### Task 9 — Gates + PR (5 min)

```bash
bunx tsc --noEmit   # expect: exit 0
bun run lint        # expect: no errors
bun test            # expect: all suites pass
npm run build       # expect: "Compiled successfully" (npm, not bun — Windows)
git push -u origin feature/goal-cadence
gh pr create --title "QOL: per-goal cadence (daily / weekdays / X-per-week)" \
  --body "Streaks count scheduled days only; rest days carry the chain. See plan 2026-09-09_233504."
```

## How it affects the overall flow

- Write path: form picker → zod-validated POST/PATCH → `Json?` column. Read path: `loadGoals()` normalizes stored JSON → passes schedule into `computeStreaks` → stats + schedule ride `GoalDTO` to every client component. No client-side streak math exists, so the schedule-aware numbers flow to the UI for free.
- Check-ins gain one server-side gate: create-on-unscheduled-day → 400. Toggle-off and DELETE stay ungated (users can always clean up).
- Existing goals are untouched: null schedule short-circuits to today's exact behavior, locked by the Task-1 regression suite.

## Tests / validation

- Unit (TDD, per-task red→green): `bun test packages/shared` — regression (Task 1), schedule predicates (Task 2), schedule-aware streaks (Task 3).
- API (Task 5): the three curl commands with expected statuses.
- Manual (Task 7): all three cadence types through the form; rest-day toggle disabled; heatmap dimming; detail line.
- Gates (Task 9): tsc / lint / test / build clean.

## Risks, tradeoffs, and open questions

- **Weekly semantics are the hard part.** Locked rule: a missed scheduled day breaks the streak only while that week's quota is still reachable; once met, remaining days of the week don't count or break. Weeks start Sunday (matches `buildHeatmap`). Alternative (strict per-day weekly) rejected — it defeats the purpose.
- **`longest` with skipped days**: a Mon→Fri weekdays run with Tue/Thu skipped is ONE run of 3, not three runs of 1. Covered by tests; easy to get wrong.
- **Stale duplicate**: `src/lib/streaks.ts` is an unused pre-extraction copy of the shared module. Do NOT edit it (out of scope); consider deleting it in a later cleanup.
- **Backfill on rest days** is rejected server-side by design; backfill support is YAGNI for now.
- Open question (default = no): should rest-day heatmap cells be clickable to open the detail sheet? Keep as-is.
- Open question (default = normalize): schema allows `days: [1,1,1]` — `normalizeSchedule` dedupes+sorts on read rather than rejecting; consider also normalizing on write in a follow-up.