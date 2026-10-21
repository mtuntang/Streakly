# Streakly — Dev Notes

This file explains the big decisions behind Streakly in plain words: what we
chose and why. You should be able to read any section without having
followed the project.

- Every decision has the same shape: **Problem** (what was wrong or
  needed), **Decision** (what we did), and **Why** (when it isn't obvious).
- Newest decisions are at the bottom of "Decisions".
- Each heading ends with the PR where it happened, so you can look up the code.

---

## The app in one paragraph

Streakly is a habit tracker. You create goals ("run", "read"), check in on the
days you do them, and the app counts your streak (how many scheduled days in a
row you kept it up). It is a TypeScript monorepo:

- `apps/web` (Next.js): the website. It holds no data itself.
- `apps/api` (Hono on Bun): the server. It owns the database (Postgres via
  Prisma) and login (Better Auth). The website talks to it through a proxy:
  the browser calls `/api/...` on the website, and the website forwards it.
- `packages/shared`: plain logic and types both sides use (streak math,
  schedules, form validation).

Ground rule: **finish a feature before moving infrastructure around, never in
the middle of one.**

---

## Decisions

### 1. Duplicated logic: Streaks are calculated in one place only, on the server

**Problem:** streak math is the hardest logic in the app ("what is today?",
time zones, grace days). If the website and the server each had a copy,
the two copies would slowly start giving different answers.

**Decision:** the math (`computeStreaks` in `packages/shared/src/streaks.ts`)
runs only on the server. The browser receives finished numbers in
`GoalDTO.stats` and only displays them. Before changing its signature,
search for every place that calls it.

### 2. Dependency boundaries: A shared package with strict rules (PR #1)

**Problem:** the website and the server need the same logic and types, but
code that imports React or the database can't run on both sides.

**Decision:** `packages/shared` may only import `date-fns` and `zod`. No
database, no React, no Next.js. It was split out as a pure file move, with
no edits mixed in.

**Why:** a package with no framework code can be used by either side
without dragging the other along.

**Gotcha:** bun does not link workspace packages automatically. The root
`package.json` must list `"@streakly/shared": "workspace:*"`, or imports fail.

### 3. Data modeling: A goal's schedule is one JSON field, checked by zod (PR #2)

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

### 4. Backward compatibility: New fields never break old behavior (PR #7)

**Problem:** `StreakStats` keeps growing (weekly goals needed new fields).
Every change risks quietly changing what existing daily goals return.

**Decision:** new fields get defaults (`unit: "day"`, optional `week`), and
a test that pins the OLD shape is written first and must stay green.

**Why:** it turns "this should still work" into a test that fails if it
doesn't.

### 5. Testing workflow: Tests first, one commit per passing step

**Problem:** without a fixed routine, a change gets "done" without proof it
works.

**Decision:** write a failing test, make it pass with the smallest change,
commit. Before any PR, run: `bunx tsc --noEmit` → `bun run lint` →
`bun test` → `npm run build` (use npm, not bun, for builds on this Windows
machine).

### 6. Single source of truth: One helper decides how a goal card looks (PRs #7–#9)

**Problem:** if the goal card and the detail panel each worked out on their
own whether a goal is on a rest day, at risk, or broken, they could
disagree. Separately, a real dark-mode bug made a checked rest-day button
never look checked.

**Decision:** `cardCheckinState()` (in `packages/shared/src/card-state.ts`)
decides the card's mode once, and both views use it. `toggleButtonStyle()`
does the same for the check-in button's look; tests lock the dark-mode fix.

### 7. Type safety: Plain string types instead of TypeScript enums

**Problem:** we need types for fixed sets of values, like
`"normal" | "quota-at-risk"`. TypeScript offers two ways: string unions and
`enum`.

**Decision:** string unions everywhere. When the list of values is needed at
runtime, use an `as const` object.

**Why:** the compiler catches typos in both, so enums add no safety. Network
data arrives as plain strings either way; zod is what actually checks it.
Enums also add hidden runtime code, and `const enum` breaks with fast build
tools like bun.

### 8. Product rule: You can check in on a rest day (PR #8)

**Problem:** on a day off its schedule (say, Saturday for a Mon–Fri goal),
the check-in button was disabled, so the app refused real effort.

**Decision:** allow it, but keep it honest:

- It counts toward your total and shows on the heatmap.
- It does NOT grow your streak, and it can't restart a broken one.
- The button is dashed and says "Checked in on a rest day", so you know it
  didn't count toward the streak.

### 9. Misleading UI: The heatmap is simple: done or not done (PR #9)

**Problem:** the heatmap suggested more than the data holds. It had a
"Less → More" legend, but a day is only ever checked or not. It also dimmed
rest days, which looked like a rendering bug.

**Decision:**

- Two states only: checked or unchecked. The legend is gone.
- Every unchecked day is the same gray. The goal's schedule badge already
  says which days are rest days.
- Weekly goals show one dot per required check-in instead of 7 day-dots,
  because a weekly goal is about the count, not the days.

### 10. Naming: Names say what things do

**Problem:** `streakCopy` built the card's whole status line, not just
streak text. And "copy" is design jargon that also sounds like "duplicate".

**Decision:** renamed it `cardStatusMessage()`. Names describe what the code
returns or does, not jargon.

### 11. Misleading text: Text never misleads

**Problem:** a goal that lost its streak and a brand-new goal both have zero
current days. Showing "No active streak yet" for both is wrong for the
first one.

**Decision:** a lost streak says "Streak broken — start again today". Same
numbers, different meaning, different text.

### 12. Dead code: Delete what you don't use (PR #10)

**Problem:** unused files pile up: 34 unused UI components, 38 unused
packages, stray copies of shared files, and old template folders.

**Decision:** delete them. UI components come back with one command
(`npx shadcn add <name>`), so there's no reason to keep unused ones.

### 13. Git workflow: How commits and PRs are done

**Problem:** history is only useful if each entry is easy to read.

**Decision:**

- One commit = one change, with a prefix: `feat:`, `fix:`, `refactor:`,
  `test:`, `chore:`, `docs:`.
- PRs are squash-merged, so `main` reads like a changelog.
- PR descriptions: what changed, plus a checklist of commands to verify it.
- Cleanup work gets its own PR, never mixed into a feature.
- After a merge, delete the branch locally and on GitHub.

### 14. Environment quirks: Windows quirks (so they don't bite twice)

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

### 15. Input validation: Database ids are UUIDs made by Postgres (PR #19)

**Problem:** goals and check-ins need ids. With a Postgres `uuid` column, a
badly formed id in a URL makes the database throw an error, which would
show up as a 500 crash.

**Decision:** ids are real Postgres `uuid` values that the database
generates, and the server checks an id's format first, so a bad one
returns 404 (not found).

**Not yet:** the browser doesn't create ids itself. That changes with offline
mode (roadmap item 5).

### 16. Data isolation: Every goal belongs to one user (PR #20)

**Problem:** once the app has several users, nobody should be able to see or
change anyone else's goals.

**Decision:** goals have a `userId`, and every database query includes it.
Someone else's goal answers 404 (not found), never 403 (forbidden).

**Why 404:** a 403 would confirm that the goal exists. A 404 reveals nothing.

### 17. Authentication: Signing in on the website (PR #23)

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

### 18. Port conflict: The api's entry file must not default-export the app (PR #24)

**Problem:** every website page showed "404 Not Found", while `/api` calls
still worked. Bun automatically starts a web server for any entry file whose
default export has a `fetch` function, on port 3000. The api's `index.ts`
did exactly that, so it took the website's port.

**Decision:** the app now lives in `apps/api/src/app.ts` as a named export
(`{ app }`). `index.ts` only starts the server on port 4000. Tests and the
seed script import from `app.ts`.

### 19. Silent misconfiguration: Two login settings were silently not working (PR #26)

**Problem 1:** sign-in from the website was rejected in development.
Better Auth only accepts login requests coming from its own site; this
stops other sites from making requests while you're logged in (called CSRF
protection). It learns "its own site" from `BETTER_AUTH_URL`, which wasn't
set. So it guessed from the forwarded request (`localhost:4000`, the api),
while the browser said the request came from `localhost:3000` (the
website). Every login looked like an attack. Tests missed it because Better
Auth turns this check off during tests by default.

**Decision 1:** set `BETTER_AUTH_URL` to the address people type in their
browser (dev: `http://localhost:3000`), never the api's internal address.
The check is now on in tests too.

**Problem 2:** the limit on login attempts (5 per minute) wasn't applied.
The setting was named `specialRules`, which Better Auth doesn't have, so it
was skipped without any error.

**Decision 2:** use the real name, `customRules`. A test pins the setting.

**Lesson:** some libraries ignore a misspelled option without any error.
After changing a security setting, test the real behavior (send the
requests, watch for the block), not just whether the code compiles.

### 20. Time zone bug: "Today" means the user's day, not the server's (PR #60)

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

### 21. Unnecessary re-renders: A check-in redraws only its own card (PR #65)

**Problem:** this was a case of **unnecessary re-renders**. React redraws
("re-renders") a component whenever the component that contains it
redraws, even if nothing it shows has changed. Each redraw costs time, so
a small change that redraws the whole page makes the app feel slow.
Here, checking in one goal redrew every card on the page, and moving the
pointer across a card's heatmap redrew all 126 day squares for each square
it passed. Measured on the demo data in the dev build:
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

### 22. Time zone shift: Check-ins come back on the day they were saved (PRs #28, #53)

**Problem:** this was a **time zone shift**: a date saved in one time
zone was read back in another, so it moved to a different day. On a server
running in a US time zone, every check-in came back from the api one day
early. The card then still said "not done", so a
second tap deleted the check-in. The demo seed had the same kind of bug
(its check-ins landed on UTC days), and it crashed when run a second time
because the demo user already existed.

**Decision:** the api reads stored dates in UTC (`fromDayDate`, the
read-side twin of `toDayDate`). The seed uses local days and reuses the demo
user if it is already there.

**Why:** the database returns a plain date as midnight UTC. Turning that
into a day in local time shifts it back a day anywhere west of UTC.

### 23. Unit mismatch: Weekly goals are counted in weeks, everywhere (PRs #48, #54, #55)

**Problem:** several places treated weekly goals like daily ones. The
stats bar showed a 4-week streak as "4d". The weekly math had gaps: today
didn't count as a day you could still check in, an empty week didn't reset
the longest streak, and the streak stayed alive after this week's quota
became impossible. Future-dated and duplicate check-ins also counted, and
"Streak broken" showed on goals that never had a streak.

**Decision:**

- The stats bar shows the best streak per unit (`2d · 4w`).
- Weekly streaks follow the rules in decision 3, with tests for each gap.
- Streak math ignores future and duplicate check-ins.
- The completion rate follows the goal's schedule and is calculated on the
  server.
- "Streak broken" only shows for goals that once had a streak.

### 24. Input validation: The api rejects bad input and cleans what it keeps (PRs #52, #56)

**Problem:** the api accepted check-in dates that aren't real days, and
reorder lists of any size or shape. A goal deleted mid-request came back as
`200 null`. Schedules could store the same weekday twice, and a blank
description was stored as an empty string.

**Decision:**

- Invalid dates and reorder bodies get a 400. The reorder list has a size
  cap.
- A goal that vanished mid-request answers 404.
- Schedules store each weekday once, sorted, and a blank description is
  stored as empty (`null`).

### 25. Stale data and double submit: Check-ins and the goal form behave reliably (PRs #49, #57, #58)

**Problem:** two classic reliability bugs, plus a few smaller ones.

- **Stale data:** a check-in used the date the page saw when it loaded,
  not the real date. A page left open overnight checked in for yesterday.
- **Double submit:** each click sent its own request, so a double-click
  checked in and immediately un-checked.
- A failed check-in undid newer changes along with itself.
- The new-goal form started with the last edited goal's days and
  per-week count.
- Card buttons were announced to screen readers without saying which goal
  they act on.
- The delete dialog closed before the delete had finished.

**Decision:** a check-in uses the date at click time, and the page reloads
on a new day. A double-click no longer checks in and then un-checks. A failed
check-in undoes only itself. The form resets to defaults for a new goal
(Mon/Wed/Fri, 3 per week). Every card button names its goal, the delete
dialog stays open and shows "Deleting…" until it finishes, and goals can
be reordered with the keyboard.

### 26. Code quality: Lint fails on any warning (PR #59)

**Problem:** a block in the lint config switched off about 30 rules, so
problems went unnoticed.

**Decision:** the block is gone, and `bun run lint` fails on any warning
(`--max-warnings=0`). The few warnings it uncovered were fixed, and unused
code was deleted (see decision 12).

### 27. Race condition: One hook loads and changes goals (PR #62)

**Problem:** components called the api themselves, so no single place
knew the true state of the goal list. That caused real bugs:

- A failed reorder kept the unsaved order on screen.
- A **race condition**: two loads could be in flight at once, and if the
  older one finished last, its outdated data overwrote the newer data.
- The history sheet could show a goal that had been deleted.

**Decision:** `useGoals()` owns loading and every change (check-in,
reorder, save, delete). Components no longer call the api.

- A failed reorder puts the old order back.
- Only the newest load can update the list.
- The history sheet follows live data and closes if its goal is deleted.
- Every api response is checked against shared schemas
  (`GoalDTOSchema`), and a test keeps them in step with the types.

### 28. Redundant database queries: Reorder and check-ins on the server (PR #63)

**Problem:** a reorder where none of the ids belonged to the user answered
200 and changed nothing, so a wrong request looked like a success. Each
check-in also made **redundant database queries**: it loaded the same goal
three times, where one lookup was enough.

**Decision:** that reorder now answers 404 (a mixed list still reorders the
user's own goals). A check-in checks ownership once with an id-only lookup:
per tap, three full goal loads became one lookup plus one response load.

### 29. Visual design: One calm design where color shows state (PR #65)

**Problem:** the app had two visual styles (Calm and Playful) and a toggle
between them, which doubled the design work. Color was mostly decoration,
so it didn't tell you what was due, done or at risk. The sign-in pages had
no brand, and the dark theme's grays didn't match each other.

**Decision:**

- Calm is the only style, in light and dark. Playful, its toggle and the
  milestone badges are gone.
- Color means state. A due check-in has a goal-colored edge and label, done
  is a soft tint, a rest day is dashed, and a weekly goal at risk is amber
  with an icon.
- The dark theme's grays share one hue, and the goal colors sit on one
  matched band.
- The sign-in pages show the brand next to the form, and errors appear
  inline.
- Small moments of feedback: on check-in, the card's flame flickers and the
  streak number rolls up. Reduced-motion settings keep only feedback that
  doesn't move.
- The history sheet reads: now, the last 14 days with dates, then 6 months.

### 30. Responsive design: Phones and tablets (PR #65)

**Problem:** on phones the cards stacked into a long page, and the row of
goal pills sat at the top, out of thumb reach. The footer only repeated the
header. On tablets, cards couldn't be dragged to reorder. Reordering also
needed a way that works without dragging.

**Decision:**

- Phones show the cards as a sideways deck, one card at a time. The pills
  moved to a bar at the bottom of the screen, above the home indicator.
  Swiping the bar turns the deck, and swiping the deck turns the bar. Hold
  a pill and slide it to reorder.
- Everything fits on one screen, with no scrolling down to 320×568. Cards
  keep their full width; the summary at the top shrinks instead.
- The new-goal dialog and the history sheet fit phones, with full-width
  buttons.
- On tablets, hold a card for a moment, then drag it.
- Each card's menu has "Move earlier" and "Move later".
- The footer is removed on every screen size.

**Fixed along the way:**

- Dragging a pill moved the order too fast to control. The bar snapped to
  the next pill on every tiny scroll step, so a slow drag jumped many
  places. Snapping is now off while a pill is held.
- Swiping a card that started on its ⋯ button opened the menu, because the
  menu opened as soon as a finger touched it. On touch, it now opens on a
  tap.
- Each swipe redrew the whole page: **unnecessary re-renders** again (see
  decision 21). Now only the summary redraws.

**Why the bottom:** the thumb rests near the bottom of a phone. The bar
floats a little above the edge so it doesn't clash with the system's swipe
gestures.

### 31. Accessibility: Easier to see in light mode (PR #65)

**Problem:** in light mode, for some goal colors (lime, amber, teal, green,
sky), done days on the heatmap looked almost the same as missed days. The
"Mark done" and rest-day button outlines were faint, and small icon buttons
were hard to tap on phones.

**Decision:** done colors are darker in light mode, so a done day clearly
stands out (at least 3:1 contrast, the accessibility minimum). Button
outlines are darker. Small icon buttons respond to taps in a 44px area
around them, with no change in how they look.

### 32. Code organization: The website moves into `apps/web` (PR #67)

**Problem:** the website lived at the repo root, mixed in with the files
for the whole monorepo. Its packages were listed in the root
`package.json`, so the server quietly borrowed some of them (`better-auth`,
`zod`) without listing them itself. A server image built from its own
package list would be missing them.

**Decision:**

- The website is now a workspace package, `apps/web`, next to `apps/api`.
  Each one lists exactly the packages it uses. The root keeps only the
  shared tooling (TypeScript, ESLint, Prisma).
- Root commands still work: `bun run dev`, `npm run build`, `bun test`,
  `bun run lint`. Type checking is now `bun run typecheck`, which checks the
  website and the rest of the repo separately.
- Tailwind scans `packages/shared` explicitly. Goal colors are written there,
  and Tailwind only looks inside the website's own folder by default.

### 33. Silent misconfiguration: Production settings for the api (PR #68)

**Problem:** three settings would have quietly been wrong on a live server.

- `bun run start` for the api didn't set `NODE_ENV=production`. Libraries
  switch to their production behavior on it. Better Auth, for example,
  sends people back to the site instead of showing its built-in error
  page.
- The sign-in rate limit counts attempts per client IP address. Every
  request reaches the api through the website's proxy, and the proxy adds
  no IP of its own. Better Auth found no trustworthy IP, so **all users
  shared one bucket**: five failed sign-ins by anyone locked out everyone
  for a minute.
- The demo seed creates an account whose password is in this repo. Run
  against a production database, anyone could sign in to it.

**Decision:**

- The api's `start` script sets `NODE_ENV=production`.
- `CLIENT_IP_HEADER` names the header the hosting provider's edge sets
  with the visitor's real IP (`x-real-ip` on Railway, `fly-client-ip` on
  Fly). The edge overwrites it, so a visitor can't fake it. With it set,
  each IP gets its own limit.
- The seed script refuses to run with `NODE_ENV=production`.

### 34. Deployment: Docker images for the api and the website (PR #69)

**Problem:** to deploy, each app has to run somewhere other than this
laptop, with the same versions every time.

**Decision:**

- Each app has a Dockerfile (`apps/api/Dockerfile`, `apps/web/Dockerfile`).
  Both are built from the repo root, because they need the shared package
  and the one lockfile.
- The api image applies any new database migrations when it starts, then
  serves.
- The website image runs Next.js's standalone server, which ships only the
  files the server needs.
- `docker compose --profile app up -d --build` runs both images locally
  against the dev database, on http://localhost:3100. Plain
  `docker compose up -d` still starts only Postgres. The local run uses
  plain http, so its session cookie has no `Secure` flag (https only).
  Better Auth adds the flag when `BETTER_AUTH_URL` starts with `https://`,
  as it will on the live site.

**Gotcha:** the website's `API_PROXY_URL` is read at **build** time. Next
writes the proxy target into the build output, so changing it means
rebuilding the image. Setting it only when the container starts does nothing.

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
   How the website loads and changes goals now lives in one `useGoals()`
   hook. **DONE** (PR #62).
   The UI overhaul for phone, tablet and desktop. **DONE** (PR #65).
   Getting ready for a first deploy: the website moves into `apps/web`
   (PR #67), production settings (PR #68), Docker images (PR #69).
   **IN PROGRESS:** next is picking a host and deploying.
4. Payments with Stripe (after launch).
5. Installable app that works offline (PWA). Changes made offline are stored
   in the browser and sent when back online. This is when the browser starts
   creating ids itself (uuid v7). Check-ins merge safely, since there's one
   per day; for text edits, the last save wins. A mobile app (Expo) would
   reuse this later.
