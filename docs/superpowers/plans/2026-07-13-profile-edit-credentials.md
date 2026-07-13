# Profile Edit + Credential Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every authenticated user a self-service `/profile` page to set a site-wide profile image, edit contact details, and change their email/password (each rate-limited to once per 7 days, current-password guarded).

**Architecture:** New `profile.service.ts` owns all `/users/me` self-service logic (the only layer importing `prisma` for these routes); a new `profile.controller.ts` + routes wire it in; credential ops reuse `bcrypt` and two newly-exported `auth.service` helpers. Avatars go to a **separate public R2 bucket** via the existing presign→confirm pattern and are stored as a stable public CDN URL. Frontend adds a `/profile` page, wires the avatar into `TopBar`, and adds a Profile entry to the user menu.

**Tech Stack:** Express + Prisma (Postgres) + Zod + Vitest (backend); Next.js 16 App Router + React Testing Library (frontend); Cloudflare R2 (S3 SDK).

## Global Constraints

- Three-tier: `routes` → `controllers` (zero Prisma imports) → `services` (only layer importing `@/config/database`'s `prisma`). Copied verbatim from CLAUDE.md.
- Response envelope: `{ "status": "success", "data": {}, "message"? }` / `{ "status": "success", "data": [], "count": 0 }` / `{ "status": "error", "message", "code" }`.
- Known failures throw `AppError(code, statusCode, message)` from `@/utils/app-error`.
- Soft deletes only; never hard-delete a model with relations.
- Every new implementation/behavioral change is backed by a Vitest unit test (§3.4) in addition to live-stack verification.
- Backend tests mock `@/config/database`'s `prisma` export and `@/utils/r2`.
- Conventional Commits; branch is `feature/profile-edit-credentials` (already created off `dev`).
- `noUncheckedIndexedAccess` is on — index access needs `?.`/`!`.
- Frontend: read `node_modules/next/dist/docs/` before writing Next.js code (this is Next 16, not training-data Next).

**Env-var note (adjustment from spec):** the spec named `R2_PUBLIC_BASE_URL`, but `env.ts` already declares an **unused** `R2_PUBLIC_URL`. Reuse that as the public base URL; only add `R2_PUBLIC_BUCKET_NAME`.

---

### Task 1: Schema, env, and constants

**Files:**
- Modify: `backend/prisma/schema.prisma:90-129` (User model)
- Modify: `backend/src/config/env.ts:35-40` (R2 block)
- Modify: `backend/src/utils/constants.ts` (add avatar + cooldown constants)

**Interfaces:**
- Produces: `User.profileImage`, `User.emailChangedAt`, `User.passwordChangedAt` columns; `env.R2_PUBLIC_BUCKET_NAME`, `env.R2_PUBLIC_URL`; constants `AVATAR_IMAGE_CONTENT_TYPES`, `AVATAR_IMAGE_MAX_SIZE_BYTES`, `CREDENTIAL_CHANGE_COOLDOWN_MS`.

- [ ] **Step 1: Add User columns.** In `schema.prisma`, inside `model User` after the `nicBackUrl` line (107), add:

```prisma
  profileImage      String? // public CDN URL of the avatar (public bucket)
  emailChangedAt    DateTime? // cooldown anchor — self email changes
  passwordChangedAt DateTime? // cooldown anchor — self password changes
```

- [ ] **Step 2: Add env vars.** In `env.ts`, after `R2_PUBLIC_URL: z.string().default(''),` (line 40) add:

```ts
  R2_PUBLIC_BUCKET_NAME: z.string().default(''),
```

- [ ] **Step 3: Add constants.** In `backend/src/utils/constants.ts`, add near the NIC image constants:

```ts
/** Allowed content types for a profile avatar upload. */
export const AVATAR_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Max avatar size — 5 MB. */
export const AVATAR_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
/** Minimum gap between self email/password changes — 7 days. */
export const CREDENTIAL_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
```

- [ ] **Step 4: Generate the migration + client.**

Run: `cd backend && npx prisma migrate dev --name profile_fields_and_credential_cooldown`
Expected: migration created and applied; `npx prisma generate` runs. If the DB isn't reachable locally, run inside the stack: `docker compose exec backend npx prisma migrate dev --name profile_fields_and_credential_cooldown`.

- [ ] **Step 5: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (new fields/env compile).

- [ ] **Step 6: Commit.**

```bash
git add backend/prisma backend/src/config/env.ts backend/src/utils/constants.ts
git commit -m "feat(profile): add avatar + credential-cooldown schema, env, constants"
```

---

### Task 2: Public-bucket R2 helpers

**Files:**
- Modify: `backend/src/utils/r2.ts`

**Interfaces:**
- Consumes: `env.R2_PUBLIC_BUCKET_NAME`, `env.R2_PUBLIC_URL`.
- Produces: `createR2PresignedPutUrl(key, contentType, expiresInSeconds, bucket?)`, `r2HeadObject(key, bucket?)` (both gain an optional bucket arg, default `env.R2_BUCKET_NAME` — existing callers unchanged); `getPublicAvatarConfig(): { bucket: string; publicBaseUrl: string }` (throws `503 R2_NOT_CONFIGURED` when unset); `deleteR2Object(key, bucket?)`.

- [ ] **Step 1: Parameterize the two helpers by bucket.** In `r2.ts`, change the `PutObjectCommand`/`HeadObjectCommand` to take an optional bucket. Replace the `createR2PresignedPutUrl` signature/body:

```ts
export const createR2PresignedPutUrl = async (
  key: string,
  contentType: string,
  expiresInSeconds: number,
  bucket: string = env.R2_BUCKET_NAME,
): Promise<string> => {
  const client = getR2Client();
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
};
```

And `r2HeadObject`:

```ts
export const r2HeadObject = async (
  key: string,
  bucket: string = env.R2_BUCKET_NAME,
): Promise<{ exists: boolean; size?: number; contentType?: string }> => {
  const client = getR2Client();
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { exists: true, size: res.ContentLength, contentType: res.ContentType };
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (err as { name?: string })?.name;
    if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return { exists: false };
    throw err;
  }
};
```

- [ ] **Step 2: Add public-avatar config + delete helper.** Append to `r2.ts` (add `DeleteObjectCommand` to the import on line 1):

```ts
/**
 * Resolves the *public* avatar bucket + its public base URL. Avatars are served
 * from a separate public bucket (the main `lms` bucket is private — NIC/exam PDFs),
 * so this throws 503 until both env vars are set (and the bucket is made public in
 * the Cloudflare dashboard — the app's S3 key cannot enable public access itself).
 */
export const getPublicAvatarConfig = (): { bucket: string; publicBaseUrl: string } => {
  ensureR2Configured();
  if (!env.R2_PUBLIC_BUCKET_NAME || !env.R2_PUBLIC_URL) {
    throw new AppError(
      'R2_NOT_CONFIGURED',
      503,
      'Public avatar storage is not configured (R2_PUBLIC_BUCKET_NAME / R2_PUBLIC_URL).',
    );
  }
  return { bucket: env.R2_PUBLIC_BUCKET_NAME, publicBaseUrl: env.R2_PUBLIC_URL.replace(/\/+$/, '') };
};

/** Best-effort object delete (used when replacing/removing an avatar). */
export const deleteR2Object = async (key: string, bucket: string = env.R2_BUCKET_NAME): Promise<void> => {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
};
```

- [ ] **Step 3: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add backend/src/utils/r2.ts
git commit -m "feat(profile): public-bucket R2 helpers for avatars"
```

---

### Task 3: Zod schemas

**Files:**
- Create: `backend/src/schemas/profile.schema.ts`

**Interfaces:**
- Consumes: `AVATAR_IMAGE_CONTENT_TYPES`, `AVATAR_IMAGE_MAX_SIZE_BYTES` from constants.
- Produces: `updateProfileSchema`/`UpdateProfileInput`, `avatarUploadUrlSchema`/`AvatarUploadUrlInput`, `avatarConfirmSchema`/`AvatarConfirmInput`, `changeEmailSchema`/`ChangeEmailInput`, `changePasswordSchema`/`ChangePasswordInput`.

- [ ] **Step 1: Write the file.**

```ts
import { z } from 'zod';
import { AVATAR_IMAGE_CONTENT_TYPES, AVATAR_IMAGE_MAX_SIZE_BYTES } from '@/utils/constants';

// Contact-only self edits. NIC, name, email, role are intentionally NOT accepted here.
export const updateProfileSchema = z
  .object({
    phone: z.string().trim().min(3).max(30).nullish(),
    address: z.string().trim().min(1).max(300).nullish(),
    city: z.string().trim().min(1).max(120).nullish(),
  })
  .strict(); // reject any unexpected key (e.g. a smuggled `role`/`nic`)

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const avatarUploadUrlSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i, 'File name must be a .jpg/.jpeg/.png/.webp without spaces.'),
  contentType: z.enum(AVATAR_IMAGE_CONTENT_TYPES),
  fileSizeBytes: z.coerce.number().int().positive().max(AVATAR_IMAGE_MAX_SIZE_BYTES),
});

export type AvatarUploadUrlInput = z.infer<typeof avatarUploadUrlSchema>;

export const avatarConfirmSchema = z.object({
  key: z.string().trim().min(1).max(300),
});

export type AvatarConfirmInput = z.infer<typeof avatarConfirmSchema>;

export const changeEmailSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newEmail: z.string().trim().toLowerCase().email().max(255),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 2: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add backend/src/schemas/profile.schema.ts
git commit -m "feat(profile): zod schemas for profile + credential endpoints"
```

---

### Task 4: Export auth token helpers + shared cookie helper

**Files:**
- Modify: `backend/src/services/auth.service.ts` (export two helpers)
- Create: `backend/src/utils/auth-cookies.ts` (shared cookie set/clear)
- Modify: `backend/src/controllers/auth.controller.ts:14-32` (use the shared helper)

**Interfaces:**
- Produces (auth.service): `issueTokenPair(userId: string, role: string): Promise<AuthTokens>` where `AuthTokens = { accessToken: string; refreshToken: string }`; `revokeAllRefreshTokens(userId: string): Promise<void>`.
- Produces (utils/auth-cookies): `setAuthCookies(res, accessToken, refreshToken): void`, `clearAuthCookies(res): void`.

- [ ] **Step 1: Export `issueTokenPair` + `revokeAllRefreshTokens`.** In `auth.service.ts`, rename the private `generateAndStoreTokens` to an exported `issueTokenPair` (keep the body identical) and update its 3 call sites (`register`, `login`, `refreshTokens`) to call `issueTokenPair`. Then add:

```ts
/** Deletes every refresh-token row for a user (used on password change). */
export const revokeAllRefreshTokens = async (userId: string): Promise<void> => {
  await prisma.refreshToken.deleteMany({ where: { userId } });
};
```

- [ ] **Step 2: Create the shared cookie helper.** `backend/src/utils/auth-cookies.ts`:

```ts
import type { Response } from 'express';
import { COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN, COOKIE_OPTIONS } from '@/utils/constants';
import { getCookieMaxAge } from '@/services/auth.service';

/** Sets both access + refresh token cookies (refresh scoped to /api/auth). */
export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  const { accessMaxAge, refreshMaxAge } = getCookieMaxAge();
  res.cookie(COOKIE_ACCESS_TOKEN, accessToken, { ...COOKIE_OPTIONS, maxAge: accessMaxAge });
  res.cookie(COOKIE_REFRESH_TOKEN, refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: refreshMaxAge,
    path: '/api/auth',
  });
};

/** Clears both auth cookies. */
export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(COOKIE_ACCESS_TOKEN, COOKIE_OPTIONS);
  res.clearCookie(COOKIE_REFRESH_TOKEN, { ...COOKIE_OPTIONS, path: '/api/auth' });
};
```

- [ ] **Step 3: Reuse it in auth.controller.** In `auth.controller.ts`, delete the local `setAuthCookies`/`clearAuthCookies` definitions (lines 14-32) and import them instead:

```ts
import { setAuthCookies, clearAuthCookies } from '../utils/auth-cookies';
```

(Leave all call sites as-is — same names/signatures.)

- [ ] **Step 4: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run existing auth tests to prove the refactor is behavior-preserving.**

Run: `cd backend && npm run test -- auth`
Expected: PASS (existing auth service/controller tests unchanged).

- [ ] **Step 6: Commit.**

```bash
git add backend/src/services/auth.service.ts backend/src/utils/auth-cookies.ts backend/src/controllers/auth.controller.ts
git commit -m "refactor(auth): export issueTokenPair/revokeAllRefreshTokens + shared cookie helper"
```

---

### Task 5: profile.service — write tests first, then implement

**Files:**
- Create: `backend/src/services/profile.service.ts`
- Create: `backend/src/services/profile.service.test.ts`
- Modify: `backend/src/services/auth.service.ts` (getMe + SafeUser + toSafeUser add fields)

**Interfaces:**
- Consumes: `createR2PresignedPutUrl`, `r2HeadObject`, `getPublicAvatarConfig`, `deleteR2Object` (r2.ts); `issueTokenPair`, `revokeAllRefreshTokens` (auth.service); `CREDENTIAL_CHANGE_COOLDOWN_MS`, avatar constants.
- Produces:
  - `updateProfile(userId: string, input: UpdateProfileInput): Promise<SafeUser>`
  - `generateAvatarUploadUrl(userId, input: AvatarUploadUrlInput): Promise<{ uploadUrl: string; key: string; expiresAt: string }>`
  - `confirmAvatar(userId, input: AvatarConfirmInput): Promise<{ profileImage: string }>`
  - `removeAvatar(userId): Promise<void>`
  - `changeEmail(userId, input: ChangeEmailInput): Promise<SafeUser>`
  - `changePassword(userId, input: ChangePasswordInput): Promise<{ tokens: { accessToken: string; refreshToken: string } }>`

- [ ] **Step 1: Write the failing test file.** `backend/src/services/profile.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  userFindUnique, userUpdate, r2Head, r2Put, avatarConfig, delObj,
  compare, hash, revokeAll, issuePair,
} = vi.hoisted(() => ({
  userFindUnique: vi.fn(), userUpdate: vi.fn(),
  r2Head: vi.fn(), r2Put: vi.fn(), avatarConfig: vi.fn(), delObj: vi.fn(),
  compare: vi.fn(), hash: vi.fn(),
  revokeAll: vi.fn(), issuePair: vi.fn(),
}));

vi.mock('@/config/database', () => ({
  prisma: { user: { findUnique: userFindUnique, update: userUpdate } },
}));
vi.mock('@/utils/r2', () => ({
  createR2PresignedPutUrl: r2Put,
  r2HeadObject: r2Head,
  getPublicAvatarConfig: avatarConfig,
  deleteR2Object: delObj,
}));
vi.mock('bcryptjs', () => ({ default: { compare, hash } }));
vi.mock('@/services/auth.service', () => ({
  revokeAllRefreshTokens: revokeAll,
  issueTokenPair: issuePair,
}));

import {
  updateProfile, confirmAvatar, changeEmail, changePassword,
} from './profile.service';

const OLD = new Date('2020-01-01T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  r2Head.mockResolvedValue({ exists: true });
  avatarConfig.mockReturnValue({ bucket: 'lms-public', publicBaseUrl: 'https://cdn.example' });
  compare.mockResolvedValue(true);
  hash.mockResolvedValue('new-hash');
  issuePair.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
  userUpdate.mockResolvedValue({ id: 'u1' });
});

describe('updateProfile', () => {
  it('writes only contact fields', async () => {
    userUpdate.mockResolvedValueOnce({ id: 'u1', phone: '123' });
    await updateProfile('u1', { phone: '123', address: 'A', city: 'C' });
    const data = userUpdate.mock.calls[0]![0].data;
    expect(Object.keys(data).sort()).toEqual(['address', 'city', 'phone']);
    expect(data).not.toHaveProperty('role');
    expect(data).not.toHaveProperty('nic');
  });
});

describe('confirmAvatar', () => {
  it('rejects a key not under the caller prefix (before HEAD)', async () => {
    await expect(confirmAvatar('u1', { key: 'avatars/other/x.jpg' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN_KEY', statusCode: 403 });
    expect(r2Head).not.toHaveBeenCalled();
  });
  it('409s when the object never landed', async () => {
    r2Head.mockResolvedValueOnce({ exists: false });
    await expect(confirmAvatar('u1', { key: 'avatars/u1/x.jpg' }))
      .rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', statusCode: 409 });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it('persists the public URL', async () => {
    const res = await confirmAvatar('u1', { key: 'avatars/u1/x.jpg' });
    expect(res).toEqual({ profileImage: 'https://cdn.example/avatars/u1/x.jpg' });
    expect(userUpdate.mock.calls[0]![0].data.profileImage).toBe('https://cdn.example/avatars/u1/x.jpg');
  });
});

describe('changeEmail', () => {
  const user = (over = {}) => ({ id: 'u1', email: 'old@x.com', password: 'h', role: 'STUDENT', emailChangedAt: null, ...over });
  it('401 on wrong current password, before cooldown', async () => {
    userFindUnique.mockResolvedValueOnce(user());
    compare.mockResolvedValueOnce(false);
    await expect(changeEmail('u1', { currentPassword: 'bad', newEmail: 'new@x.com' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it('429 when within the cooldown window', async () => {
    userFindUnique.mockResolvedValueOnce(user({ emailChangedAt: new Date() }));
    await expect(changeEmail('u1', { currentPassword: 'ok', newEmail: 'new@x.com' }))
      .rejects.toMatchObject({ code: 'EMAIL_CHANGE_TOO_SOON', statusCode: 429 });
  });
  it('400 SAME_EMAIL without consuming the window', async () => {
    userFindUnique.mockResolvedValueOnce(user({ emailChangedAt: OLD }));
    await expect(changeEmail('u1', { currentPassword: 'ok', newEmail: 'old@x.com' }))
      .rejects.toMatchObject({ code: 'SAME_EMAIL', statusCode: 400 });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it('409 when the new email is taken', async () => {
    userFindUnique.mockResolvedValueOnce(user({ emailChangedAt: OLD }));
    userFindUnique.mockResolvedValueOnce({ id: 'other' }); // uniqueness probe
    await expect(changeEmail('u1', { currentPassword: 'ok', newEmail: 'taken@x.com' }))
      .rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it('updates email + emailChangedAt on success', async () => {
    userFindUnique.mockResolvedValueOnce(user({ emailChangedAt: OLD }));
    userFindUnique.mockResolvedValueOnce(null); // free
    await changeEmail('u1', { currentPassword: 'ok', newEmail: 'new@x.com' });
    const data = userUpdate.mock.calls[0]![0].data;
    expect(data.email).toBe('new@x.com');
    expect(data.emailChangedAt).toBeInstanceOf(Date);
  });
});

describe('changePassword', () => {
  const user = (over = {}) => ({ id: 'u1', password: 'h', role: 'STUDENT', passwordChangedAt: null, ...over });
  it('401 on wrong current password', async () => {
    userFindUnique.mockResolvedValueOnce(user());
    compare.mockResolvedValueOnce(false);
    await expect(changePassword('u1', { currentPassword: 'bad', newPassword: 'longenough' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });
  it('429 within cooldown', async () => {
    userFindUnique.mockResolvedValueOnce(user({ passwordChangedAt: new Date() }));
    await expect(changePassword('u1', { currentPassword: 'ok', newPassword: 'longenough' }))
      .rejects.toMatchObject({ code: 'PASSWORD_CHANGE_TOO_SOON', statusCode: 429 });
  });
  it('400 SAME_PASSWORD (new equals current) without consuming window', async () => {
    userFindUnique.mockResolvedValueOnce(user({ passwordChangedAt: OLD }));
    compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true); // current ok, new == current
    await expect(changePassword('u1', { currentPassword: 'ok', newPassword: 'ok-longenough' }))
      .rejects.toMatchObject({ code: 'SAME_PASSWORD', statusCode: 400 });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it('hashes, sets passwordChangedAt, revokes tokens, reissues on success', async () => {
    userFindUnique.mockResolvedValueOnce(user({ passwordChangedAt: OLD }));
    compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // current ok, new != current
    const res = await changePassword('u1', { currentPassword: 'ok', newPassword: 'brand-new-pass' });
    const data = userUpdate.mock.calls[0]![0].data;
    expect(data.password).toBe('new-hash');
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    expect(revokeAll).toHaveBeenCalledWith('u1');
    expect(issuePair).toHaveBeenCalledWith('u1', 'STUDENT');
    expect(res).toEqual({ tokens: { accessToken: 'a', refreshToken: 'r' } });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails (module not found).**

Run: `cd backend && npm run test -- profile.service`
Expected: FAIL — `profile.service` has no exports yet.

- [ ] **Step 3: Implement `profile.service.ts`.**

```ts
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import {
  createR2PresignedPutUrl,
  r2HeadObject,
  getPublicAvatarConfig,
  deleteR2Object,
} from '@/utils/r2';
import { issueTokenPair, revokeAllRefreshTokens } from '@/services/auth.service';
import { CREDENTIAL_CHANGE_COOLDOWN_MS } from '@/utils/constants';
import type {
  UpdateProfileInput,
  AvatarUploadUrlInput,
  AvatarConfirmInput,
  ChangeEmailInput,
  ChangePasswordInput,
} from '@/schemas/profile.schema';

const BCRYPT_SALT_ROUNDS = 12;
const AVATAR_PRESIGN_TTL = 15 * 60; // 15 min

// Public-safe self shape (mirrors auth.service SafeUser fields the profile page needs).
const selfSelect = {
  id: true, indexNumber: true, email: true, name: true, role: true,
  phone: true, nic: true, address: true, city: true, barcode: true,
  profileImage: true, emailChangedAt: true, passwordChangedAt: true,
  setupCompleted: true, createdAt: true,
} as const;

export const updateProfile = async (userId: string, input: UpdateProfileInput) => {
  // Only contact fields — `.strict()` on the schema already rejects extras, but we
  // also build `data` explicitly so nothing else can ever reach Prisma.
  const data: Record<string, unknown> = {};
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.address !== undefined) data.address = input.address;
  if (input.city !== undefined) data.city = input.city;
  return prisma.user.update({ where: { id: userId }, data, select: selfSelect });
};

export const generateAvatarUploadUrl = async (userId: string, input: AvatarUploadUrlInput) => {
  const { bucket } = getPublicAvatarConfig();
  const ext = input.fileName.split('.').pop()!.toLowerCase();
  const key = `avatars/${userId}/${randomUUID()}.${ext}`;
  const uploadUrl = await createR2PresignedPutUrl(key, input.contentType, AVATAR_PRESIGN_TTL, bucket);
  return {
    uploadUrl,
    key,
    expiresAt: new Date(Date.now() + AVATAR_PRESIGN_TTL * 1000).toISOString(),
  };
};

export const confirmAvatar = async (userId: string, input: AvatarConfirmInput) => {
  const prefix = `avatars/${userId}/`;
  if (!input.key.startsWith(prefix)) {
    throw new AppError('FORBIDDEN_KEY', 403, 'This upload key does not belong to you.');
  }
  const { bucket, publicBaseUrl } = getPublicAvatarConfig();
  const head = await r2HeadObject(input.key, bucket);
  if (!head.exists) {
    throw new AppError('UPLOAD_NOT_FOUND', 409, 'The uploaded image was not found. Please re-upload.');
  }
  const profileImage = `${publicBaseUrl}/${input.key}`;
  await prisma.user.update({ where: { id: userId }, data: { profileImage } });
  return { profileImage };
};

export const removeAvatar = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { profileImage: true } });
  await prisma.user.update({ where: { id: userId }, data: { profileImage: null } });
  // Best-effort object delete — never fail the request if the object is already gone.
  if (user?.profileImage) {
    try {
      const { bucket, publicBaseUrl } = getPublicAvatarConfig();
      const key = user.profileImage.replace(`${publicBaseUrl}/`, '');
      if (key && key !== user.profileImage) await deleteR2Object(key, bucket);
    } catch {
      /* ignore */
    }
  }
};

const assertCooldown = (last: Date | null, code: string): void => {
  if (!last) return;
  const nextAllowed = last.getTime() + CREDENTIAL_CHANGE_COOLDOWN_MS;
  if (Date.now() < nextAllowed) {
    const when = new Date(nextAllowed).toLocaleDateString();
    throw new AppError(code, 429, `You changed this too recently. You can change it again on ${when}.`);
  }
};

export const changeEmail = async (userId: string, input: ChangeEmailInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User not found.');

  const ok = await bcrypt.compare(input.currentPassword, user.password);
  if (!ok) throw new AppError('INVALID_CREDENTIALS', 401, 'Current password is incorrect.');

  assertCooldown(user.emailChangedAt, 'EMAIL_CHANGE_TOO_SOON');

  if (input.newEmail === user.email.toLowerCase()) {
    throw new AppError('SAME_EMAIL', 400, 'That is already your email address.');
  }

  const existing = await prisma.user.findUnique({ where: { email: input.newEmail } });
  if (existing) throw new AppError('EMAIL_ALREADY_EXISTS', 409, 'An account with this email already exists.');

  return prisma.user.update({
    where: { id: userId },
    data: { email: input.newEmail, emailChangedAt: new Date() },
    select: selfSelect,
  });
};

export const changePassword = async (userId: string, input: ChangePasswordInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User not found.');

  const ok = await bcrypt.compare(input.currentPassword, user.password);
  if (!ok) throw new AppError('INVALID_CREDENTIALS', 401, 'Current password is incorrect.');

  assertCooldown(user.passwordChangedAt, 'PASSWORD_CHANGE_TOO_SOON');

  const same = await bcrypt.compare(input.newPassword, user.password);
  if (same) throw new AppError('SAME_PASSWORD', 400, 'The new password must differ from the current one.');

  const hashed = await bcrypt.hash(input.newPassword, BCRYPT_SALT_ROUNDS);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed, passwordChangedAt: new Date() },
  });

  // Invalidate every session, then hand the current caller a fresh pair.
  await revokeAllRefreshTokens(userId);
  const tokens = await issueTokenPair(userId, user.role);
  return { tokens };
};
```

> Note: `AppError` is `(code, statusCode, message)` only — no metadata arg (verified). The `429` message embeds the next-allowed date; the frontend independently derives the exact lock date from `emailChangedAt`/`passwordChangedAt` in `/auth/me` (Task 9 Step 5), so no structured `nextAllowedAt` field is needed in the error body.

- [ ] **Step 4: Add self fields to `auth.service` getMe.** In `auth.service.ts`, add `profileImage: true, emailChangedAt: true, passwordChangedAt: true` to the `getMe` select; add `profileImage`, `emailChangedAt`, `passwordChangedAt` to the `SafeUser` interface (as `string | null` / `Date | null`) and to `toSafeUser`'s param + return; and in `getMe`'s return object append `emailChangedAt: user.emailChangedAt, passwordChangedAt: user.passwordChangedAt`. Ensure `profileImage` flows through `toSafeUser`.

- [ ] **Step 5: Run the tests to green.**

Run: `cd backend && npm run test -- profile.service`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/services/profile.service.ts backend/src/services/profile.service.test.ts backend/src/services/auth.service.ts
git commit -m "feat(profile): profile.service (contact, avatar, email/password) + getMe fields"
```

---

### Task 6: Controller + routes

**Files:**
- Create: `backend/src/controllers/profile.controller.ts`
- Modify: `backend/src/routes/user.routes.ts` (wire the new `/me` routes)

**Interfaces:**
- Consumes: profile.service exports; `setAuthCookies` (utils/auth-cookies); profile schemas.
- Produces: routes `PATCH /api/users/me/profile`, `POST /api/users/me/avatar/upload-url`, `POST /api/users/me/avatar/confirm`, `DELETE /api/users/me/avatar`, `PATCH /api/users/me/email`, `PATCH /api/users/me/password`.

- [ ] **Step 1: Write the controller.** `backend/src/controllers/profile.controller.ts`:

```ts
import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as ProfileService from '@/services/profile.service';
import { setAuthCookies } from '@/utils/auth-cookies';
import type {
  UpdateProfileInput,
  AvatarUploadUrlInput,
  AvatarConfirmInput,
  ChangeEmailInput,
  ChangePasswordInput,
} from '@/schemas/profile.schema';

export const updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const data = await ProfileService.updateProfile(req.user!.userId, req.body as UpdateProfileInput);
  res.status(200).json({ status: 'success', data, message: 'Profile updated.' });
});

export const getAvatarUploadUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const data = await ProfileService.generateAvatarUploadUrl(req.user!.userId, req.body as AvatarUploadUrlInput);
  res.status(200).json({ status: 'success', data });
});

export const confirmAvatar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const data = await ProfileService.confirmAvatar(req.user!.userId, req.body as AvatarConfirmInput);
  res.status(200).json({ status: 'success', data, message: 'Profile photo updated.' });
});

export const removeAvatar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  await ProfileService.removeAvatar(req.user!.userId);
  res.status(200).json({ status: 'success', data: { profileImage: null }, message: 'Profile photo removed.' });
});

export const changeEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const data = await ProfileService.changeEmail(req.user!.userId, req.body as ChangeEmailInput);
  res.status(200).json({ status: 'success', data, message: 'Email updated.' });
});

export const changePassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { tokens } = await ProfileService.changePassword(req.user!.userId, req.body as ChangePasswordInput);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.status(200).json({ status: 'success', data: null, message: 'Password updated. Other sessions were signed out.' });
});
```

> Verify `req.user` is the shape `verifyToken` attaches (it carries `userId` + `role` — see `auth.middleware.ts`). Match its property name exactly (`req.user!.userId`).

- [ ] **Step 2: Wire routes.** In `user.routes.ts`, add imports and routes. Add to the `@/schemas/user.schema` import block a separate import from profile schemas, add `* as ProfileController`, and insert these routes **above** the `/:id` routes (so `/me/...` isn't shadowed):

```ts
import * as ProfileController from '@/controllers/profile.controller';
import {
  updateProfileSchema,
  avatarUploadUrlSchema,
  avatarConfirmSchema,
  changeEmailSchema,
  changePasswordSchema,
} from '@/schemas/profile.schema';

// ─── Profile self-service (any authenticated role) ─────────
userRoutes.patch('/me/profile', verifyToken, validateBody(updateProfileSchema), ProfileController.updateProfile);
userRoutes.post('/me/avatar/upload-url', verifyToken, validateBody(avatarUploadUrlSchema), ProfileController.getAvatarUploadUrl);
userRoutes.post('/me/avatar/confirm', verifyToken, validateBody(avatarConfirmSchema), ProfileController.confirmAvatar);
userRoutes.delete('/me/avatar', verifyToken, ProfileController.removeAvatar);
userRoutes.patch('/me/email', verifyToken, validateBody(changeEmailSchema), ProfileController.changeEmail);
userRoutes.patch('/me/password', verifyToken, validateBody(changePasswordSchema), ProfileController.changePassword);
```

- [ ] **Step 3: Typecheck + full backend test run.**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS (all suites, including the new profile tests).

- [ ] **Step 4: Commit.**

```bash
git add backend/src/controllers/profile.controller.ts backend/src/routes/user.routes.ts
git commit -m "feat(profile): controller + /users/me routes"
```

---

### Task 7: Backend endpoint docs

**Files:**
- Create: `context/api_endpoints/profile.endpoints.md`

- [ ] **Step 1: Write the doc** covering the 6 endpoints, the request/response shapes above, the error codes (`FORBIDDEN_KEY` 403, `UPLOAD_NOT_FOUND` 409, `INVALID_CREDENTIALS` 401, `EMAIL_CHANGE_TOO_SOON`/`PASSWORD_CHANGE_TOO_SOON` 429 — next-allowed date is in the message and derivable from `emailChangedAt`/`passwordChangedAt` on `/auth/me`, `SAME_EMAIL`/`SAME_PASSWORD` 400, `EMAIL_ALREADY_EXISTS` 409, `R2_NOT_CONFIGURED` 503), the public-bucket + Cloudflare-dashboard requirement, the 7-day cooldown, and that password change revokes all sessions and reissues cookies. Follow the structure of `context/api_endpoints/account-setup.endpoints.md`.

- [ ] **Step 2: Commit.**

```bash
git add context/api_endpoints/profile.endpoints.md
git commit -m "docs: profile + credential-management endpoints"
```

---

### Task 8: Frontend types + API wiring

**Files:**
- Modify: `frontend/lib/types.ts:41-57` (User) + add result types

**Interfaces:**
- Produces: `User.profileImage`, `User.address`, `User.city`, `User.emailChangedAt`, `User.passwordChangedAt`; `AvatarUploadUrlResult`.

- [ ] **Step 1: Extend `User`** (add after `createdAt`):

```ts
  address?: string | null;
  city?: string | null;
  profileImage?: string | null;
  emailChangedAt?: string | null;
  passwordChangedAt?: string | null;
```

- [ ] **Step 2: Add the avatar result type** near `NicUploadUrlResult`:

```ts
/** Signed direct-to-public-R2 avatar upload (POST /users/me/avatar/upload-url). */
export interface AvatarUploadUrlResult {
  uploadUrl: string;
  key: string;
  expiresAt: string;
}
```

- [ ] **Step 3: Typecheck.**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add frontend/lib/types.ts
git commit -m "feat(profile): frontend types for profile fields + avatar upload"
```

---

### Task 9: Profile page + components

**Files:**
- Create: `frontend/app/(app)/profile/page.tsx` (SSR loads `/auth/me`)
- Create: `frontend/app/(app)/profile/_components/ProfileClient.tsx` (tabs/sections shell, client)
- Create: `frontend/app/(app)/profile/_components/AvatarUpload.tsx`
- Create: `frontend/app/(app)/profile/_components/ContactForm.tsx`
- Create: `frontend/app/(app)/profile/_components/CredentialForms.tsx`

**Interfaces:**
- Consumes: `api` (`get/post/patch/del`), `User`, `AvatarUploadUrlResult`, `ApiSuccess`, `Avatar/AvatarImage/AvatarFallback`.

- [ ] **Step 1: Read the Next 16 docs for the App Router page/data-fetch conventions.**

Run: `ls frontend/node_modules/next/dist/docs/ && sed -n '1,60p' frontend/app/(app)/dashboard/page.tsx`
Expected: confirms the `cookies()` + `api.get("/auth/me", { cookie })` SSR pattern to mirror.

- [ ] **Step 2: Write `page.tsx`** (SSR — mirror dashboard):

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { api } from "@/lib/api";
import type { ApiSuccess, User } from "@/lib/types";
import { ProfileClient } from "./_components/ProfileClient";

export default async function ProfilePage() {
  const cookie = (await cookies()).toString();
  let user: User;
  try {
    user = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <PageHeader title="Profile" description="Manage your photo, contact details, and sign-in credentials." />
      <ProfileClient user={user} />
    </div>
  );
}
```

- [ ] **Step 3: Write `AvatarUpload.tsx`** — presign → PUT → confirm → preview, mirroring `AccountSetupForm`'s handler (object-URL preview, revoke on unmount, "Upload failed" on non-ok PUT), plus a Remove button calling `api.del("/users/me/avatar")`. Renders `Avatar` with `AvatarImage src={preview ?? user.profileImage ?? undefined}` and initials fallback. Signature: `function AvatarUpload({ user }: { user: User })`. Include:

```tsx
const res = await api.post<ApiSuccess<AvatarUploadUrlResult>>("/users/me/avatar/upload-url", {
  fileName: file.name, contentType: file.type, fileSizeBytes: file.size,
});
const put = await fetch(res.data.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
if (!put.ok) { setError("Upload failed"); return; }
const confirmed = await api.post<ApiSuccess<{ profileImage: string }>>("/users/me/avatar/confirm", { key: res.data.key });
setPreview(URL.createObjectURL(file)); // or use confirmed.data.profileImage
router.refresh(); // so TopBar picks up the new avatar
```

- [ ] **Step 4: Write `ContactForm.tsx`** — controlled inputs for `phone`, `address`, `city` (initial from `user`), read-only `name` + `nic` displayed above, submit → `api.patch("/users/me/profile", { phone, address, city })`, success/error toast, `router.refresh()`. Signature: `function ContactForm({ user }: { user: User })`.

- [ ] **Step 5: Write `CredentialForms.tsx`** — two forms. Email: `currentPassword` + `newEmail` → `api.patch("/users/me/email", …)`. Password: `currentPassword` + `newPassword` (+ confirm field, client-side match check) → `api.patch("/users/me/password", …)` then on success `router.push("/auth/login")` is NOT needed (cookies reissued) — show "Password changed; other devices signed out." Each form computes a cooldown lock: if `user.emailChangedAt`/`passwordChangedAt` is within 7 days, disable submit and show "You can change this again on `<date + 7d>`". On a `429` `ApiError`, surface the message. Signature: `function CredentialForms({ user }: { user: User })`.

- [ ] **Step 6: Write `ProfileClient.tsx`** — a client component composing `AvatarUpload`, `ContactForm`, `CredentialForms` in cards/sections. Signature: `export function ProfileClient({ user }: { user: User })`.

- [ ] **Step 7: Typecheck + build.**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: PASS; `/profile` appears in the route manifest.

- [ ] **Step 8: Commit.**

```bash
git add "frontend/app/(app)/profile"
git commit -m "feat(profile): /profile page (avatar, contact, credentials)"
```

---

### Task 10: TopBar — avatar image + Profile menu link

**Files:**
- Modify: `frontend/components/custom/TopBar.tsx`

- [ ] **Step 1: Show the avatar image.** Import `AvatarImage` and add it inside the `Avatar` (line 80-84), before the fallback:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// ...
<Avatar className="size-8">
  {user.profileImage ? <AvatarImage src={user.profileImage} alt={user.name} /> : null}
  <AvatarFallback className="text-xs font-medium">{initials(user.name)}</AvatarFallback>
</Avatar>
```

- [ ] **Step 2: Add the Profile menu item.** Import `UserRound` from `lucide-react` and add a `Link` in the dropdown, above the STUDENT-only "Account setup" link:

```tsx
<Link
  href="/profile"
  role="menuitem"
  onClick={() => setOpen(false)}
  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
>
  <UserRound className="size-4" aria-hidden />
  Profile
</Link>
```

- [ ] **Step 3: Typecheck.**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add frontend/components/custom/TopBar.tsx
git commit -m "feat(profile): TopBar avatar image + Profile menu entry"
```

---

### Task 11: Frontend tests

**Files:**
- Create: `frontend/app/(app)/profile/_components/AvatarUpload.test.tsx`
- Create: `frontend/app/(app)/profile/_components/CredentialForms.test.tsx`

**Interfaces:**
- Consumes: the components from Task 9; mock `@/lib/api`, `next/navigation`, `URL.createObjectURL`/`revokeObjectURL`, `fetch` — mirror `AccountSetupForm.test.tsx`.

- [ ] **Step 1: AvatarUpload test** — mirror `AccountSetupForm.test.tsx`: (a) successful PUT → confirm called with `{ key }` → preview img rendered; (b) failed PUT (`fetch` ok:false) → confirm NOT called + "Upload failed" shown + no preview.

```tsx
post
  .mockResolvedValueOnce({ data: { uploadUrl: "https://r2/put", key: "avatars/u/x.jpg", expiresAt: "" } })
  .mockResolvedValueOnce({ data: { profileImage: "https://cdn/avatars/u/x.jpg" } });
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
// ... upload a File, then:
expect(post).toHaveBeenCalledWith("/users/me/avatar/confirm", { key: "avatars/u/x.jpg" });
```

- [ ] **Step 2: CredentialForms test** — with `user.passwordChangedAt` set to now, the password submit is disabled and the "change again on" copy renders; with it null/old, submit is enabled and `api.patch("/users/me/password", …)` fires on submit.

- [ ] **Step 3: Run frontend tests.**

Run: `cd frontend && npm run test`
Expected: PASS (existing 55 + the new cases).

- [ ] **Step 4: Commit.**

```bash
git add "frontend/app/(app)/profile/_components"
git commit -m "test(profile): avatar upload + credential cooldown RTL tests"
```

---

### Task 12: Live-stack verification + headless smoke

**Files:** none (verification only).

- [ ] **Step 1: Set the public-bucket env + create/expose the bucket.** Add `R2_PUBLIC_BUCKET_NAME` and `R2_PUBLIC_URL` to `.env`; in the Cloudflare dashboard create the public bucket, enable public access, and add its CORS rule for the app origin (localhost + the ngrok domain), mirroring the private-bucket CORS fix. *(Operator step — flagged in the spec.)*

- [ ] **Step 2: Rebuild + bring up the stack.**

Run: `docker compose build backend && docker compose up -d`
Then confirm the migration applied: `docker compose exec backend npx prisma migrate deploy`
Expected: containers healthy; `profile_fields_and_credential_cooldown` present.

- [ ] **Step 3: API smoke (as a logged-in user, via cookies):**
  - `PATCH /api/users/me/profile { city }` → 200, city persisted; retry with `{ role: "SUPER_ADMIN" }` → 400 (strict schema rejects it).
  - Avatar: `POST /me/avatar/upload-url` → PUT the returned URL cross-origin → `POST /me/avatar/confirm` → 200 with a `cdn`-based `profileImage`; confirm with a tampered `key` (another user's prefix) → 403; confirm before upload → 409.
  - `PATCH /me/password` with wrong current → 401; correct → 200 + `Set-Cookie` reissued; immediately again → 429 (message names the next-allowed date).
  - `PATCH /me/email` with the same email → 400; a taken email → 409; a fresh email → 200; again → 429.

- [ ] **Step 4: Headless UI drive** (Playwright-core against the cached Chromium, `waitUntil: "domcontentloaded"`): log in → open the user menu → click **Profile** → upload an avatar → assert the preview + the TopBar avatar image appear → edit city → change password → assert success copy. Capture a screenshot.

- [ ] **Step 5: Final gate — run both suites once more.**

Run: `cd backend && npm run test && cd ../frontend && npm run test`
Expected: PASS. (Lint is intentionally not gating — backend has no eslint flat config; see CLAUDE.md.)

- [ ] **Step 6: Update the spec's status + open the PR** into `dev` once unit + system + smoke all pass (per the test-gate rule). Do not delete the branch after merge.

---

## Self-Review

**Spec coverage:**
- Data model (profileImage/emailChangedAt/passwordChangedAt) → Task 1. ✅
- Public avatar storage (bucket param, config, env) → Tasks 1-2. ✅
- All 6 endpoints → Tasks 5-6; contact-only/locked fields → schema `.strict()` + explicit `data` build (Task 3/5). ✅
- Current-password guard, cooldown ordering, same-value rejection, uniqueness, token revocation + reissue → Task 5 tests + impl. ✅
- getMe fields → Task 5 Step 4. ✅
- Frontend page, forms, avatar upload, cooldown UI → Task 9; TopBar avatar + Profile entry (added per user request) → Task 10. ✅
- Site-wide avatar (TopBar) → Task 10; other-user avatars explicitly out of scope (spec §8). ✅
- Tests (backend Vitest, frontend RTL, live + headless) → Tasks 5, 11, 12. ✅
- Docs → Task 7. ✅

**Placeholder scan:** No "TBD"/"handle edge cases" left; each code step shows real code. Frontend component bodies (Task 9 Steps 3-6) give the exact API calls + signatures rather than full JSX — acceptable as they mirror the existing `AccountSetupForm` pattern the implementer will read, but the wiring (endpoints, payloads, refresh) is spelled out.

**Type consistency:** `issueTokenPair(userId, role)` / `revokeAllRefreshTokens(userId)` names match between Task 4 (definition) and Task 5 (use); `AvatarUploadUrlResult` matches between Task 8 (def) and Tasks 9/11 (use); `confirmAvatar` returns `{ profileImage }` consistently; `getPublicAvatarConfig` returns `{ bucket, publicBaseUrl }` used identically in Task 2/5.

**Open follow-up baked in:** `AppError` metadata arg (Task 5 Step 3 note) — the implementer verifies the signature and adjusts where `nextAllowedAt` is computed. Not a blocker.
