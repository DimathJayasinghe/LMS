# 05 — UI Context

> Design tokens, component conventions, and layout patterns for a coherent, premium user interface.

---

## 1. Design Philosophy

- **Clean and professional** — this is an educational platform, not a social media app.
- **Information-dense but not cluttered** — dashboards should surface key data at a glance.
- **Accessible** — WCAG 2.1 AA compliance minimum. Proper contrast ratios, keyboard navigation, screen reader labels.
- **Responsive** — desktop-first design, but all views must work on tablets and mobile browsers (no native app).

---

## 2. Color Palette

### 2.1 Core Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--color-primary` | `#4F46E5` (Indigo 600) | `#818CF8` (Indigo 400) | Primary actions, active nav items, links |
| `--color-primary-hover` | `#4338CA` (Indigo 700) | `#6366F1` (Indigo 500) | Button hover states |
| `--color-secondary` | `#0EA5E9` (Sky 500) | `#38BDF8` (Sky 400) | Secondary actions, info badges |
| `--color-accent` | `#F59E0B` (Amber 500) | `#FBBF24` (Amber 400) | Warnings, highlights, pending states |

### 2.2 Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-success` | `#10B981` | Payment confirmed, exam submitted, attendance present |
| `--color-error` | `#EF4444` | Failed payments, validation errors, absent |
| `--color-warning` | `#F59E0B` | Pending states, approaching deadlines |
| `--color-info` | `#3B82F6` | Informational banners, tooltips |

### 2.3 Neutrals

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--bg-primary` | `#FFFFFF` | `#0F172A` (Slate 900) | Main background |
| `--bg-secondary` | `#F8FAFC` (Slate 50) | `#1E293B` (Slate 800) | Card backgrounds, sidebar |
| `--bg-tertiary` | `#F1F5F9` (Slate 100) | `#334155` (Slate 700) | Input backgrounds, table stripes |
| `--text-primary` | `#0F172A` (Slate 900) | `#F8FAFC` (Slate 50) | Headings, body text |
| `--text-secondary` | `#64748B` (Slate 500) | `#94A3B8` (Slate 400) | Muted text, labels |
| `--border` | `#E2E8F0` (Slate 200) | `#334155` (Slate 700) | Card borders, dividers |

---

## 3. Typography

### 3.1 Font Stack

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

- Load **Inter** from Google Fonts via Next.js `next/font`.
- Monospace used only for exam timers and code-like displays.

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-xs` | 12px | 400 | 1.5 | Badges, captions |
| `--text-sm` | 14px | 400 | 1.5 | Table data, secondary text |
| `--text-base` | 16px | 400 | 1.6 | Body text, form inputs |
| `--text-lg` | 18px | 500 | 1.5 | Card titles, section headers |
| `--text-xl` | 20px | 600 | 1.4 | Page subtitles |
| `--text-2xl` | 24px | 700 | 1.3 | Page titles |
| `--text-3xl` | 30px | 700 | 1.2 | Dashboard hero stats |

---

## 4. Spacing & Layout

### 4.1 Spacing Scale

Based on 4px increments: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`

### 4.2 Dashboard Layout

```
┌──────────────────────────────────────────────────────┐
│  Top Bar (64px)  — Logo, role badge, notifications   │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│  Sidebar   │  Main Content Area                      │
│  (256px)   │  (fluid, max-width: 1280px, centered)   │
│            │                                         │
│  - Nav     │  ┌───────────────────────────────────┐  │
│  - Links   │  │  Page Header + Breadcrumbs        │  │
│  - Role    │  ├───────────────────────────────────┤  │
│    based   │  │                                   │  │
│            │  │  Page Content                     │  │
│            │  │                                   │  │
│            │  └───────────────────────────────────┘  │
│            │                                         │
└────────────┴─────────────────────────────────────────┘
```

- Sidebar collapses to a hamburger on screens < 1024px.
- Mobile: bottom navigation bar with 4 key actions.

### 4.3 Breakpoints

| Token | Value | Target |
|-------|-------|--------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet portrait |
| `lg` | 1024px | Tablet landscape / small laptop |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Large desktop |

---

## 5. Component Conventions

### 5.1 Component Structure

```
src/components/
├── ui/                   # Atomic UI primitives (Button, Input, Badge, Modal, etc.)
├── layout/               # Shell components (Sidebar, TopBar, PageHeader)
├── features/             # Domain-specific composites (ExamCard, PaymentTable, AttendanceScanner)
└── providers/            # Context providers (ThemeProvider, AuthProvider)
```

### 5.2 Component File Pattern

```tsx
// components/ui/Button.tsx
'use client';

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, children, className, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)} disabled={isLoading || props.disabled} {...props}>
        {isLoading ? <Spinner /> : children}
      </button>
    );
  }
);
Button.displayName = 'Button';
```

**Rules:**
- Every component uses `forwardRef` if it wraps a native HTML element.
- Use the `cn()` utility (clsx + tailwind-merge) for conditional class merging.
- Props interface defined above the component, not inline.

### 5.3 Core UI Components

| Component | Variants | Notes |
|-----------|----------|-------|
| `Button` | primary, secondary, ghost, danger × sm, md, lg | Loading spinner, disabled state |
| `Input` | text, email, password, search | Error state with Zod message display |
| `Badge` | success, error, warning, info, neutral | For statuses (PRESENT, ABSENT, PAID, PENDING) |
| `Card` | default, bordered, elevated | Wrapper with consistent padding and border-radius |
| `Modal` | default, confirm (danger) | Trap focus, close on Escape, portal-rendered |
| `Table` | — | Sortable headers, pagination, loading skeleton |
| `Toast` | success, error, warning, info | Auto-dismiss (5s), stackable, positioned top-right |
| `Skeleton` | line, circle, card | Shimmer animation for loading states |
| `EmptyState` | — | Illustration + message + action button |

---

## 6. Animation & Motion

### 6.1 Transitions

```css
--transition-fast: 150ms ease-in-out;
--transition-base: 200ms ease-in-out;
--transition-slow: 300ms ease-in-out;
```

- All interactive elements (buttons, links, cards) have `transition-base` on hover.
- Modals and drawers use `transition-slow` with `opacity` + `transform` for enter/exit.

### 6.2 Motion Rules

- **Respect `prefers-reduced-motion`** — disable all animations if the user has this OS setting enabled.
- No animations longer than 500ms — they should feel snappy, not theatrical.
- Loading spinners: simple rotating circle, not complex multi-element animations.

---

## 7. Status Badge Mapping

Consistent color mapping across the entire UI:

| Status | Badge Variant | Color |
|--------|--------------|-------|
| `PRESENT` | success | Green |
| `ABSENT` | error | Red |
| `PENDING` (payment) | warning | Amber |
| `SUCCESS` (payment) | success | Green |
| `FAILED` (payment) | error | Red |
| `UPLOADING` | info | Blue |
| `COMPLETED` (submission) | success | Green |
| `SENT` (SMS) | success | Green |
| `ACTIVE` (user) | success | Green |
| `INACTIVE` (user) | neutral | Gray |

---

## 8. Dark Mode

- Toggle stored in `localStorage` and synced via Zustand.
- CSS variables switch via `data-theme="dark"` on `<html>`.
- Default to system preference on first visit (`prefers-color-scheme` media query).
- All components must look correct in both modes — no hardcoded colors.

---

## 9. Icons

- Use **Lucide React** icon library (lightweight, tree-shakeable, consistent).
- Icon size follows the text size of its context (16px for body, 20px for headings).
- Always include `aria-label` on icon-only buttons.

---

## 10. Exam Timer Display

The exam timer is a critical, high-visibility component:

```
┌─────────────────────────────────┐
│  ⏱  01:23:45                   │
│     remaining                   │
└─────────────────────────────────┘
```

- Uses `--font-mono` for fixed-width digit rendering.
- Color transitions: Green (>50% time) → Amber (25-50%) → Red (<25%, pulsing).
- Timer is purely visual — server enforces the actual deadline.
- Sticky-positioned at top of exam page, always visible while scrolling.
