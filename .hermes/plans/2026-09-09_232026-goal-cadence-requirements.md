# Goal Cadence (Schedule-Based Check-ins) — QOL Update

## Goal

Let each goal define its own cadence — every day, specific weekdays, or X times per week — so streaks count only scheduled days and check-ins are only allowed on scheduled days.

## Requirements (the contract this feature must satisfy)

Functional requirements, numbered for traceability into the tasks below:

- **R1. Cadence data model.** Every goal has a schedule: `null` = daily (backward-compatible default for all existing goals), or one of:
  - `{ type: "daily" }`
  - `{ type: "weekdays", days: number[] }` — ISO weekdays, 0=Sun..6=Sat, 1–7 entries, no duplicates
  - `{ type: "weekly", timesPerWeek: number }` — 1..7
- **R2. Validation.** The API rejects invalid schedules with a 400 and a human-readable message; the DB column accepts any JSON but the service normalizes invalid stored JSON to `null` (daily).
- **R3. Streak semantics.**
  - Only scheduled days participate in streaks: unscheduled days neither build nor break the chain (a Mon/Wed/Fri goal checked Mon and Wed has current streak 2 even though Tuesday passed unchecked).
  - `doneToday` is only true when today is scheduled AND checked.
  - `active` (streak still alive): today scheduled → today or yesterday checked; today unscheduled → most recent scheduled day checked.
  - `longest` walks scheduled days only; `total` remains total check-ins (all days).
  - Weekly (X per week): flexible — a missed scheduled day breaks the chain only while the week's quota is still unmet. Daily/weekdays are strict.
- **R4. Check-in gating.** The today-toggle on a card is disabled on unscheduled days, showing the next scheduled day ("Rest day — back Thu"). The API also rejects (400) check-in POSTs for unscheduled dates — UI is not the only gate.
- **R5. UI visibility.** Cards show a cadence badge ("Every day", "Mon/Wed/Fri", "3×/week"); the goal form has a cadence picker (3 modes: daily radio, 7 weekday chips, 1–7 stepper); heatmap cells for unscheduled days are dimmed; detail sheet shows the cadence line.
- **R6. Seeding.** Seed data gains variety: one weekdays goal, one weekly goal, so the feature is demonstrable immediately.
- **R7. Compatibility.** All existing goals (schedule=null) behave exactly as before — verified by regression tests on the current streak rules.

## Current context / assumptions

- Post-PR-#1 main (eaa17c2): bun workspaces live, `packages/shared` contains `streaks.ts` + `goal-config.ts`, ground rule "imports nothing outside date-fns". zod (v4) is in root deps but NOT yet in shared — this feature adds it.
- `computeStreaks(dateKeys, now)` in `packages/shared/src/streaks.ts:44` — pure, date-key based (YYYY-MM-DD local keys). Adding an optional third `schedule` param keeps all existing call sites valid.
- Prisma + SQLite; `schema.prisma` `model Goal` at `prisma/schema.prisma:14`; migrations via `bunx prisma migrate dev`.
- No test runner exists yet. Bun ships one: `bun test` works out of the box with `bun:test` imports. Add `"test": "bun test"` script to root package.json.
- API routes (`src/app/api/goals/**`) validate with zod, return full DTO via `loadGoals()` (`src/lib/goals-api.ts`).
- UI consumers of GoalDTO: `src/components/streaks/{streaks-app,goal-card,goal-detail-sheet,goal-form-dialog,stats-bar,heatmap}.tsx`.
- Verification gates (from streakly-dev skill): `bunx tsc --noEmit`, `bun run lint`, `npm run build` (NOT `bun run build` on Windows — cp -r breaks), plus runtime smoke.
- `Heatmap` in `packages/shared/src/streaks.ts` (exports HeatmapCell + grid builder) — dimming is a UI concern, applied in the heatmap component via schedule-aware cell opacity.

## Architecture / proposed approach

Add `packages/shared/src/schedule.ts` — a self-contained module owning the `Schedule` zod schema, the `isScheduledDay(schedule, weekday)` predicate, and `nextScheduledDayKey(schedule, from)` helper. Extend `computeStreaks` with an optional `schedule` param; internally it walks day-by-day over scheduled days only. Persist schedule as a nullable `Json` column on Goal (one migration), validate at the API edge with the shared zod schema, and pass `schedule` through `GoalDTO`. UI reads it everywhere from the DTO; the form picker writes it.

## Step-by-step tasks

### Task 0 — Branch

```bash
git checkout main && git pull origin main
git checkout -b feature/goal-cadence
```

Expected: `Switched to a new branch 'feature/goal-cadence'`.

### Task 1 — Add test script + first failing test (TDD)

Add to root `package.json` scripts: `"test": "bun test"`.

Create `packages/shared/src/streaks.test.ts` with the REGRESSION cases first (they must pass against current code — this validates the harness):

```ts
import { describe, it, expect } from "bun:test";
import { computeStreaks, todayKey } from "./streaks";

const NOW = new Date("2026-09-09T12:00:00"); // Wednesday

describe("computeStreaks (daily regression)", () => {
  it("counts consecutive days ending today", () => {
    const keys = ["2026-09-07", "2026-09-08", "2026-09-09"];
    expect(computeStreaks(keys, NOW)).toMatchObject({ current: 3, doneToday: true, active: true });
  });
  it("keeps streak alive when yesterday done, today not yet", () => {
    const keys = ["2026-09-08"];
    expect(computeStreaks(keys, NOW)).toMatchObject({ current: 1, active: true, doneToday: false });
  });
  it("breaks when yesterday and today unchecked", () => {
    const keys = ["2026-09-05"];
    expect(computeStreaks(keys, NOW)).toMatchObject({ current: 0, active: false });
  });
});
```

Run: `bun test packages/shared` — expect: 3 passing (harness works, no behavior change yet). Commit: `test: streak regression harness with bun test`.

### Task 2 — `packages/shared/src/schedule.ts` (TDD)

Create `packages/shared/src/schedule.test.ts` with failing tests:

```ts
import { describe, it, expect } from "bun:test";
import { isScheduledDay, nextScheduledDayKey, ScheduleSchema } from "./schedule";
```

Cover: daily → every weekday true; weekdays [1,3,5] → Mon true, Tue false; weekly → every day true; `ScheduleSchema.safeParse` rejects `days: []`, `days: [7]`, `timesPerWeek: 0`, unknown `type`; `nextScheduledDayKey({type:"weekdays",days:[1,3,5]}, "2026-09-09")` → `"2026-09-10"` (Wed→Thu); daily → same day.

Then implement `schedule.ts`:

```ts
import { z } from "zod";
import { addDays, fromKey, toKey, getDay } from "./streaks"; // getDay: add `export const getDay = (d: Date) => d.getDay();` to streaks.ts if not present

export const ScheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("weekdays"), days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }),
  z.object({ type: z.literal("weekly"), timesPerWeek: z.number().int().min(1).max(7) }),
]);
export type Schedule = z.infer<typeof ScheduleSchema>;

export function isScheduledDay(schedule: Schedule | null, weekday: number): boolean {
  if (!schedule || schedule.type === "daily" || schedule.type === "weekly") return true;
  return schedule.days.includes(weekday);
}

export function nextScheduledDayKey(schedule: Schedule | null, fromKeyStr: string): string {
  if (!schedule || schedule.type !== "weekdays") return fromKeyStr;
  let d = addDays(fromKey(fromKeyStr), 1);
  for (let i = 0; i < 7; i++) {
    if (isScheduledDay(schedule, getDay(d))) return toKey(d);
    d = addDays(d, 1);
  }
  return fromKeyStr; // unreachable
}
```

Wire into `packages/shared/src/index.ts`: add `export * from "./schedule";`. Move `zod` into `packages/shared/package.json` dependencies (`"zod": "^4.0.2"` — same version as root; bun dedupes).

Run: `bun test packages/shared` — red → green. Commit: `feat: schedule types + predicates in shared`.

### Task 3 — Schedule-aware `computeStreaks` (TDD)

Add failing tests to `streaks.test.ts` (using NOW = Wed 2026-09-09):

1. Weekdays goal `[1,3,5]` (Mon/Wed/Fri), checked Mon 9-7 + Tue 9-8 + Wed 9-9: Tue is unscheduled so must be ignored → `{ current: 3, longest: 3 }` (with schedule: current counts Mon,Tue?,Wed — no: Mon 7, Wed 9 are scheduled; Tue 8 unscheduled is skipped; the chain Mon→Wed counts as consecutive scheduled days: current=3 with Tue counted as carried? NO — assert `current: 3` where Tue does NOT break and does not count: chain = Mon, Wed, and Tue-as-carry is only about not breaking; the count = number of scheduled+checked days in the run = Mon(7), Wed(9) = 2, but the skipped Tue keeps the run alive. Expected: `current: 2`... **spec decision: unscheduled days don't count toward the number.** Write the test asserting `current: 2` for Mon+Wed checked with Tue skipped, `current: 3` when Wed checked and Fri unchecked-but-alive.
2. Missed scheduled day breaks: checked Mon 9-7, NOT Wed 9-9 (today Wed, unscheduled-check? no — Wed IS scheduled, unchecked today, Tue 9-8 checked) → active=true (grace for today), current counts Mon = 1.
3. Weekly 3×/week: this week Mon+Tue+Wed checked → streak intact; if only Mon checked and it's Friday (9-11): quota reachable → active stays true, current continues.
4. Null schedule === daily: identical output to old function for same inputs (loop the Task-1 cases through `computeStreaks(keys, NOW, null)`).

Implementation: extend signature to `computeStreaks(dateKeys, now = new Date(), schedule = null)`. Walk backward day-by-day from the anchor: skip unscheduled days (don't count, don't break); break on checked=false scheduled days; for weekly, a missed day breaks only if `checksInThatWeek < timesPerWeek` is still satisfiable (week not over). For `longest`, walk the sorted keys but insert virtual unscheduled-day skips: iterate calendar days from first to last check-in, same skip rule.

Helper inside streaks.ts:

```ts
function isScheduled(schedule: Schedule | null, d: Date): boolean {
  return isScheduledDay(schedule, d.getDay());
}
```

Run `bun test packages/shared` until green; run the Task-1 regression suite again (must still pass). Commit: `feat: schedule-aware streak computation`.

### Task 4 — Prisma schema + DTO plumbing

`prisma/schema.prisma` `model Goal`: add `schedule Json?` after `icon`.

```bash
bunx prisma migrate dev --name add_goal_schedule
```

Expected: migration folder created in `prisma/migrations/`, no errors, existing data intact.

- `packages/shared/src/goal-config.ts`: `GoalDTO` gains `schedule: Schedule | null;` (import type from `./schedule`).
- `src/lib/goals-api.ts` `loadGoals()`: map `schedule: normalizeSchedule(g.schedule)` where `normalizeSchedule` (in `schedule.ts`) runs `ScheduleSchema.safeParse` and falls back to `null` on any mismatch.

Verify: `bunx tsc --noEmit` — expect errors ONLY in files constructing GoalDTO literals (stats-bar mock data if any); fix by adding `schedule: null`. Commit: `feat: persist + expose goal schedule`.

### Task 5 — API accept + enforce (R2, R4 server side)

- `src/app/api/goals/route.ts`: `CreateGoalSchema` gains `schedule: ScheduleSchema.optional().nullable()`; pass `schedule: data.schedule ?? null` to `db.goal.create`.
- `src/app/api/goals/[id]/route.ts`: same on `UpdateGoalSchema`, pass through on update.
- `src/app/api/goals/[id]/checkins/route.ts` POST: after date validation, add:

```ts
const goals = await loadGoals();
const goalDto = goals.find((g) => g.id === id);
if (goalDto && !isScheduledDay(goalDto.schedule, dateKey)) {
  return NextResponse.json({ error: "Not a scheduled day for this goal" }, { status: 400 });
}
```

Verify with curl against `bun run dev`:

```bash
curl -s -X POST localhost:3000/api/goals -H "Content-Type: application/json" \
  -d '{"name":"Gym","color":"emerald","schedule":{"type":"weekdays","days":[1,3,5]}}'
# expect 201, body.schedule == {"type":"weekdays","days":[1,3,5]}
curl -s -X POST localhost:3000/api/goals/<id>/checkins -H "Content-Type: application/json" \
  -d '{"date":"<a-Thursday-key>"}'
# expect 400 {"error":"Not a scheduled day for this goal"}
```

Commit: `feat: API validates and enforces cadence`.

### Task 6 — Form cadence picker (R5)

`src/components/streaks/goal-form-dialog.tsx`: add state `schedule` (init `goal?.schedule ?? { type: "daily" }`), a segmented control with 3 options, weekday chip row (7 buttons, Sun..Sat) shown for weekdays mode, a 1–7 stepper for weekly mode. Include `schedule` in the POST/PATCH body. Import `ScheduleSchema` from `@streakly/shared` to validate before send (DRY: same schema both sides).

Verify: create each kind via UI; confirm stored values via `curl -s localhost:3000/api/goals | grep -o '"schedule":{[^}]*}'`.

Commit: `feat: cadence picker in goal form`.

### Task 7 — Card, heatmap, detail (R5)

- `src/components/streaks/goal-card.tsx`: badge with cadence label (helper `cadenceLabel(schedule)` in schedule.ts: "Every day" / "Mon Wed Fri" / "3× per week"); when `!isScheduledDay(goal.schedule, today)`, disable the toggle button, label it `Rest day — back ${nextScheduledDayKey(...) short-format}`, style `opacity-60`.
- `src/components/streaks/heatmap.tsx`: accept optional `schedule`; pass to the shared `buildHeatmap` consumer and add `opacity-25` to cells whose day is unscheduled.
- `src/components/streaks/goal-detail-sheet.tsx`: cadence line under the goal name.

Verify: `bun run dev`, walk through all three cadence types in the browser; streak numbers must match the Task-3 test expectations on the seeded data. Commit: `feat: schedule-aware cards, heatmap, detail`.

### Task 8 — Seed variety (R6)

`src/lib/goals-api.ts` `ensureSeedData`: "Morning Workout" gets `{ type: "weekdays", days: [1,2,3,4,5] }`, "Read 20 Pages" gets `{ type: "weekly", timesPerWeek: 4 }`. The existing 35-day patterns stay (all-days coverage remains valid for weekdays; for weekly it's also fine — quota satisfied).

Verify: reset DB (`bunx prisma migrate reset --force`), restart dev, confirm seeded goals show correct cadence labels and streaks. Commit: `feat: cadence variety in seed data`.

### Task 9 — Gates + PR

```bash
bunx tsc --noEmit   # expect: exit 0
bun run lint        # expect: no errors
bun test            # expect: all suites pass
npm run build       # expect: "Compiled successfully" (npm, not bun — Windows)
git push -u origin feature/goal-cadence
gh pr create --title "QOL: per-goal cadence (daily / weekdays / X-per-week)" --body "Streaks count scheduled days only; rest days carry the chain. See plan 2026-09-09_232026."
```

## Tests / validation

- Unit (TDD): `bun test` — schedule predicates (Task 2), schedule-aware streaks incl. daily-regression (Tasks 1, 3). RED→GREEN per task before wiring UI.
- API (Task 5): curl happy-path + 400 on unscheduled check-in.
- Manual (Task 7): create all three cadence types; toggle disabled on rest days; streak counts match unit tests.
- Gates (Task 9): tsc / lint / test / build all clean.

## Risks, tradeoffs, and open questions

- **Weekly (X/week) semantics are the tricky part.** Locked rule: a missed scheduled day breaks the streak only while the week's quota is still reachable; once quota met for a week, that week's remaining days neither count nor break. Alternative (strict daily-style weekly) rejected: it defeats the purpose of flexible goals. Edge cases around week boundaries (Sun vs Mon start) — plan uses calendar weeks starting Sunday; document in code.
- **`longest` with skipped days**: a Mon→Fri weekdays run with Tue/Thu skipped is ONE run of 3 (scheduled days only), not 3 runs of 1. Covered by tests; easy to get wrong.
- **Server-side check-in gate** (R4) may surprise users trying to backfill past rest days — intentional; backfill support is out of scope (YAGNI).
- **`computeStreaks` signature change** is backward-compatible (optional params), but the UI must pass schedule everywhere stats show — a missed call site silently shows daily math. Mitigation: `stats-bar.tsx` + `goal-card.tsx` both consume `goal.stats` from the API (server-computed WITH schedule), so client recomputation is not needed anywhere. Verify no client-side `computeStreaks` calls exist (grep).
- Open question: should rest-day cells in the heatmap be clickable to view the detail sheet? (Currently the whole heatmap is a button.) Default: keep as-is.
- Open question: cap `days` array to sorted-unique? Schema allows [1,1,1]; normalize on write (dedupe+sort) in the service rather than rejecting.