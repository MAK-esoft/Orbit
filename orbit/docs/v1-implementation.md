# Orbit — V1 Implementation Plan & Progress Tracker

> Single source of truth for **what** is being built and **where it stands**.
> Keep this file updated as work progresses. Each task has a status:
> `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> Spec reference: [`orbit-dev-spec.md`](../orbit-dev-spec.md)

---

## Status Legend

| Symbol | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete |
| `[!]` | Blocked / needs decision |

## Overall Progress Snapshot

| Phase | Status | Notes |
|---|---|---|
| Week 0 — Repo & docs scaffolding | `[x]` | Monorepo, Docker, Prisma schema, docs — verified |
| Week 1 — Foundation (auth, RO/user mgmt) | `[x]` | Auth, users, RO mgmt — verified end-to-end |
| Week 2 — Core submission workflow | `[x]` | Upload, list+filters, detail, review actions, CSV — verified |
| Week 3 — Resubmission, notifications, timeline | `[x]` | Resubmit chain, notifications drawer+polling, timeline, dashboards — verified |
| Week 4 — Polish, responsive, QA, deploy | `[~]` | Empty/loading/error states, mobile nav, reset flow done; prod Dockerfiles + deploy pending |

> **Verified 2026-06-22:** Full stack runs via `npm run dev` (API :4000, web :3000). Both apps
> typecheck clean; `next build` succeeds. End-to-end HTTP smoke tests pass: multipart upload →
> file storage/retrieval → admin status transitions (state machine) → in-app notifications →
> resubmission chain → CSV export. All RO + Admin pages render 200 with auth; 401/403/400
> envelopes correct. Rich mock data seeded (3 ROs, 6 users, submissions across every status +
> a rejected→resubmitted→approved chain).

---

## Week 0 — Repository & Documentation Scaffolding

Foundation that all later work depends on.

- [x] Monorepo root: npm workspaces + Turborepo (`package.json`, `turbo.json`)
- [x] `.gitignore`, `.env.example`, `.env` template
- [x] `docs/v1-implementation.md` (this file)
- [x] `CLAUDE.md` (project memory / technical decisions)
- [x] `docker-compose.yml` — PostgreSQL + Redis sidecars (host ports 5440 / 6380)
- [x] Root `README.md` with setup & run instructions
- [x] `apps/api` — NestJS app skeleton (config, main, app module, global guards/interceptor/filter)
- [x] `apps/web` — Next.js App Router skeleton (Tailwind, design tokens, Inter, UI primitives)
- [x] Prisma schema — all 6 tables + enums, initial migration applied
- [x] Prisma module/service wired into Nest
- [x] `dotenv-cli` wired so Prisma/seed read the root `.env`

---

## Week 1 — Foundation

**Goal:** Running skeleton with auth, database, and basic navigation.

### Backend (NestJS)
- [x] Prisma schema migrated against Dockerized Postgres
- [x] Seed script: 1 SUPER_ADMIN, 1 sample RO + RO user (dev only)
- [x] Auth module
  - [x] `POST /auth/login` — email+password, issues access (15m) + refresh (7d) cookies
  - [x] `POST /auth/logout` — clears cookies, revokes refresh token
  - [x] `POST /auth/refresh` — refresh token rotation
  - [x] `POST /auth/forgot-password` — email reset link (1h expiry)
  - [x] `POST /auth/reset-password` — single-use reset (revokes sessions)
  - [x] `POST /auth/set-password` — account activation via setup token (48h expiry)
  - [x] `GET /auth/me` — current user profile
  - [x] JWT strategy + `AuthGuard` (reads HTTP-only cookies, global)
  - [x] `RolesGuard` + `@Roles()` decorator (global)
  - [x] Refresh token hashing & storage in `refresh_tokens`
  - [x] Rate limiting on auth endpoints (@nestjs/throttler; Redis store = future upgrade)
- [x] Users module
  - [x] `GET /users` (SUPER_ADMIN/ADMIN)
  - [x] `POST /users` — create admin (SUPER_ADMIN) / RO user (ADMIN+)
  - [x] `PATCH /users/:id`
  - [x] `DELETE /users/:id` (deactivate + revoke sessions)
  - [x] `POST /users/:id/reset-password` (admin-triggered)
- [x] Regional Offices module
  - [x] `GET /regional-offices`
  - [x] `POST /regional-offices`
  - [x] `PATCH /regional-offices/:id` (incl. deactivate)
  - [x] `GET /regional-offices/:id/users`
- [x] Mail service (Nodemailer) — setup + reset templates (console fallback if no SMTP)
- [x] Account setup email on RO user creation

### Frontend (Next.js)
- [x] Route groups: `(auth)`, `(ro)`, `(admin)`
- [x] Middleware-based session gate / redirect
- [x] API client (fetch wrapper, cookie credentials, refresh-on-401 retry)
- [x] Design tokens (Tailwind theme from spec §14.2/14.3), Inter font
- [x] Layout shells: sidebar nav (desktop) + bottom tab bar (mobile), top bar, notification bell placeholder
- [x] Auth pages: login, forgot password, reset password, set password (activation)
- [x] Admin: RO management (list + create RO) — live end-to-end against API
- [~] Admin: User management UI (backend ready; list/create/deactivate/reset UI pending)
- [ ] Admin: create RO user form (uses `POST /users`)

**Deliverable:** Working login/logout; admin creates ROs & users; users receive setup emails and set passwords.

---

## Week 2 — Core Submission Workflow

**Goal:** End-to-end payment proof submission and status management.

### Backend
- [x] Files module
  - [x] `StorageService` interface + `LocalStorageService`
  - [x] Multer config (type + size validation, 10MB, memory storage)
  - [x] Storage path `/uploads/{year}/{month}/{submissionId}/{uuid}-{name}`
  - [x] `GET /files/:year/:month/:submissionId/:filename` — authenticated, access-scoped
- [x] Submissions module
  - [x] `POST /submissions` (RO only, multipart, validation)
  - [x] `GET /submissions` (admin: all + filters; RO: own) with pagination
  - [x] `GET /submissions/:id` (access-scoped)
  - [x] `PATCH /submissions/:id/status` (admin) — transition rules enforced
  - [x] `GET /submissions/:id/history` (full resubmission chain)
  - [x] Status transition validation (state machine, §10.2)
  - [x] Write `submission_status_history` on every change
  - [x] CSV export of filtered results (admin) — `GET /submissions/export`

### Frontend
- [x] RO: New Submission form (all fields, drag/drop upload, Zod validation)
- [x] RO: My Submissions list (filters, pagination 20/page, status badges)
- [x] RO: Submission detail (fields, attachment preview, status badge)
- [x] Admin: All Submissions list (all filters, sort, pagination 25/page, CSV)
- [x] Admin: Submission detail + review actions (Under Review / Approve / Reject modal)

**Deliverable:** ✅ RO submits proofs; admin reviews & approves/rejects; status persists.

---

## Week 3 — Resubmission, Notifications, Timeline

**Goal:** Complete the lifecycle loop and notification system.

### Backend
- [x] `POST /submissions/:id/resubmit` (RO) — new record, `parent_id` + `version+1`
- [x] Notifications module
  - [x] EventEmitter2 events on all status changes (created / status / resubmitted)
  - [x] Write `notifications` records (types per §11.2)
  - [x] `GET /notifications` (+ `?unread=true`, returns `meta.unreadCount`)
  - [x] `PATCH /notifications/:id/read`
  - [x] `PATCH /notifications/read-all`
  - [~] Redis pub/sub plumbing — EventEmitter2 in place; WS/Redis is the documented future path
- [x] Dashboard endpoints (`GET /dashboard/ro`, `GET /dashboard/admin`)

### Frontend
- [x] Status timeline component (chronological, resubmission chain, reasons)
- [x] Resubmission flow (pre-filled form, mandatory new file)
- [x] Notification slide-in drawer + unread badge (99+) + mark-as-read / mark-all
- [x] Polling `GET /notifications?unread=true` every 30s
- [x] Admin dashboard (summary cards, pending queue, per-RO breakdown)
- [x] RO dashboard (summary cards, recent submissions)

**Deliverable:** ✅ Full lifecycle with resubmission; in-app notifications end-to-end; dashboards live.

---

## Week 4 — Polish, Responsive, QA, Deployment

**Goal:** Production-ready, tested, deployed.

- [x] Mobile responsiveness (sidebar → bottom tab bar; responsive grids/tables)
- [x] Bottom tab navigation (mobile)
- [x] Empty states for all list views (`EmptyState`)
- [x] Error states (API failures, upload errors, form validation inline)
- [x] Loading skeletons (`TableSkeleton`, `LoadingBlock`)
- [x] Password reset flow (forgot → reset → set-password activation)
- [~] End-to-end QA across all roles — happy paths verified; broader manual QA recommended
- [~] Security review — cookie auth, file access guards, RolesGuard, rate limits, validation in place; formal review pending
- [ ] Production Dockerfiles (NestJS + Next.js)
- [x] `.env.example` finalized & documented
- [ ] Deployment (DigitalOcean Droplet + Docker Compose — pending hosting decision)
- [x] README with setup & run instructions

**Deliverable:** App feature-complete & verified locally. Remaining: prod Dockerfiles + deploy (awaiting hosting decision), formal security/QA pass.

---

## Remaining for production hardening (post-feature-complete)

- [ ] Production Dockerfiles for `apps/api` and `apps/web` (multi-stage)
- [ ] `docker-compose.prod.yml` wiring api + web + postgres + redis
- [ ] Real SMTP provider config (Brevo/Mailjet) — currently console fallback in dev
- [ ] Move rate-limit + notification delivery to Redis (ioredis) for multi-instance
- [ ] Automated tests (unit/e2e) and CI
- [ ] Formal security review & full cross-role QA pass

---

## Open Decisions / Risks

| # | Item | Status |
|---|---|---|
| 1 | Hosting provider (DO Droplet recommended) | Pending client decision |
| 2 | Production SMTP provider (Brevo/Mailjet) | Pending |
| 3 | S3/MinIO migration (post-V1) | Deferred — abstraction in place |

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-22 | Initial plan created; Week 0 scaffolding started. |
| 2026-06-22 | Week 1 foundation complete & verified (auth, users, RO mgmt). |
| 2026-06-22 | Weeks 2–3 complete: submissions, files, status lifecycle, resubmission, notifications, timeline, dashboards — all verified end-to-end. Rich mock seed added. Week 4 polish (states, mobile nav, reset flow) done; prod Dockerfiles + deploy remain. |
