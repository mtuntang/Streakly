# Streakly — Dev Notes

This file explains the big decisions behind Streakly in plain words: what we
chose and why. You should be able to read any section without having
followed the project.

- Every decision has the same shape: **Problem** (what was wrong or
  needed), **Decision** (what we did), and **Why** (when it isn't obvious).
- Newest decisions are at the bottom of "Decisions". Numbers never change,
  because commits and PRs refer to them.
- Each heading ends with the PR where it happened, so you can look up the code.

**Contents**

- [The app in one paragraph](#the-app-in-one-paragraph)
- [Worst bugs we've hit](#worst-bugs-weve-hit): start here to learn what
  bites in this codebase.
- [Decisions](#decisions), by theme:
  - Streak rules and data: 1, 3, 4, 8, 15, 16, 20, 22, 23
  - Code and workflow: 2, 5, 7, 10, 12, 13, 14, 26, 32, 47
  - Website behavior: 6, 9, 11, 21, 25, 27, 29, 30, 31, 38, 39, 40, 49
  - Login and security: 17, 19, 33, 35, 36, 41, 43, 44, 45, 48, 50
  - Server reliability and deploys: 18, 24, 28, 34, 37, 42, 46
- [How data is stored](#how-data-is-stored)
- [Roadmap](#roadmap)

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

## Worst bugs we've hit

The bugs that did, or could have done, the most damage, worst first. Each
one points to the decision with the fix. Read these first: they show what
tends to go wrong here.

1. **The tests wrote into the real dev database** (decision 47). The api
   tests share one database connection, and it connected to whichever
   database was configured when the app was first loaded. When a test file
   that doesn't use the database ran first, the next file's tests used the
   database in `.env`: on a laptop, that's the dev database, so test
   accounts and goals landed in real data. It hid because files ran in
   alphabetical order on Windows, which happened to be safe. On Linux CI
   the order differed, and only CI's empty database made it fail.
2. **A check-in could undo itself** (decision 49). Each tap said "flip it".
   If the server saved a check-in but the reply was lost on a weak
   connection, the screen rolled back to "not done", and the next tap
   deleted the real check-in. An earlier bug did the same through dates
   (decision 22): check-ins came back a day early, so the card said "not
   done" and a second tap deleted them.
3. **One old check-in could freeze the server for everyone** (decision 42).
   The longest-streak math walked every calendar day between the first and
   last check-in. A check-in dated in year 1 cost about 1.2 seconds of
   server time on every read of that goal, and the server handles one
   thing at a time, so every user waited.
4. **Sign-in rate limits could be dodged, or locked everyone out**
   (decisions 33, 41). With no trusted IP, all users shared one bucket:
   five wrong passwords from anyone blocked everyone for a minute. A later
   bug did the opposite: the server trusted an IP header that any client
   can set, so an attacker got a fresh limit on every request.
5. **Two login settings silently did nothing** (decision 19). With no
   public address set, Better Auth treated every sign-in from the website
   as a cross-site attack and rejected it. And a misspelled option name
   (`specialRules` instead of `customRules`) was ignored without an error,
   so the 5-attempt sign-in limit never applied.
6. **Every request to one goal ran its checks twice** (decision 48). The
   sign-in check and the rate limiter were attached to both an outer and
   an inner router, so each check-in read the session twice and the write
   limit was half what it said.
7. **Sign-up tells anyone whether an email has an account** (decision 35).
   A taken email gets "User already exists". Accepted for now and listed
   under "Known limits" in `DEPLOY.md`; hiding it needs email
   verification.

**Traps in how we merge** (decision 13):

- **A check nobody runs can be broken for weeks.** Typecheck failed on
  `main` (the seed script couldn't find the shared package) until CI first
  ran it.
- **Deleting a branch can close a PR for good.** When a merged PR's branch
  is deleted, a PR built on top of that branch is closed, not moved, and
  can't be reopened.
- **A rebase with no conflicts can still break the tests.** One PR renamed
  a test helper that another PR's new test used. Git saw no conflict; only
  running the tests did.

**The pattern:** the worst bugs passed on the machine they were written on
and failed somewhere else: another test order, a weak network, a merge.
Find them by recreating those conditions on purpose.

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
commit. Before any PR, all of these must pass (CI runs the same four as
separate jobs):

- `bun run typecheck`
- `bun run lint`
- `bun test packages apps/web`
- `cd apps/api && bun run test` (needs Docker with the `streakly-db-1`
  database running)

When dependencies or build config change, also run `bun run build`.

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
- **PRs built on another PR's branch:** before merging the first PR, point
  the second one at `main` (`gh pr edit <n> --base main`). Deleting the
  first PR's branch otherwise closes the second PR, and it can't be
  reopened.
- **Run the tests after every rebase,** even one with no conflicts. Two PRs
  can change different lines and still break each other.

### 14. Environment quirks: Windows quirks (so they don't bite twice)

**Problem:** some tools behave differently on this Windows machine and
waste time when forgotten.

**Decision:**

- `bun run build` works in git-bash and cmd.exe alike (PR #80). It used to
  fail on Windows because the build copied files with `cp -r`.
- A stuck dev server can keep its port while serving nothing. Stop it by
  port, not by name: find the process id with `netstat`, then
  `MSYS_NO_PATHCONV=1 taskkill /PID <id> /T /F`.
- Check that a server is up with `curl`, not by reading its log file.
- To run the production build locally: `bun run build`, then
  `bun run start`, which runs `apps/web/.next/standalone/apps/web/server.js`.
- Docker Desktop has to be running before the api tests: they reach the
  database with `docker exec`. Without it, they fail with a misleading
  handful of errors that have nothing to do with the code.

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
- Root commands still work: `bun run dev`, `bun run build`, `bun test`,
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
  each IP gets its own limit. The api refuses to boot in production
  without it; `none` (used by the local compose app profile) means no
  edge proxy and one shared bucket. Unset or `none`, `X-Forwarded-For`
  is never read, because any client can set it.
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

### 35. Authentication: Forgot and change password (PR #70)

**Problem:** someone who forgot their password had no way back into their
account, and nobody could change a password they knew.

**Decision:**

- **Forgot password** emails a link that works once and expires in 1 hour.
  The link opens the website's reset page, where the person picks a new
  password. Resetting signs out every device.
- **Change password** asks for the current password. It keeps this device
  signed in and signs out all the others.
- **Emails go through Resend** (`RESEND_API_KEY`, `EMAIL_FROM`). The server
  refuses to start in production without them, so a reset email can't
  silently fail to send. In development, the email is printed to the api
  log instead, so you can open the link locally.
- A reset request gets the **same answer whether or not the email has an
  account**, and the email is sent in the background so the answer is
  just as fast either way. This only keeps the reset form from revealing
  who has an account: sign-up still does, by refusing a taken email (see
  "Known limits" in `DEPLOY.md`).
- Tighter rate limits: 3 reset requests and 5 password changes per minute.

**Gotcha:** a second reset request for the same person used to fail. The
database required every stored token value to be unique, and a reset
token stores the user's id as its value. That rule is gone.

### 36. Authentication: Password screens on the website (PR #71)

**Problem:** the server could reset and change passwords (decision 35), but
the website had no screens for it.

**Decision:**

- **Sign-in** has a "Forgot password?" link on the password row.
- **Forgot password** asks for an email, then says where the link went
  "if an account uses" that address, without confirming that one exists.
  It offers to send another link.
- **The reset page** asks for one new password, with a show/hide button
  instead of a second "confirm" box. A used or expired link shows "This
  link has expired" with a button to get a new one. After saving, the
  sign-in page confirms the change.
- **The header's sign-out button became an account menu**: who is signed
  in, "Change password" and "Sign out". The header keeps the same number
  of buttons on a phone.
- **The account page** shows who is signed in and has the change-password
  form. It warns that other devices will be signed out, and tells people
  who forgot their current password how to reset it instead.

### 37. Deployment: The api shuts down cleanly, reports its health and logs every request (PR #83)

**Problem:** three gaps made a deployed api hard to run and to debug.

- **No graceful shutdown.** To deploy a new version, the host sends the old
  process a stop signal (SIGTERM). The api ignored it and was killed
  mid-request, so people saw errors for requests that may already have
  been saved.
- **No health check.** The host only knew whether the process was running,
  so an api that was stuck kept getting traffic.
- **No request log.** The api logged only crashes, so a report like "it
  failed sometime yesterday" couldn't be traced to any request.

**Decision:**

- On SIGTERM the api stops taking new requests, lets open ones finish,
  closes the database connection and exits. It gives up after 10 seconds,
  so a deploy never hangs.
- Both Docker images have a health check. The api's calls `/api/health`.
  The website's only checks that the site answers: if it depended on the
  api, an api outage would make the host restart the website over and
  over, which can't fix anything.
- One log line per request: method, path, status, time taken and a
  **request id**. The id also goes back in the `x-request-id` header, and
  a 500 error includes it, so a user's screenshot leads to exactly one log
  line. Query strings, bodies and headers are never logged, because a
  password-reset link carries its token in the query string.
- An unknown address answers `{ "error": "Not found." }`, the same shape as
  every other error.

**Gotcha:** fixing this PR's CI failure uncovered the worst test bug so
far: the api tests could write into the dev database. See decision 47.

### 38. Installable app: Add Streakly to the Home Screen (PR #72)

**Problem:** on a phone, Streakly was a browser tab. A habit tracker gets
opened every day, so it should launch like an app, and most people don't
know how to add a website to their Home Screen.

**Decision:**

- The site has a web app manifest (a file that tells phones the app's name,
  icons and colors), so it opens full screen from the Home Screen.
- On Android, Chrome's own one-tap install prompt is used. Everywhere else,
  an in-app guide shows the steps with an animated phone. It knows iPhone
  Safari, other iPhone browsers, iPads that report themselves as Macs, and
  Android apart.
- A small tip and an account menu item ("Add to Home Screen") offer it
  until the app is installed. Dismissing the tip hides it for the visit.

### 39. Onboarding: Try the demo without an account (PR #73)

**Problem:** a visitor had to sign up before seeing anything.

**Decision:** the sign-in page has a "Try the demo" button. It opens the
real app on 13 sample goals that live only in the browser's memory, so
check-ins, reordering and editing all work, nothing is saved, and a reload
starts over. The demo and the server's seed script use the same sample data
(`packages/shared/src/demo.ts`), and the app talks to a `GoalsClient`, so
the demo plugs in an in-memory client instead of the api one.

### 40. Interaction design: Reordering moves the card and its pill together (PR #74)

**Problem:** reordering a card didn't move its pill in the bottom bar along
with it (or the other way round), and the movement jumped.

**Decision:** on phones, holding a pill zooms the deck out so the cards
around it are visible, and they slide as the pill passes them. On tablets
and desktop, dragging a card slides its pill into place. Every slide starts
from where the item is on screen right now, so quick moves blend into one
motion. Reduced-motion settings keep the result without the animation.

### 41. Rate limiting: Limits that can't be dodged, on every route (PRs #75, #84)

**Problem:** two gaps.

- With no trusted IP header configured, the server read `X-Forwarded-For`,
  a header any client can set. Sending a new value with each request gave
  a fresh sign-in limit every time.
- Only the login endpoints had limits. A signed-in account could read or
  write goals in a tight loop, and every read recalculates every streak.

**Decision:**

- The server never reads `X-Forwarded-For`. It trusts only the header named
  in `CLIENT_IP_HEADER`, which the host's edge sets, and refuses to start in
  production without it (decision 33).
- Two unused login endpoints were switched off. One of them
  (`verify-password`) checked passwords without the strict sign-in limit.
- Goal routes are limited per user: 120 reads and 60 writes a minute, in
  separate buckets so a burst of writes never blocks reading. Change them
  with `GOALS_READS_PER_MINUTE` and `GOALS_WRITES_PER_MINUTE`.

**Limit:** the counts live in the api's memory. That's fine for one api
instance; more than one needs shared storage such as Redis (see
`DEPLOY.md`).

### 42. Unbounded work: One old check-in could freeze the server (PR #76)

**Problem:** this was **unbounded work**: the cost of a request depended on
data a user controls, with no upper limit. The longest-streak math walked
every calendar day between a goal's first and last check-in. A check-in
dated `0001-01-01` meant about 740,000 steps, roughly 1.2 seconds, on every
read of that goal. The api handles one request at a time per process, so
everyone waited.

**Decision:**

- The math walks the check-ins instead of the calendar: one step per
  check-in. A gap of 7 or more days always contains a scheduled day (every
  schedule repeats weekly), so each gap costs at most 7 steps.
- Check-in dates must fall between 2000-01-01 and 2099-12-31.
- A test compares the new math with the old calendar walk on 300 random
  histories and gets the same answers.

### 43. Input validation: Limits on everything a client sends (PR #77)

**Problem:** the api accepted request bodies up to 128 MiB, any number of
goals, check-ins years in the future, and an account name of any length (a
2,000,000-character name was stored and then sent back on every page load).
Goal writes also accepted form and plain-text bodies, which other websites
can send with a user's cookie without asking first.

**Decision:**

- Only `application/json` bodies are read (415 otherwise). Another site
  can't send JSON to the api without the browser asking permission first,
  and the api never grants it.
- Bodies over 64 KiB are refused (413) before any route runs.
- At most 100 goals per user.
- A check-in can be dated at most 2 days after the user's today. That covers
  a stored time zone that trails the device after travel.
- Account names are capped at 80 characters and image URLs at 2048.

### 44. Dependency security: No critical advisories (PR #78)

**Problem:** `bun audit` reported 4 critical advisories, including two in
Next.js: one that lets requests skip middleware, and one that can crash the
server.

**Decision:** upgraded `next` to 16.4, `zod` to 4.6 and `hono` to 4.13. The
remaining advisories are in build and lint tools only, which never ship to
users. `eslint-config-next` stays on 16.1 for now: its newer rules flag
real issues in components, and fixing those deserves its own PR.

### 45. Security headers: The website tells browsers to lock it down (PR #79)

**Problem:** the website sent no security headers. Any site could load the
account page inside a hidden frame and trick a click (clickjacking).

**Decision:** every response carries a strict Content-Security-Policy (the
page may load scripts, styles, images and fonts only from Streakly itself),
`X-Frame-Options: DENY`, `nosniff`, a referrer policy, and HSTS (always use
https). Scripts and styles still allow inline code, because Next.js writes
some inline; moving to nonces is a separate change. The local Postgres port
is now only reachable from this machine, because its dev password is in
the repo.

### 46. Deployment: A handover checklist, and CI on every PR (PRs #80, #81)

**Problem:** "pick a host and deploy" had no checklist, nothing listed the
environment variables, and no check ran automatically on a PR.

**Decision:**

- `DEPLOY.md` is the checklist: what the host must provide, every
  environment variable, first-boot checks, a sign-in round trip, known
  limits and rollback.
- `.env.example` documents every variable with a dev value, and a test fails
  when the boot guard requires a variable the template doesn't list.
- GitHub Actions runs four jobs on every PR: typecheck, lint, unit tests,
  and the api tests against Postgres.
- `db:push` is gone: it changes the database without a migration, so the
  change never reaches a deploy. Schema changes go through `db:migrate`.

### 47. Test isolation: Tests can never reach the dev database (PRs #83, #88)

**Problem:** this is worst bug 1. Bun runs all test files in one process
and shares loaded code between them, including the api's database
connection. That connection uses the database that was configured when the
app was first loaded. Each database test file sets its own test database
first, but one test file loads the app without setting any. When it ran
first, the next file's tests used the database in `.env`. On CI that
database was empty, and 22 tests failed. On a laptop it is the dev
database, so the tests passed while writing test accounts into it. The
file order hid it: Windows runs the files alphabetically, which happened
to be safe.

**Decision:** every test command runs with `--isolate`, which gives each
test file a fresh copy of the app's code. That covers CI, `bun run test`
at the root and `bun run test` in `apps/api`.

**Lesson:** a test suite that can reach real data has to be unable to by
design, not safe by luck of file order.

### 48. Double counting: Each request checks sign-in and the rate limit once (PR #86)

**Problem:** the goal routes are two routers, one for the whole list and
one for a single goal, with the second mounted inside the first. Both had
the sign-in check and the rate limiter attached. Middleware attached to the
outer router (code that runs before every route) already covers the inner
one, so every single-goal request ran both twice: two session lookups in
the database, and two counts against the limit. The 60-writes-a-minute
limit was really 30 check-ins.

**Decision:** the middleware sits on the outer router only. Tests check
that a check-in counts once and that a single-goal request without a
session still gets 401.

### 49. Retry safety: A check-in can be sent twice without undoing it (PR #87)

**Problem:** `POST /goals/:id/checkins` toggled: it added the check-in if
missing and deleted it if present. A request that runs twice therefore
undid itself. That happens when the server saves a check-in but the reply
is lost: the screen rolls back to "not done", and the next tap deletes the
real check-in.

**Decision:** each request says what the user wants. `POST` only checks in,
and an existing check-in counts as success. `DELETE` removes it. The button
still toggles; the website sends `checked` or `unchecked`
(`GoalsClient.setChecked`). A test sends two check-ins at once and expects
exactly one.

**Why it matters later:** the planned offline mode (roadmap item 5) will
resend changes after the connection comes back, and that is only safe if
sending twice is the same as sending once.

### 50. Log spoofing: Visitors can't choose the request id (PR #92)

**Problem:** the api reuses an incoming `x-request-id` header, so a hosting
proxy's trace id carries through to the logs (decision 37). But the website
forwards browser headers unchanged, so any visitor could set it: reuse
another request's id to confuse an investigation, or fill every log line
with kilobytes of text.

**Decision:** a supplied id is reused only if it's 1–128 letters, digits,
`_`, `.` or `-`, which covers normal trace ids. Anything else gets a fresh
random id.

---

## How data is stored

Postgres 16, started with `docker compose up -d` (port 5432). Demo data:
`bun run db:seed`.

- **Login tables** (owned by Better Auth): `user`, `session`, `account` (the
  password lives here, not on the user), `verification`.
- **App tables:** `goals` belong to a user (deleting the user deletes their
  goals). `check_ins` belong to a goal and have no `userId` of their own:
  ownership goes user → goal → check-in. One check-in per goal per day (a
  unique rule). Checking in twice for the same day changes nothing
  (decision 49).
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
   (PR #67), production settings (PR #68), Docker images (PR #69),
   clean shutdown, health checks and request logs (PR #83), and a
   security and reliability pass: rate limits, input limits, security
   headers, dependency upgrades and retry-safe check-ins (PRs #75–#92).
   The deploy checklist (`DEPLOY.md`), `.env.example` and CI exist
   (PRs #80, #81).
   Forgot and change password (PR #70 server, PR #71 website).
   **IN PROGRESS:** next is picking a host and deploying, following
   `DEPLOY.md`.
4. Payments with Stripe (after launch).
5. Installable app that works offline (PWA). Installing to the Home Screen
   is **DONE** (PR #72), and so is a demo that runs without an account
   (PR #73). Still to build: changes made offline are stored in the
   browser and sent when back online. This is when the browser starts
   creating ids itself (uuid v7). Check-ins merge safely, since there's one
   per day and sending one twice changes nothing; for text edits, the last
   save wins. A mobile app (Expo) would reuse this later.
