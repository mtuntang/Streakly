# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

An installable offline app (PWA) is planned, with a native app (Expo) later. Both will reuse the same API.

## Users

Anyone who wants to log their habits and become more consistent, whether they are building a new habit or keeping up one they already have.

Each person has their own account: one account per person, one email and password login. There are no teams, shared goals, or organizations.

## Product Purpose

Streakly turns habits into streaks. You create a goal, check in on the days it is due, and the app keeps an honest count of your unbroken chain and your history. Success means the user comes back tomorrow: checking in is fast, and they can trust the streak they see.

## Positioning

Streaks that follow how a habit is actually scheduled:

- Three cadences: every day, specific weekdays, or X times per week. Each streak is counted in the unit the user chose, so weekly goals count weeks, never days.
- Rest days neither break nor grow a streak. A user can still check in on a rest day; it counts toward their history, not their chain.
- "Today" is the user's own day, computed in their time zone, not the server's.
- A broken streak is called broken. It is not presented as a fresh start.

## Operating Context

- The daily loop: open the app, check in, leave. It usually takes seconds and often happens on a phone.
- A tab left open past midnight rolls over to the new day on its own.
- Users who travel, or live far from the server, still get the correct "today".
- Detail views (the full heatmap and the last 14 days) are for looking back, not part of the daily check-in.

## Capabilities and Constraints

Shipped:

- Goals with a name, an optional description, one of 8 colors, an icon, and a cadence.
- A check-in toggle for today, including voluntary check-ins on rest days.
- Streak stats: current streak, best streak, total check-ins, and a completion rate. Weekly goals also show quota progress and an at-risk warning.
- A heatmap of each goal's history, and a detail view.
- Goals can be reordered by dragging or with the keyboard.
- Email and password accounts with a 10-character minimum password, sign-in rate limits, and the user's time zone saved.

Not built yet. UI and copy must not suggest these exist:

- Password reset. It is planned and needs an email provider.
- Reminders, notifications, social features, and sharing.
- OAuth or social login. This was decided against: each account uses one login method.
- Offline use. It is planned with the PWA.
- Payments. Stripe is planned for after launch. Pricing and plans are not decided.

Terminology: goal, check-in, streak, cadence ("Every day" / "Specific days" / "X per week"), rest day, quota, best/record. A check-in is either done or not done; there are no intensity levels.

## Brand Commitments

- The name is Streakly. The logo is the flame tile (`public/logo.svg`, `public/favicon.svg`).
- Taglines in use: "Stay consistent, one day at a time" and "Don't break the chain".
- Voice: plain, honest, and encouraging, never hype.
  - Never show a number in a unit the user didn't choose.
  - Rest-day and broken-streak messages always say what actually happened.
  - UI text avoids designer jargon.

## Evidence on Hand

- Demo data for development only (`prisma/seed.ts`): 4 goals and about 109 check-ins.
- There are no real users, testimonials, usage numbers, press coverage, or pricing yet. Do not make any of these up.

## Product Principles

1. The numbers are honest. Streak math is calculated in one place, on the server, and the UI shows only states that calculation produced.
2. The daily check-in is the product. It must stay a single, instant tap; everything else comes second.
3. Respect the user's calendar: their time zone, their rest days, and the cadence they chose.
4. Consistency matters more than intensity. A check-in is done or not done.
5. Ship in small steps that work on their own, and don't build features before they are needed.

## Accessibility & Inclusion

The standard is WCAG 2.2 Level AA, the current W3C recommendation. It includes all of 2.1 AA, which is the level most accessibility laws point to. In practice:

- Text contrast is at least 4.5:1 (3:1 for large text). Icons, controls, and focus indicators are at least 3:1.
- Every action works with a keyboard, including reordering goals, and keyboard focus is always visible.
- Controls have names screen readers can announce. The heatmap has a text summary, and changes in state are announced.
- Animation is reduced or removed when the user has asked their system for reduced motion.
- Touch targets are at least 24×24 CSS px (the WCAG 2.2 AA minimum), and primary actions on mobile aim for 44px.
