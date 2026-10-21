---
version: 1
slug: "src-components-streaks-streaks-app-tsx"
primary_target: "src/components/streaks/streaks-app.tsx"
related_targets: ["src/app/sign-in/page.tsx","src/app/sign-up/page.tsx"]
---

# Surface brief: Streakly app shell (goal grid, sign-in)

Scope: the signed-in goal grid (streaks-app, goal cards, summary, detail sheet, goal form) and the auth pages. Mode: Operate.
Audience/job: anyone logging habits; open, check in on a card, leave. Frequency: daily, phone and desktop, all lighting.
Constraints: same functions (cards, drag reorder, heatmap, summary, sheet); on phones the header, summary, whole front card and dock fit with no vertical scroll, and card width never shrinks (the summary gives way first); flame logo stays a flame; 8 goal colors keep their names; WCAG 2.2 AA; no invented numbers (no XP/levels).
User-pinned: Calm only, in light and dark (Playful, its style toggle and milestone badges were removed at the user's request). Color marks action and state: a due check-in button carries the goal color as an edge and label, a done one is a quiet tint of it, a rest day is dashed neutral, an at-risk quota is amber (`--risk`) with an icon. The checked state in light mode must stay easy on the eyes (no solid 700 fills on large controls), yet done marks stay ≥3:1 against empty ones (`--goal-*` band in both themes).

## Direction contract

THESIS: A calm habit app whose color always means something: what is due, what is done, what is at risk. Refuses the grey shadcn dashboard with one accent.

OWN-WORLD: oat-tinted ground (dusk navy at night), white cards with soft deep shadows, no hard borders, large radii, Figtree throughout, peach flame.

STORY: The user sees what is due today, taps once, gets an immediate and proportionate reward, and trusts the count.

FIRST VIEWPORT: Header (flame mark left; refresh, theme, sign-out, New goal right). Summary: greeting, big "X of Y done today", today ribbon, secondary stats row, "Still to do" as goal-colored chips that jump to their card. Then the card grid; each card's full-width check-in button is the primary action, above its heatmap. No footer. Phones (<640px): the summary sits on top, then a sideways card deck with one card at a time, and the ribbon becomes a wheel docked at the bottom above the safe area.

FORM: Pinned by the user, not rolled. Signature move: the today ribbon, one soft pill per goal in that goal's own color, filling as it is checked. On phones it is a scroll wheel linked to the deck: swipe either one and the other follows; tap a pill to bring its card forward; hold a pill to lift it and slide to reorder (geared, no snap while held, eased settle). Tablets pick a card up after a 200ms hold, with a dip and a buzz. Check-in reward = soft ripple + self-drawing check + the streak number rolling up + today's heatmap cell landing; clearing the day brightens the ribbon pill by pill, once. Refresh turns in whole eased revolutions and settles into a check. Detail sheet reads now → last 14 days (done / not done / rest) → 6-month heatmap. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
