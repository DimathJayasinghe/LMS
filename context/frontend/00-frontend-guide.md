# 00 — Frontend Guide

> How the frontend is built, and how an AI agent should work in it. Read this first, then Doc 01.

---

## 1. What this app is

The **student- and staff-facing web client** for a single Sri Lankan tuition institute. It talks to the
Express/Prisma backend (see `context/api_endpoints/`) over cookie-authenticated HTTP. There is **no native
app** — this web app must work on desktop, tablet, and mobile browsers.

Audience (roles the UI serves — see Doc 04 for the enum):

- **STUDENT** — the primary user. Browses classes, enrolls, pays, watches live/recorded lessons, sits exams, uploads answers, marks attendance by QR.
- **TEACHER** — manages their own courses, sessions, timetable, videos, exams.
- **ADMIN** (front desk) — enrollment, payments at entrance, attendance scanning, user management.
- **MARKER** — grades exam submissions.
- **SUPER_ADMIN** — the owner; everything.

Public visitors (no login) see the **marketing landing page** and can register.

---

## 2. Tech stack (what's actually installed)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.6** (App Router) | RSC by default. See Doc 03 — conventions differ from older Next. |
| Runtime | **React 19.2** | `use()` API, `<form>` actions, ref-as-prop available. |
| Language | **TypeScript** (strict) | Path alias `@/*` → project root. |
| Styling | **Tailwind CSS v4** | Configured in `app/globals.css` via `@theme inline` + `@import "tailwindcss"`. No `tailwind.config.js`. |
| Component kit | **shadcn/ui** (`style: radix-nova`, `baseColor: neutral`, `rsc: true`) built on **radix-ui** | Primitives live in `components/ui/`. Add via the shadcn CLI. |
| Animated UI | **Magic UI** components (`registries.@magicui`) + **`motion`** (Framer Motion successor) | RainbowButton, RippleButton, TextAnimate, TypingAnimation already present. |
| Icons | **lucide-react** (primary) + **FontAwesome** (marketing pages only) | Standardize on Lucide for app UI. See Doc 01 §9. |
| Forms | **react-hook-form** | Already used on auth pages. |
| CSS-in-JS | **styled-components v6** | Present on some landing components. **Constrained** — see Doc 02 §5. |
| Fonts | **Poppins** via `next/font/google` | `--font-poppins`, weights 400/700. This is the brand font. |

> **Do not add heavy dependencies** (state libs, data-fetching libs, UI kits) without a reason that
> Doc 09 (cost & complexity) would approve. The project's north star is **lowest cost, lowest complexity**.
> Prefer: RSC data fetching + a thin `api` client (Doc 04), React context for the little global state we need
> (auth, theme, toasts), and Tailwind utilities.

---

## 3. Repo layout (`/frontend`)

```
frontend/
├── app/                      # App Router routes (see Doc 02 for the target tree)
│   ├── layout.tsx            # Root layout — loads Poppins, wraps providers
│   ├── globals.css           # Tailwind v4 entry + design tokens (@theme inline, :root, .dark)
│   ├── page.tsx              # "/" (today: empty — see roadmap)
│   ├── home/                 # Marketing landing (the design reference)
│   │   ├── page.tsx
│   │   └── _components/      # Route-private components (Grid, Header, CourseCard, StudentReviews)
│   └── auth/{login,signup}/  # Auth screens with route-private _components
├── components/
│   ├── ui/                   # shadcn primitives + Magic UI (button, input, badge, field, avatar, …)
│   └── custom/               # Shared app chrome (Nav, Footer)
├── lib/
│   └── utils.ts              # cn() — clsx + tailwind-merge
├── public/                   # Static assets (Courses/, images)
├── components.json           # shadcn config
├── AGENTS.md / CLAUDE.md     # "This is NOT the Next.js you know" — heed it
└── next.config.ts
```

**Conventions already in play (keep them):**
- Route-private components live in a `_components/` folder next to the `page.tsx` that uses them (the `_`
  prefix keeps the folder out of routing). Promote a component to `components/` only when a **second** route needs it.
- Shared cross-route chrome lives in `components/custom/`.
- shadcn primitives live in `components/ui/` and are imported via `@/components/ui/...`.

---

## 4. How the agent should work here

1. **Read Doc 01 before styling anything.** The design is already set by the landing page; match it, don't invent a new one.
2. **Check the API contract before wiring data.** Every screen maps to endpoints in `context/api_endpoints/`. Use the exact paths, roles, request bodies, and error codes documented there.
3. **Confirm the Next.js API.** Before using a routing/data/caching/font/metadata feature, verify it against `frontend/node_modules/next/dist/docs/01-app/`. Doc 03 lists the traps.
4. **Server Component by default.** Add `"use client"` only to the specific component that needs state, effects, event handlers, or browser APIs. Push the boundary as deep as possible (Doc 02 §4).
5. **Reuse before you build.** Check `components/ui/` and `components/custom/` first. Extend a shadcn primitive rather than hand-rolling a new one.
6. **Every screen ships its states.** Loading, empty, and error are not optional (Doc 05 §4). A page that only handles the happy path is not done.
7. **Accessible or it's not merged.** Keyboard, focus-visible, labels, alt text, contrast, `prefers-reduced-motion` (Doc 05 §1–2).
8. **Verify before claiming done.** `npm run lint` and a real `npm run build` must pass. If you changed a route, load it in `next dev` and confirm it renders.

---

## 5. Environment & running

| Command (in `/frontend`) | Purpose |
|---|---|
| `npm run dev` | Dev server (Fast Refresh) on `http://localhost:3000`. |
| `npm run build` | Production build — **the real type/route check**. Run before declaring work done. |
| `npm run start` | Serve the production build. |
| `npm run lint` | ESLint (`eslint-config-next`). |

Environment variables (client-exposed ones **must** be prefixed `NEXT_PUBLIC_`):

| Var | Example | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000/api` | Backend base URL used by the `api` client (Doc 04). |

Put local values in `frontend/.env.local` (gitignored). Never commit secrets; the frontend needs **no**
server secrets — auth is entirely via the backend's HTTP-only cookies.

---

## 6. Git & naming

Follow `context/documents/11-git-and-naming.md`. In short: branch off `dev` as
`feature/<area>-<slug>` (e.g. `feature/student-dashboard`), open a PR into `dev`, then `dev → main`.
Frontend-specific naming: **PascalCase** component files (`CourseCard.tsx`), **camelCase** hooks
(`useAuth.ts`), route folders **kebab-case** and lowercase (`class-details/`).

---

## 7. Definition of done (per screen)

- [ ] Matches Doc 01 tokens (Poppins, black/white, rounding, pill buttons).
- [ ] Server/Client boundary is minimal and correct (Doc 02).
- [ ] Data comes from the documented endpoint via the `api` client; roles respected (Doc 04).
- [ ] Loading + empty + error states implemented (Doc 05).
- [ ] Responsive at 375 / 768 / 1280 px.
- [ ] Keyboard-navigable, labelled, AA contrast, honors reduced motion.
- [ ] `npm run build` and `npm run lint` pass.
- [ ] Roadmap (Doc 06) updated: move the item to Done.
