# 03 — Code Standards

> Shared TypeScript and Next.js conventions that every file in the codebase must follow.  
> Consistency is non-negotiable — deviation creates maintenance debt.

---

## 1. General Principles

| Principle | Rule |
|-----------|------|
| **Small files** | Every file should do ONE thing. Max ~150 lines; if longer, split. |
| **Named exports** | Use named exports everywhere. Default exports only for Next.js page/layout files (framework requirement). |
| **No `any`** | TypeScript `any` is banned. Use `unknown` + type narrowing when the type is genuinely unknown. |
| **Explicit return types** | All functions and methods must declare explicit return types. |
| **Immutable by default** | Use `const` everywhere. `let` only when reassignment is truly needed. Never use `var`. |
| **Early returns** | Prefer guard clauses over deeply nested `if/else` trees. |
| **No magic values** | Numbers, strings, and config values go in `constants.ts` or `.env` — never inline. |

---

## 2. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files (components) | `PascalCase.tsx` | `StudentDashboard.tsx` |
| Files (non-components) | `kebab-case.ts` | `payment.service.ts` |
| React components | `PascalCase` | `ExamTimer` |
| Functions / variables | `camelCase` | `getStudentById` |
| Constants / env keys | `UPPER_SNAKE_CASE` | `MAX_UPLOAD_SIZE_MB` |
| Types / interfaces | `PascalCase` | `PaymentRecord` |
| Zod schemas | `camelCase` + `Schema` suffix | `createExamSchema` |
| Backend files | `domain.layer.ts` | `payment.controller.ts`, `payment.service.ts`, `payment.routes.ts` |
| Database enums | `UPPER_SNAKE_CASE` | `SUPER_ADMIN`, `PENDING` |

---

## 3. TypeScript Config

```jsonc
// tsconfig.json — key settings (both frontend and backend)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": false,  // too aggressive for Prisma types
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## 4. Frontend Standards (Next.js App Router)

### 4.1 File Colocation

```
src/app/(dashboard)/student/exams/
├── page.tsx          # Route component (server component by default)
├── ExamList.tsx      # Client component (add "use client" directive)
└── exam.actions.ts   # Server actions if needed
```

- **Server Components** by default. Only add `"use client"` when the component needs browser APIs, event handlers, or hooks.
- Keep `page.tsx` thin — it fetches data and delegates rendering to child components.

### 4.2 Data Fetching

| Pattern | When to Use |
|---------|-------------|
| `React Query (useQuery)` | Client-side data that needs caching, refetching, optimistic updates |
| `Server Components` (async) | Initial page loads where SEO matters or data is static |
| `Server Actions` | Form mutations that benefit from progressive enhancement |

### 4.3 State Management (Zustand)

- One store per domain: `useAuthStore`, `useExamStore`, `useNotificationStore`.
- Stores live in `src/lib/stores/`.
- Enable cross-tab sync via `BroadcastChannel` for exam state to prevent the multi-tab overwrite bug.

### 4.4 API Client (Axios)

- Single Axios instance in `src/lib/api.ts` with:
  - `baseURL` pointing to `api.academylms.com`
  - Request interceptor: attach JWT from cookie
  - Response interceptor: on `401`, trigger silent token refresh
  - `withCredentials: true` for HTTP-only cookies

### 4.5 Form Validation

```typescript
// Always define Zod schema FIRST, then infer the type
const createExamSchema = z.object({
  title: z.string().min(3).max(200),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});

type CreateExamInput = z.infer<typeof createExamSchema>;
```

- Same Zod schemas are shared with backend (via a shared `schemas/` folder or copy).
- React Hook Form uses `zodResolver` — no manual validation logic.

---

## 5. Backend Standards (Express + TypeScript)

### 5.1 Three-Tier File Naming

```
src/
├── routes/
│   └── payment.routes.ts     # router.post('/pay', ...middleware, controller.fn)
├── controllers/
│   └── payment.controller.ts # extract req → call service → send res
├── services/
│   └── payment.service.ts    # business logic + Prisma queries
```

### 5.2 Controller Pattern

```typescript
// payment.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as PaymentService from '@/services/payment.service';

export const processPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await PaymentService.processPayment(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error); // Global error handler catches it
  }
};
```

**Controller rules:**
- No `import { prisma }` — ever.
- No business logic — only extract, delegate, respond.
- Always wrap in try/catch → `next(error)`.

### 5.3 Service Pattern

```typescript
// payment.service.ts
import { prisma } from '@/config/database';

export const processPayment = async (
  data: ProcessPaymentInput
): Promise<PaymentRecord> => {
  // Business logic lives here
  const existing = await prisma.payment.findUnique({...});
  if (existing) throw new AppError('DUPLICATE_PAYMENT', 409);
  
  return prisma.payment.create({...});
};
```

**Service rules:**
- No `req` or `res` objects — receives plain data, returns plain data.
- This is the ONLY layer that imports Prisma.
- Throw typed `AppError` for known failure cases.

### 5.4 Error Handling

```typescript
// utils/app-error.ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message?: string
  ) {
    super(message ?? code);
  }
}
```

- All known errors throw `AppError` with a code and HTTP status.
- Global error handler in `index.ts` catches everything and returns uniform JSON:
  ```json
  { "status": "error", "message": "...", "code": "DUPLICATE_PAYMENT" }
  ```

### 5.5 Middleware Ordering

```typescript
// Route definition order:
router.post(
  '/pay',
  rateLimiter,          // 1. Rate limit first
  verifyToken,          // 2. Auth check
  requireRole('STUDENT'), // 3. Role guard
  validateBody(schema), // 4. Zod validation
  checkIdempotency,     // 5. Idempotency (on high-stakes routes only)
  controller.fn         // 6. Controller
);
```

---

## 6. Shared Conventions

### 6.1 Environment Variables

- All env vars are validated at startup via a Zod schema in `src/config/env.ts`.
- App crashes immediately on boot if any required variable is missing — fail fast.
- **Platform vs. provider settings (planned, [14](./14-multi-tenancy-readiness.md) §4):** `env.ts` keeps validating platform-level settings (database, Redis, JWT, encryption key). Provider credentials (Bunny, PayHere, Zoom, SMS, bank details) move to encrypted per-organization settings with an environment fallback for the default organization. Until then, read provider settings only through the existing utility modules (`utils/bunny.ts`, `utils/zoom.ts`, `utils/r2.ts`) so the refactor touches few files.

### 6.2 Logging

```typescript
import { logger } from '@/config/logger';

logger.info({ userId, action: 'PAYMENT_CREATED' }, 'Student payment processed');
logger.error({ err, userId }, 'Payment processing failed');
```

- Use **Pino** structured JSON logger — never `console.log` in production code. Request logging must
  redact authorization, request cookies, and response `Set-Cookie` headers; never log tokens,
  presigned credentials, passwords, or full identity documents.

- Direct-to-storage public display uploads must use a server-issued resource-bound key, then a
  separate confirmation request. Confirmation must reauthorize ownership, bound the fetched bytes,
  compare stored MIME to decoded content, enforce a pixel limit and full decode, check the product's
  exact dimensions, and only then build the public URL. Never accept an arbitrary client URL for a
  managed asset. Delete invalid, replaced, and removed tracked objects best-effort and audit the
  privileged lifecycle actions.
- Always include context object as first argument.

### 6.3 Date Handling

- All dates stored in PostgreSQL as UTC.
- Frontend converts to local timezone for display only.
- Use `date-fns` or native `Intl.DateTimeFormat` — no Moment.js.

### 6.4 Imports

```typescript
// Ordering (enforced by ESLint):
// 1. Node built-ins
// 2. External packages
// 3. Internal aliases (@/...)
// 4. Relative imports
// 5. Type imports (last)

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { PaymentRecord } from '@/types';
```

### 6.5 Git Conventions

| Type | Format | Example |
|------|--------|---------|
| Branch | `feat/`, `fix/`, `chore/` | `feat/exam-timer` |
| Commit | Conventional Commits | `feat(exams): add server-authoritative timer` |
| PR | One feature per PR | Squash-merge into `main` |

---

## 7. Linting & Formatting

| Tool | Purpose |
|------|---------|
| **ESLint** | TypeScript linting with `@typescript-eslint` recommended rules |
| **Prettier** | Code formatting (single quotes, trailing commas, 2-space indent) |
| **Husky + lint-staged** | Pre-commit hooks to auto-lint and format staged files |

```jsonc
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 100
}
```
