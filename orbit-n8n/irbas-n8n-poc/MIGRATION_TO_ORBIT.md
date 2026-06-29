# Migrated to the Orbit application

This POC has been integrated into the **Orbit** application (`../../orbit`).
Orbit's PostgreSQL database is now the single source of truth and the Orbit web
app is the only review UI.

## What changed

- **Supabase is retired.** The workflow no longer writes to Supabase. All
  ingestion now goes through the Orbit API at `/api/integrations/*`
  (authenticated with `X-Integration-Key`). `supabase/schema.sql` is kept only
  for historical reference — it is no longer used.
- **The standalone approval UI is retired.** `approval-ui/index.html` is no
  longer used. Admins review, approve, and reject requests inside the Orbit web
  app (`/admin/submissions`). The ledger/balance is computed by Orbit from
  approved submissions — the old `ledger_entries` table and balance updates are
  gone.
- **The workflow (`n8n-workflows/irbas_whatsapp_flow.json`) was repointed** to
  the Orbit API:
  | Step | Now calls |
  |---|---|
  | Log Raw Message | `POST {ORBIT}/integrations/messages` |
  | Create Payment / Expense Request | `POST {ORBIT}/integrations/submissions` (Orbit resolves the RO from `channelId` and attributes to the Workflow Bot user) |
  | Mark Unrecognised | `PATCH {ORBIT}/integrations/messages/:id` |
- **New app-originated branch** (`POST /webhook/app-submission`): when a request
  is created in the Orbit app, Orbit sends it here for enrichment; the workflow
  extracts info and posts it back to
  `POST {ORBIT}/integrations/submissions/:id/extraction`.

## Configuration

See `.env.example`: set `ORBIT_API_BASE_URL` and `INTEGRATION_API_KEY`
(the latter must match `INTEGRATION_API_KEY` in the Orbit API `.env`).
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are no longer needed.
