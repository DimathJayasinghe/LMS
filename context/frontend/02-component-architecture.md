# 02 — Component Architecture

> Folder structure, server/client boundaries, shadcn usage, the styled-components policy, and naming.
> Goal: predictable structure, minimal client JS, no surprises.

---

## 1. Directory structure (target)

Grow the existing structure toward this. Nothing here contradicts what's already in the repo — it extends it.

```
frontend/
├── app/
│   ├── layout.tsx                 # Root layout: <html>, Poppins, global providers
│   ├── globals.css                # Tailwind v4 + tokens
│   ├── page.tsx                   # "/" — landing (see roadmap; today empty)
│   ├── (marketing)/               # Route group: public pages sharing the marketing shell
│   │   ├── home/ · about/ · courses/ · teachers/ · contact/
│   ├── auth/                      # login, signup, account-setup
│   │   └── login/ signup/ …/_components/
│   └── (app)/                     # Route group: authenticated area, own layout (sidebar/topbar)
│       ├── layout.tsx             # Dashboard shell (guards auth, renders Sidebar + TopBar)
│       ├── dashboard/             # Role-aware landing after login
│       ├── classes/ · exams/ · payments/ · timetable/ · attendance/ · admin/ …
│       └── */_components/         # Route-private pieces
├── components/
│   ├── ui/                        # shadcn primitives + Magic UI (atoms)
│   ├── custom/                    # Shared chrome: Nav, Footer, Sidebar, TopBar, PageHeader
│   └── features/                  # Cross-route domain composites: ExamCard, PaymentTable, AttendanceScanner
├── lib/
│   ├── utils.ts                   # cn()
│   ├── env.ts                     # typed env access (NEXT_PUBLIC_API_URL)
│   ├── api.ts                     # the fetch client (Doc 04)
│   ├── types.ts                   # shared API/domain types (User, Role, Course, …)
│   └── hooks/                     # reusable client hooks (useAuth, useToast, …)
└── public/
```

**Route groups** `(marketing)` and `(app)` (parentheses = no URL segment) let the two surfaces have different
layouts — marketing gets the floating pill nav + footer; the authenticated area gets the sidebar shell — without
polluting the URL.

---

## 2. Where a component lives

| Scope | Location | Example |
|---|---|---|
| Used by exactly one route | `app/<route>/_components/` | `app/home/_components/CourseCard.tsx` |
| Shared app chrome (nav, footer, sidebar) | `components/custom/` | `components/custom/Nav.tsx` |
| Domain composite reused across routes | `components/features/` | `components/features/ExamCard.tsx` |
| Generic primitive (atom) | `components/ui/` | `components/ui/button.tsx` |

Rule of promotion: start route-private in `_components/`. The **moment a second route needs it**, move it up to
`components/features/` (domain) or `components/custom/` (chrome). Don't pre-promote.

---

## 3. File & symbol naming

| Thing | Convention | Example |
|---|---|---|
| Component file & export | **PascalCase** | `CourseCard.tsx` → `export default function CourseCard()` |
| Primitive (shadcn) file | lowercase (as generated) | `button.tsx`, `avatar.tsx` |
| Hook file & export | `useX.ts` / camelCase | `useAuth.ts` |
| Non-component module | camelCase | `api.ts`, `formatDate.ts` |
| Route folder | kebab-case, lowercase | `class-details/`, `account-setup/` |
| Types | PascalCase | `type Course`, `interface UserProfile` |

Match the **existing** style of the file you edit; consistency beats preference.

---

## 4. Server vs Client components (the most important rule)

Next.js 16 renders everything as a **Server Component** unless marked `"use client"`. Keep it that way.

**Stay a Server Component** (the default) for: pages, layouts, anything that fetches data, static markup,
composing children. Server Components can `async`/`await` data and never ship JS.

**Add `"use client"`** only when the component itself needs:
- `useState` / `useReducer` / `useEffect` / refs to DOM,
- event handlers (`onClick`, `onChange`, `onSubmit`),
- browser APIs (`window`, `localStorage`, `navigator`, geolocation, camera for QR),
- React context consumers/providers, or
- a client-only library (`styled-components`, `motion`, `react-hook-form`, most Magic UI animated components).

**Push the boundary down.** Don't mark a whole page `"use client"` to get one interactive button. Keep the page
a Server Component and extract the interactive bit into its own small client component. `"use client"` is
**contagious** — everything imported by a client file joins the client bundle.

**Patterns you'll use constantly:**
- *Server page → client leaf:* fetch on the server, pass serializable props into a small `"use client"` child
  (button, form, chart).
- *Client shell → server children via `children`:* a client `Modal`/`Tabs` can wrap server-rendered content by
  taking it as `children` (a "slot"). This keeps server content server-rendered inside a client interaction.
- *Providers:* context providers are client components rendering `{children}`; mount them in `layout.tsx`
  wrapping `{children}` (not the whole `<html>`). See Doc 04 for `AuthProvider`.

> Props crossing the server→client boundary must be **serializable** (no functions, class instances, Dates
> become strings — send ISO strings and parse on the client).

---

## 5. Styling policy (and the styled-components constraint)

Priority order for styling:

1. **Tailwind utility classes** with design tokens (Doc 01) — the default for ~everything.
2. **shadcn variants** (`cva`) — when a primitive needs structured variants (`Button`, `Badge`).
3. **`cn()`** (`@/lib/utils`) — always use it to merge/condition classes; it dedupes conflicting Tailwind classes.
4. **CSS Modules** (`*.module.css`) — only for genuinely custom CSS Tailwind can't express cleanly.
5. **styled-components** — **constrained**, see below.

### styled-components policy

styled-components v6 is installed and used by some landing components (`Grid`, `Nav`, `Header`,
`LoginLeftSide`). Two hard facts under Next.js 16 App Router:

- It is **CSS-in-JS running at runtime** → any file that uses `styled` **must be a Client Component**
  (`"use client"`), so it ships JS and can't be a Server Component.
- Server-side rendering it correctly needs a **styled-components registry** wired in the root layout
  (`useServerInsertedHTML`), or you get a flash of unstyled content and hydration warnings.

**Therefore:**
- **Prefer Tailwind + `motion` for all new work.** They keep components Server-friendly (Tailwind) or use the
  animation lib we already standardize on (`motion`), with no registry needed.
- **Do not add new styled-components.** If you touch a landing component that uses it and the change is
  non-trivial, prefer migrating that piece to Tailwind (+ `motion` for the animation).
- If styled-components must stay, ensure (a) the file has `"use client"`, and (b) the SSR registry is installed
  in `app/layout.tsx`. (Setting up the registry is a tracked task — see Doc 06 / the hand-off notes.)

---

## 6. shadcn / Magic UI usage

- Config lives in `components.json` (`style: radix-nova`, `baseColor: neutral`, `rsc: true`, `iconLibrary: lucide`,
  and a `@magicui` registry). Add primitives with the shadcn CLI rather than hand-copying, so tokens/variants
  stay consistent:
  ```bash
  npx shadcn@latest add dialog table dropdown-menu toast skeleton tabs sonner
  ```
- Extend a primitive by wrapping it or adding a `cva` variant — don't fork it. Keep restyling to `className`
  overrides via `cn()` so the design tokens still flow.
- Magic UI animated components (`@magicui`) are for expressive marketing accents; use them deliberately, not
  as default UI.

---

## 7. Component file pattern

```tsx
// components/features/ExamCard.tsx
import { cn } from '@/lib/utils'
import type { Exam } from '@/lib/types'

interface ExamCardProps {
  exam: Exam
  className?: string
}

// Server Component by default — no "use client" unless it needs interactivity.
export function ExamCard({ exam, className }: ExamCardProps) {
  return (
    <article className={cn('bg-card border border-border rounded-2xl p-5 hover:shadow-xl transition', className)}>
      {/* … */}
    </article>
  )
}
```

Conventions:
- Props interface named `XProps`, declared **above** the component (not inline).
- Accept `className` and merge with `cn()` so callers can adjust spacing/layout.
- React 19: pass `ref` as a normal prop when needed (no `forwardRef` ceremony required).
- One primary export per file; name it to match the filename.
- Keep components small; extract interactive leaves into their own `"use client"` files.

---

## 8. State management

Keep it minimal — the project's north star is low complexity.

- **Server state** (lists, details) → fetched in Server Components via the `api` client; no client cache library.
- **Auth/session** → a single `AuthProvider` (React context, Doc 04) exposing the current user.
- **Ephemeral UI state** (open/closed, form fields) → local `useState` / `react-hook-form`.
- **Toasts/theme** → small context providers or shadcn `sonner`.
- **Do not** add Redux/Zustand/Jotai/React-Query unless a concrete need survives review. Context + RSC covers us.
