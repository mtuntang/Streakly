# Streakly — Dev Notes

This file explains the big decisions behind Streakly in plain words: what we
chose, why, and what we chose NOT to do. You should be able to read any
section without having followed the project.

- Newest decisions are at the bottom of "Decisions".
- Each section ends with the PR where it happened, so you can look up the code.
- Keep the file under ~300 lines. Move old sections to `DEV_NOTES-archive.md`.

---

## The app in one paragraph

Streakly is a habit tracker. You create goals ("run", "read"), check in on the
days you do them, and the app counts your streak (how many scheduled days in a
row you kept it up). It is a TypeScript monorepo:

- The website (Next.js, at the repo root in `src/`). It holds no data itself.
- `apps/api` (Hono on Bun): the server. It owns the database (Postgres via
  Prisma) and login (Better Auth). The website talks to it through a proxy:
  the browser calls `/api/...` on the website, and the website forwards it.
- `packages/shared`: plain logic and types both sides use (streak math,
  schedules, form validation).

Ground rule: **finish a feature before moving infrastructure around, never in
the middle of one.**

---

## Decisions

### 1. Streaks are calculated in one place only, on the server

The streak math (`computeStreaks` in `packages/shared/src/streaks.ts`) runs on
the server. The browser receives finished numbers in `GoalDTO.stats` and only
displays them.

**Why:** streak math is the hardest logic in the app ("what is today?", time
zones, grace days). Two copies would slowly disagree. Before changing its
signature, search for every place that calls it.

### 2. A shared package with strict rules (PR #1)

`packages/shared` may only import `date-fns` and `zod`. No database, no React,
no Next.js. It was split out first, as a pure file move with no edits.

**Why:** both the website and the server use it. If it stays free of
framework code, either side can use it without dragging the other along.

**Gotcha:** bun does not link workspace packages automatically. The root
`package.json` must list `"@streakly/shared": "workspace:*"`, or imports fail.

### 3. A goal's schedule is one JSON field, checked by zod (PR #2)

`Goal.schedule` holds one of:

- `null` or `{ type: "daily" }`: every day
- `{ type: "weekdays", days: [0..6] }`: chosen days (0 = Sunday)
- `{ type: "weekly", timesPerWeek: 1..7 }`: any N days per week

**Why JSON:** one field, one validation rule, and the TypeScript type matches
it exactly. The database itself does not check the JSON (no constraint). zod
checks it when it is written, and bad stored values are treated as daily.

**How weekly streaks work:** a weekly goal counts weeks, not days. A week
counts if you hit the quota. Missing a day only breaks the streak once the
quota can no longer be reached that week. Weeks start on Sunday.

**Grace rule (daily/weekdays):** missing a scheduled day breaks the streak.
But today does not count against you until it is over. Days that are not on
your schedule neither add to nor break the streak.

### 4. New fields never break old behavior

When `StreakStats` gets a new field, it gets a default, and a test that pins
the OLD shape is written first (PR #7 example: `unit: "day"` and an optional
`week`). That test must stay green.

**Why:** it turns "this should still work" into a test that fails if it doesn't.

### 5. Tests first, one commit per passing step

Write a failing test, make it pass with the smallest change, commit. Before
any PR, run: `bunx tsc --noEmit` → `bun run lint` → `bun test` →
`npm run build` (use npm, not bun, for builds on this Windows machine).

### 6. One helper decides how a goal card looks (PRs #7–#9)

`cardCheckinState()` (in `packages/shared/src/card-state.ts`) says whether a
card is in "check-in" mode or "rest day" mode, and whether the streak is
broken or at risk. The card and the detail panel both use it, so they can't
disagree. `toggleButtonStyle()` does the same for the check-in button's look.
It exists because of a real dark-mode bug where a checked button never looked
checked; tests now lock the fix.

### 7. Plain string types instead of TypeScript enums

Values like `"normal" | "quota-at-risk"` are written as string unions, not
`enum`.

**Why:** the compiler catches typos in both, so enums add no safety. Data
from the network arrives as plain strings either way; zod is what actually
checks it. Enums also add hidden runtime code, and `const enum` breaks with
fast build tools like bun. When you need the list of values at runtime, use
an `as const` object.

### 8. You can check in on a rest day (PR #8)

If a goal is scheduled Mon–Fri, you can still check in on Saturday.

- It counts toward your total and shows on the heatmap.
- It does NOT grow your streak, and it can't restart a broken one.
- The button looks different (dashed) and says "Checked in on a rest day",
  so you know it didn't count toward the streak.

**Why:** the app shouldn't refuse real effort.

### 9. The heatmap is simple: done or not done (PR #9)

- A day is either checked or not. The "Less → More" legend was removed
  because there are no levels.
- Every unchecked day is the same gray. Rest days are not dimmed: the goal's
  schedule badge already says which days are rest days.
- Weekly goals show one dot per required check-in instead of 7 day-dots,
  because a weekly goal is about the count, not the days.

### 10. Names say what things do

`cardStatusMessage()` (was `streakCopy`) builds the card's status line. We
avoid "copy" (design jargon for text): it is unclear and sounds like
"duplicate".

### 11. Text never misleads

A goal that had a streak and lost it says "Streak broken — start again today",
never "No active streak yet". Same numbers, different meaning.

### 12. Delete what you don't use (PR #10)

Old template files and unused components were deleted (34 unused UI
components, 38 unused packages, stray copies of shared files). UI components
can be re-added with one command (`npx shadcn add <name>`), so there is no
reason to keep unused ones.

### 13. How commits and PRs are done

- One commit = one change, with a prefix: `feat:`, `fix:`, `refactor:`,
  `test:`, `chore:`, `docs:`.
- PRs are squash-merged, so `main` reads like a changelog.
- PR descriptions: what changed, plus a checklist of commands to verify it.
- Cleanup work gets its own PR, never mixed into a feature.
- After a merge, delete the branch locally and on GitHub.

### 14. Windows quirks (so they don't bite twice)

- Build with `npm run build`; use bun for everything else.
- Stop a stuck dev server by its port, not its name: find the process id
  with `netstat`, then `MSYS_NO_PATHCONV=1 taskkill /PID <id> /T /F`.
- Check that a server is up with `curl`, not by reading its log file.

### 15. Database ids are UUIDs made by Postgres (PR #19)

Goal and check-in ids are real Postgres `uuid` values that the database
generates. A badly formed id in a URL returns 404 (not found) instead of
crashing with a 500.

**Not yet:** the browser does not create ids itself. That changes with
offline mode (roadmap item 5).

### 16. Every goal belongs to one user (PR #20)

Goals have a `userId`. Every database query includes it, so you can only see
or change your own goals. Another user's goal answers 404 (not found), never
403 (forbidden): the app does not even admit it exists.

### 17. Signing in on the website (PR #23)

- **The server refuses to start with unsafe settings.** Outside development
  and tests, it needs a secret key of 32+ characters (`BETTER_AUTH_SECRET`)
  and its public address (`BETTER_AUTH_URL`). Without the key, Better Auth
  would use a publicly known default, and anyone could fake a login.
- **The password minimum only applies when creating an account.** Signing in
  accepts any length, so raising the minimum later won't lock people out.
- **"Logged out" and "server unreachable" are handled differently.** Logged
  out → go to the sign-in page. Can't reach the server → show a Retry
  button. A network hiccup never logs you out.
- **If your session expires while you use the app,** the next request sends
  you to the sign-in page instead of showing error messages (`apiFetch`).

### 18. The api's entry file must not default-export the app (PR #24)

**What went wrong:** Bun automatically starts a web server for any entry file
whose default export has a `fetch` function, on port 3000. The api did that,
so it grabbed the website's port and every page showed "404 Not Found".

**Fix:** the app now lives in `apps/api/src/app.ts` as a named export
(`{ app }`). `index.ts` only starts the server on port 4000. Tests and the
seed script import from `app.ts`.

### 19. Two login settings were silently not working (PR #26)

- **Sign-in from the website was rejected in development.** Better Auth only
  accepts login requests from its own site, to block other sites from making
  requests while you are logged in (this is called CSRF protection). It learns
  "its own site" from `BETTER_AUTH_URL`. That wasn't set, so it guessed from
  the forwarded request (`localhost:4000`, the api) while the browser said it
  came from `localhost:3000` (the website). Every login looked like an
  attack.
  **Rule:** `BETTER_AUTH_URL` is the address people type in their browser
  (dev: `http://localhost:3000`), never the api's internal address.
- **Tests didn't catch it,** because Better Auth turns this check off during
  tests by default. It is now switched on in every environment.
- **The login attempt limit was ignored.** The setting was named
  `specialRules`, which Better Auth doesn't have, so it was skipped without
  any error. The real name is `customRules`. A test now pins the setting.
- **Lesson:** a misspelled option fails silently in some libraries. After
  changing a security setting, test the real behavior (send the requests,
  watch for the block), not just whether the code compiles.

---

## Things we chose NOT to do (for now)

- **No browser-rendering tests.** Display logic lives in small functions that
  have unit tests. How it actually looks is checked by screenshot.
- **No database rules for the schedule JSON.** zod checks it on write.
- **No enums.** See decision 7.
- **No separate profiles or organizations.** One person = one account = one
  way to log in.

---

## How data is stored

Postgres 16, started with `docker compose up -d` (port 5432). Demo data:
`bun run db:seed`.

- **Login tables** (owned by Better Auth): `user`, `session`, `account` (the
  password lives here, not on the user), `verification`.
- **App tables:** `goals` belong to a user (deleting the user deletes their
  goals). `check_ins` belong to a goal and have no `userId` of their own:
  ownership goes user → goal → check-in. One check-in per goal per day (a
  unique rule), which also makes a double-click harmless.
- **Time zone** is stored once, on the user (the column exists; filling it in
  at sign-up is the next task). It is never copied onto goals, so there is
  only one place to change it.
- **Dates:** a check-in's date is a plain calendar date (`date` column). The
  server converts it to and from `"YYYY-MM-DD"` text.

---

## Roadmap

1. Split the server out of the website (`apps/api` owns the data).
   **DONE** (PRs #14, #17, #18, #19).
2. Move from SQLite to Postgres. **DONE** (PR #17).
3. Accounts and login, with each user seeing only their own goals.
   **DONE** (PRs #18, #20, #22, #23; fixes in #26).
   **NEXT:** save the user's time zone at sign-up. The real work is testing
   the daylight-saving switches (the spring-forward and fall-back days).
4. Payments with Stripe (after launch).
5. Installable app that works offline (PWA). Changes made offline are stored
   in the browser and sent when back online. This is when the browser starts
   creating ids itself (uuid v7). Check-ins merge safely, since there's one
   per day; for text edits, the last save wins. A mobile app (Expo) would
   reuse this later.
