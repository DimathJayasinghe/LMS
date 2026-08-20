# 11 — Git Workflow & Naming Conventions

> How we branch, commit, review, and name things. Consistency here keeps a multi-contributor repo (backend + frontend) from drifting. This formalizes the flow already visible in the repo's history.

---

## 1. Branching Model

A lightweight **trunk-with-integration** flow. Three kinds of branch:

```
main            ← production. Protected. Only updated via PR. Always deployable.
  └── dev       ← integration / staging. Features land here first.
        └── <work branches>   ← short-lived; one task each
```

| Branch | Role | Rules |
|--------|------|-------|
| `main` | Production truth | Protected; **no direct pushes**; PR + green CI + review to merge; deploys from here |
| `dev` | Integration/staging | Features merge here first and are tested together before a release PR to `main` |
| Work branches | One task | Branch off `dev`; short-lived; delete after merge |

> The repo also has `dev-backend` as a backend-only integration lane feeding `dev`/`main`. Keep such long-lived lanes to a minimum — prefer one `dev`. Retire experiments (old `feature/*`, contributor scratch branches) once merged.

### 1.1 Work-branch naming

`<type>/<short-scope>` — or, when it helps in a shared repo, prefix with the contributor: `<name>/<type>/<scope>`.

| Type | Use for | Example |
|------|---------|---------|
| `feature/` | New capability | `feature/subject-crud` |
| `fix/` | Bug fix | `fix/exam-timer-off-by-one` |
| `chore/` | Tooling, deps, config | `chore/bump-prisma-7` |
| `docs/` | Docs only | `docs/cost-and-hosting` |
| `refactor/` | No behaviour change | `refactor/extract-course-access` |

- Lowercase, `kebab-case` scope, no spaces. Keep it short and specific: `feature/pay-at-entrance`, not `feature/payments`.
- One task per branch. If the scope is growing past ~5 files or two domains, split it (see 04-ai-workflow-rules).

### 1.2 Lifecycle

```
git switch dev && git pull
git switch -c feature/pay-at-entrance
# ...commit small, logical steps...
git push -u origin feature/pay-at-entrance
# open PR → dev ; tests green + review ; merge
```
Release: PR `dev → main` when a batch is tested. Tag `main` for notable releases (`v1.0.0`).

> **For AI-agent sessions (2026-07-10, restated explicitly after a stretch of direct-to-`dev`
> commits that shouldn't have happened): never commit straight to `dev`, even for a small fix.**
> Always: branch → do the work → run the test suite (`cd backend && npm run test` + `npx tsc
> --noEmit` in both `backend/` and `frontend/`) → push the branch → open a PR (`gh pr create`) →
> merge only once everything is green. GitHub Actions runs backend/frontend tests and builds on
> every PR into `dev`/`main`; local verification is still required before pushing so CI is a
> confirmation, not the first feedback loop. **Never delete a branch after
> merging** — this repo's owner continues work on branches post-merge, which overrides the
> "delete branch" line in §5 below.

---

## 2. Commit Messages — Conventional Commits

`type(scope): summary` — imperative, lowercase, ≤ 72 chars, no trailing period.

```
feat(subjects): add Subject CRUD endpoints
fix(exams): reject submission when server time > endTime
refactor(class): extract assertCourseAccess ownership gate
chore(docker): add redis AOF persistence + healthchecks
docs(architecture): switch topology to single-VPS Compose
```

| Type | When |
|------|------|
| `feat` | New user-facing capability |
| `fix` | Bug fix |
| `refactor` | Internal change, no behaviour change |
| `chore` | Build, deps, config, tooling |
| `docs` | Documentation only |
| `test` | Tests only |
| `perf` | Performance |

- **Scope** = the domain: `auth`, `users`, `subjects`, `class`, `exams`, `submissions`, `payments`, `attendance`, `video`, `stream`, `docker`, `infra`.
- One logical change per commit. Body (optional) explains **why**, not what. Reference issues: `Refs #42`.
- A schema change and its code go in the **same** commit/PR so the tree is never half-migrated.

---

## 3. Pull Requests

- **One feature per PR.** Small PRs review faster and revert cleanly.
- **Squash-merge** into `dev`/`main` so history stays one-commit-per-feature.
- Merge requires: **tests green** (`npm run build` + `npm run test`, locally and in GitHub Actions)
  and **one review** where a
  human reviewer is available.
- Backend and frontend lint are required CI checks. The backend baseline covers application code
  and unit tests; legacy live-stack diagnostic scripts excluded from `tsconfig.json` remain a
  documented follow-up rather than being silently treated as lint-clean.
- PR description states: what changed, why, how tested, and any migration/ops step (e.g. "run `prisma migrate deploy`").
- Never merge red CI or a partial migration. If blocked, keep the PR in draft.

---

## 4. Naming Conventions (consolidated)

The authoritative style lives in [03-code-standards.md](./03-code-standards.md); this is the quick reference.

### 4.1 Files & code

| Element | Convention | Example |
|---------|-----------|---------|
| Backend files | `domain.layer.ts` | `payment.service.ts`, `subject.routes.ts` |
| React components | `PascalCase.tsx` | `ExamTimer.tsx` |
| Other frontend files | `kebab-case.ts` | `api-client.ts` |
| Functions / vars | `camelCase` | `assertCourseAccess`, `getStudentById` |
| Types / interfaces | `PascalCase` | `AuthenticatedUser`, `PaymentRecord` |
| Zod schemas | `camelCase` + `Schema` | `createSubjectSchema` |
| Constants / env keys | `UPPER_SNAKE_CASE` | `MAX_UPLOAD_SIZE_MB`, `DATABASE_URL` |
| React hooks | `use` + `PascalCase` | `useAuthStore` |

### 4.2 Database (Prisma)

| Element | Convention | Example |
|---------|-----------|---------|
| Models | `PascalCase`, singular | `Course`, `ClassSession`, `MarkerAssignment` |
| Fields | `camelCase` | `teacherId`, `paymentMonth`, `deletedAt` |
| Enums | `PascalCase` name, `UPPER_SNAKE_CASE` values | `Role.SUPER_ADMIN`, `PaymentMethod.ENTRANCE` |
| FK field | `<relation>Id` | `subjectId`, `enrollmentId`, `collectedById` |
| Booleans | `is`/`has` prefix | `isActive`, `isPublished` |
| Timestamps | `createdAt`, `updatedAt`, soft-delete `deletedAt` | — |
| Composite unique | business rule at DB level | `@@unique([subjectId, name, year])` |

### 4.3 API routes

- Base: `/api/<plural-resource>` in `kebab-case` → `/api/subjects`, `/api/class-sessions` (nested under `/api/classes/:classId/sessions`), `/api/audit-logs`.
- Nest child resources under the parent: `/api/classes/:classId/sessions/:sessionId`.
- Actions as sub-paths when not plain CRUD: `POST /api/exams/:id/assign-markers`, `PATCH /api/payments/:id/override`.
- Response envelope is always `{ status, data, message?, count?, code? }` (see 07 §API Response Format).

### 4.4 Branches, commits, env

- Branches: `type/kebab-scope` (§1.1). Commits: `type(scope): summary` (§2).
- Env vars: `UPPER_SNAKE_CASE`, grouped by service (`R2_*`, `BUNNY_*`, `PAYHERE_*`, `NOTIFY_*`); every one registered and validated in `backend/src/config/env.ts` (fail-fast at boot). Never commit `.env`.

---

## 5. Quick Do / Don't

| ✅ Do | ❌ Don't |
|------|---------|
| Branch off `dev`, one task, short-lived | Commit straight to `dev` or `main` |
| `feat(exams): ...` conventional commits | `update stuff`, `wip`, `fix2` |
| Squash-merge via PR once tests are green | Merge red/untested code or a partial migration |
| Ship schema + code together | Split a migration across PRs |
| **Keep merged branches** (2026-07-10, overrides the old advice below) | Delete a branch after merging — the owner keeps working on them |
| `domain.layer.ts` + `camelCase` fields | Mixed casing, `snake_case` in TS |
