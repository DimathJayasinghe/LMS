# Design - GitHub Actions CI quality gate

**Date:** 2026-08-13
**Branch:** `chore/ci-quality-gate` (off `dev`)
**Status:** Implementation pending
**Priority:** P0 release safety

## Problem

Pull requests can currently merge without any automated check. Local verification has been used as
a substitute, but it is not reproducible, visible to every reviewer, or enforceable with branch
protection.

## Design

Add `.github/workflows/ci.yml` with independent backend and frontend jobs plus one aggregate
`Quality Gate` job suitable for a required branch-protection check.

- Trigger on pull requests into `dev` and `main`, pushes to `dev`, and manual dispatch.
- Use read-only repository permissions and cancel superseded runs for the same PR/ref.
- Use Node.js 22 and locked `npm ci` installs with per-app npm caches.
- Backend: Prisma validate/generate, full Vitest suite, TypeScript production build.
- Frontend: full Vitest suite, explicit TypeScript check, Next.js production build.
- Use only non-secret placeholder build-time environment values; no database service is required
  because current tests mock persistence and Prisma validation/generation does not connect.

The action versions follow the current official action documentation: `actions/checkout@v5` and
`actions/setup-node@v6`.

## Lint baseline

Lint is intentionally not part of the initial required check. The backend package exposes a lint
script but has no ESLint configuration, so it always fails before reading source. The frontend has
five existing React-hook lint errors in files unrelated to the CI change. A follow-up must install
and align backend ESLint, fix or consciously configure the frontend findings, then add lint to CI.
Making a permanently red workflow would not create a useful quality gate.

## Operational follow-up

After this PR is merged, configure repository branch protection to require `Quality Gate` for
`dev` and `main`. Repository settings are external state and are not encoded in this commit.
