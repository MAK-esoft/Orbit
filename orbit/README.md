# Orbit

Payment-proof management platform for **IRBAS** — replaces WhatsApp/email workflows
between Regional Offices and Head Office with a structured submit → review →
approve/reject → resubmit lifecycle.

> **New here?** Read [`CLAUDE.md`](CLAUDE.md) for architecture & decisions, and
> [`docs/v1-implementation.md`](docs/v1-implementation.md) for task status.
> Product spec: [`orbit-dev-spec.md`](orbit-dev-spec.md).

## Stack

Next.js (App Router) · NestJS · PostgreSQL · Prisma · Redis · Tailwind + shadcn/ui ·
JWT (HTTP-only cookies) · Docker Compose · Turborepo monorepo.

## Prerequisites

- Node.js ≥ 20
- Docker + Docker Compose

## Getting Started

```bash
# 1. Configure environment
cp .env.example .env        # then fill in SMTP + secrets

# 2. Start infrastructure (Postgres + Redis)
docker compose up -d

# 3. Install dependencies (all workspaces)
npm install

# 4. Set up the database
npm run prisma:migrate
npm run seed                # creates a dev SUPER_ADMIN (see .env)

# 5. Run everything (api on :4000, web on :3000)
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000

## Monorepo Layout

```
apps/api    NestJS backend (Prisma, auth, submissions, notifications, files)
apps/web    Next.js frontend (RO + Admin portals)
docs/       Implementation tracker
```

## Common Commands

| Command | What |
|---|---|
| `npm run dev` | Run api + web in parallel (Turbo) |
| `npm run build` | Build all apps |
| `npm run db:up` / `db:down` | Start/stop Postgres + Redis |
| `npm run prisma:migrate` | Apply DB migrations (dev) |
| `npm run seed` | Seed dev super admin + sample RO |

See [`docs/v1-implementation.md`](docs/v1-implementation.md) for the full plan and progress.
