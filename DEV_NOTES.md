# Streakly — Dev Notes

This file explains the big decisions behind Streakly in plain words: what we
chose, why, and what we chose NOT to do. You should be able to read any
section without having followed the project.

- Every decision has the same shape: **Problem** (what was wrong or
  needed), **Decision** (what we did), and **Why** (when it isn't obvious).
- Newest decisions are at the bottom of "Decisions".
- Each heading ends with the PR where it happened, so you can look up the code.
- Keep the file under ~350 lines. Move old sections to `DEV_NOTES-archive.md`
  (decisions 7–12, 18 and 19 live there now).

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

**Problem:** streak math is the hardest logic in the app ("what is today?",
time zones, grace days). If the website and the server each had a copy,
the two copies would slowly start giving different answers.

**Decision:** the math (`computeStreaks` in `packages/shared/src/streaks.ts`)
runs only on the server. The browser receives finished numbers in
`GoalDTO.stats` and only displays them. Before changing its signature,
search for every place that calls it.

### 2. A shared package with strict rules (PR #1)

**Problem:** the website and the server need the same logic and types, but
code that imports React or the database can't run on both sides.

**Decision:** `packages/shared` may only import `date-fns` and `zod`. No
database, no React, no Next.js. It was split out as a pure file move, with
no edits mixed in.

**Why:** a package with no framework code can be used by either side
without dragging the other along.

**Gotcha:** bun does not link workspace packages automatically. The root
`package.json` must list `"@streakly/shared": "workspace:*"`, or imports fail.

### 3. A goal's schedule is one JSON field, checked by zod (PR #2)

**Problem:** goals needed schedules beyond "every day": chosen weekdays, or
"N times a week".

**Decision:** `Goal.schedule` is one JSON field holding one of:

- `null` or `{ type: "daily" }`: every day
- `{ type: "weekdays", days: [0..6] }`: chosen days (0 = Sunday)
- `{ type: "weekly", timesPerWeek: 1..7 }`: any N days per week

**Why JSON:** one field, one validation rule, and the TypeScript type matches
it exactly. The database doesn't check the JSON. zod checks it when it is
written, and bad stored values are treated as daily.

**How weekly streaks work:** a weekly goal counts weeks, not days. A week
counts if you hit the quota. A missed day only breaks the streak once the
quota can no longer be reached that week. Weeks start on Sunday.

**Grace rule (daily/weekdays):** missing a scheduled day breaks the streak,
but today doesn't count against you until it's over. Days off your schedule
neither add to nor break the streak.

### 4. New fields never break old behavior (PR #7)

**Problem:** `StreakStats` keeps growing (weekly goals needed new fields).
Every change risks quietly changing what existing daily goals return.

**Decision:** new fields get defaults (`unit: "day"`, optional `week`), and
a test that pins the OLD shape is written first and must stay green.

**Why:** it turns "this should still work" into a test that fails if it
doesn't.

### 5. Tests first, one commit per passing step

**Problem:** without a fixed routine, a change gets "done" without proof it
works.

**Decision:** write a failing test, make it pass with the smallest change,
commit. Before any PR, run: `bunx tsc --noEmit` → `bun run lint` →
`bun test` → `npm run build` (use npm, not bun, for builds on this Windows
machine).

### 6. One helper decides how a goal card looks (PRs #7–#9)

**Problem:** if the goal card and the detail panel each worked out on their
own whether a goal is on a rest day, at risk, or broken, they could
disagree. Separately, a real dark-mode bug made a checked rest-day button
never look checked.

**Decision:** `cardCheckinState()` (in `packages/shared/src/card-state.ts`)
decides the card's mode once, and both views use it. `toggleButtonStyle()`
does the same for the check-in button's look; tests lock the dark-mode fix.

### 13. How commits and PRs are done

**Problem:** history is only useful if each entry is easy to read.

**Decision:**

- One commit = one change, with a prefix: `feat:`, `fix:`, `refactor:`,
  `test:`, `chore:`, `docs:`.
- PRs are squash-merged, so `main` reads like a changelog.
- PR descriptions: what changed, plus a checklist of commands to verify it.
- Cleanup work gets its own PR, never mixed into a feature.
- After a merge, delete the branch locally and on GitHub.

### 14. Windows quirks (so they don't bite twice)

**Problem:** some tools behave differently on this Windows machine and
waste time when forgotten.

**Decision:**

- Build with `npm run build`; use bun for everything else.
- A stuck dev server can keep its port while serving nothing. Stop it by
  port, not by name: find the process id with `netstat`, then
  `MSYS_NO_PATHCONV=1 taskkill /PID <id> /T /F`.
- Check that a server is up with `curl`, not by reading its log file.
- To run the production build locally, start the server from
  `.next/standalone/Documents/Code/Streakly/`. Copy `.next/static` and
  `public` into that folder first; the build script copies them one level
  too high for this deep path. Use `node.exe`, not `node`, in git-bash.

### 15. Database ids are UUIDs made by Postgres (PR #19)

**Problem:** goals and check-ins need ids. With a Postgres `uuid` column, a
badly formed id in a URL makes the database throw an error, which would
show up as a 500 crash.

**Decision:** ids are real Postgres `uuid` values that the database
generates, and the server checks an id's format first, so a bad one
returns 404 (not found).

**Not yet:** the browser doesn't create ids itself. That changes with offline
mode (roadmap item 5).

### 16. Every goal belongs to one user (PR #20)

**Problem:** once the app has several users, nobody should be able to see or
change anyone else's goals.

**Decision:** goals have a `userId`, and every database query includes it.
Someone else's goal answers 404 (not found), never 403 (forbidden).

**Why 404:** a 403 would confirm that the goal exists. A 404 reveals nothing.

### 17. Signing in on the website (PR #23)

**Problem:** the website had no sign-in screen, and a few settings could
quietly make login unsafe.

**Decision:**

- **The server refuses to start with unsafe settings.** Outside development
  and tests, it needs a secret key of 32+ characters (`BETTER_AUTH_SECRET`)
  and its public address (`BETTER_AUTH_URL`). Without the key, Better Auth
  would use a publicly known default, and anyone could fake a login.
- **The password minimum only applies when creating an account.** Sign-in
  accepts any length, so raising the minimum later won't lock people out.
- **"Logged out" and "server unreachable" are handled differently.** Logged
  out → go to the sign-in page. Can't reach the server → show a Retry
  button. A network hiccup never logs you out.
- **If your session expires mid-use,** the next request sends you to the
  sign-in page instead of showing error messages (`apiFetch`).

### 20. "Today" means the user's day, not the server's (PR #60)

**Problem:** the server decided what "today" was from its own clock. On a
server running in UTC, a user in a time zone where it was already tomorrow
would check in for their own date. The streak math saw that as a
"future" check-in and ignored it, so the button showed "not done" right
after the click.

**Decision:** the browser sends its time zone (an IANA name such as
`America/Los_Angeles`) when the account is created, and updates it on later
visits if it has changed. The server works out "today" in that zone, both
for streak stats and for a check-in sent without a date
(`todayKeyIn` / `zonedToday` in the shared package).

- **Only named zones are accepted.** A fixed offset like `+05:00` has no
  daylight-saving rules, so the day would shift by an hour twice a year. A
  bad zone gets a 400 response.
- **With no zone stored, the server's day is used,** which is what the app
  did before. Users who signed up earlier keep working until their next
  visit stores their zone.

**Gotcha:** tests that change the user (`update-user`) must send an
`Origin` header. Without one, Better Auth rejects the request with a 403.

### 21. A check-in redraws only its own card (PR #65)

**Problem:** checking in one goal redrew every card on the page, and
moving the pointer across a card's heatmap redrew all 126 day squares
for each square it passed. Measured on the demo data in the dev build:
a check-in redrew 570 components (~105ms), and hovering 20 squares took
~109ms of rendering.

**Decision:**

- **Cards, the edit dialog and the history sheet skip redrawing** when
  their goal didn't change (`React.memo`). This works because the goal
  list keeps unchanged goals as the same objects and the click handlers
  keep their identity (`useCallback` in `useGoals` and the page).
- **The heatmap keeps its hover label apart from its squares.** One
  listener on the grid reads which day is under the pointer, so hovering
  redraws only the label.
- **Result:** a check-in redraws 176 components (~35ms), and only the
  card that changed; hovering 20 squares takes ~7ms.

**Gotcha:** the drag library (dnd-kit) rebuilds its shared state whenever
its sensor settings are a new object, and that redraws every card, memo
or not. So the settings are constants outside the component, and the
list of card ids passed to it only changes when the order does.

### 22. Phone and tablet layout (PR #65)

**Changed:**

- **Phones:** cards are a sideways deck you swipe, one card at a time. The
  row of goal pills moved to a bar at the bottom of the screen, where a
  thumb can reach it. Swiping the bar turns the deck, and swiping the deck
  turns the bar. Hold a pill to drag it and change the order.
- **Small phones:** everything fits on one screen, with no scrolling down
  to 320×568. Cards keep their full width; the summary at the top shrinks
  instead.
- **Tablets:** hold a card for a moment, then drag it to reorder.
- **Footer removed.** It only repeated the header and took space on phones.

**Fixed:**

- Dragging a pill moved the order too fast to control. Now it moves slowly
  and stops where you let go.
- Swiping a card that started on its ⋯ button opened the menu.
- Each swipe redrew the whole page. Now only the summary redraws.

### 23. Easier to see in light mode (PR #65)

**Fixed:**

- Done days on the heatmap looked almost the same as missed days for some
  goal colors (lime, amber, teal, green, sky). Done colors are darker now,
  so the difference is clear.
- The outlines of the "Mark done" and rest-day buttons were too faint, so
  they are darker.
- Small icon buttons were hard to tap on phones. They now respond to taps
  in a slightly larger area around them, with no change in how they look.

---

## Things we chose NOT to do (for now)

- **No browser-rendering tests.** Display logic lives in small functions that
  have unit tests. How it actually looks is checked by screenshot.
- **No database rules for the schedule JSON.** zod checks it on write.
- **No enums.** See decision 7 (in the archive).
- **No footer.** Legal links, when they exist, go on the sign-in and
  settings pages.
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
- **Time zone** is stored once, on the user (sent by the browser; see
  decision 20). It is never copied onto goals, so there is only one place
  to change it.
- **Dates:** a check-in's date is a plain calendar date (`date` column). The
  server converts it to and from `"YYYY-MM-DD"` text.

---

## Roadmap

1. Split the server out of the website (`apps/api` owns the data).
   **DONE** (PRs #14, #17, #18, #19).
2. Move from SQLite to Postgres. **DONE** (PR #17).
3. Accounts and login, with each user seeing only their own goals.
   **DONE** (PRs #18, #20, #22, #23; fixes in #26).
   Each user's "today" follows their own time zone. **DONE** (PR #60).
   **NEXT:** clean up how the website loads and changes goals (one
   `useGoals()` hook).
4. Payments with Stripe (after launch).
5. Installable app that works offline (PWA). Changes made offline are stored
   in the browser and sent when back online. This is when the browser starts
   creating ids itself (uuid v7). Check-ins merge safely, since there's one
   per day; for text edits, the last save wins. A mobile app (Expo) would
   reuse this later.
