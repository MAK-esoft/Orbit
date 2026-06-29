# IRBAS WhatsApp Ingestion — POC (n8n + Supabase + Groq)

A proof-of-concept pipeline for **IRBAS** (Pakistani cosmetics distributor). It ingests
WhatsApp messages from Regional Offices (ROs), classifies each with AI, attempts to
verify payment proofs against a bank-notification inbox, and routes everything into a
Supabase-backed approval queue with a simple browser UI.

```
WhatsApp webhook ─▶ n8n ─▶ Groq (classify) ─▶ ┬─ payment  ─▶ bank-email match ─▶ payment_requests
                                              ├─ expense  ─▶ expense_requests
                                              └─ unknown  ─▶ logged only
                                                                    │
                                          Supabase  ◀───────────────┘
                                             ▲
                              approval-ui/index.html (approve / reject → ledger)
```

> **POC, not production.** It favours a working end-to-end flow over hardening. Notes
> marked **⚠ before production** call out what must change.

---

## What's in here

```
irbas-n8n-poc/
├── docker-compose.yml              # runs n8n locally on :5678
├── .env / .env.example             # secrets (.env is gitignored)
├── supabase/schema.sql             # full DB schema + seed data
├── n8n-workflows/
│   ├── irbas_whatsapp_flow.json    # IMPORT THIS into n8n
│   └── build_workflow.js           # generator for the JSON (reference only)
├── mock-data/                      # *.sh (Git Bash) and *.ps1 (PowerShell)
│   ├── send_payment_proof.*
│   ├── send_expense_proof.*
│   └── send_unknown.*
├── approval-ui/index.html          # open in a browser to clear the queue
└── README.md
```

---

## Prerequisites

- **Docker + Docker Compose** — runs n8n
- **A Supabase project** (free tier) — the database
- **A Groq API key** (free tier) — AI classification
- `curl` (Git Bash) **or** PowerShell — to fire the mock messages

A Gmail OAuth credential is **optional** — without it the payment branch still works,
it just records `bank_email_match = false`.

---

## Setup (in order)

### 1. Configure secrets
```bash
cp .env.example .env          # Windows PowerShell:  Copy-Item .env.example .env
```
Fill in **at minimum** (see the [API Keys](#api-keys-required) table for where each comes from):

```
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=irbas_poc_2024
N8N_ENCRYPTION_KEY=<openssl rand -hex 16>
GROQ_API_KEY=<from console.groq.com>
SUPABASE_URL=<https://xxxx.supabase.co>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
WHATSAPP_VERIFY_TOKEN=test_token_123
```

> `WHATSAPP_VERIFY_TOKEN` guards the webhook. The mock scripts default to
> `test_token_123` — keep them in sync. If you leave the env var **empty**, the webhook
> skips the token check (convenient for first-run testing).

### 2. Create the database
Open your Supabase project → **SQL Editor** → paste the entire contents of
[supabase/schema.sql](supabase/schema.sql) → **Run**. This creates 6 tables and seeds
3 ROs + 6 customers. Safe to re-run (it drops and recreates).

### 3. Start n8n
```bash
docker compose up -d
docker compose logs -f n8n     # wait for "Editor is now accessible"
```
Open **http://localhost:5678** and log in with the basic-auth user/password from `.env`.

### 4. Import the workflow
In n8n: **top-right menu (⋯) → Import from File** → choose
[n8n-workflows/irbas_whatsapp_flow.json](n8n-workflows/irbas_whatsapp_flow.json).
(Older n8n: **Workflows → Import from File**.)

The 21 nodes should lay out across three branches. Supabase/Groq calls read their
secrets from `$env`, so **no n8n credentials are needed for them** — they come from
`.env` via docker-compose.

### 5. (Optional) Connect Gmail for bank-email verification
Only if you want real bank-email matching:
1. In n8n: **Credentials → New → Gmail OAuth2 API**, name it exactly **`IRBAS Gmail`**.
2. Add `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` and complete the OAuth connect flow.
3. Open the **Search Bank Emails** node and confirm it's bound to the `IRBAS Gmail` credential.

The node is set to **continue on error**, so if Gmail isn't connected the payment branch
still completes — it just reports no match.

### 6. Activate
Toggle the workflow **Active** (top-right). The webhook is now live at:
```
http://localhost:5678/webhook/whatsapp-incoming
```
> While building you can also use the **Test URL** (`/webhook-test/...`) by clicking
> *Listen for test event* — but the mock scripts target the production path above.

### 7. Configure the approval UI
Edit [approval-ui/index.html](approval-ui/index.html), set:
```js
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";   // anon key, NOT service_role
```
(Get the anon key from Supabase → Settings → API → `anon` `public`.) Then just
double-click the file to open it in a browser.

---

## Testing each scenario

Set the token so the scripts authenticate (match your `.env`):

**Git Bash**
```bash
export WHATSAPP_VERIFY_TOKEN=test_token_123
chmod +x mock-data/*.sh
./mock-data/send_payment_proof.sh
./mock-data/send_expense_proof.sh
./mock-data/send_unknown.sh
```

**PowerShell**
```powershell
$env:WHATSAPP_VERIFY_TOKEN = "test_token_123"
.\mock-data\send_payment_proof.ps1
.\mock-data\send_expense_proof.ps1
.\mock-data\send_unknown.ps1
```

| Scenario | Script | Expected result |
|---|---|---|
| **Payment proof, no bank match** | `send_payment_proof` (Gmail not connected) | Row in `payment_requests`, `bank_email_match = false`, status `pending` |
| **Payment proof, bank match** | `send_payment_proof` (Gmail connected + a matching alert email exists with PKR 450,000 or slip 2024-1847 in last 24h) | Same, but `bank_email_match = true` and `bank_email_amount` populated |
| **Expense proof** | `send_expense_proof` | Row in `expense_requests` (Lahore RO, ~35,000, "AC repair…") |
| **Unrecognised** | `send_unknown` | Row in `whatsapp_messages` only, `classification = unrecognised`, no request created |

**Verify in n8n:** open the workflow → **Executions** tab to see each run and inspect any
node's input/output. The **Match Email to Payment** and **Parse Classification** nodes
log detail via `console.log` (visible in the execution view / `docker compose logs n8n`).

**Verify the ledger:** open `approval-ui/index.html`, **Approve** a payment →
- it disappears from the queue,
- a row appears in `ledger_entries` (`entry_type = payment_received`),
- the RO's `balance_pkr` increases by the amount.

Approving an expense decreases the RO balance and writes `entry_type = expense_deducted`.
**Reject** prompts for a reason and sets status `rejected` (no ledger entry).

---

## How classification works

- **Build Groq Body** assembles the prompt; **Groq Classification** calls
  `llama-3.1-8b-instant` at `temperature 0`.
- **Parse Classification** strips any stray ```` ```json ```` fences, `JSON.parse`s the
  reply, and **defaults to `unrecognised`** if the model returns malformed JSON — a bad
  AI response never crashes the run.
- **Route by Classification** (Switch) sends the item down the payment / expense /
  unrecognised branch.

Groq free tier: ~30 req/min, 14,400 req/day — plenty for POC testing.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| **404 on the webhook** | Workflow isn't **Active**, or you used the test path. Production path is `/webhook/whatsapp-incoming`. |
| **401 / "Unauthorized: invalid token"** | `?token=` in the script ≠ `WHATSAPP_VERIFY_TOKEN` in `.env`. Match them, or blank the env var to skip the check. Restart n8n after editing `.env`. |
| **`$env.SUPABASE_URL` is empty in a node** | The var must be set **before** `docker compose up`. After editing `.env`, run `docker compose up -d --force-recreate`. |
| **Supabase calls fail / RLS error** | Confirm you ran `schema.sql` (it disables RLS for the POC) and that the n8n side uses the **service_role** key, the UI uses the **anon** key. |
| **Groq 401 / 400** | Check `GROQ_API_KEY`; confirm model `llama-3.1-8b-instant` is still available on your account. |
| **Switch always goes to "unrecognised"** | The model returned non-JSON. Open the execution → **Parse Classification** logs show the raw content. |
| **Payment branch errors on Gmail** | Either connect the `IRBAS Gmail` credential or rely on continue-on-error (it should pass through with no match). |
| **RO comes out null** | The mock's `display_phone_number` must match a `whatsapp_group_id` in `regional_offices` (e.g. `group_karachi_001`). |
| **n8n won't start** | `docker compose logs n8n`. A missing `N8N_ENCRYPTION_KEY` is the usual culprit. |

---

## Image-proof reading (Groq vision)

Real ROs mostly send **photos** of deposit slips, bank-transfer screenshots, and cheques
rather than typing the details. The workflow handles this:

- `Extract Fields` detects an attached **image** (Slack `files[]` with an `image/*` mimetype)
  and records its download URL.
- `Has Image Proof` (IF) routes images down a vision path: **Download Image** (fetches the
  Slack file using `SLACK_BOT_TOKEN`) → **Build Vision Body** (base64-encodes it) →
  **Groq Vision** (`meta-llama/llama-4-scout-17b-16e-instruct`) → same `Parse Classification`.
- Text-only messages take the original text path. Both converge, so routing/Supabase logic is unchanged.

Result: an image with no caption is classified and its **amount / reference / method** are read
straight off the picture — verified end-to-end (a real NJT card receipt screenshot produced
`expense_proof`, amount **Rs 1,317.55**, ref **027400**, "NJT MOBILE NEWARK US, Visa …2422").

**Extraction policy:** the vision prompt is deliberately *generous* — it extracts whatever is
visible and classifies any financial receipt as `payment_proof` (deposit/transfer) or
`expense_proof` (purchase/card/bill), reserving `unrecognised` only for images with no
transaction at all. (The earlier strict "must be paid to IRBAS" wording caused real receipts to
be dropped as `unrecognised` with no data stored.)

**Requirements:**
- Slack bot scope **`files:read`** (add it, then reinstall the app) — without it the download returns 403.
- `SLACK_BOT_TOKEN` set in `.env` (the `xoxb-…` token) — passed to the Download Image node.
- **Images only** in this phase. PDFs are not read yet (Groq vision takes images; a PDF would need a
  page→image conversion step first).

> The same logic is ready for WhatsApp images, but fetching WhatsApp media needs a real
> `WHATSAPP_API_TOKEN` (production WhatsApp Business API), so it can't be tested with the mocks.

---

## Slack trigger (second trigger, for end-to-end testing)

The workflow has a **second trigger — `Slack Incoming`** — feeding the *same* pipeline as
the WhatsApp webhook. `Extract Fields` auto-detects the source (WhatsApp vs Slack) and
normalizes both; `Find RO` matches a Regional Office by **either** `whatsapp_group_id`
**or** `slack_channel_id`.

> The Slack node ships **disabled** so the workflow activates without Slack creds. Enable
> it (open node → toggle, or re-activate) only after the steps below.

### A. Add the Slack channel column (one-time)
Run in Supabase SQL Editor:
```sql
ALTER TABLE regional_offices ADD COLUMN IF NOT EXISTS slack_channel_id text;
```

### B. Create the Slack app + get keys
1. https://api.slack.com/apps → **Create New App → From scratch** → name it, pick your workspace.
2. **OAuth & Permissions → Scopes → Bot Token Scopes**, add:
   `channels:history`, `channels:read`, `chat:write`, `users:read`, **`files:read`** (add `groups:history` for private channels). `files:read` is required so the workflow can download image proofs.
3. **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-…`).
4. **Basic Information → App Credentials** → copy the **Signing Secret**.
5. Create a Slack channel (e.g. `#irbas-karachi`) and **invite the bot**: in the channel type `/invite @YourAppName`.
6. Channel → **View channel details** (bottom) → copy the **Channel ID** (`C0123ABCD`), then map it:
   ```sql
   UPDATE regional_offices SET slack_channel_id = 'C0123ABCD' WHERE name = 'Karachi RO';
   ```

### C. Expose local n8n (ngrok) — Slack needs a public HTTPS URL
```bash
ngrok http 5678
```
Copy the `https://xxxx.ngrok-free.app` URL, then set it as n8n's public URL and recreate:
```
# in .env add/set:  WEBHOOK_URL=https://xxxx.ngrok-free.app
docker compose up -d --force-recreate
```

### D. Connect Slack in n8n + subscribe to events
1. n8n → **Credentials → Create → "Slack API"**, name it **exactly `IRBAS Slack`**, paste the
   `xoxb-…` token **and** the **Signature Secret** (= the app's *Signing Secret*). The signing
   secret is required — without it the trigger returns **401** to Slack's signed requests.
2. Open the **Slack Incoming** node → **enable** it → select the `IRBAS Slack` credential → **save & activate** the workflow.
3. The trigger's **production webhook path** is `/webhook/slack-incoming/webhook`, so the full
   Request URL is: `<WEBHOOK_URL>/webhook/slack-incoming/webhook`
   (e.g. `https://<your-tunnel>/webhook/slack-incoming/webhook`).
4. Slack app → **Event Subscriptions → Enable** → paste that URL as the **Request URL** (it must verify ✓) → under **Subscribe to bot events** add `message.channels` → **Save**, then **reinstall** the app if prompted.

### E. Test
Type a message in the mapped Slack channel, e.g. *"Payment kar di 275,000 D.Watson wali slip 99-2231"* →
watch it appear in n8n **Executions** and as a pending row in the approval UI — same as WhatsApp.

> **Test without Slack/ngrok:** because `Extract Fields` handles Slack-shaped payloads
> regardless of which trigger fired, you can simulate a Slack message locally:
> ```bash
> curl -X POST "http://localhost:5678/webhook/whatsapp-incoming?token=test_token_123" \
>   -H "Content-Type: application/json" \
>   -d '{"event":{"type":"message","channel":"C0123ABCD","user":"U999","text":"Payment kar di 275,000 D.Watson wali slip 99-2231"}}'
> ```
> (Set `C0123ABCD` to whatever you mapped in step B.)

| Key | Where to get it | Notes |
|-----|----------------|-------|
| Slack **Bot Token** (`xoxb-…`) | api.slack.com/apps → OAuth & Permissions | Goes in the n8n `IRBAS Slack` credential |
| Slack **Signing Secret** | api.slack.com/apps → Basic Information | Used by Slack Event Subscriptions verification |

---

## API Keys Required

### Minimum for basic POC (no real WhatsApp, no real bank email)
These let you test classification + Supabase storage with the mock scripts.

| Key | Where to get it | Notes |
|-----|----------------|-------|
| `GROQ_API_KEY` | console.groq.com → API Keys | Free tier — 30 req/min, 14,400 req/day. No card needed. Model: `llama-3.1-8b-instant` |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | Free tier is fine |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key | Keep secret — full DB access (used by n8n only) |
| `N8N_BASIC_AUTH_USER` | Any string you choose | e.g. `admin` |
| `N8N_BASIC_AUTH_PASSWORD` | Any string you choose | e.g. `irbas_poc_2024` |
| `N8N_ENCRYPTION_KEY` | Any random 32-char string | `openssl rand -hex 16` |
| `WHATSAPP_VERIFY_TOKEN` | Any string you choose | e.g. `test_token_123` — authenticates the mock scripts |

Also needed by the **approval UI** (browser-side): the Supabase **anon** key
(Settings → API → `anon` `public`) — hardcoded into `approval-ui/index.html`.

### Additional for bank-email verification (optional)

| Key | Where to get it | Notes |
|-----|----------------|-------|
| `GMAIL_CLIENT_ID` | console.cloud.google.com → OAuth 2.0 Client IDs | Create project, enable Gmail API, create OAuth creds |
| `GMAIL_CLIENT_SECRET` | Same as above | From the downloaded JSON |
| `GMAIL_REFRESH_TOKEN` | developers.google.com/oauthplayground | Scope: `https://www.googleapis.com/auth/gmail.readonly` |
| `IRBAS_BANK_EMAIL` | The "from" address on the bank's transaction emails | e.g. `alerts@hbl.com` |

> In n8n the Gmail node uses an **OAuth2 credential named `IRBAS Gmail`**, set up in the
> n8n UI (steps above). The `.env` Gmail vars are there for reference / your OAuth setup.

### For real WhatsApp (production path only — not needed for POC)

| Key | Where to get it | Notes |
|-----|----------------|-------|
| `WHATSAPP_API_TOKEN` | Meta Developer Console → WhatsApp → API Setup | Requires an approved WhatsApp Business account |
| `WHATSAPP_PHONE_NUMBER_ID` | Same as above | Phone-number ID of the registered business number |

---

## ⚠ Before production
- Re-enable Supabase **RLS** and add policies; stop using the service_role key in clients.
- The approval UI talks straight to Supabase with the anon key — put it behind real auth.
- No payment is auto-approved here by design — every payment/expense lands in `pending`.
  `bank_email_match` is a **confidence signal only**.
- Replace the mock webhook with the real WhatsApp Cloud API (verify token + signature).

---

## Implementation notes

- **All Supabase calls use the HTTP Request node** (not the community Supabase node) —
  easier to debug for a POC.
- **Extract Fields is a Code node** (the spec sketched a Set node). It normalizes *both*
  the real WhatsApp Cloud payload and the mock script's `{ "body": { ... } }` wrapper, and
  enforces the `?token` check — far more robust than brittle Set expressions.
- A small **Capture Message Id** / **Build * Body** Code node pattern is used so the flow
  doesn't depend on whether PostgREST returns an array or an object.
- Regenerate the workflow JSON anytime with: `node n8n-workflows/build_workflow.js`.
