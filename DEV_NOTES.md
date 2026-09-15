# Streakly — Dev Notes

Engineering decisions log: what was decided, why, and what we deliberately did NOT do.
Maintained as decisions were made; newest sections at the bottom. Pair with the PR
history (squash-merged, so main's log reads as a changelog and PRs carry the detail).

---

## Project context

Streakly is a habit tracker (Next.js 16, bun, Prisma/SQLite, shadcn/ui, dnd-kit)
evolving into a multi-user SaaS. Target architecture: bun-workspaces monorepo —
`packages/shared` (pure logic), `apps/api` (Hono backend owning the DB),
`apps/web` (Next.js, HTTP-only consumer), then Postgres + Better Auth + Stripe.

Principle agreed up front: **ship features first, extract infrastructure between
features, never mid-feature.** The extraction windows were chosen after feature
work completed (cadence features merged before the monorepo split; the api split
happens before auth makes it 3x harder).

---

## Architecture decisions

### 1. All streak math is server-side, in one shared package

`computeStreaks` lives in `packages/shared/src/streaks.ts` and is called only from
`loadGoals()` (server). Stats ride `GoalDTO.stats` to the client; client components
are dumb renderers and never recompute streaks.

**Why:** one source of truth for the only genuinely hard logic. Client-side
recomputation would drift the moment time zones, "today", or grace rules are
involved. Enforced by convention (grep call sites before changing the signature).

### 2. Monorepo split before auth (PR #1)

`packages/shared` extracted first, as a pure move (`git mv`, no edits, separate
commits). Ground rule: shared imports NOTHING outside `date-fns` + `zod` — no
Prisma, no React, no Next.

**Why:** the shared package is the contract between web and the future api. Purity
is what makes the api extraction cheap later; purity enforced at extraction time
is cheaper than refactoring a contaminated package.

**Also learned:** bun does not auto-link workspace packages — the root
`package.json` must declare `"@streakly/shared": "workspace:*"` or imports fail
even after `bun install`.

### 3. Schedules stored as a JSON column, validated by zod (PR #2)

`Goal.schedule Json?` holds `null` (= daily, backward-compatible default) or
`{ type: "daily" } | { type: "weekdays", days: [0..6] } | { type: "weekly", timesPerWeek: 1..7 }`.

**Why JSON over columns:** one migration, one zod gate, discriminated-union shape
in TypeScript. No DB-level validation — acceptable at this scale; invalid stored
JSON is normalized to `null` on read (`normalizeSchedule`, which also dedupes/sorts
weekday arrays).

**Weekly quota semantics (the hard call):** a weekly goal's streak counts
consecutive weeks whose quota was MET. A missed day only breaks the streak once
that week's quota is mathematically unreachable; once met, remaining days of the
week neither count nor break. Weeks start Sunday (matches the heatmap). Strict
per-day weekly was rejected — it defeats the purpose of a flexible quota.

**Grace rule (daily/weekdays):** an unchecked *scheduled* day kills the chain, but
the chain stays alive through today if the most recent scheduled day was checked
(today included as grace). Unscheduled days are transparent: they neither build
nor break the chain.

### 4. Backward compatibility is a gate, not a hope

Every extension of `StreakStats` is additive with defaults, locked by a
regression test written BEFORE the change and kept green through every task.
Example (PR #7): `unit: "day"` + optional `week` — daily/weekdays goals return
the exact old shape, proven by a shape-lock test.

**Why:** it converts "should be backward compatible" from a hope into a CI-failing
fact.

### 5. TDD per task, red→green, commit per green task

Feature work follows: failing tests first (proving the harness and the gap), then
minimal implementation, then commit. The daily-regression suite is always written
first. Gates before any PR: `bunx tsc --noEmit` → `bun run lint` → `bun test` →
`npm run build` (npm, not bun, for builds on this Windows setup).

### 6. Card render state derives from one shared helper (PRs #7–#9)

`cardCheckinState(schedule, stats, now)` in `packages/shared/src/card-state.ts`
returns a discriminated union (`{ kind: "checkin", brokenStreak, urgency }` |
`{ kind: "rest", nextDayShort }`). Card and detail sheet branch on it; they cannot
disagree.

**Why here and not in schedule.ts:** `schedule.ts` already imports from
`streaks.ts`; a new `card-state.ts` avoided deepening the import cycle.

`toggleButtonStyle(state, doneToday)` similarly derives the check-in button's
render contract (`variant` / `dashed` / `filled`) for ALL cadences. Born from a
real dark-mode bug: the rest-day checked button kept `variant="outline"` and its
outline classes fought the goal-color fill, so the button never looked "checked"
in dark mode. The fix (flip to `variant="default"` when checked) is now locked by
tests, including an equality test that checked-state rendering is identical for
rest days and normal days.

### 7. String literal unions and `as const` objects over TS enums

`CardUrgency`, `CardCheckinState.kind`, `Schedule.type`, `StreakUnit` are all
string literal unions. TS enums are deliberately not used.

**The reasoning chain:**

- Compile-time safety is identical (exhaustiveness, typo rejection).
- No type survives `JSON.stringify` — `JSON.parse` returns `any`, so the wire
  always delivers untyped words. Enums provide no runtime guard; they just make
  the any-cast feel safe. Safety at boundaries comes from runtime validation
  (zod), which validates literal unions natively and shares the type's source of
  truth.
- TS enums carry runtime machinery (reverse mappings, `const enum` breaking under
  transpile-only builds like bun/esbuild) for zero added safety.
- One idiom per codebase beats two. The repo standardized on unions + zod.
- When the set of values is needed at runtime (list/iterate/map to labels), use
  `as const` objects — same namespacing, JSON-safe, no build traps.

Related vocabulary that shaped practice: the parse-then-cast antipattern, unsound
assertions ("type laundering"), and the rule that `as` on deserialized data is a
promise, not a check.

### 8. Voluntary rest-day check-ins (PR #8)

Users may check in on non-scheduled days ("did it anyway"). Semantics:

- Counts toward `total` and renders on the heatmap.
- Does NOT grow `current`/`longest` — rest days stay transparent in the chain.
- Cannot resurrect a dead chain.
- `doneToday` is now simply "checked today", scheduled or not (one-line change in
  `computeStreaks`; the streak-walk logic already treated unscheduled days as
  transparent, so nothing else moved).
- The API 400 gate on check-in POSTs for unscheduled days was removed.
- UI: the rest-day button is enabled and dashed ("Do it anyway (Rest Day - back
  Mon)"); once checked it reads "Checked in on a rest day" so the user knows it
  did not advance the streak.

**Why:** the app should not refuse real effort. The alternative (disabled toggle)
hid data users wanted to give. Initially backlogged because it changes
`doneToday` semantics; shipped as a contained follow-up once the card-behavior
work landed.

### 9. Heatmap: binary, uniform, no legend (PR #9)

- Check-ins are yes/no — the Less→More intensity legend was fiction and was
  removed.
- All unchecked cells are one gray (`bg-foreground/15` light / `bg-muted/40`
  dark). The earlier rest-day dimming (`opacity-25`) was removed once voluntary
  check-ins shipped: the cadence badge already communicates the schedule, and the
  heatmap re-encoding it read as a rendering bug. The heatmap no longer takes a
  `schedule` prop.
- Weekly goals show **quota progress dots** — one dot per required check-in
  (filled in the goal color, remaining muted) — not a 7-day Sun–Sat row. The
  quota IS the week; showing 7 weekday dots implied the wrong contract.

### 10. Naming: say what it does, not the jargon

- `cardStatusMessage()` (was `streakCopy`): it produces the card's status line for
  every state — rest day, completed, alive, broken, fresh — not just the streak.
- Avoided "copy" (frontend jargon for user-facing text) in favor of "message":
  clearer to non-native readers and not confusable with "duplicate".

### 11. Copy honesty as a product rule

The card never reuses empty-state copy for broken states: a goal that HAD a
streak and lost it shows "Streak broken — start again today", never "No active
streak yet". Same stats, different meaning. Voluntary check-ins get distinct
wording so users always know what counted.

### 12. Residue hygiene (PR #10)

Deleted tracked template artifacts (`.zscripts/`, `mini-services/`, `download/`,
`Caddyfile`, stale npm `package-lock.json` — bun.lock is the single lockfile) and
untracked `.hermes/` (planning docs stay local). Rationale: root clutter reads as
unfinished thinking, and dead weight accumulates by default — the repo has run
two prune rounds (34 unused shadcn components, 38 deps, stale lib copies) plus
this root cleanup. Shadcn components are one `npx shadcn add <x>` away; hoarding
them cost ~60% of the repo in dead lines once.

### 13. Commit & PR hygiene

- One commit = one logical change; conventional prefixes (`feat:`, `fix:`,
  `chore:`, `refactor:`, `test:`); body only when the why isn't obvious.
- Squash-merge features so main reads as a changelog; per-commit detail lives in
  the PR.
- PR bodies stay brief: what changed + a "how to verify" checklist with exact
  commands.
- Chores get their own PRs, never ride feature branches.
- After merge: sync main, delete local + remote feature branches.

### 14. Windows/ tooling quirks (recorded so they don't bite twice)

- `npm run build` for builds (bun's build path breaks on this setup); bun for
  everything else (test, install, dev).
- Kill dev servers by port (`netstat` + `taskkill /PID <pid> /T /F` with
  `MSYS_NO_PATHCONV=1`), not by name; a half-dead server holds :3000 while
  serving nothing (curl 000 + LISTENING = kill and relaunch).
- Dev-server readiness is verified with curl, never by trusting log files.

---

## What we deliberately did NOT do (and why)

- **No CSS/DOM testing rig.** Button/state decision logic is extracted into
  shared pure functions and unit-tested; rendered pixels are verified by
  human screenshot on each UI PR. A jsdom/testing-library setup is a known gap,
  not an oversight — deferred until UI complexity justifies the rig.
- **No Postgres/JSON schema validation in the DB yet.** The JSON schedule column
  is zod-validated at write time and normalized on read. Proper DB-level
  constraints arrive with the Postgres migration.
- **No auth until the api split.** Bolt auth onto Next.js route handlers now and
  it would have to move twice.
- **No intensity scale on the heatmap.** Binary check-ins — the legend lied.
- **No TS enums.** See decision 7.

---

## Roadmap (agreed sequence)

1. ~~Monorepo Step 1: `packages/shared`~~ (PR #1)
2. ~~Per-goal cadence: schedules, streak semantics, API gates, picker, seeds~~ (PR #2)
3. ~~Prune/dead-code/chores~~ (PRs #3–#6, #10)
4. ~~Per-cadence card behavior: week units, quota dots, honest copy~~ (PR #7, #9)
5. ~~Voluntary rest-day check-ins~~ (PR #8)
6. **NEXT: Monorepo Step 2 — `apps/api` (Hono) owns the DB; web becomes
   HTTP-only.** Design drafted: request → zod (shared schema) → Prisma →
   `computeStreaks` → `GoalDTO`. Three PRs: skeleton, route migration (fixing the
   loadGoals-loads-everything pattern), web cutover.
7. Postgres (Neon) migration.
8. Better Auth + userId scoping on every query (open decision to settle first:
   single- vs multi-user).
9. Stripe (subscriptions; can follow post-MVP).
10. PWA (small; can ride along anytime), later Expo/mobile against the same API.
