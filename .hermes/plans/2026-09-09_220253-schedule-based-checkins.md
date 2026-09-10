# Streakly — Weekly/Monthly check-in support

## Goal

Let each goal define its own cadence (daily, specific weekdays, or X times per week) so streaks count only scheduled days, and check-ins are possible on scheduled days only.

## Current context / assumptions

- Stack: Next.js App Router (TypeScript, bun), Prisma + SQLite, shadcn/ui, dnd-kit. Verified working tree is clean on `main`.
- Schema (prisma/schema.prisma): `Goal { id, name, description, color, icon, order, createdAt, updatedAt, checkIns CheckIn[] }`, `CheckIn { id, goalId, date String, @@unique([goalId, date]) }` — dates stored as `YYYY-MM-DD` local keys.
- All streak math lives in `src/lib/streaks.ts` (`computeStreaks(dates)` → `{ current, longest, total, doneToday, active }`). It is purely date-key based; adding a schedule parameter is backward-compatible if optional.
- API routes already validate with zod and return the full `GoalDTO` via `loadGoals()` (`src/lib/goals-api.ts`); UI components consume `GoalDTO` from `src/lib/goal-config.ts`.
- Existing UI: `GoalFormDialog` (create/edit), `GoalCard` (today toggle), `GoalDetailSheet`, `StreaksApp` (state + fetch), `Heatmap`.
- No tests exist yet. Verify with `bun run lint` and `bun run build` (per repo convention) plus a dev-server smoke test.
- DB is SQLite via `DATABASE_URL`; migration tool available through `bunx prisma migrate dev`.
- Assumption: single-user local app; no auth, no timezone server-side concerns (keys are client-local dates).

## Architecture / proposed approach

Add an optional `schedule` JSON column on `Goal` (nullable = daily, the existing default) with a zod-validated shape: `{ type: "daily" } | { type: "weekdays", days: number[] } | { type: "weekly", timesPerWeek: n }`. `computeStreaks` gains an optional `isScheduled(dateKey)` predicate; a scheduled day that is missed breaks the streak, while unscheduled days are simply skipped (the chain continues through them). The today-toggle disables itself on unscheduled days, and the heatmap/detail views dim unscheduled cells.

## Step-by-step tasks

### Task 1 — Schedule type + validation helpers (`src/lib/schedule.ts`)

Create `src/lib/schedule.ts`:

```ts
import { z } from "zod";

export const WeekdayScheduleSchema = z.object({
  type: z.literal("weekdays"),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
});

export const WeeklyScheduleSchema = z.object({
  type: z.literal("weekly"),
  timesPerWeek: z.number().int().min(1).max(7),
});

export const DailyScheduleSchema = z.object({ type: z.literal("daily") });

export const ScheduleSchema = z.discriminatedUnion("type", [
  DailyScheduleSchema,
  WeekdayScheduleSchema,
  WeeklyScheduleSchema,
]);

export type Schedule = z.infer<typeof ScheduleSchema>;

/** Is this ISO weekday (0=Sun..6=Sat) a scheduled day? `weekly` counts every day as eligible. */
export function isScheduledDay(schedule: Schedule | null, weekday: number): boolean {
  if (!schedule || schedule.type === "daily" || schedule.type === "weekly") return true;
  return schedule.days.includes(weekday);
}
```

Verify: `bunx tsc --noEmit` passes.

### Task 2 — Prisma schema + migration

In `prisma/schema.prisma`, add to `model Goal`:

```prisma
  schedule Json?
```

Run:

```bash
bunx prisma migrate dev --name add_goal_schedule
```

Expected: migration created in `prisma/migrations/`, client regenerated, no data loss.

### Task 3 — Streak math with schedule (TDD)

Create `src/lib/streaks.test.ts` (or vitest equivalent if the repo later adds a runner — for now use a lightweight `bun test`-style file). Write failing tests first:

```ts
import { describe, it, expect } from "bun:test";
import { computeStreaks } from "./streaks";
import type { Schedule } from "./schedule";
```

Test cases to assert:

1. Daily goal with today checked → unchanged behavior (regression).
2. Weekdays-only goal, checked Mon/Tue/Wed, today=Thu unchecked → `current = 3`, `active = true`.
3. Weekdays-only goal, today=Sat (unscheduled) with Friday checked → `active = true`, toggle-eligible is false (covered by `doneTodayForSchedule` helper below).
4. Weekly (3×/week) goal: treat as "flexible" — streak counts consecutive *scheduled-eligible* days with check-ins, but a missed eligible day only breaks the chain once the week's quota is mathematically unreachable. **Simplification (decide now, keep forever):** for `weekly`, every day is eligible and missing a day breaks the streak like daily, EXCEPT the streak ignores days beyond `timesPerWeek` checks already made this week. Implementation: only enforce break when `checksThisWeek < timesPerWeek` on an elapsed day. Keep this logic in one pure function `scheduledBreak(schedule, dateKey, checkedDates)`.

Then extend `computeStreaks` in `src/lib/streaks.ts`:

```ts
export function computeStreaks(
  dates: string[],
  schedule?: Schedule | null,
  today: Date = new Date(),
): StreakStats
```

Rules:
- `doneToday`: only true if today is a scheduled day AND checked.
- `active`: today unscheduled → carry yesterday's chain status (checked yesterday = alive).
- `current`/`longest` walk only scheduled days; a scheduled day without a check-in ends the chain (except "today not yet done" allowance already handled by `active`).

Add `export function isCheckInAllowed(schedule: Schedule | null, dateKey: string): boolean` in the same file, returning false for unscheduled days (used by UI to disable the toggle).

Run `bun test src/lib/streaks.test.ts` — verify red → green, then commit: `feat: schedule-aware streak computation`.

### Task 4 — API: accept + persist schedule

- `src/app/api/goals/route.ts`: add `schedule: ScheduleSchema.optional().nullable()` to `CreateGoalSchema`; on create, `schedule: data.schedule ?? null`.
- `src/app/api/goals/[id]/route.ts`: same field on `UpdateGoalSchema`; pass through to `db.goal.update`.
- `src/lib/goals-api.ts` `loadGoals()`: include `schedule: (g.schedule as Schedule | null) ?? null` in the mapped `GoalDTO` (raw JSON passthrough is fine — validation happened at write time; still run `ScheduleSchema.safeParse` defensively and fall back to `null`).

Verify with curl:

```bash
bun run dev &
curl -s localhost:3000/api/goals | head -c 300
# expect goals array; seeded goals show "schedule":null
```

Commit: `feat: persist goal schedule via API`.

### Task 5 — GoalDTO type update

In `src/lib/goal-config.ts`, extend `GoalDTO`:

```ts
  schedule: Schedule | null;
```

(import `Schedule` from `@/lib/schedule`). Fix any compile errors in `stats-bar.tsx` / `goal-detail-sheet.tsx` that construct or mock DTOs (they must include `schedule: null`).

Verify: `bunx tsc --noEmit` clean.

### Task 6 — Form UI: cadence picker

In `src/components/streaks/goal-form-dialog.tsx`, add a "Cadence" section between Icon and footer: three radio-style buttons — "Every day", "Specific days" (renders 7 toggle chips Sun–Sat), "X per week" (number stepper 1–7). Local state `schedule: Schedule` initialized from `goal?.schedule ?? { type: "daily" }`; include `schedule` in the POST/PATCH body.

Verify: create a weekdays goal via UI; `curl -s localhost:3000/api/goals | python -m json.tool | grep -A3 schedule` shows the saved days.

Commit: `feat: cadence picker in goal form`.

### Task 7 — Card + detail UI

- `src/components/streaks/goal-card.tsx`: on unscheduled days, replace the today-toggle with a disabled button labeled e.g. "Rest day — back Thu" (compute next scheduled weekday via `isCheckInAllowed` + a small `nextScheduledDayKey` helper in `src/lib/schedule.ts`); show a small Badge with the cadence ("Mon/Wed/Fri" or "3×/week").
- `src/components/streaks/goal-detail-sheet.tsx`: show cadence line and dim heatmap cells on unscheduled days (pass `schedule` into `Heatmap` as optional prop; unscheduled cells get `opacity-30`).

Verify: bun run dev, open each goal type; toggle disabled on rest days; streak numbers match Task 3 test expectations for seeded data.

Commit: `feat: schedule-aware cards and detail view`.

### Task 8 — Seed data variety

In `src/lib/goals-api.ts` `ensureSeedData`, give "Morning Workout" `{ type: "weekdays", days: [1,2,3,4,5] }` and "Read 20 Pages" `{ type: "weekly", timesPerWeek: 4 }`; adjust seeded check-in patterns so no scheduled day is missed (patterns currently cover all days — that stays valid).

Verify: delete the dev DB file (see `DATABASE_URL` in `.env`), restart dev server, confirm seeded goals render with correct streaks.

Commit: `feat: schedule variety in seed data`.

### Task 9 — Final gates

```bash
bun run lint    # expect: no errors
bun run build   # expect: compiled successfully
```

Fix anything flagged, then final commit if needed.

## Tests / validation

- Unit: `bun test src/lib/streaks.test.ts` per Task 3 (red → green before wiring UI).
- API: curl checks in Tasks 4 and 6.
- Manual: dev-server walkthrough in Task 7 (create daily + weekdays + weekly goals, toggle, drag-reorder still works, delete works).
- Build gates: `bun run lint && bun run build` clean.

## Risks, tradeoffs, and open questions

- **Weekly "flexible quota" semantics are the hard part.** The plan locks in a simple rule (missed eligible day breaks the chain only while the weekly quota is still unmet). Simpler alternative: treat weekly as "every day eligible, k checks per week required" — rejected as it complicates `longest` math. If users find current-week edge cases confusing, revisit.
- **JSON column vs. columns:** JSON keeps one migration and one zod gate; tradeoff is no DB-level validation — acceptable for a local single-user app.
- **Timezones:** date keys are client-local; a user crossing midnight mid-session could see the toggle flip day. Pre-existing behavior; out of scope.
- Open question: should rest-day check-ins be allowed retroactively (backfill)? Currently no — confirm desired.
- Open question: existing goals with `schedule = null` behave as daily — confirm that's the desired default for migrated data.