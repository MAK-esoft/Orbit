# CLAUDE.md — Orbit Project Context

> This file orients any new session (human or AI) to Orbit: what it is, how it's
> built, and the decisions already locked in. Read this first, then check
> [`docs/v1-implementation.md`](docs/v1-implementation.md) for task status.
> The authoritative product spec is [`orbit-dev-spec.md`](orbit-dev-spec.md).

---

## 1. What Orbit Is

Orbit is a web platform for **IRBAS** that replaces ad-hoc WhatsApp/email workflows
for **payment-proof management** between Regional Offices (ROs) and Head Office.

- ROs submit payment proofs (screenshots / deposit slips / transfer confirmations) via a structured form.
- Head Office (admins) review and **approve / reject** each submission with a documented reason.
- Every submission carries a visible **status** and an immutable **status history / timeline**.
- Rejected proofs can be **resubmitted** as a new version, preserving full history.

**Explicitly out of scope** (do NOT build): ERP integration, inventory/orders,
RO→customer transaction tracking, BI dashboards, WhatsApp/SMS notifications,
native mobile apps, multi-currency (PKR only), in-app accounting/ledger.

---

## 2. Tech Stack (locked)

| Layer | Choice |
|---|---|
| Monorepo | npm workspaces + **Turborepo** |
| Frontend | **Next.js** (App Router) + TypeScript |
| Backend | **NestJS** (modular REST) + TypeScript |
| Database | **PostgreSQL** |
| ORM | **Prisma** |
| Auth | **JWT** access (15m) + refresh (7d) in **HTTP-only Secure SameSite=Strict cookies** |
| File storage | **Local disk** behind a `StorageService` interface (S3/MinIO-swappable later) |
| Styling | **Tailwind CSS** + **shadcn/ui** |
| Cache/queue | **Redis** (`ioredis`) — notifications, rate limiting, future sessions |
| Email | **Nodemailer** + SMTP — account setup & password reset only |
| Validation | **class-validator/class-transformer** (API) · **Zod** + React Hook Form (web) |
| Containers | **Docker + Docker Compose** |

---

## 3. Repository Layout

```
orbit/
├── apps/
│   ├── api/                 # NestJS backend
│   │   ├── prisma/          # schema.prisma, migrations, seed
│   │   └── src/
│   │       ├── auth/        users/ regional-offices/ submissions/
│   │       ├── notifications/ files/ mail/ redis/ common/ config/
│   │       ├── prisma/      # PrismaModule/Service
│   │       ├── app.module.ts
│   │       └── main.ts
│   └── web/                 # Next.js frontend
│       └── src/app/
│           ├── (auth)/      # login, forgot, reset, set-password  (public)
│           ├── (ro)/        # /ro/*    role: RO_USER
│           └── (admin)/     # /admin/* role: ADMIN / SUPER_ADMIN
├── docs/v1-implementation.md
├── docker-compose.yml
├── turbo.json
├── package.json             # workspaces root
├── .env / .env.example
└── CLAUDE.md (this file)
```

Both portals live in **one Next.js app**, separated by route groups + middleware role guards.

---

## 4. Data Model (Prisma → Postgres)

Six tables. UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` everywhere.

- **regional_offices** — `name, code (unique), city, region, is_active`.
- **users** — `email (unique), password_hash (null until activated), full_name, role, ro_id (null for admins), is_active, setup_token(+expiry), reset_token(+expiry), last_login_at, created_by`.
- **payment_submissions** — `ro_id, submitted_by, request_type, payment_type, payment_type_note, amount(Decimal 12,2), payment_date, bank_name, reference_number, notes, attachment_path/original_name/mime_type, status, version, parent_id`.
  - `request_type` = the **category/purpose** (Deposit / Expense / Salary Disbursement / Vendor Payment / Other); `payment_type` = the **method** (Bank Transfer / Cash Deposit / Cheque / Other). They are distinct fields.
- **submission_status_history** — `submission_id, from_status, to_status, changed_by, reason`.
- **notifications** — `user_id, type, title, body, submission_id, is_read`.
- **refresh_tokens** — `user_id, token_hash, expires_at, is_revoked`.
- **ledger_adjustments** — `ro_id, type (CREDIT|DEBIT), amount(Decimal 12,2), description, effective_date, created_by`. Admin-created manual ledger entries (e.g. stock delivered to an RO = DEBIT).

**Terminology:** user-facing copy calls a payment submission a **"request"** (e.g. "New request", "My Requests"). Routes/code still use `submissions`. Version chips ("v2") are not shown anywhere; the timeline shows "Resubmitted" vs "Submitted" instead.

**Enums:** `Role` (SUPER_ADMIN, ADMIN, RO_USER) · `RequestType` (DEPOSIT, EXPENSE, SALARY_DISBURSEMENT, VENDOR_PAYMENT, OTHER) · `PaymentType` (BANK_TRANSFER, CASH_DEPOSIT, CHEQUE, OTHER) · `SubmissionStatus` (SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED).

### Resubmission model
Resubmitting a `REJECTED` proof **creates a new row** (`parent_id` → original, `version + 1`, status `SUBMITTED`). The original is **never mutated**. Timeline reads across the parent/child chain.

---

## 5. Roles & Permissions

- **SUPER_ADMIN** — full access; manages ROs, admin users, RO users.
- **ADMIN** — head office; views all submissions, changes status, creates RO users.
- **RO_USER** — scoped to own RO; submits & resubmits proofs, views own history.

Every route is decorated with `@Roles()` — nothing is implicitly public.
Unauthenticated → `401`. Authenticated-but-unauthorized → `403`.
RO data access is always scoped by `ro_id`.

---

## 6. Status Lifecycle (state machine — enforce server-side)

```
SUBMITTED ─► UNDER_REVIEW ─► APPROVED        (terminal)
SUBMITTED ─────────────────► APPROVED        (skip review — clear-cut)
SUBMITTED / UNDER_REVIEW ──► REJECTED         (terminal; reason mandatory, min 10 chars)
REJECTED ─► (resubmit) ─► new SUBMITTED v+1
```

- `APPROVED` and `REJECTED` are terminal **per record**.
- Status changes by admins only; every change writes a `submission_status_history` row and emits a notification.
- **Auto-acknowledge:** when an admin opens a `SUBMITTED` submission's detail page, it auto-transitions to `UNDER_REVIEW` (no manual click). Implemented client-side in the admin detail page, guarded to run once per id.

---

## 7. Auth Decisions

- Tokens in **HTTP-only, Secure, SameSite=Strict cookies** — never exposed to JS.
- **Refresh token rotation**: each use revokes the old hashed token, issues a new one.
- No public self-registration. Admin creates accounts → **setup link emailed** (48h expiry) → user sets password to activate.
- Password reset link expires in **1h**, single-use.
- Concurrent sessions allowed (multiple `refresh_tokens` per user). No auto-extend.
- Passwords hashed with **bcrypt**. Setup/reset tokens stored **hashed**, compared by hash.

---

## 8. File Handling

- Accepted: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Max **10MB**, one file/submission.
- Path: `/uploads/{year}/{month}/{submissionId}/{uuid}-{originalName}`.
- Served only via authenticated `GET /files/...` endpoint scoped to RO owner / admins. No public FS exposure.
- Behind `StorageService` interface (`save`, `getUrl`, `delete`) — `LocalStorageService` for V1; S3/MinIO later with no schema/API change.

---

## 8b. Ledger / Balance

A monthly **balance** and a per-RO **running ledger** treat each item as credit or debit:
- **Credit** (money in): approved `DEPOSIT` requests + admin `CREDIT` adjustments.
- **Debit** (charges/money out): approved `EXPENSE`/`SALARY_DISBURSEMENT`/`VENDOR_PAYMENT`/`OTHER` requests + admin `DEBIT` adjustments (e.g. stock delivered).
- Dashboard "This month" balance = credited / debited / net, for the current month (by payment/effective date), approved only. Folds in adjustments.
- **Ledger page** (`/admin/ledger?roId=`, `/ro/ledger`) = chronological statement with a running **Outstanding = debits − credits** (positive ⇒ RO owes IRBAS). Admins add/remove CREDIT/DEBIT entries per RO; ROs view their own (read-only).
- CSV export of the requests list is available to **both** RO (own) and admin (all/filtered).

## 9. Notifications

- **In-app only** for operational events (email is auth-only).
- NestJS emits events (`EventEmitter2`, Redis pub/sub plumbing for future WS) on status changes → writes `notifications` rows.
- Frontend **polls** `GET /notifications?unread=true` every 30s. Bell badge caps at `99+`. Slide-in right drawer.
- Types: `SUBMISSION_RECEIVED`, `STATUS_CHANGED` (under-review/approved), `PROOF_REJECTED`, `PROOF_RESUBMITTED`. Recipients per spec §11.2.

---

## 10. API Conventions

- Response envelope: `{ data, meta, error }`. Paginated: `meta: { total, page, limit, totalPages }`.
- HTTP codes used semantically: 200/201/400/401/403/404/422/500.
- All IDs are UUIDs; timestamps ISO 8601; **monetary amounts returned as strings** (avoid float issues).
- Global `ValidationPipe` (whitelist + transform). Global response/exception interceptors for the envelope.

---

## 11. Design System (web)

- Aesthetic: clean professional SaaS, **Deel-inspired neutral black & white**. Font **Inter**.
- Primary/brand is **neutral near-black** `#18181B` (not blue); `primary-light` `#F4F4F5`; bg `#FAFAFA`; border `#E4E4E7`. Tokens live in `tailwind.config.ts` + `globals.css` — change there to retheme.
- **Semantic status colors retained** (badges/timeline only): submitted `#3B82F6`, review `#F59E0B`, approved `#10B981`, rejected `#EF4444`.
- Attachment images use a zoomable lightbox (`image-viewer.tsx`) with download. Status chain is a transaction-style stepper (`status-timeline.tsx`).
- Sidebar nav (≥768px, 240px / 64px collapsed) → bottom tab bar on mobile. FAB for New Submission (RO mobile).
- Status badge = filled dot + label on light tint. Vertical status timeline, most-recent at bottom.
- Forms: label above field, errors below field (never toast), two-col desktop / single mobile.

---

## 12. Environment Variables

See [`.env.example`](.env.example). Categories: Database, Auth (JWT secrets/expiries),
SMTP, Redis, File storage (`UPLOAD_DIR`, `MAX_FILE_SIZE_MB`), App (`FRONTEND_URL`, `NODE_ENV`,
`API_PORT`, token TTLs). Never commit real secrets; `.env` is gitignored.

---

## 13. Commands (once scaffolded)

```bash
# from repo root
docker compose up -d            # Postgres + Redis
npm install                     # install all workspaces
npm run dev                     # turbo: api + web in parallel

# api (apps/api)
npm run prisma:migrate          # apply migrations (dev)
npm run prisma:generate
npm run seed                    # dev seed: super admin + sample RO
```

---

## 14. Conventions for Contributors / Future Sessions

- **Update [`docs/v1-implementation.md`](docs/v1-implementation.md)** task checkboxes as you complete work.
- Keep the spec the source of truth; reflect scope changes there before coding.
- Enforce the status state machine **server-side** — never trust the client.
- Scope every RO query by `ro_id`; never leak cross-RO data.
- Add `@Roles()` to every new route. New file types/limits go through `StorageService` + Multer config, not ad-hoc.
- Amounts: `Decimal` in DB, **string** in API responses.
