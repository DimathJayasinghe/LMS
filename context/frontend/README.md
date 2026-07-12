# Frontend Agent Docs

> The single source of truth for building the LMS frontend. Read these before writing any UI code.
> These mirror the backend's `context/documents/` set, but for the **Next.js 16 web app** in `/frontend`.

The design language in these docs is **reverse-engineered from the landing page the team already built**
(`app/home`, `app/auth`, `components/`). We follow that established look — editorial black-on-white,
Poppins, heavy rounding, animated grid backdrops — everywhere, including dashboards.

## Read order

| # | Doc | What it covers |
|---|-----|----------------|
| 00 | [Frontend Guide](./00-frontend-guide.md) | Stack, repo layout, how the agent should work, golden rules. **Start here.** |
| 01 | [Design Language](./01-design-language.md) | The visual identity: color, type, rounding, buttons, motion, the grid motif. Supersedes `documents/05-ui-context.md` for visuals. |
| 02 | [Component Architecture](./02-component-architecture.md) | Folder structure, server/client boundaries, shadcn usage, styled-components policy, naming. |
| 03 | [Next.js 16 Conventions](./03-nextjs16-conventions.md) | What changed vs the Next.js you remember: async `params`, route helpers, data fetching, caching, fonts, metadata. |
| 04 | [API Integration](./04-api-integration.md) | Talking to the backend: base URL, cookie auth + refresh, the typed `api` client, error shapes, roles. |
| 05 | [UX Principles](./05-ux-principles.md) | Non-negotiable UI/UX rules: accessibility, responsiveness, forms, loading/empty/error states, feedback. |
| 06 | [Frontend Roadmap](./06-frontend-roadmap.md) | Page inventory per role, build order, what exists today vs what's pending. |

## Companion docs (already in the repo)

- **API contracts** — `context/api_endpoints/*.endpoints.md` (request/response/role for every endpoint).
- **Backend architecture** — `context/documents/02-architecture.md`, `08-database-design.md`.
- **Git & naming** — `context/documents/11-git-and-naming.md` (branch strategy applies to frontend too).

## The one rule above all others

The frontend's own `AGENTS.md` says it plainly: **this is not the Next.js in your training data.**
Before writing code that touches a Next.js feature (routing, data fetching, caching, fonts, metadata),
open the bundled docs at `frontend/node_modules/next/dist/docs/01-app/` and confirm the current API.
Doc 03 summarizes the traps, but the bundled docs are authoritative.
