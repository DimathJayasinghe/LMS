# 01 — Design Language

> The visual identity of the LMS, **reverse-engineered from the landing page the team already built**
> (`app/home`, `app/auth`, `components/`). Every new screen — marketing, auth, and dashboards — follows this.
>
> **This supersedes `context/documents/05-ui-context.md` for all visual decisions** (color, type, buttons,
> motion). From `05-ui-context.md` we keep only the *structural* guidance (dashboard shell layout in §4.2 and
> the status→badge semantics in §7); its Indigo/Slate + Inter palette is **retired** in favor of what's below.

---

## 1. The identity in one paragraph

**Editorial minimalism.** Near-pure **black on white**, oversized confident **Poppins** headlines, and
**heavily rounded** shapes — pill buttons, pill nav, `rounded-2xl` cards. The signature texture is a faint
**animated grid** (graph-paper squares that softly light up) sitting behind hero content. Color is used
sparingly and deliberately: a single **teal** accent for course tags, an animated **rainbow** gradient reserved
for the one hero call-to-action, and semantic colors (green/red/amber) only for status. The result should feel
like a premium education brand — calm, spacious, high-contrast — **not** a busy SaaS dashboard.

Design principles, in priority order:
1. **Contrast & clarity over decoration.** Black text on white, huge type, generous whitespace.
2. **Rounded and soft.** Nothing sharp; pills and large radii everywhere.
3. **Restraint with color.** Monochrome base; accent colors earn their place.
4. **Motion with purpose.** Subtle, snappy, and always respectful of `prefers-reduced-motion`.
5. **One system, two surfaces.** Marketing pages are expressive; dashboards are the same DNA, dialed to be denser and calmer.

---

## 2. Color

Colors are defined as **OKLCH CSS variables** in `app/globals.css` (`:root` for light, `.dark` for dark),
mapped to Tailwind via `@theme inline`. **Always style with the semantic token, never a raw hex/oklch.**
Use Tailwind classes like `bg-background`, `text-foreground`, `bg-primary`, `border-border`, `text-muted-foreground`.

### 2.1 Core tokens (shadcn "neutral" base — already in `globals.css`)

| Token (Tailwind class) | Light | Dark | Usage |
|---|---|---|---|
| `background` / `foreground` | white / near-black | near-black / near-white | Page background & primary text |
| `card` / `card-foreground` | white / near-black | dark / near-white | Card surfaces |
| `primary` / `primary-foreground` | near-black / near-white | near-white / near-black | **Primary buttons, key CTAs** — the black pill |
| `secondary` / `secondary-foreground` | light gray / near-black | dark gray / near-white | Secondary buttons, chips |
| `muted` / `muted-foreground` | light gray / mid gray | dark gray / light gray | Subtle backgrounds & secondary text |
| `accent` / `accent-foreground` | light gray / near-black | dark gray / near-white | Hover fills, subtle highlights |
| `border` | slate-200-ish | white @ 10% | Card borders, dividers, inputs |
| `destructive` | red | red | Errors, destructive actions |
| `ring` | gray | gray | Focus rings (`focus-visible:ring-ring`) |

> The base is intentionally **monochrome**. "Primary" is black, not a brand hue — that is the look.

### 2.2 Accent & expressive colors (use sparingly)

| Purpose | Value | Where it appears |
|---|---|---|
| **Course year ribbon** | `teal-600` corner ribbon (clip-path) | `CourseCard` — the "2027 A/L" tag |
| **Hero CTA** | animated **rainbow gradient** via `--color-1..5` (`RainbowButton`) | The single "Register to class" button. Reserve it — one per view, max. |
| **Stat highlight** | `yellow-700` on a number | "125K+ Students" social proof |
| **Secure/trust** | `green-500` | Footer "Secure Payment" shield |

Do **not** introduce new brand hues. If a new accent is truly needed, add it as a CSS variable in `globals.css`
and document it here — never hardcode.

### 2.3 Semantic status colors

Status is the one place color is mandatory. Map every status to a `Badge` variant (see §7). Keep these
consistent app-wide; they carry the same meaning the backend enums do (`PRESENT`, `PAID`, `PENDING`, …).

| Meaning | Color | Token |
|---|---|---|
| Success (present, paid, completed, active) | green | `--color-success` → add as `emerald-500` |
| Error / danger (absent, failed) | red | `destructive` |
| Warning / pending (deadline near, payment due) | amber | `amber-500` |
| Info (uploading, informational) | blue | `blue-500` |
| Neutral (inactive, draft) | gray | `muted` |

---

## 3. Typography

**Poppins** is the brand typeface — geometric, rounded, friendly-but-serious. It is loaded in
`app/layout.tsx` via `next/font/google` as `--font-poppins` (weights 400 and 700) and set as the body font.

```tsx
// app/layout.tsx (already present)
const poppins = Poppins({ subsets: ['latin'], weight: ['400','700'], variable: '--font-poppins' });
```

### 3.1 Type scale & voice

The landing page uses **very large** display headings and airy body text. Match this register:

| Role | Tailwind | Weight | Notes |
|---|---|---|---|
| Hero display | `text-6xl`–`text-[5rem]` `leading-none` | 700 | Marketing heroes only. Tight leading. |
| Page title (dashboard) | `text-2xl`–`text-3xl` | 700 | Dense screens stay smaller than marketing. |
| Section heading | `text-4xl`–`text-5xl` (marketing) / `text-xl` (app) | 500–700 | |
| Card title | `text-lg` | 500 | e.g. `CourseCard` name. |
| Body | `text-base` `leading-7` | 400 | Generous line height; marketing copy often `italic` for taglines. |
| Secondary / meta | `text-sm text-muted-foreground` | 400 | Schedule rows, captions. |
| Caption / badge | `text-xs` | 400 | |

- **Marketing** leans into oversized, occasionally italic, centered, `select-none` display type.
- **Dashboards** dial the top of the scale down (start at `text-2xl` for titles) to stay information-dense.
- Reserve a monospace font (`--font-mono`) for **exam timers** and numeric countdowns only.

---

## 4. Shape, radius & elevation

Rounding is a core brand signal. The radius scale is defined in `globals.css` (`--radius: 0.625rem`, scaled
`sm`→`4xl`). Defaults:

| Element | Radius |
|---|---|
| Buttons, nav bar, pills, chips, avatars | `rounded-full` |
| Cards, panels, images, inputs, modals | `rounded-2xl` (marketing) / `rounded-lg`–`rounded-xl` (dense app UI) |
| Small controls (badges, tags) | `rounded-md`–`rounded-lg` |

**Elevation** is subtle: default cards are flat with a 1px `border-border`; elevate on hover
(`hover:shadow-xl` + a slightly darker border), not by default. Avoid heavy drop shadows.

**Spacing** follows a 4px scale and errs on the side of **airy** — marketing sections use large vertical
rhythm (`mt-40`, `pt-40`, big `gap`s); dashboards tighten to `gap-4`/`gap-6` and `p-4`/`p-6`.

---

## 5. Buttons — the button system

Buttons are the most recognizable element. There is a clear hierarchy:

| Tier | Look | Component / classes | When |
|---|---|---|---|
| **Primary** | Solid **black pill**, white text, `rounded-full`, roomy padding, `hover:scale-[1.05]` `duration-300` | shadcn `Button` (default variant) restyled to pill, or `RippleButton` for forms | The main action on a screen (Register, Enroll, Pay, Submit). One primary per view. |
| **Hero CTA** | Animated **rainbow-border** pill | `RainbowButton` (`components/ui/rainbow-button`) | The single most important marketing CTA. **Reserve** — never more than one visible. |
| **Secondary / outline** | White bg, `border-border`, black text; **hover inverts** to black bg + white text (`duration-100`) | shadcn `Button variant="outline"` restyled to pill | "View Class", secondary nav actions. |
| **Ghost** | No border/bg; `hover:bg-muted` | shadcn `Button variant="ghost"` | Toolbar/table row actions, icon buttons. |
| **Destructive** | shadcn `destructive` variant | `Button variant="destructive"` | Delete/deactivate, always behind a confirm. |

Rules:
- Pill (`rounded-full`) is the default button shape on marketing/auth. In dense tables/toolbars, `rounded-lg`
  from the base shadcn `Button` is acceptable to save space.
- Every button has a visible `focus-visible` ring (shadcn `Button` already does — don't strip it).
- Loading state: disable + swap label for a spinner (Lucide `Loader2` with `animate-spin`), keep width stable.
- Icon-only buttons **must** have an `aria-label`.
- Links that look like buttons should still be real `<a>`/`<Link>`; buttons that act like buttons must be `<button>`.

---

## 6. Signature components & motifs

These are the recurring, brand-defining pieces already established. Reuse and extend them; don't reinvent.

- **The grid backdrop.** A wrapping flex of faint white squares with `1px` near-transparent borders that
  softly light on hover (`app/home/_components/Grid.tsx`, `app/auth/.../LoginLeftSide.tsx`). It is the hero
  texture of the brand. Keep it decorative, low-contrast, and behind content with fade masks at the edges.
- **Floating pill nav** (`components/custom/Nav.tsx`). Centered, `max-width: 50rem`, 1px border, `rounded-full`,
  white bg. Circular black "L" logo on the left, centered link list, black login pill on the right.
- **CourseCard** (`app/home/_components/CourseCard.tsx`). White `rounded-2xl` card, 1px border → `hover:shadow-xl`
  + darker border; cover image on top; **teal corner ribbon** (clip-path) for the A/L year; title (`text-lg`);
  a schedule row (Lucide/FA clock + `text-sm text-muted-foreground`); an outline "View Class" button that
  inverts on hover. This is the canonical content card — mirror its structure for exams, sessions, etc.
- **Social proof cluster** (`StudentReviews`). Overlapping **grayscale** avatars (`grayscale` on `AvatarImage`)
  + a stat with one colored number.
- **Footer** (`components/custom/Footer.tsx`). `max-w-7xl`, 4-column link grid, muted links with
  `hover:text-foreground transition-colors`, a bottom bar with trust/payment badges.

---

## 7. Status → Badge mapping

Use the shadcn `Badge` for every status token. One mapping, used everywhere (attendance, payments, exams,
users). This is inherited from `05-ui-context.md §7` and stays authoritative:

| Status | Variant | Color |
|---|---|---|
| `PRESENT`, `PAID`/`SUCCESS`, `COMPLETED`, `ACTIVE`, `SENT` | success | green |
| `ABSENT`, `FAILED` | destructive | red |
| `PENDING` (payment/deadline) | warning | amber |
| `UPLOADING`, informational | info | blue |
| `INACTIVE`, draft | neutral | gray |

---

## 8. Motion

Animation is present and part of the brand, but **snappy and purposeful**.

- **Library:** `motion` (Framer Motion successor, installed) for component animation; small CSS keyframes for
  loops. Existing keyframes in `globals.css`: `rainbow`, `rippling`, `blink-cursor`; landing uses a `pop` fade.
- **Existing animated primitives:** `RainbowButton`, `RippleButton`, `TextAnimate` (e.g. `blurInUp` by word),
  `TypingAnimation`, `AnimatedGridPattern`. Prefer these over new one-offs.
- **Durations:** interactions `100–300ms` (hover scale, color/inversion); decorative loops may be `1–5s` but
  must be low-contrast and non-distracting.
- **Hover language:** primary CTAs scale up slightly (`hover:scale-[1.05]`); outline buttons invert colors;
  cards raise a shadow. Keep transitions on `transform`/`opacity`/`color` for performance.
- **`prefers-reduced-motion`:** **mandatory.** Gate decorative/looping motion behind it; when reduced, disable
  the grid animation, typing, and scale/loop effects. (See Doc 05 §2.)

---

## 9. Icons & imagery

- **Icons:** **Lucide** (`lucide-react`) is the standard for app UI — consistent, tree-shakeable, matches the
  shadcn `iconLibrary`. FontAwesome is present and used on marketing pages; it's acceptable there for flourish,
  but **default to Lucide** for anything in dashboards/forms/tables. Don't mix both in the same component.
- Icon size tracks its text: 16px (`size-4`) with body, 20px (`size-5`) with headings. Icon-only controls need
  `aria-label`.
- **Imagery:** always `next/image` with explicit `width`/`height` (or `fill` + sized parent) and meaningful
  `alt`. Cover images use `object-cover` and inherit the card radius. Avatars are `grayscale` by default for
  the editorial look (color them only when identity color matters).

---

## 10. Dark mode

Tokens for dark mode already exist (`.dark` block in `globals.css`) but the toggle isn't wired yet.

- Marketing/auth are **light-first** (the editorial look lives in white space) — ship them light now.
- Dashboards should support dark mode: toggle by adding/removing `.dark` on `<html>`, persisted in
  `localStorage`, defaulting to `prefers-color-scheme` on first visit. Because every component is styled with
  tokens (not raw colors), dark mode "just works" if you never hardcode a color.
- **Rule:** never hardcode `#fff`, `bg-white`, `text-black` on structural UI — use `bg-background`,
  `text-foreground`, etc., so both themes render correctly. (The current landing uses some raw `bg-white`/
  `text-black`; new code should use tokens. See Doc 05 §7 for the cleanup list.)

---

## 11. Quick reference — "make it look right"

```
Surface        → bg-background text-foreground
Card           → bg-card border border-border rounded-2xl hover:shadow-xl
Primary button → bg-primary text-primary-foreground rounded-full px-8 py-3 hover:scale-[1.05] transition
Outline button → border border-border rounded-full px-8 py-3 hover:bg-foreground hover:text-background transition
Muted text     → text-sm text-muted-foreground
Section rhythm → generous py; center with mx-auto max-w-7xl px-6
Focus          → keep shadcn's focus-visible:ring-ring (never remove)
Font           → Poppins (inherited from body); huge & tight for heroes, calmer for dashboards
```
