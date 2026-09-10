# Monorepo Extraction — Step 1: create `packages/shared` and move pure logic

## Goal

Turn the single Next.js app into a bun-workspaces monorepo and relocate the two pure-logic modules (`streaks.ts`, `goal-config.ts`) into `packages/shared` with zero behavior change.

> NOTE: the branch creation the user asked for is a 1-command task — it is Task 0 below and must run FIRST so all work lands on the new branch.

## Current context / assumptions

- Repo: `mtuntang/Streakly`, branch `main`, clean tree at c1f3271. Single Next.js 16 app at repo root (no `apps/` or `packages/` yet).
- Package manager is **bun** (`bun-types` in devDeps, `bun run` gates used in repo convention).
- `tsconfig.json` uses `moduleResolution: "bundler"`, path alias `@/* → ./src/*`.
- Files to move are PURE: `src/lib/streaks.ts` imports only `date-fns`; `src/lib/goal-config.ts` imports **nothing** (contains `GOAL_COLORS`, `GOAL_ICONS`, `getColor`, `GoalDTO` type).
- `src/lib/goal-config.ts` currently also exports zod-ish validation helpers? — no: routes define schemas locally in `src/app/api/goals/route.ts` using `GOAL_COLORS` keys. That stays put this step.
- Consumers today: components under `src/components/streaks/**` and API routes import via `@/lib/streaks` / `@/lib/goal-config`.
- Verification commands: `bun run lint` and `bun run build` (repo convention), plus `bunx tsc --noEmit`.
- Assumption: Phase 1 (schedule feature) plan exists at `.hermes/plans/2026-09-09_220253-schedule-based-checkins.md` but is NOT yet implemented; this extraction is independent of it and safe to do first. If schedule work lands first, its new `schedule.ts` file just gets moved the same way in a follow-up.

## Architecture / proposed approach

Introduce bun workspaces at the repo root with `apps/*` and `packages/*` globs (empty `apps/` placeholder is fine to skip — YAGNI, add it in Step 2 of the broader extraction). Create `packages/shared` as a private package named `@streakly/shared`, move the two files unchanged, add a thin re-export shim at the old `src/lib` paths temporarily so consumer imports don't all break at once — then update imports in the same PR and delete the shims. `date-fns` moves to `packages/shared` deps since only streaks.ts uses it.

## Step-by-step tasks

### Task 0 — Create the branch

```bash
git checkout main && git pull origin main
git checkout -b feature/extract-shared-package
```

Expected: `Switched to a new branch 'feature/extract-shared-package'`.

### Task 1 — Enable workspaces at root

Edit `package.json` (root). Change `"name"` to `"streakly"` (current name `nextjs_tailwind_shadcn_ts` is template residue) and add:

```json
  "workspaces": [
    "packages/*"
  ],
```

Keep all existing scripts/dependencies for now (web still owns everything until Step 2).

### Task 2 — Create the shared package skeleton

Create `packages/shared/package.json`:

```json
{
  "name": "@streakly/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "date-fns": "^4.1.0"
  }
}
```

Notes for the implementer:
- `main`/`exports` point at **TypeScript source**, not `dist/`. Next.js and bun both transpile workspace TS directly — no build step, no tsup. Do NOT add a build pipeline (YAGNI at this size).
- `zod` is intentionally NOT added yet — nothing in shared uses it until Step 2/3.

Create `packages/shared/src/index.ts`:

```ts
export * from "./streaks";
export * from "./goal-config";
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

### Task 3 — Move the files (git mv, no edits)

```bash
mkdir -p packages/shared/src
git mv src/lib/streaks.ts packages/shared/src/streaks.ts
git mv src/lib/goal-config.ts packages/shared/src/goal-config.ts
bun install
```

Expected after `bun install`: bun links the workspace; `node_modules/@streakly/shared` appears as a symlink to `packages/shared`.

### Task 4 — Re-point imports

Find every consumer:

```bash
grep -rn "from \"@/lib/streaks\"\|from '@/lib/streaks'\|from \"@/lib/goal-config\"" src
```

For each file found, replace `@/lib/streaks` → `@streakly/shared` and `@/lib/goal-config` → `@streakly/shared` (the barrel `index.ts` re-exports both, so mixed imports in one file keep working).

Known consumers (from current tree, verify with the grep): `src/lib/goals-api.ts`, `src/components/streaks/streaks-app.tsx`, `src/components/streaks/goal-card.tsx`, `src/components/streaks/goal-form-dialog.tsx`, `src/components/streaks/goal-detail-sheet.tsx`, `src/components/streaks/heatmap.tsx`, `src/components/streaks/stats-bar.tsx`, `src/app/api/goals/route.ts`, `src/app/api/goals/[id]/route.ts`, `src/app/api/goals/[id]/checkins/route.ts`.

Also update `src/lib/goals-api.ts`'s import of `@/lib/streaks` → `@streakly/shared`.

### Task 5 — Compile + gates (verification, not TDD — this is a refactor)

There is no test runner in the repo yet; this step is a pure move, so the validation is type-check + lint + build + runtime smoke:

```bash
bunx tsc --noEmit        # expected: no output, exit 0
bun run lint             # expected: no errors
bun run build            # expected: "Compiled successfully"
```

Runtime smoke:

```bash
bun run dev &
sleep 5
curl -s localhost:3000/api/goals | head -c 200
# expected: [{"id":"...
kill %1
```

Commit:

```bash
git add -A
git commit -m "refactor: extract @streakly/shared package (pure move)"
```

### Task 6 — README note in shared package (optional, 2 min)

Create `packages/shared/README.md`:

```md
# @streakly/shared

Pure logic + types shared by web and (future) api.
Rule: imports NOTHING outside date-fns. No prisma, no react, no next.
```

Commit: `docs: shared package ground rule`.

### Task 7 — PR

```bash
git push -u origin feature/extract-shared-package
gh pr create --title "Monorepo Step 1: extract @streakly/shared" --body "Pure move of streaks.ts + goal-config.ts into packages/shared. No behavior change. Part of the BE separation sequence (Step 1 of 4)."
```

Expected: PR URL printed; CI (if any) green.

## Tests / validation

- No new unit tests required for a pure move (nothing changed semantically). If `bun test` exists by the time this runs (Phase 1 may add `src/lib/streaks.test.ts`), run `bun test` — expected: all pass, with the test file updated to import from `@streakly/shared`.
- Gates: `bunx tsc --noEmit`, `bun run lint`, `bun run build` — all must exit 0.
- Smoke: `/api/goals` returns seeded goals (proves streak computation still works through the moved module).

## Risks, tradeoffs, and open questions

- **`moduleResolution: "bundler"` + TS-source exports**: works for Next/bun, but plain `tsc` consumers would need a build step — acceptable; the only consumers are bun/Next.
- **Name change of root package** (`streakly`): cosmetic; no lockfile consumers reference the old name. If bun warns, accept the new lockfile entry.
- **Barrel `index.ts`**: two files today, so `export *` is safe. When schedule.ts lands in Phase 1, add it to the barrel — one line.
- **Open question:** keep re-export shims at `@/lib/streaks` for a transition period? Plan says no — all consumers updated in one PR (they're all in this repo, ~10 files). Shims would leave two import styles drifting.
- **Open question:** should `GoalDTO`'s `stats` subshape move to shared now? It already lives in `goal-config.ts`, so yes — it moves with the file. No separate action.
- Next steps (out of scope here): Step 2 = `apps/api` + Hono; Step 3 = strip DB from web; Step 4 = Postgres + auth + scoping.