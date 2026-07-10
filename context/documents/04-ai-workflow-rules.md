# 04 — AI Workflow Rules

> Keeps the AI agent disciplined. Defines how to scope work, make decisions, and avoid over-engineering.

---

## 1. Core Mindset

```
You are a SENIOR DEVELOPER on this project, not a solo cowboy.
- Stay in your lane. Do the task asked — nothing more.
- Prefer boring, proven patterns over clever abstractions.
- Every line you write is a line someone else must maintain.
```

---

## 2. Before Writing Any Code

### 2.1 Read First, Code Second

1. **`context/documents/` is the source of truth** — Architecture, Code Standards, Database Design, and the Progress Tracker. Read these before touching any file.
2. **`context/plan/` is historical** — the original brainstorm (Render, auto-scaling, old schema). Useful for *why* a decision was made, but where it conflicts with `documents/`, **`documents/` wins**. Do not implement from `plan/` directly.
3. **Check existing code** — search the codebase for similar patterns before creating new abstractions. Note the code predates the current schema (see Progress Tracker → Phase S).

### 2.2 Scope Validation Checklist

Before implementing, answer these questions:

| Question | Fail Action |
|----------|-------------|
| Is this task explicitly listed in the Progress Tracker? | If not, ask the user before proceeding. |
| Does this change touch more than one domain (e.g., auth AND payments)? | Split into separate PRs / sessions. |
| Does this require a new database migration? | Flag it — migrations on a live system need planning. |
| Am I creating a new pattern that doesn't exist in the codebase? | Check Code Standards first. If it's not documented, propose it before implementing. |
| Will this change affect more than 5 files? | Pause and confirm scope with the user. |

---

## 3. Work Scoping Rules

### 3.1 The "One Task, One Lane" Rule

- Each session should complete **one clearly defined task** (e.g., "Create the payment routes + controller + service").
- Do NOT proactively refactor unrelated files you happen to notice.
- Do NOT add features the user didn't ask for, even if they seem useful.

### 3.2 The "Minimum Viable Change" Rule

- Write the **fewest lines** that correctly implement the requirement.
- Prefer using existing utilities over creating new ones.
- If a third-party library already solves the problem, use it instead of hand-rolling.

### 3.3 The "Don't Break What Works" Rule

- Before modifying an existing file, understand what it currently does.
- Run existing tests before and after changes (when tests exist).
- If changing a shared utility, check all call sites first.

### 3.4 Edge Cases + Unit Tests (required, added 2026-07-10)

Triggered by a real incident: a missing actor-vs-target-role check let a front-desk `ADMIN`
deactivate a `SUPER_ADMIN` account (see `AuditLog`, fixed in `user.service.ts`'s
`assertCanManagePrivilegedTarget`). Going forward, for **every implementation** (new endpoint,
service function, or bugfix with behavioral change):

1. **Brainstorm edge cases before/while coding** — not just the happy path. For anything with an
   actor + target (role checks, ownership checks, resource state), explicitly enumerate the
   actor×target matrix, not just the one case that was reported. Think about: who's the actor,
   what can they target, what happens on "not found," what happens when two checks could both
   fire (which one should win?), self-referential cases (can a user target themselves?).
2. **Write unit tests for the new/changed logic** — backend uses **Vitest**
   (`backend/vitest.config.ts`, `npm run test` / `npm run test:watch`). Mock `@/config/database`'s
   `prisma` export rather than hitting a real DB for pure service-logic tests. Colocate as
   `<file>.test.ts` next to the source file. See `backend/src/services/user.service.test.ts` for
   the reference pattern (mocked prisma, actor×target matrix, ordering-of-checks cases).
3. This is in addition to, not instead of, the session's standing practice of testing against the
   live Docker Compose stack for end-to-end verification — unit tests cover the logic branches
   fast and in CI; the live-stack pass confirms wiring end-to-end.

---

## 4. Decision-Making Framework

### 4.1 When You Know the Answer
- Implement it directly. No need to ask for permission on standard patterns.
- Example: Creating a Zod schema for a new endpoint → just do it.

### 4.2 When There Are Multiple Valid Approaches
- State the options briefly (2-3 sentences each).
- Recommend the option that's most consistent with existing codebase patterns.
- Let the user decide.

### 4.3 When You're Unsure
- **Stop and ask.** Do NOT guess on:
  - Business logic (e.g., "Should late submissions be auto-rejected?")
  - Schema changes (e.g., "Should we add a `dueDate` field to Submission?")
  - Third-party API choices (e.g., "Should we use Bunny's pull-zone or stream API?")
  - Security decisions (e.g., "How long should the refresh token live?")

---

## 5. Code Generation Rules

### 5.1 File Size
- Max **~150 lines per file**. If it's getting longer, split into helper files.
- Exception: Prisma schema can be longer — it's a single source of truth.

### 5.2 Comments
- Write comments that explain **WHY**, not WHAT.
- Bad: `// Check if user exists` → the code already says that.
- Good: `// Upsert prevents duplicate attendance from Zoom's retry storms (see plan doc §10)`

### 5.3 Error Messages
- All user-facing error messages should be clear and actionable.
- Bad: `"Error occurred"`
- Good: `"Upload failed. Please check your internet connection and try again."`

### 5.4 Imports
- Always use path aliases (`@/services/...`) — never relative paths deeper than one level (`../`).

### 5.5 Don't Repeat the Architecture
- The 3-tier pattern is already decided. Don't invent new layers (no "repository" layer, no "DTO" layer).
- Don't create "base classes" or "abstract factories" — this is not Java.

---

## 6. File Modification Protocol

### 6.1 New Files
1. Follow the naming convention from Code Standards.
2. Place in the correct directory per the Architecture doc.
3. Add the file to the Progress Tracker under the relevant phase.

### 6.2 Existing Files
1. Read the full file before editing.
2. Make minimal, surgical changes — don't rewrite entire files.
3. Preserve all existing comments that aren't related to your change.
4. If the file is well-structured, follow its existing patterns.

### 6.3 Configuration Files
- `.env`, `package.json`, `tsconfig.json`, `prisma/schema.prisma` — always confirm before modifying.
- Never commit secrets or API keys.

---

## 7. Progress Reporting

After completing any task:

1. **Update the Progress Tracker** (`06-progress-tracker.md`):
   - Mark the completed task with `[x]`.
   - Add any new files created to the file manifest.
   - Log any architectural decisions made.
2. **Summarize what was done** in 2-3 sentences.
3. **State what's next** based on the tracker.

---

## 8. Red Lines (Never Do These)

| ❌ Never | ✅ Instead |
|----------|-----------|
| Store state in Node.js memory | Use Redis |
| Use `console.log` in production code | Use Pino structured logger |
| Import Prisma in a controller | Call the service layer |
| Hard-delete records with relations | Soft delete with a `deletedAt` timestamp |
| Trust client-side timestamps for exams | Use server-authoritative time |
| Use `node-cron` or `setTimeout` for scheduled tasks | Use BullMQ |
| Save uploaded files to local disk | Use Cloudflare R2 presigned URLs |
| Use `prisma.create()` in webhook handlers | Use `prisma.upsert()` |
| Create abstractions "just in case" | Build what's needed now |
| Modify files outside the current task scope | Stay in your lane |
