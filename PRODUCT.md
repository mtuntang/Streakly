# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Streakly is meant to be used on both phones and computers. On a phone, users install it from the browser to their home screen and open it like an app. Desktop users can use it in a browser tab or install it the same way. One responsive web app serves both, as an installable PWA. Installing and offline use are planned and not yet built. A native app (Expo) may come later and would reuse the same API.

## Users

Anyone who wants to log their habits and become more consistent, whether they are building a new habit or keeping up one they already have.

Each person has their own account: one account per person, one email and password login. There are no teams, shared goals, or organizations.

## Product Purpose

Streakly makes logging habits as simple as possible. Each habit is a goal card. Users check in from the card, put the cards in whatever order suits them, and see their streak history as a GitHub-style heatmap on each card. The app keeps an honest count of each unbroken chain.

Success means logging takes almost no effort, so users come back every day: open the app, check in, get on with their day, and trust the streak they see.

## Positioning

Streaks that follow how a habit is actually scheduled:

- Three cadences: every day, specific days of the week (for example Mon/Wed/Fri), or a weekly quota (for example 2 or 4 times a week, on any days). Each streak is counted in the unit the user chose, so quota goals count weeks, never days.
- Rest days neither break nor grow a streak. A user can still check in on a rest day; it counts toward their history, not their chain.
- "Today" is the user's own day, computed in their time zone, not the server's.
- A broken streak is called broken. It is not presented as a fresh start.

## Operating Context

- The daily loop: open the app, check in, leave. It usually takes a few seconds, on a phone (from the home screen) or on a computer.
- A tab left open past midnight rolls over to the new day on its own.
- Users who travel, or live far from the server, still get the correct "today".
- Detail views (the full heatmap and the last 14 days) are for looking back, not part of the daily check-in.

## Capabilities and Constraints

Shipped:

- Goals with a name, an optional description, one of 8 colors, an icon, and a cadence.
- A check-in toggle for today, including voluntary check-ins on rest days.
- Streak stats: current streak, best streak, total check-ins, and a completion rate. Weekly goals also show quota progress and an at-risk warning.
- A heatmap of each goal's history, and a detail view.
- Goals can be reordered by dragging their cards, with a mouse or by touch.
- Email and password accounts with a 10-character minimum password, sign-in rate limits, and the user's time zone saved.
- Password reset by email (a one-time link that expires in 1 hour) and password change from the account page. Both sign out the user's other devices.

Not built yet. UI and copy must not suggest these exist:

- Reminders, notifications, social features, and sharing.
- OAuth or social login. This was decided against: each account uses one login method.
- Offline use. It is planned with the PWA.
- Payments. Stripe is planned for after launch. Pricing and plans are not decided.

Terminology: goal, check-in, streak, cadence ("Every day" / "Specific days" / "X per week"), rest day, quota, best/record. A check-in is either done or not done; there are no intensity levels.

## Brand Commitments

- The name is Streakly. The logo is the flame tile (`public/logo.svg`, `public/favicon.svg`).
- Goal cards are the main interface, and the user can rearrange them.
- Each goal's history is shown as a GitHub-style contribution heatmap: a grid of days, one week per column, with each day filled in or empty.
- Taglines in use: "Stay consistent, one day at a time" and "Don't break the chain".
- Voice: plain, honest, and encouraging, never hype.
  - Never show a number in a unit the user didn't choose.
  - Rest-day and broken-streak messages always say what actually happened.
  - UI text avoids designer jargon.

## Evidence on Hand

- Demo data for development only (`prisma/seed.ts`): 4 goals and about 109 check-ins.
- There are no real users, testimonials, usage numbers, press coverage, or pricing yet. Do not make any of these up.

## Product Principles

1. Remove friction first. Logging a habit should be obvious without instructions and take as few taps as possible. Every screen, step, and setting has to justify the effort it adds. When in doubt, take something away.
2. The numbers are honest. Streak math is calculated in one place, on the server, and the UI shows only states that calculation produced.
3. The daily check-in is the product. Checking in from the card is a single tap with an instant response; everything else comes second.
4. Respect the user's calendar: their time zone, their rest days, and the cadence they chose.
5. Consistency matters more than intensity. A check-in is done or not done.
6. Ship in small steps that work on their own, and don't build features before they are needed.

## Accessibility & Inclusion

The standard is WCAG 2.2 Level AA, the current W3C recommendation. It includes all of 2.1 AA, which is the level most accessibility laws point to. In practice:

- Text contrast is at least 4.5:1 (3:1 for large text). Icons, controls, and focus indicators are at least 3:1.
- Every action works with a keyboard except reordering goals, and keyboard focus is always visible. Reordering is drag-only by choice. That one action falls short of WCAG 2.1.1 (keyboard) and 2.5.7 (an alternative to dragging).
- Controls have names screen readers can announce. The heatmap has a text summary, and changes in state are announced.
- Animation is reduced or removed when the user has asked their system for reduced motion.
- Touch targets are at least 24×24 CSS px (the WCAG 2.2 AA minimum), and primary actions on mobile aim for 44px.
