# Streakly — Dev Notes archive

Older decisions moved out of `DEV_NOTES.md` to keep it short. They still
apply; numbers match the originals.

---

### 7. Plain string types instead of TypeScript enums

**Problem:** we need types for fixed sets of values, like
`"normal" | "quota-at-risk"`. TypeScript offers two ways: string unions and
`enum`.

**Decision:** string unions everywhere. When the list of values is needed at
runtime, use an `as const` object.

**Why:** the compiler catches typos in both, so enums add no safety. Network
data arrives as plain strings either way; zod is what actually checks it.
Enums also add hidden runtime code, and `const enum` breaks with fast build
tools like bun.

### 8. You can check in on a rest day (PR #8)

**Problem:** on a day off its schedule (say, Saturday for a Mon–Fri goal),
the check-in button was disabled, so the app refused real effort.

**Decision:** allow it, but keep it honest:

- It counts toward your total and shows on the heatmap.
- It does NOT grow your streak, and it can't restart a broken one.
- The button is dashed and says "Checked in on a rest day", so you know it
  didn't count toward the streak.

### 9. The heatmap is simple: done or not done (PR #9)

**Problem:** the heatmap suggested more than the data holds. It had a
"Less → More" legend, but a day is only ever checked or not. It also dimmed
rest days, which looked like a rendering bug.

**Decision:**

- Two states only: checked or unchecked. The legend is gone.
- Every unchecked day is the same gray. The goal's schedule badge already
  says which days are rest days.
- Weekly goals show one dot per required check-in instead of 7 day-dots,
  because a weekly goal is about the count, not the days.

### 10. Names say what things do

**Problem:** `streakCopy` built the card's whole status line, not just
streak text. And "copy" is design jargon that also sounds like "duplicate".

**Decision:** renamed it `cardStatusMessage()`. Names describe what the code
returns or does, not jargon.

### 11. Text never misleads

**Problem:** a goal that lost its streak and a brand-new goal both have zero
current days. Showing "No active streak yet" for both is wrong for the
first one.

**Decision:** a lost streak says "Streak broken — start again today". Same
numbers, different meaning, different text.

### 12. Delete what you don't use (PR #10)

**Problem:** unused files pile up: 34 unused UI components, 38 unused
packages, stray copies of shared files, and old template folders.

**Decision:** delete them. UI components come back with one command
(`npx shadcn add <name>`), so there's no reason to keep unused ones.

### 18. The api's entry file must not default-export the app (PR #24)

**Problem:** every website page showed "404 Not Found", while `/api` calls
still worked. Bun automatically starts a web server for any entry file whose
default export has a `fetch` function, on port 3000. The api's `index.ts`
did exactly that, so it took the website's port.

**Decision:** the app now lives in `apps/api/src/app.ts` as a named export
(`{ app }`). `index.ts` only starts the server on port 4000. Tests and the
seed script import from `app.ts`.

### 19. Two login settings were silently not working (PR #26)

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
