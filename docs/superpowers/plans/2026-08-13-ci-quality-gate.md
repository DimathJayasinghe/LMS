# CI Quality Gate Implementation Plan

**Goal:** Make backend/frontend tests and production builds run automatically and visibly on every
PR into `dev` or `main`.

## Tasks

- [x] Add a least-privilege, concurrency-cancelled GitHub Actions workflow.
- [x] Add independent backend and frontend verification jobs using locked installs and npm caches.
- [x] Add an aggregate `Quality Gate` job for branch protection.
- [ ] Validate the workflow by opening a PR and waiting for all three jobs to pass.
- [ ] Merge only after the GitHub-hosted run is green.
- [ ] Update the tracker and contributor workflow docs with the live CI behavior and lint baseline.
