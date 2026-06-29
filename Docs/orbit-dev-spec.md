# Orbit — Development Specification

**Client:** IRBAS  
**Product:** Orbit  
**Purpose:** Consolidated communication and payment proof management platform replacing WhatsApp/email workflows between IRBAS Regional Offices and Head Office  
**Version:** 1.0  
**Last Updated:** June 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Additional Services & Justifications](#3-additional-services--justifications)
4. [System Architecture](#4-system-architecture)
5. [User Roles & Permissions](#5-user-roles--permissions)
6. [Authentication & Account Management](#6-authentication--account-management)
7. [Database Schema](#7-database-schema)
8. [Feature Specifications — RO Portal](#8-feature-specifications--ro-portal)
9. [Feature Specifications — Admin Portal](#9-feature-specifications--admin-portal)
10. [Payment Proof Status Lifecycle](#10-payment-proof-status-lifecycle)
11. [Notification System](#11-notification-system)
12. [File Handling](#12-file-handling)
13. [API Module Structure (NestJS)](#13-api-module-structure-nestjs)
14. [UI/UX Guidelines](#14-uiux-guidelines)
15. [Development Timeline — 4 Weeks](#15-development-timeline--4-weeks)
16. [Deployment Notes](#16-deployment-notes)
17. [Out of Scope](#17-out-of-scope)

---

## 1. Project Overview

IRBAS currently operates 10–15 Regional Offices (ROs) across Pakistan. Each RO sells KEUNE cosmetic products to end customers (D.Watson, Imtiaz, Al-Fatah, etc.) and remits payments back to head office in Islamabad. Today, payment proofs — screenshots, deposit slips, and transfer confirmations — are shared via WhatsApp groups and email threads. There is no structured workflow, no audit trail, and no single place for head office to track the status of submitted payments.

**Orbit** replaces this entirely. It is a web-based platform where:

- ROs submit payment proofs through a structured, form-based interface
- Head office reviews, approves, or rejects each submission with a documented reason
- Every submission carries a clear status that is visible to both the RO and admin at all times
- Rejected proofs can be corrected and resubmitted, with the full lifecycle visible in the status history

Orbit does **not** integrate with the existing ERP. The accountant continues entering payment data into the ERP manually, using verified submissions from Orbit as the source of truth. This is by design — it removes the risk of modifying a legacy ERP system.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (App Router) | Server and client components; API routes for BFF pattern if needed |
| Backend | NestJS | Modular, TypeScript-first REST API |
| Database | PostgreSQL | Primary data store |
| ORM | Prisma | Type-safe schema management and migrations |
| Auth | JWT (access + refresh tokens) | Stateless authentication; stored in HTTP-only cookies |
| File Storage | Local disk (server filesystem) | Structured directory layout; path stored in DB |
| Styling | Tailwind CSS | Utility-first; pairs well with Next.js App Router |
| Component Library | shadcn/ui | Accessible, unstyled-base components customized to Orbit's design |
| Containerization | Docker + Docker Compose | Development environment parity; production-ready |

---

## 3. Additional Services & Justifications

The core stack (Next, Nest, Postgres) handles most of Orbit's needs. The following additional services are recommended:

### 3.1 Redis
**Purpose:** In-app notification queue and future session/cache layer  
**Why:** Notifications need to be pushed or polled efficiently without hammering the database on every request. Redis pub/sub or a simple queue ensures notifications are delivered in near-real-time without architectural complexity. Also useful for rate limiting auth endpoints.  
**Library:** `ioredis` in NestJS  
**Deployment:** Redis official Docker image — runs as a sidecar container

### 3.2 Nodemailer + SMTP (Transactional Email)
**Purpose:** Password reset emails  
**Why:** Even though operational notifications are in-app only, users need a way to recover their accounts. Email is the only viable reset channel without phone number infrastructure. Use any SMTP provider (Gmail SMTP for early development, Brevo/Mailjet for production — both have free tiers).  
**Library:** `nodemailer` in NestJS

### 3.3 Multer (File Upload Middleware)
**Purpose:** Handling multipart/form-data uploads for payment proof attachments  
**Why:** Built into NestJS via `@nestjs/platform-express`. Handles file validation (type, size limits) before writing to disk.  
**Storage:** Local disk with structured path: `/uploads/{year}/{month}/{submission_id}/{filename}`

> **Note on file storage scalability:** Local disk storage is fine for initial delivery. The directory structure and abstraction layer should be designed so that switching to S3-compatible storage (AWS S3 or self-hosted MinIO) in the future requires only a storage provider swap — not a schema or API change. Document this as a future upgrade path.

### 3.4 class-validator + class-transformer
**Purpose:** Input validation and DTO transformation in NestJS  
**Why:** Standard in NestJS projects; ensures all incoming API payloads are validated at the pipe level before reaching business logic.

### 3.5 Zod (Frontend Validation)
**Purpose:** Form validation in Next.js  
**Why:** Works seamlessly with React Hook Form; provides runtime type safety on the client side.

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  ┌──────────────┐      ┌───────────────────┐    │
│  │   RO Portal  │      │   Admin Portal    │    │
│  │  (Next.js)   │      │   (Next.js)       │    │
│  └──────┬───────┘      └────────┬──────────┘    │
└─────────┼────────────────────────┼───────────────┘
          │ HTTPS REST             │ HTTPS REST
          ▼                        ▼
┌─────────────────────────────────────────────────┐
│              NestJS API Server                   │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │
│  │   Auth   │ │Submissions│ │  Notifications  │ │
│  │  Module  │ │  Module  │ │     Module      │ │
│  └──────────┘ └──────────┘ └─────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │
│  │  Users   │ │    RO    │ │   File Upload   │ │
│  │  Module  │ │  Module  │ │     Module      │ │
│  └──────────┘ └──────────┘ └─────────────────┘ │
└───────┬───────────────┬──────────────┬───────────┘
        │               │              │
        ▼               ▼              ▼
  ┌──────────┐   ┌──────────┐   ┌──────────┐
  │PostgreSQL│   │  Redis   │   │Local Disk│
  │ (Prisma) │   │ (Queue)  │   │(Uploads) │
  └──────────┘   └──────────┘   └──────────┘
```

Both the RO portal and admin portal are part of the same Next.js application, separated by route groups and middleware-based role guards:

- `/ro/*` — RO-facing routes (protected, role: `RO_USER`)
- `/admin/*` — Admin-facing routes (protected, role: `ADMIN`)
- `/auth/*` — Login, forgot password, reset password (public)

---

## 5. User Roles & Permissions

### 5.1 Role Definitions

| Role | Description |
|---|---|
| `SUPER_ADMIN` | Can manage admin accounts and RO accounts; full system access |
| `ADMIN` | Head office staff; can view all submissions, change status, approve/reject |
| `RO_USER` | Regional Office user; can only view and manage their own RO's submissions |

### 5.2 Permission Matrix

| Action | SUPER_ADMIN | ADMIN | RO_USER |
|---|---|---|---|
| Create RO | ✅ | ❌ | ❌ |
| Create RO users | ✅ | ✅ | ❌ |
| Create admin users | ✅ | ❌ | ❌ |
| View all RO submissions | ✅ | ✅ | ❌ |
| View own RO submissions | ✅ | ✅ | ✅ |
| Submit payment proof | ❌ | ❌ | ✅ |
| Move status to "Under Review" | ✅ | ✅ | ❌ |
| Approve submission | ✅ | ✅ | ❌ |
| Reject submission (with reason) | ✅ | ✅ | ❌ |
| Resubmit rejected proof | ❌ | ❌ | ✅ |
| View submission status history | ✅ | ✅ | ✅ (own only) |
| View notifications | ✅ | ✅ | ✅ (own only) |
| Mark notifications as read | ✅ | ✅ | ✅ (own only) |

### 5.3 Multi-User ROs

Each RO can have multiple user accounts. All users within the same RO see the same submission history (scoped to their RO). There is no sub-role differentiation within an RO at this stage — all RO users have equal capability within their RO's scope.

---

## 6. Authentication & Account Management

### 6.1 Login Flow

- Email + password authentication
- On success: issue a short-lived **access token** (15 minutes) and a long-lived **refresh token** (7 days)
- Both tokens stored as **HTTP-only, Secure, SameSite=Strict cookies** — never exposed to JavaScript
- Refresh token rotation on each use (old token invalidated, new one issued)
- On logout: both cookies are cleared server-side

### 6.2 Account Creation (Admin-managed)

RO accounts and admin accounts are created by an admin — there is no public self-registration.

**Admin creates an RO user:**
1. Admin fills in: name, email, RO assignment, role
2. System generates a one-time setup link and sends it to the user's email
3. User clicks the link, sets their password, and activates their account
4. Setup links expire after 48 hours

### 6.3 Password Reset

- "Forgot password" link on login page
- User enters email → system sends a reset link (expires in 1 hour)
- Reset link is single-use and invalidated after use

### 6.4 Session Behaviour

- Inactive sessions do not auto-extend — user must re-authenticate once access token expires and refresh token is used
- Concurrent sessions from different devices are allowed (no single-session restriction)

---

## 7. Database Schema

### 7.1 `regional_offices`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
name            VARCHAR(255) NOT NULL
code            VARCHAR(50) UNIQUE NOT NULL   -- e.g. "RO-LHR-01"
city            VARCHAR(100)
region          VARCHAR(100)
is_active       BOOLEAN DEFAULT TRUE
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

### 7.2 `users`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
email           VARCHAR(255) UNIQUE NOT NULL
password_hash   VARCHAR(255)                  -- NULL until account activated
full_name       VARCHAR(255) NOT NULL
role            ENUM('SUPER_ADMIN', 'ADMIN', 'RO_USER') NOT NULL
ro_id           UUID REFERENCES regional_offices(id) -- NULL for admin/super_admin
is_active       BOOLEAN DEFAULT TRUE
setup_token     VARCHAR(255)                  -- one-time account activation token
setup_token_expires_at TIMESTAMP
reset_token     VARCHAR(255)
reset_token_expires_at TIMESTAMP
last_login_at   TIMESTAMP
created_by      UUID REFERENCES users(id)
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

### 7.3 `payment_submissions`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
ro_id           UUID NOT NULL REFERENCES regional_offices(id)
submitted_by    UUID NOT NULL REFERENCES users(id)
payment_type    ENUM('BANK_TRANSFER', 'CASH_DEPOSIT', 'CHEQUE', 'OTHER') NOT NULL
payment_type_note VARCHAR(255)               -- used when type = OTHER (e.g. "direct bank transfer screenshot")
amount          DECIMAL(12,2) NOT NULL
payment_date    DATE NOT NULL
bank_name       VARCHAR(255)
reference_number VARCHAR(255)               -- slip/transaction ref number
notes           TEXT
attachment_path VARCHAR(500) NOT NULL       -- relative path to uploaded file on disk
attachment_original_name VARCHAR(255)
attachment_mime_type VARCHAR(100)
status          ENUM('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED'
version         INTEGER NOT NULL DEFAULT 1  -- increments on each resubmission
parent_id       UUID REFERENCES payment_submissions(id) -- links resubmission to original
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

> **Resubmission model:** When an RO resubmits a rejected proof, a new `payment_submissions` row is created with `parent_id` pointing to the original submission and `version` incremented. The original record's status remains `REJECTED`. This preserves the complete history without mutating past records.

### 7.4 `submission_status_history`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
submission_id   UUID NOT NULL REFERENCES payment_submissions(id)
from_status     ENUM('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')
to_status       ENUM('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED') NOT NULL
changed_by      UUID NOT NULL REFERENCES users(id)
reason          TEXT                          -- mandatory when to_status = REJECTED
created_at      TIMESTAMP DEFAULT NOW()
```

### 7.5 `notifications`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id)
type            VARCHAR(100) NOT NULL         -- e.g. 'SUBMISSION_RECEIVED', 'STATUS_CHANGED', 'PROOF_REJECTED'
title           VARCHAR(255) NOT NULL
body            TEXT
submission_id   UUID REFERENCES payment_submissions(id)
is_read         BOOLEAN DEFAULT FALSE
created_at      TIMESTAMP DEFAULT NOW()
```

### 7.6 `refresh_tokens`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id)
token_hash      VARCHAR(255) NOT NULL         -- hashed refresh token
expires_at      TIMESTAMP NOT NULL
is_revoked      BOOLEAN DEFAULT FALSE
created_at      TIMESTAMP DEFAULT NOW()
```

---

## 8. Feature Specifications — RO Portal

### 8.1 Dashboard (Home)

The RO dashboard shows an at-a-glance summary of the RO's activity:

- **Summary cards:** Total submissions, Pending (Submitted + Under Review), Approved, Rejected
- **Recent submissions table:** Last 10 submissions with status badges, amount, date, and quick action links
- **Notification bell:** Unread count badge; clicking opens notification panel

### 8.2 Submit New Payment Proof

A structured form replacing the WhatsApp image drop. Fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| Payment type | Dropdown | Yes | Bank Transfer, Cash Deposit, Cheque, Other |
| Payment type note | Text | If type = Other | Describes the specific type |
| Amount | Number | Yes | PKR, 2 decimal places |
| Payment date | Date picker | Yes | Cannot be a future date |
| Bank name | Text | Yes | |
| Reference / slip number | Text | Yes | Transaction ref or deposit slip number |
| Notes | Textarea | No | Any additional context |
| Attachment | File upload | Yes | Image (JPG/PNG/WEBP) or PDF; max 10MB |

**Validation:**
- All required fields must be filled before submission
- Attachment is mandatory — the submit button is disabled without a file
- Accepted file types enforced on both client and server

**On submit:**
- Status is set to `SUBMITTED`
- A status history record is created
- Admin receives an in-app notification
- RO user sees a success state with the submission ID and current status

### 8.3 My Submissions (List View)

A full list of all submissions for the RO, with:

- **Filters:** Status, payment type, date range
- **Columns:** Submission ID, payment type, amount, payment date, submitted by, status badge, date submitted, action
- **Pagination:** 20 items per page
- **Row click:** Opens submission detail

### 8.4 Submission Detail View

Displays all fields of the submission plus:

- **Status badge** (prominent, colour-coded)
- **Attachment preview/download** (image inline preview; PDF download link)
- **Status timeline** (see Section 10 for full specification)
- **Rejection reason** (displayed prominently if status is `REJECTED`)
- **Resubmit button** (visible only if status is `REJECTED`)

### 8.5 Resubmission Flow

When an RO clicks "Resubmit":

1. A pre-filled form opens with all fields from the rejected submission
2. The RO can update any field and must replace or re-attach the file
3. On submit:
   - A new `payment_submissions` record is created (`version` + 1, `parent_id` = rejected submission ID)
   - Status of new record is `SUBMITTED`
   - Admin receives an in-app notification (type: `PROOF_RESUBMITTED`)
4. The original submission remains visible in the timeline with `REJECTED` status

### 8.6 Notifications Panel

- Accessible from the bell icon in the top navigation bar
- Lists all notifications for the current user, newest first
- Each notification shows: icon (type-based), title, body, time ago, read/unread state
- Clicking a notification marks it as read and navigates to the relevant submission
- "Mark all as read" button
- Unread count shown as a badge on the bell icon

---

## 9. Feature Specifications — Admin Portal

### 9.1 Dashboard (Home)

- **Summary cards:** All submissions (total), Pending review, Approved (this month), Rejected (this month)
- **Submissions requiring action:** A prioritised list of `SUBMITTED` and `UNDER_REVIEW` items, sorted oldest first
- **Per-RO breakdown table:** Each RO's pending count, last submission date, total approved amount this month
- **Notification bell:** Unread count badge; clicking opens notification panel

### 9.2 All Submissions (List View)

Admin can view submissions across all ROs, with:

**Filters:**
- RO (multi-select dropdown)
- Status (multi-select: Submitted, Under Review, Approved, Rejected)
- Payment type
- Date range (payment date)
- Submitted date range
- Amount range

**Columns:**
- Submission ID
- RO name
- Submitted by
- Payment type
- Amount
- Payment date
- Status badge
- Date submitted
- Action (Review)

**Sorting:** By any column; default is date submitted descending  
**Pagination:** 25 items per page  
**Export:** CSV export of filtered results (includes all columns)

### 9.3 Submission Detail & Review View

Admin sees the full submission with:

- All RO-submitted fields
- Attachment preview (inline image / PDF download)
- Status timeline (full lifecycle including all version changes)
- Current status prominently displayed

**Actions available (based on current status):**

| Current Status | Available Actions |
|---|---|
| `SUBMITTED` | Move to Under Review, Approve, Reject |
| `UNDER_REVIEW` | Approve, Reject |
| `APPROVED` | None (terminal state) |
| `REJECTED` | None (terminal state — RO must resubmit) |

**Reject action:**
- Opens a modal with a mandatory reason field (textarea, min 10 characters)
- Cannot confirm rejection without a reason
- On confirm: status updated, history record created, RO receives in-app notification

**Approve action:**
- Single confirmation step (no extra fields required)
- On confirm: status updated, history record created, RO receives in-app notification

### 9.4 RO Management

Admin can:

- View all ROs (name, code, city, region, active status, user count)
- Create a new RO (name, code, city, region)
- Deactivate an RO (prevents new submissions; existing data preserved)
- View all users within an RO
- Create a new RO user (name, email, RO assignment) — triggers account setup email

### 9.5 User Management

Admin (SUPER_ADMIN only) can:

- View all users with role, RO assignment, active status, last login
- Create admin users
- Deactivate any user
- Reset a user's password (sends reset email)

### 9.6 Notifications Panel

Same behaviour as RO portal. Notification types visible to admin:

- `SUBMISSION_RECEIVED` — new proof submitted by an RO
- `PROOF_RESUBMITTED` — RO has resubmitted a previously rejected proof

---

## 10. Payment Proof Status Lifecycle

### 10.1 Status Definitions

| Status | Colour | Meaning |
|---|---|---|
| `SUBMITTED` | Blue | RO has submitted the proof; awaiting admin review |
| `UNDER_REVIEW` | Amber | Admin has acknowledged and is reviewing |
| `APPROVED` | Green | Admin has verified and approved |
| `REJECTED` | Red | Admin has rejected; reason is documented |

### 10.2 State Transition Rules

```
SUBMITTED ──────────────────────────────────► APPROVED
     │                                             ▲
     │                                             │
     ▼                                             │
UNDER_REVIEW ────────────────────────────────► APPROVED
     │
     ▼
  REJECTED
     │
     │  (RO updates and resubmits — new record created)
     ▼
SUBMITTED (v2) ──► UNDER_REVIEW ──► APPROVED / REJECTED
```

- Admin can move from `SUBMITTED` directly to `APPROVED` (skip Under Review) — valid for clear-cut proofs
- Admin can move from `SUBMITTED` directly to `REJECTED` (if obviously invalid)
- `APPROVED` and `REJECTED` are terminal states on a given record
- Resubmission creates a new version record; the rejected original is never mutated

### 10.3 Visual Status Timeline Component

Both RO and admin views include a vertical status timeline on each submission detail page. The timeline renders all events chronologically:

**For a first-time approved submission:**
```
● Submitted             [RO User Name]    22 Jun 2026, 10:14 AM
● Under Review          [Admin Name]      22 Jun 2026, 11:30 AM
● Approved              [Admin Name]      22 Jun 2026, 02:45 PM
```

**For a rejected and resubmitted submission:**
```
● Submitted (v1)        [RO User Name]    22 Jun 2026, 10:14 AM
● Under Review          [Admin Name]      22 Jun 2026, 11:30 AM
● Rejected              [Admin Name]      22 Jun 2026, 12:00 PM
  └─ Reason: "Amount does not match bank statement."
● Resubmitted (v2)      [RO User Name]    22 Jun 2026, 03:00 PM
● Under Review          [Admin Name]      22 Jun 2026, 04:15 PM
● Approved              [Admin Name]      22 Jun 2026, 04:30 PM
```

Each event node in the timeline carries:
- Status icon (colour-coded dot or icon)
- Action label
- Actor name (who performed the action)
- Timestamp
- Reason (if rejection)

The timeline is the single source of truth for the history of a submission and must be visible to both the RO (for their own submissions) and admin (for all submissions).

---

## 11. Notification System

### 11.1 Delivery Channel

In-app notifications only (no email, no SMS, no WhatsApp) for operational events.  
Email is used only for account setup and password reset (see Section 6).

### 11.2 Notification Types & Recipients

| Event | Recipient | Title | Body |
|---|---|---|---|
| RO submits proof | All admin users | New payment proof submitted | "{RO Name} submitted a {payment_type} proof of PKR {amount}" |
| Admin moves to Under Review | Submitting RO user(s) | Your submission is under review | "Your proof #{id} is being reviewed by the team" |
| Admin approves | Submitting RO user(s) | Payment proof approved | "Your proof #{id} for PKR {amount} has been approved" |
| Admin rejects | Submitting RO user(s) | Payment proof rejected | "Your proof #{id} was rejected. Tap to view the reason and resubmit" |
| RO resubmits | All admin users | Proof resubmitted | "{RO Name} has resubmitted proof #{original_id} (v{version})" |

### 11.3 Implementation

- NestJS emits notification events using an `EventEmitter2` or Redis pub/sub after each status change
- Notification records are written to the `notifications` table
- Frontend polls for unread notifications every 30 seconds via a lightweight endpoint (`GET /notifications?unread=true`)
- Future upgrade path: replace polling with WebSocket (Socket.io) — the notification schema and event system support this without changes

### 11.4 Notification Badge & Panel

- Bell icon in top nav shows unread count (capped at `99+`)
- Notification panel is a slide-in drawer (right side), not a new page
- Clicking a notification: marks as read → navigates to the relevant submission
- "Mark all as read" marks all as read without navigation

---

## 12. File Handling

### 12.1 Accepted File Types

| Type | MIME Types | Notes |
|---|---|---|
| JPEG | `image/jpeg` | Most common for phone photos of slips |
| PNG | `image/png` | Screenshots |
| WEBP | `image/webp` | Modern phone screenshots |
| PDF | `application/pdf` | Formal bank receipts |

### 12.2 File Size Limit

Maximum **10MB per file**. One file per submission.

### 12.3 Storage Path Structure

```
/uploads/
  {year}/
    {month}/
      {submission_id}/
        {uuid}-{original_filename}
```

Example: `/uploads/2026/06/a1b2c3d4-uuid.../f5e6-receipt.jpg`

- The UUID prefix prevents filename collisions on resubmission of same-named files
- The original filename is preserved in the database for display purposes
- The full relative path (from `/uploads/`) is stored in `attachment_path`

### 12.4 File Serving

- Files are served via a dedicated NestJS endpoint: `GET /files/:year/:month/:submission_id/:filename`
- Endpoint is authenticated — only the submitting RO's users or admin can access a given file
- Direct filesystem access is never exposed to the public

### 12.5 Future Migration Path

The file-handling service should be abstracted behind a `StorageService` interface in NestJS:

```typescript
interface StorageService {
  save(file: Express.Multer.File, submissionId: string): Promise<string>
  getUrl(path: string): string
  delete(path: string): Promise<void>
}
```

`LocalStorageService` implements this for Phase 1. Swapping to `S3StorageService` (MinIO or AWS S3) in the future only requires a new implementation — no changes to submission logic.

---

## 13. API Module Structure (NestJS)

```
src/
├── app.module.ts
├── main.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts          POST /auth/login
│   ├── auth.service.ts             POST /auth/logout
│   ├── auth.guard.ts               POST /auth/refresh
│   ├── roles.guard.ts              POST /auth/forgot-password
│   └── dto/                        POST /auth/reset-password
│
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts         GET  /users
│   ├── users.service.ts            POST /users
│   └── dto/                        PATCH /users/:id
│                                   DELETE /users/:id (deactivate)
│
├── regional-offices/
│   ├── ro.module.ts
│   ├── ro.controller.ts            GET  /regional-offices
│   ├── ro.service.ts               POST /regional-offices
│   └── dto/                        PATCH /regional-offices/:id
│                                   GET  /regional-offices/:id/users
│
├── submissions/
│   ├── submissions.module.ts
│   ├── submissions.controller.ts   GET  /submissions         (admin: all; RO: own)
│   ├── submissions.service.ts      POST /submissions         (RO only)
│   └── dto/                        GET  /submissions/:id
│                                   PATCH /submissions/:id/status  (admin only)
│                                   POST /submissions/:id/resubmit (RO only)
│                                   GET  /submissions/:id/history
│
├── notifications/
│   ├── notifications.module.ts
│   ├── notifications.controller.ts GET  /notifications
│   ├── notifications.service.ts    PATCH /notifications/:id/read
│   └── dto/                        PATCH /notifications/read-all
│
├── files/
│   ├── files.module.ts
│   ├── files.controller.ts         GET  /files/:year/:month/:submissionId/:filename
│   └── storage/
│       ├── storage.interface.ts
│       └── local-storage.service.ts
│
└── prisma/
    ├── prisma.module.ts
    └── prisma.service.ts
```

### 13.1 Key API Conventions

- All responses follow a consistent envelope: `{ data, meta, error }`
- Pagination response: `{ data: [], meta: { total, page, limit, totalPages } }`
- HTTP status codes used semantically (200, 201, 400, 401, 403, 404, 422, 500)
- All IDs are UUIDs
- Timestamps returned in ISO 8601 format
- All monetary amounts as strings in API responses to avoid floating-point issues

### 13.2 Role Guards

Every route is decorated with `@Roles()` — no route is implicitly accessible. Unauthenticated requests return `401`. Authenticated requests to unauthorized routes return `403`.

---

## 14. UI/UX Guidelines

### 14.1 Design Direction

Orbit targets a **clean, professional SaaS aesthetic** — similar to Deel's transaction and payment management interface. The design prioritises:

- Clarity of status at a glance (colour-coded badges, prominent state indicators)
- Dense but scannable data tables with strong hierarchy
- A sidebar navigation pattern (desktop) that collapses to a bottom tab bar (mobile)
- Zero decorative clutter — every element earns its place

### 14.2 Colour Palette

| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | `#2563EB` | Primary actions, links, active nav |
| `--color-primary-light` | `#EFF6FF` | Primary button hover bg, selected row bg |
| `--color-surface` | `#FFFFFF` | Card and panel backgrounds |
| `--color-bg` | `#F8FAFC` | Page background |
| `--color-border` | `#E2E8F0` | Table borders, dividers |
| `--color-text-primary` | `#0F172A` | Headings, primary labels |
| `--color-text-secondary` | `#64748B` | Subtext, metadata |
| `--color-status-submitted` | `#3B82F6` | Submitted badge |
| `--color-status-review` | `#F59E0B` | Under review badge |
| `--color-status-approved` | `#10B981` | Approved badge |
| `--color-status-rejected` | `#EF4444` | Rejected badge |

### 14.3 Typography

- **Font:** Inter (Google Fonts) — clean, legible, excellent at small sizes in data tables
- **Scale:**
  - Page title: 24px / 600
  - Section heading: 18px / 600
  - Card label: 14px / 500
  - Body / table text: 14px / 400
  - Meta / timestamps: 12px / 400, `--color-text-secondary`

### 14.4 Layout

**Sidebar navigation (desktop, ≥768px):**
- Fixed left sidebar, 240px wide
- Orbit logo + product name at top
- Navigation links with icons (Tabler Icons)
- User avatar + name + role at bottom
- Sidebar collapses to icon-only at 64px on narrow desktop viewports

**Bottom tab navigation (mobile, <768px):**
- 4–5 primary tabs: Dashboard, Submissions, New (RO only), Notifications, Account
- Full-width page content above
- Floating action button (FAB) for "New Submission" on mobile RO view

### 14.5 Component Patterns

**Status badge:**
```
[● Approved]  — filled dot + label, bg is light tint of status colour
```

**Data table:**
- Sticky header
- Row hover highlight (`--color-primary-light`)
- Sortable column headers with directional arrow
- Zebra striping optional but not required
- Empty state: centred icon + message + CTA

**Form layout:**
- Two-column grid on desktop, single column on mobile
- Label above field (not floating)
- Error messages below the field in red, never in a toast
- Required fields marked with `*` in the legend, not on every label

**Modals:**
- Centred overlay with backdrop blur
- Max width 480px
- Used only for: reject reason input, confirm approve action, confirm deactivate
- Not used for forms with more than 4 fields (use a dedicated page instead)

**Status timeline:**
- Vertical line connecting events
- Colour-coded dots matching status colours
- Most recent event at the bottom
- Full timestamp (date + time) on each node

### 14.6 Responsiveness

- Full functionality on both desktop and mobile
- Tables become horizontally scrollable with a sticky first column on mobile
- All modals stack full-screen on mobile
- File upload supports both click-to-browse and drag-and-drop (desktop)

---

## 15. Development Timeline — 4 Weeks

### Week 1 — Foundation

**Goal:** Running skeleton with auth, database, and basic navigation

- [ ] Project scaffolding: Next.js + NestJS monorepo setup (Turborepo recommended)
- [ ] Docker Compose: PostgreSQL + Redis containers
- [ ] Prisma schema: all tables defined and migrated
- [ ] Auth module: login, logout, JWT access/refresh token flow
- [ ] Role guards and route protection
- [ ] Next.js route groups: `/auth`, `/ro`, `/admin`
- [ ] Layout shells: sidebar navigation, top bar, notification bell placeholder
- [ ] Admin: RO management (create RO, create RO user, account setup email)
- [ ] User management (SUPER_ADMIN)

**End of week deliverable:** Fully working login/logout, admin can create ROs and users, users receive setup emails and can set passwords

---

### Week 2 — Core Submission Workflow

**Goal:** End-to-end payment proof submission and status management

- [ ] File upload module: Multer configuration, `LocalStorageService`, file serving endpoint
- [ ] Submissions module: create submission API, attach file, validation
- [ ] RO portal: New Submission form (all fields, file upload, validation)
- [ ] RO portal: My Submissions list (table, filters, pagination)
- [ ] RO portal: Submission detail view (all fields, attachment preview, status badge)
- [ ] Admin: All Submissions list (table, all filters, CSV export)
- [ ] Admin: Submission detail + review actions (Under Review, Approve, Reject with reason modal)
- [ ] Status history: write history records on every status change

**End of week deliverable:** RO can submit proofs; admin can review and approve/reject; status persists correctly

---

### Week 3 — Resubmission, Notifications, and Timeline

**Goal:** Complete the lifecycle loop and notification system

- [ ] Resubmission flow: new record creation, `parent_id` + `version` logic
- [ ] Status timeline component: full chronological event render including resubmission chain
- [ ] Notification service: event emission on all status changes
- [ ] Notification records written to DB
- [ ] Notification panel UI: slide-in drawer, unread badge, mark as read
- [ ] Polling endpoint: `GET /notifications?unread=true` every 30s
- [ ] Admin dashboard: summary cards, pending queue, per-RO breakdown
- [ ] RO dashboard: summary cards, recent submissions

**End of week deliverable:** Full status lifecycle with resubmission; in-app notifications working end-to-end; dashboards populated with real data

---

### Week 4 — Polish, Responsive Design, QA, and Deployment

**Goal:** Production-ready, fully tested, deployed

- [ ] Mobile responsiveness: all views tested at 375px, 768px, 1280px
- [ ] Bottom tab navigation for mobile
- [ ] Empty states for all list views
- [ ] Error states: API failures, upload errors, form validation
- [ ] Loading skeletons for data tables and detail views
- [ ] Password reset flow: forgot password + reset link + form
- [ ] End-to-end QA: full submission lifecycle across roles
- [ ] Security review: auth headers, file access guards, input sanitization
- [ ] Docker production Dockerfile for NestJS and Next.js
- [ ] Environment variable documentation (`.env.example`)
- [ ] Deployment to chosen hosting (see Section 16)
- [ ] Basic README with setup and run instructions

**End of week deliverable:** Production-ready Orbit, deployed and accessible

---

## 16. Deployment Notes

### 16.1 Hosting (Decision Pending)

Hosting provider is not yet decided. The following are recommended options based on Orbit's profile:

| Option | Pros | Cons | Recommended for |
|---|---|---|---|
| DigitalOcean Droplet | Simple, predictable pricing, full control | Manual server management | Default recommendation |
| AWS EC2 + RDS | Scalable, managed database | More complex setup, higher cost | If scale becomes a concern |
| Railway / Render | Zero-config deployment | Less control, vendor lock-in | If speed of deployment is critical |

For initial delivery, a **DigitalOcean Droplet (2 vCPU / 4GB RAM)** with Docker Compose is the simplest and most cost-effective path.

### 16.2 Environment Variables Required

```
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/orbit

# Auth
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@orbit.irbas.com

# Redis
REDIS_URL=redis://localhost:6379

# File Storage
UPLOAD_DIR=/uploads
MAX_FILE_SIZE_MB=10

# App
FRONTEND_URL=https://orbit.irbas.com
NODE_ENV=production
```

### 16.3 Data Residency

No formal compliance requirements were specified. However, given IRBAS operates exclusively in Pakistan, hosting in a region geographically close to Pakistan (e.g., Mumbai, Singapore) is recommended for latency.

---

## 17. Out of Scope

The following are explicitly **not** part of Orbit and should not be built or referenced in this engagement unless the client explicitly requests:

- ERP integration of any kind (no database reads, writes, or API calls to the existing ERP)
- Stock, inventory, or order management
- RO-to-customer transaction tracking (D.Watson, Imtiaz, Al-Fatah orders)
- BI dashboards (separate track — to be documented separately)
- WhatsApp or SMS notifications (in-app only for operational events)
- Mobile native app (iOS/Android) — web responsive only
- Multi-currency support — PKR only
- Ledger or accounting functionality within Orbit

---

*This document is the single source of truth for Orbit's development. Any scope changes must be reflected here before implementation begins.*
