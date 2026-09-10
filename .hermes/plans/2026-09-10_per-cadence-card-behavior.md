# Plan: Per-Cadence Goal Card Behavior

Plan date: 2026-09-10. Branch to create: `feature/cadence-card-behavior` off latest `main`.

## Goal

Make the goal card tell the truth for each cadence type: weekdays goals show rest-day/broken-streak states clearly, weekly-quota goals show week progress ("2 / 4 this week") and week-based streaks instead of a daily-style toggle and day-based streak number.

## Current context / assumptions

Verified by reading the code in this session:

- `packages/shared/src/schedule.ts` — `ScheduleSchema` discriminated union: `daily` | `weekdays` (days: 0-6 array) | `weekly` (timesPerWeek: 1-7). Helpers: `isScheduledDay`, `cadenceLabel`, `weekdayShort`, `nextScheduledDayKey`.
- `packages/shared/src/streaks.ts` — `computeStreaks(dateKeys, now, schedule)` returns `StreakStats { current, longest, total, doneToday, active }`. Weekly path (`weeklyStats`, line 124) already computes `checksThisWeek`, `daysRemaining`, `metThisWeek`, `reachable` internally but discards them — only the union fields are returned. Week starts Sunday (`weekStartsOn: 0`, matches `buildHeatmap`).
- `src/lib/goal-config.ts:148` — `GoalDTO.stats` is `{ current, longest, total, doneToday, active }`.
- `src/lib/goals-api.ts:10` — `loadGoals()` maps DB rows → DTO, calls `computeStreaks(dates, new Date(), schedule)`. This is the ONLY server place stats are computed (streak math is server-side by ground rule; never recompute in client).
- `src/components/streaks/goal-card.tsx` — the card. Current behavior for ALL types: shows `${stats.current}` + "days", a daily-style toggle button (disabled "Rest day — back X" on unscheduled weekdays days), badge from `cadenceLabel`.
- `src/components/streaks/goal-detail-sheet.tsx:51` — stat cards hardcode `${goal.stats.current}d` / `${goal.stats.longest}d`.
- Test suite: `packages/shared/src/*.test.ts` colocated, run via `bun test packages/shared`. Gates: `bunx tsc --noEmit` → `bun run lint` → `bun test` → `npm run build` (npm, NOT bun, for build — Windows quirk).
- `src/lib/streaks.ts` is a stale unused copy — do NOT edit it.
- `examples/websocket/` breaks raw builds if tsconfig exclusion is lost — leave tsconfig alone.
- No DB schema change needed: `schedule` is already stored per goal.

## Architecture / proposed approach

Extend `StreakStats` in the shared package with two optional, additive fields: `unit: "day" | "week"` (default "day" — backward compatible) and `week?: { quota: number; done: number; met: boolean }` (only present for weekly cadence). All streak math stays in `computeStreaks` (server-side ground rule); the card and sheet become dumb renderers that branch on `stats.week` / `stats.unit`. UI copy for the three states (rest day / broken streak / alive) is derived in one helper in the shared package so card + sheet stay DRY.

## Step-by-step tasks

### Task 1 — Regression suite lock (RED first, stays green throughout)

File: `packages/shared/src/streaks.test.ts` (existing suite — READ IT FIRST; if these cases already exist, skip to Task 2).

Add to the existing describe blocks (do not remove anything):

```ts
// Weekly backward-compat lock: existing DTO shape must not change for daily/weekdays goals.
it("returns no week field and unit 'day' for daily and weekdays schedules", () => {
  const daily = computeStreaks(["2026-09-08"], new Date("2026-09-09T10:00:00"), null);
  const weekdays = computeStreaks(
    ["2026-09-07"],
    new Date("2026-09-09T10:00:00"),
    { type: "weekdays", days: [1, 3] },
  );
  expect(daily.unit).toBe("day");
  expect(daily.week).toBeUndefined();
  expect(weekdays.unit).toBe("day");
  expect(weekdays.week).toBeUndefined();
});
```

Run: `bun test packages/shared` → all pass (these assert CURRENT behavior; Task 2 makes them still pass).

Commit: `test: lock stats shape for daily/weekdays cadences`

### Task 2 — Extend StreakStats with unit + week (shared package)

Files: `packages/shared/src/streaks.ts`, `packages/shared/src/streaks.test.ts`.

2a. RED — add tests:

```ts
describe("weekly stats extras", () => {
  const now = new Date("2026-09-09T10:00:00"); // Wed
  it("exposes quota progress and unit 'week' for weekly cadence", () => {
    // quota 4; checked Mon(7), Tue(8) → done=2, met=false, reachable
    const s = computeStreaks(
      ["2026-09-07", "2026-09-08"],
      now,
      { type: "weekly", timesPerWeek: 4 },
    );
    expect(s.unit).toBe("week");
    expect(s.week).toEqual({ quota: 4, done: 2, met: false });
  });
  it("marks met when quota reached in the current week", () => {
    const s = computeStreaks(
      ["2026-09-06", "2026-09-07", "2026-09-08"], // Sun, Mon, Tue — quota 3
      now,
      { type: "weekly", timesPerWeek: 3 },
    );
    expect(s.week).toEqual({ quota: 3, done: 3, met: true });
  });
  it("doneToday for weekly stays based on today's check-in", () => {
    const s = computeStreaks(["2026-09-09"], now, { type: "weekly", timesPerWeek: 2 });
    expect(s.doneToday).toBe(true);
  });
});
```

Run `bun test packages/shared` → the three new tests FAIL (unit is undefined, week missing). Existing tests still pass.

2b. GREEN — implement in `packages/shared/src/streaks.ts`:

1. Extend the interface (top of file, after `StreakStats` doc block):

```ts
/** Unit the current streak is counted in for display. */
export type StreakUnit = "day" | "week";

/** Week-quota progress, present only for weekly cadence. */
export interface WeekProgress {
  /** Required check-ins per week. */
  quota: number;
  /** Check-ins made in the current week (Sunday start). */
  done: number;
  /** Quota already met this week. */
  met: boolean;
}
```

2. In `StreakStats`, add: `unit: StreakUnit;` and `week?: WeekProgress;`.

3. In the DAILY/WEEKDAYS return (line ~120): `return { current, longest, total, doneToday, active, unit: "day" };`

4. In `weeklyStats` return (line ~181): `return { current, longest, total, doneToday, active: reachable, unit: "week", week: { quota, done: checksThisWeek, met: metThisWeek } };`

Run `bun test packages/shared` → ALL green (Task 1 lock + new tests).

Commit: `feat: week progress fields on StreakStats`

### Task 3 — Shared UI-state helper for card states

Files: `packages/shared/src/schedule.ts`, `packages/shared/src/schedule.test.ts`.

3a. RED — tests in `schedule.test.ts`:

```ts
import { cardCheckinState } from "./schedule";
import type { StreakStats } from "./streaks";

describe("cardCheckinState", () => {
  const stats = (over: Partial<StreakStats>): StreakStats => ({
    current: 0, longest: 0, total: 0, doneToday: false, active: true, unit: "day", ...over,
  });

  it("weekly: every day is a check-in day", () => {
    const s = cardCheckinState(
      { type: "weekly", timesPerWeek: 4 },
      stats({ week: { quota: 4, done: 2, met: false } }),
      new Date("2026-09-12T10:00:00"), // Saturday
    );
    expect(s.kind).toBe("checkin");
    expect(s.urgency).toBe("quota-at-risk"); // Sat, unmet, 1 day left
  });

  it("weekdays: rest day reports next scheduled day", () => {
    // Sep 9 2026 is a Wednesday (3); schedule Mon+Wed → Thursday 10 is next
    const s = cardCheckinState(
      { type: "weekdays", days: [1, 3] },
      stats({}),
      new Date("2026-09-10T10:00:00"), // Thu — scheduled
    );
    expect(s.kind).toBe("checkin");
    expect(s.restDay).toBeFalsy();
  });

  it("broken streak: scheduled today, unchecked, prior streak existed", () => {
    const s = cardCheckinState(
      null, // daily
      stats({ current: 0, active: false, total: 5 }),
      new Date("2026-09-10T10:00:00"),
    );
    expect(s.kind).toBe("checkin");
    expect(s.brokenStreak).toBe(true);
  });
});
```

Run `bun test packages/shared` → FAIL (no export `cardCheckinState`).

3b. GREEN — add to `packages/shared/src/schedule.ts`:

```ts
import type { StreakStats } from "./streaks";

export type CardCheckinState =
  | { kind: "checkin"; brokenStreak: boolean; urgency: "normal" | "quota-at-risk" | "quota-today" | null }
  | { kind: "rest"; nextDayShort: string };

export function cardCheckinState(
  schedule: Schedule | null,
  stats: StreakStats,
  now: Date,
): CardCheckinState {
  if (schedule?.type === "weekly") {
    const quotaLeft = stats.week ? stats.week.quota - stats.week.done : 0;
    const daysLeft = 6 - (now.getDay()); // days after today through Sat
    const urgency =
      quotaLeft <= 0 ? null
      : daysLeft === 0 ? "quota-at-risk"
      : quotaLeft >= daysLeft ? "quota-at-risk"
      : null;
    return { kind: "checkin", brokenStreak: false, urgency };
  }
  if (!isScheduledDay(schedule, now.getDay())) {
    return { kind: "rest", nextDayShort: weekdayShort(new Date(nextScheduledDayKey(schedule, toKey(now))).getDay()) };
  }
  const broken = !stats.active && stats.total > 0;
  return { kind: "checkin", brokenStreak: broken, urgency: null };
}
```

Note: `toKey` is already imported transitively — check the actual imports in `schedule.ts` (it imports `fromKey, toKey` from `./streaks` at line 3 already). If the circular import (`streaks.ts` imports `schedule.ts`) causes issues, put `cardCheckinState` in a NEW file `packages/shared/src/card-state.ts` instead and export it from `packages/shared/src/index.ts`.

Run `bun test packages/shared` → all green.

Commit: `feat: shared card check-in state helper`

### Task 4 — GoalDTO: make new fields flow through

Files: `src/lib/goal-config.ts` (GoalDTO type), `src/lib/goals-api.ts`.

No logic change — the DTO type must match `StreakStats`. Edit `src/lib/goal-config.ts`:

```ts
import type { StreakStats } from "@streakly/shared";

export type GoalDTO = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  checkIns: { date: string }[];
  schedule: Schedule | null; // keep existing — already present
  stats: StreakStats;
};
```

(If `schedule` is already typed on the DTO, only replace the inline `stats` object with `StreakStats`.) `loadGoals()` already passes `computeStreaks` output straight through — verify no other place constructs `GoalDTO.stats` by hand: `grep -rn "stats:" src --include="*.ts*" | grep -v node_modules` and fix any literal object literals to include `unit` (TypeScript will flag them).

Verify: `bunx tsc --noEmit` → zero errors. Expected output: empty.

Commit: `refactor: GoalDTO.stats uses shared StreakStats`

### Task 5 — Card renders per cadence (the UX change)

File: `src/components/streaks/goal-card.tsx`.

5a. Weekly cards — replace the streak display block (lines 185-221) and the toggle block (lines 223-254):

```tsx
{goal.schedule?.type === "weekly" ? (
  <>
    <div className="mt-4 flex items-end justify-between gap-3">
      <div>
        <div className="flex items-baseline gap-2">
          <Flame className={cn("h-7 w-7", goal.stats.active ? colorCfg.text : "text-muted-foreground/50")} />
          <span className="text-4xl font-bold tabular-nums leading-none">{goal.stats.current}</span>
          <span className="text-sm text-muted-foreground">week{goal.stats.current === 1 ? "" : "s"}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {goal.stats.week?.met ? "Quota met this week" : `${goal.stats.week?.quota ?? 0 - (goal.stats.week?.done ?? 0)} to go this week`}
        </p>
      </div>
      <Badge variant="secondary" className="gap-1 font-medium">
        <Trophy className="h-3 w-3" /> Best {goal.stats.longest}w
      </Badge>
    </div>
    {/* 7-dot week row: filled = checked that day */}
    <WeekDots checkInKeys={new Set(goal.checkIns.map((c) => c.date))} now={today} />
    <Button onClick={() => onToggleToday(goal)} className={cn("mt-3 w-full", doneToday && cn(colorCfg.bg, "text-white hover:opacity-90"))} variant={doneToday ? "default" : "outline"} aria-pressed={doneToday}>
      {doneToday ? <><Check className="mr-2 h-4 w-4" />Checked in today</> : "Check in today"}
    </Button>
  </>
) : (
  /* existing daily/weekdays block, with ONE change: */
  /* replace the muted line (lines 201-209) with: */
  <p className="mt-1 text-xs text-muted-foreground">
    {restDay
      ? `Rest day — back ${nextDayShort}`
      : goal.stats.active && !doneToday
        ? "Streak alive — check in today!"
        : !goal.stats.active && goal.stats.total > 0
          ? "Streak broken — start again today"
          : doneToday
            ? "Completed today"
            : goal.stats.current > 0
              ? "Current streak"
              : "No active streak yet"}
  </p>
)}
```

5b. `WeekDots` — add a small local component in the same file:

```tsx
function WeekDots({ checkInKeys, now }: { checkInKeys: Set<string>; now: Date }) {
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  return (
    <div className="mt-3 flex gap-1.5">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const d = addDays(weekStart, i);
        const key = d.toISOString().slice(0, 10);
        const done = checkInKeys.has(key);
        const future = d > now;
        return (
          <span
            key={i}
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              done ? "bg-foreground" : "bg-muted-foreground/25",
              future && "opacity-40",
            )}
            aria-label={format(d, "EEE")}
          />
        );
      })}
    </div>
  );
}
```

Imports needed: `startOfWeek, addDays, format` from `date-fns`; `toKey` from `@streakly/shared` — USE `toKey(d)` instead of the manual `toISOString().slice(0,10)` (toKey handles local time correctly; the slice() form has UTC drift).

5c. Remove the now-redundant `restDay ? disabled button : toggle` duplication only for weekly (weekly never hits rest-day path since `isScheduledDay` returns true for weekly).

Behavior contract after this task:
- Weekly goal: streak number unit is "weeks", "Best Nw" badge, 7-dot week row, toggle always enabled, copy shows quota progress.
- Weekdays goal: unchanged toggle; new broken-streak copy when applicable.
- Daily: unchanged except broken-streak copy.

Verify: `bunx tsc --noEmit` → clean; `bun run lint` → clean. Runtime: `npm run build` must pass; then `curl -s localhost:3000 | grep -c "weeks"` is a weak check — real check is visual (user screenshots; per skill, do NOT self-verify UI via browser).

Commit: `feat: weekly quota card with week dots and broken-streak copy`

### Task 6 — Detail sheet unit labels

File: `src/components/streaks/goal-detail-sheet.tsx`.

In the `stats` array (lines 51-61), branch on unit:

```tsx
const isWeekly = goal.stats.unit === "week";
const unitSuffix = isWeekly ? "w" : "d";
const stats = [
  { label: "Current streak", value: `${goal.stats.current}${unitSuffix}`, icon: Flame, highlight: goal.stats.current > 0 },
  { label: "Longest streak", value: `${goal.stats.longest}${unitSuffix}`, icon: Trophy },
  { label: "Total check-ins", value: goal.stats.total, icon: CalendarCheck },
  { label: "30-day rate", value: `${rate30}%`, icon: Target },
];
```

If `goal.stats.week` exists, ALSO insert a first stat card `{ label: "This week", value: `${done}/${quota}`, icon: CalendarCheck }` and keep total cards at 4 by dropping "Total check-ins" into the header line (the sheet already shows `N total` under streak). Keep the card count at 4 to preserve the approved grid layout.

Verify: tsc + lint clean.

Commit: `feat: cadence-aware stat units in detail sheet`

### Task 7 — Full gate + runtime smoke

Run ALL gates in order, expect zero failures:

```
bunx tsc --noEmit        # empty output
bun run lint             # clean
bun test packages/shared # all suites pass
npm run build            # compiles, no socket.io errors
```

Runtime smoke: dev server (check `curl -s -o /dev/null -w "%{http_code}" localhost:3000` → 200 first; kill by port if stale per skill), then `curl -s localhost:3000/api/goals | head -c 400` → JSON containing `"stats"` with `"unit"` field.

Commit anything outstanding, then PR:

```
git push -u origin feature/cadence-card-behavior
"/c/Program Files/GitHub CLI/gh.exe" pr create --repo mtuntang/Streakly \
  --title "feat: per-cadence goal card behavior" \
  --body "## What changed
- Weekly-quota goals show week-based streaks (w not d), a 7-dot this-week row, quota progress copy, and an always-available check-in button
- Weekdays/daily goals get honest broken-streak copy (\"Streak broken — start again today\") instead of the new-goal message
- StreakStats gains additive unit/week fields; GoalDTO.stats now uses the shared type directly
## How to verify
- bunx tsc --noEmit
- bun run lint
- bun test packages/shared
- npm run build
- curl localhost:3000/api/goals -> 200, stats include unit fields"
```

Merge policy: SQUASH merge (per skill rule), so main reads `feat: per-cadence goal card behavior (#3)`.

## Tests / validation

TDD per task as specified above. Hard gates before PR: `bunx tsc --noEmit`, `bun run lint`, `bun test packages/shared`, `npm run build`. The Task 1 backward-compat lock must stay green through every task — that is the proof daily/weekdays behavior is unchanged.

## Risks, tradeoffs, open questions

- RISK: `cardCheckinState` in schedule.ts creates a schedule↔streaks import cycle (schedule.ts already imports from streaks.ts). Mitigation in Task 3: new file `card-state.ts`. Decide by trying the simple placement first.
- RISK: weekly "current streak" semantic changes display meaning (days→weeks). Existing seed data for weekly goals may show "13 weeks" where it used to say "13 days" — this is the INTENT, but verify the detail sheet's heatmap/labels still make sense.
- TRADEOFF accepted: voluntary rest-day check-ins ("did it anyway") is deliberately NOT in this plan — it changes doneToday semantics in shared code. Backlog it.
- TRADEOFF accepted: `stats.week` is optional/undefined for daily goals rather than a discriminated union — smaller diff, backward compatible, slightly less type-safe. Fine at this scale.
- OPEN QUESTION (ask user before Task 5): weekly badge when quota met — "Quota met this week" vs colorized success state on the dots? Default: plain copy, no extra color.
- OPEN QUESTION: should the card heatmap for weekly goals also show week-columns instead of day-cells? Default NO (YAGNI) — current heatmap with schedule-awareness already shipped in PR #2.