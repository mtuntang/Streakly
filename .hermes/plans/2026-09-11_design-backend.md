# Streakly Backend Design — apps/api

## Stack
Hono (Bun) + Prisma + zod. Shared: @streakly/shared.

## Endpoints
- GET /api/goals → {goals: GoalDTO[]}
- POST /api/goals/checkin → body {goalId, done} → {goal: GoalDTO}

## Data flow
1. Request → 2. zod.validate (shared schema) → 3. Prisma query → 4. computeStreaks (shared) → 5. GoalDTO → HTTP response. Web consumes only; never touches DB.

## Boundaries
- apps/web: deletes src/lib/db.ts + /api handlers; fetches HTTP only.
- apps/api: owns DB exclusively; no Prisma import in web.
- packages/shared: pure (date-fns + zod only); safe for both sides.

## Future data flow (Postgres + Better Auth)
1. Request + session cookie / JWT (Better Auth) → 2. auth middleware resolves userId
3. Prisma query scoped by userId (`where: {userId}`) → 4. computeStreaks →
5. GoalDTO → 6. HTTP response (only goals owned by userId). Web stays
consumer-only; DB remains in apps/api exclusively.
