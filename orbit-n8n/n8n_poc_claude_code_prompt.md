# Claude Code Prompt — IRBAS WhatsApp Ingestion POC (n8n + Supabase)

---

## Context

You are building a Proof of Concept for IRBAS, a Pakistani cosmetic products distributor. Their Regional Offices (ROs) currently send payment proofs, expense receipts, and other business documents via WhatsApp groups. The goal of this POC is to:

1. Intercept those WhatsApp messages via webhook
2. Classify each message using AI (payment proof / expense proof / unrecognised)
3. For payment proofs — attempt to verify against a bank notification email inbox
4. For verified payments — auto-create a ledger entry in Supabase
5. For unverifiable items — create a pending manual approval request in Supabase
6. Expose a simple approval UI so an IRBAS accountant can review and approve/reject pending items

This is a POC, not production. Prioritise working end-to-end flow over polish. Use Docker for n8n, Supabase for the database, and the Groq API for AI classification (free tier, fast inference).

---

## Part 1 — Environment Setup

### 1.1 Prerequisites check

Before writing any code, verify the following are available on this machine:
- Docker and Docker Compose
- Node.js 18+ (for any helper scripts)
- curl (for testing webhooks)

If any are missing, output clear installation instructions for macOS (Homebrew) and stop — do not proceed until the user confirms they are installed.

### 1.2 Create project folder structure

Create the following directory layout:

```
irbas-n8n-poc/
├── docker-compose.yml
├── .env                          # gitignored — holds all secrets
├── .env.example                  # committed — shows required keys without values
├── .gitignore
├── supabase/
│   └── schema.sql                # full DB schema to run in Supabase SQL editor
├── n8n-workflows/
│   └── irbas_whatsapp_flow.json  # exported n8n workflow JSON
├── mock-data/
│   ├── send_payment_proof.sh     # curl script simulating a WhatsApp payment message
│   ├── send_expense_proof.sh     # curl script simulating a WhatsApp expense message
│   └── send_unknown.sh           # curl script simulating an unrecognised message
└── README.md                     # step-by-step setup and test guide
```

### 1.3 Docker Compose for n8n

Create `docker-compose.yml` with the following services:

**n8n service:**
- Image: `n8nio/n8n:latest`
- Port: `5678:5678`
- Environment variables loaded from `.env`
- Volume: `./n8n-data:/home/node/.n8n` for workflow persistence
- Set `N8N_BASIC_AUTH_ACTIVE=true`, `N8N_BASIC_AUTH_USER`, `N8N_BASIC_AUTH_PASSWORD` from `.env`
- Set `WEBHOOK_URL=http://localhost:5678` (for local POC)
- Set `N8N_ENCRYPTION_KEY` from `.env`
- Restart policy: `unless-stopped`

No other services needed — Supabase is hosted externally.

### 1.4 Environment file

Create `.env.example` with the following keys (no values):

```
# n8n
N8N_BASIC_AUTH_USER=
N8N_BASIC_AUTH_PASSWORD=
N8N_ENCRYPTION_KEY=

# Groq API (free tier — used for AI classification)
GROQ_API_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Gmail / Email inbox for bank notifications
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
IRBAS_BANK_EMAIL=

# WhatsApp Business API (for production — mock used in POC)
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

Create `.env` with the same keys — leave values empty. Tell the user which ones are needed for the POC to run (see Part 5 — API Keys section).

---

## Part 2 — Supabase Database Schema

Create `supabase/schema.sql`. This file should be run manually by the user in the Supabase SQL editor. Include the following tables:

### Table: `regional_offices`
```sql
id uuid primary key default gen_random_uuid(),
name text not null,                        -- e.g. "Karachi RO"
city text not null,
whatsapp_group_id text,                    -- WhatsApp group ID for matching
balance_pkr numeric(14,2) default 0,       -- current running balance
created_at timestamptz default now()
```

### Table: `customers`
```sql
id uuid primary key default gen_random_uuid(),
name text not null,                        -- e.g. "D.Watson Karachi"
ro_id uuid references regional_offices(id),
contact_phone text,
created_at timestamptz default now()
```

### Table: `whatsapp_messages`
Raw ingestion log — every message received is stored here before processing.
```sql
id uuid primary key default gen_random_uuid(),
raw_payload jsonb not null,                -- full webhook payload from WhatsApp
sender_phone text,
group_id text,
message_text text,
media_url text,                            -- if image/document attached
received_at timestamptz default now(),
classification text,                       -- 'payment_proof' | 'expense_proof' | 'unrecognised'
processing_status text default 'pending'   -- 'pending' | 'processed' | 'failed'
```

### Table: `payment_requests`
Created when a WhatsApp message is classified as a payment proof.
```sql
id uuid primary key default gen_random_uuid(),
whatsapp_message_id uuid references whatsapp_messages(id),
ro_id uuid references regional_offices(id),
amount_pkr numeric(14,2),
payment_method text,                       -- 'bank_transfer' | 'cash_deposit' | 'unknown'
deposit_slip_ref text,                     -- for cash deposits — extracted from message
bank_email_match boolean default false,    -- whether bank email verification succeeded
bank_email_amount numeric(14,2),           -- amount found in matching bank email
bank_email_timestamp timestamptz,          -- timestamp from bank email
status text default 'pending',             -- 'pending' | 'approved' | 'rejected'
approved_by text,
approved_at timestamptz,
rejection_reason text,
created_at timestamptz default now()
```

### Table: `expense_requests`
Created when a WhatsApp message is classified as an expense proof.
```sql
id uuid primary key default gen_random_uuid(),
whatsapp_message_id uuid references whatsapp_messages(id),
ro_id uuid references regional_offices(id),
description text,                          -- AI-extracted description
amount_pkr numeric(14,2),                  -- AI-extracted amount if visible
media_url text,                            -- proof image URL
status text default 'pending',             -- 'pending' | 'approved' | 'rejected'
approved_by text,
approved_at timestamptz,
rejection_reason text,
created_at timestamptz default now()
```

### Table: `ledger_entries`
Created only after a payment_request or expense_request is approved.
```sql
id uuid primary key default gen_random_uuid(),
ro_id uuid references regional_offices(id),
entry_type text not null,                  -- 'payment_received' | 'expense_deducted'
amount_pkr numeric(14,2) not null,
reference_id uuid,                         -- payment_request.id or expense_request.id
description text,
created_at timestamptz default now()
```

### Seed data

After the schema, include INSERT statements for 3 sample ROs and 2 customers per RO so the POC has data to match against:

```sql
INSERT INTO regional_offices (id, name, city, whatsapp_group_id, balance_pkr) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Karachi RO', 'Karachi', 'group_karachi_001', 2500000),
  ('22222222-2222-2222-2222-222222222222', 'Lahore RO', 'Lahore', 'group_lahore_001', 1800000),
  ('33333333-3333-3333-3333-333333333333', 'Islamabad RO', 'Islamabad', 'group_islamabad_001', 950000);

INSERT INTO customers (name, ro_id, contact_phone) VALUES
  ('D.Watson Karachi', '11111111-1111-1111-1111-111111111111', '+92-21-1234567'),
  ('Imtiaz Karachi', '11111111-1111-1111-1111-111111111111', '+92-21-7654321'),
  ('Al-Fatah Lahore', '22222222-2222-2222-2222-222222222222', '+92-42-1234567'),
  ('Naheed Lahore', '22222222-2222-2222-2222-222222222222', '+92-42-9876543'),
  ('Metro Islamabad', '33333333-3333-3333-3333-333333333333', '+92-51-1234567'),
  ('Shifa Pharmacy Islamabad', '33333333-3333-3333-3333-333333333333', '+92-51-9876543');
```

---

## Part 3 — n8n Workflow Design

Build the workflow as a JSON file (`n8n-workflows/irbas_whatsapp_flow.json`) that can be imported directly into n8n via Settings → Import. The workflow must be fully functional on import — all node configurations included, credentials referenced by name.

The workflow has the following nodes in order:

### Node 1: WhatsApp Webhook Trigger
- Type: `n8n-nodes-base.webhook`
- Name: `WhatsApp Incoming`
- HTTP Method: POST
- Path: `whatsapp-incoming`
- Full URL will be: `http://localhost:5678/webhook/whatsapp-incoming`
- Authentication: Query parameter `token` checked against `WHATSAPP_VERIFY_TOKEN`
- Also handle GET requests for WhatsApp webhook verification challenge (return `hub.challenge` value)

### Node 2: Extract Message Fields
- Type: `n8n-nodes-base.set`
- Name: `Extract Fields`
- Extract from webhook body:
  - `sender_phone`: `{{ $json.body.entry[0].changes[0].value.messages[0].from }}`
  - `group_id`: `{{ $json.body.entry[0].changes[0].value.metadata.display_phone_number }}`
  - `message_text`: `{{ $json.body.entry[0].changes[0].value.messages[0].text?.body ?? '' }}`
  - `media_id`: `{{ $json.body.entry[0].changes[0].value.messages[0].image?.id ?? $json.body.entry[0].changes[0].value.messages[0].document?.id ?? '' }}`
  - `raw_payload`: `{{ JSON.stringify($json.body) }}`
- For POC: also handle simplified mock payload format (see mock scripts in Part 4)

### Node 3: Store Raw Message in Supabase
- Type: `n8n-nodes-base.httpRequest`
- Name: `Log Raw Message`
- Method: POST
- URL: `{{ $env.SUPABASE_URL }}/rest/v1/whatsapp_messages`
- Headers:
  - `apikey`: `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
  - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
  - `Content-Type`: `application/json`
  - `Prefer`: `return=representation`
- Body:
```json
{
  "raw_payload": "{{ $node['Extract Fields'].json.raw_payload }}",
  "sender_phone": "{{ $node['Extract Fields'].json.sender_phone }}",
  "group_id": "{{ $node['Extract Fields'].json.group_id }}",
  "message_text": "{{ $node['Extract Fields'].json.message_text }}",
  "processing_status": "pending"
}
```
- Store returned `id` as `whatsapp_message_id` for downstream nodes

### Node 4: AI Classification (Groq API)
- Type: `n8n-nodes-base.httpRequest`
- Name: `Groq Classification`
- Method: POST
- URL: `https://api.groq.com/openai/v1/chat/completions`
- Headers:
  - `Authorization`: `Bearer {{ $env.GROQ_API_KEY }}`
  - `Content-Type`: `application/json`
- Body:
```json
{
  "model": "llama3-8b-8192",
  "temperature": 0,
  "max_tokens": 300,
  "messages": [
    {
      "role": "system",
      "content": "You are a classifier for messages sent by Pakistani Regional Office accountants in a WhatsApp business group. You must respond with ONLY valid JSON — no explanation, no markdown, no backticks. Just the raw JSON object."
    },
    {
      "role": "user",
      "content": "Classify the following message into exactly one category and extract key fields.\n\nMessage: \"{{ $node['Extract Fields'].json.message_text }}\"\nHas image attached: {{ $node['Extract Fields'].json.media_id !== '' }}\n\nRespond with ONLY this JSON structure:\n{\n  \"classification\": \"payment_proof\" | \"expense_proof\" | \"unrecognised\",\n  \"amount_pkr\": <number or null>,\n  \"payment_method\": \"bank_transfer\" | \"cash_deposit\" | \"unknown\" | null,\n  \"deposit_slip_ref\": \"<string or null>\",\n  \"description\": \"<one line summary in English>\"\n}\n\nClassification rules:\n- payment_proof: message mentions payment, transfer, deposit, amount sent to IRBAS account\n- expense_proof: message mentions expense, repair, purchase, bill, petrol, utility paid by the RO\n- unrecognised: anything else (greetings, announcements, questions)\n\nAmount extraction rules:\n- Pakistani formats: 450,000 or 4.5 lac or 4.5 lakh or 450000 are all valid numbers\n- Extract deposit slip or reference numbers if mentioned (e.g. slip number 2024-1847)\n- If no amount visible, return null"
    }
  ]
}
```
- Parse `choices[0].message.content` from response as JSON
- Important: Groq with llama3-8b-8192 is free up to 30 requests/minute on the free tier — more than sufficient for POC testing

### Node 5: Classification Router (Switch)
- Type: `n8n-nodes-base.switch`
- Name: `Route by Classification`
- Route on: `{{ $node['Groq Classification'].json.classification }}`
- Case `payment_proof` → Branch A
- Case `expense_proof` → Branch B
- Default → Branch C (unrecognised)

---

### Branch A — Payment Proof Flow

#### Node A1: Check Bank Email
- Type: `n8n-nodes-base.gmail`
- Name: `Search Bank Emails`
- Operation: `getAll`
- Filters:
  - `q`: `from:{{ $env.IRBAS_BANK_EMAIL }} after:{{ new Date(Date.now() - 86400000).toISOString().split('T')[0].replace(/-/g,'/') }}`
  - `maxResults`: 20
- Credential: Gmail OAuth2 (named `IRBAS Gmail`)

#### Node A2: Match Bank Email to Payment
- Type: `n8n-nodes-base.code`
- Name: `Match Email to Payment`
- Language: JavaScript
- Logic:
  - Get `claimed_amount` from Claude classification output
  - Get `claimed_slip_ref` from Claude classification output
  - Loop through Gmail results
  - For each email, extract amount from body using regex patterns for Pakistani bank formats:
    - HBL: `PKR[\s]*([0-9,]+)`
    - MCB: `Rs\.[\s]*([0-9,]+)`
    - UBL: `Amount:[\s]*PKR[\s]*([0-9,]+)`
    - Generic: `([0-9]{3,}[,][0-9]{3})` (e.g. 450,000)
  - Also extract deposit slip reference if present
  - Match criteria:
    - Amount within ±500 PKR of claimed amount AND within 24 hours
    - OR deposit slip reference exact match
  - Return: `{ matched: boolean, bank_amount: number|null, bank_timestamp: string|null, match_confidence: 'high'|'low' }`

#### Node A3: Lookup RO from Group ID
- Type: `n8n-nodes-base.httpRequest`
- Name: `Find RO`
- Method: GET
- URL: `{{ $env.SUPABASE_URL }}/rest/v1/regional_offices?whatsapp_group_id=eq.{{ $node['Extract Fields'].json.group_id }}&select=id,name`
- Headers: standard Supabase headers

#### Node A4: Create Payment Request
- Type: `n8n-nodes-base.httpRequest`
- Name: `Create Payment Request`
- Method: POST
- URL: `{{ $env.SUPABASE_URL }}/rest/v1/payment_requests`
- Body built from Groq classification + email match result + RO lookup:
```json
{
  "whatsapp_message_id": "{{ $node['Log Raw Message'].json[0].id }}",
  "ro_id": "{{ $node['Find RO'].json[0].id }}",
  "amount_pkr": {{ $node['Groq Classification'].json.amount_pkr }},
  "payment_method": "{{ $node['Groq Classification'].json.payment_method }}",
  "deposit_slip_ref": "{{ $node['Groq Classification'].json.deposit_slip_ref }}",
  "bank_email_match": {{ $node['Match Email to Payment'].json.matched }},
  "bank_email_amount": {{ $node['Match Email to Payment'].json.bank_amount ?? 'null' }},
  "bank_email_timestamp": "{{ $node['Match Email to Payment'].json.bank_timestamp }}",
  "status": "{{ $node['Match Email to Payment'].json.matched && $node['Match Email to Payment'].json.match_confidence === 'high' ? 'pending' : 'pending' }}"
}
```
Note: all payment requests go to `pending` regardless of match — auto-approve is not enabled in POC. The `bank_email_match` flag gives the accountant confidence signal only.

#### Node A5: Update Message Status
- Type: `n8n-nodes-base.httpRequest`
- Name: `Mark Message Processed`
- Method: PATCH
- URL: `{{ $env.SUPABASE_URL }}/rest/v1/whatsapp_messages?id=eq.{{ $node['Log Raw Message'].json[0].id }}`
- Body: `{ "classification": "payment_proof", "processing_status": "processed" }`

---

### Branch B — Expense Proof Flow

#### Node B1: Lookup RO from Group ID
- Same as Node A3 — reuse pattern

#### Node B2: Create Expense Request
- Type: `n8n-nodes-base.httpRequest`
- Name: `Create Expense Request`
- Method: POST
- URL: `{{ $env.SUPABASE_URL }}/rest/v1/expense_requests`
- Body:
```json
{
  "whatsapp_message_id": "{{ $node['Log Raw Message'].json[0].id }}",
  "ro_id": "{{ $node['Find RO B'].json[0].id }}",
  "description": "{{ $node['Groq Classification'].json.description }}",
  "amount_pkr": {{ $node['Groq Classification'].json.amount_pkr ?? 'null' }},
  "media_url": "{{ $node['Extract Fields'].json.media_id }}",
  "status": "pending"
}
```

#### Node B3: Update Message Status
- Same pattern as A5 — classification: `expense_proof`

---

### Branch C — Unrecognised Flow

#### Node C1: Update Message Status
- Classification: `unrecognised`, status: `processed`
- No request created — message logged only

---

## Part 4 — Mock Test Scripts

Since WhatsApp Business API setup requires business verification (days/weeks), create mock curl scripts that simulate the exact webhook payload shape n8n expects. This lets the full workflow be tested without a real WhatsApp account.

### `mock-data/send_payment_proof.sh`
```bash
#!/bin/bash
# Simulates: RO Karachi accountant sends payment proof message
# "Sir payment kar di 450,000 D.Watson wali, slip number 2024-1847"

curl -X POST "http://localhost:5678/webhook/whatsapp-incoming?token=${WHATSAPP_VERIFY_TOKEN:-test_token_123}" \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "entry": [{
        "changes": [{
          "value": {
            "metadata": { "display_phone_number": "group_karachi_001" },
            "messages": [{
              "from": "+923001234567",
              "text": { "body": "Sir payment kar di 450,000 D.Watson wali, slip number 2024-1847" },
              "timestamp": "'"$(date +%s)"'"
            }]
          }
        }]
      }]
    }
  }'
```

### `mock-data/send_expense_proof.sh`
```bash
#!/bin/bash
# Simulates: RO Lahore accountant sends AC repair expense

curl -X POST "http://localhost:5678/webhook/whatsapp-incoming?token=${WHATSAPP_VERIFY_TOKEN:-test_token_123}" \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "entry": [{
        "changes": [{
          "value": {
            "metadata": { "display_phone_number": "group_lahore_001" },
            "messages": [{
              "from": "+923009876543",
              "text": { "body": "AC repair karwa di office ki, 35,000 lage hain, receipt attach hai" },
              "timestamp": "'"$(date +%s)"'"
            }]
          }
        }]
      }]
    }
  }'
```

### `mock-data/send_unknown.sh`
```bash
#!/bin/bash
# Simulates: unrecognised message

curl -X POST "http://localhost:5678/webhook/whatsapp-incoming?token=${WHATSAPP_VERIFY_TOKEN:-test_token_123}" \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "entry": [{
        "changes": [{
          "value": {
            "metadata": { "display_phone_number": "group_islamabad_001" },
            "messages": [{
              "from": "+923005556666",
              "text": { "body": "Kal office band rahega Eid ki wajah se" },
              "timestamp": "'"$(date +%s)"'"
            }]
          }
        }]
      }]
    }
  }'
```

Make all three scripts executable: `chmod +x mock-data/*.sh`

---

## Part 5 — Simple Approval UI

Create a single self-contained HTML file `approval-ui/index.html` that the accountant can open in a browser to review and approve/reject pending items. This does NOT need a backend server — it calls Supabase REST API directly from the browser.

Requirements:
- Two tabs: "Payment Requests" and "Expense Requests"
- Each tab shows a table of pending items with columns:
  - Payment tab: RO name, amount, payment method, deposit slip ref, bank email matched (green tick / red cross), date received
  - Expense tab: RO name, description, amount (if extracted), date received
- Each row has Approve and Reject buttons
- Approve: PATCH status to `approved`, POST a new `ledger_entry`, UPDATE `regional_offices.balance_pkr`
- Reject: PATCH status to `rejected` with a prompt for rejection reason
- After action: row disappears from list, show success toast
- Supabase URL and anon key hardcoded in the file for POC (with comment to replace)
- Minimal styling — use a CSS framework via CDN (Tailwind CDN is fine for POC)
- No build step required — pure HTML + vanilla JS

---

## Part 6 — README

Write a `README.md` that covers:

### Setup steps (in order):
1. Clone / create the project folder
2. Copy `.env.example` to `.env` and fill in the required keys (list which ones are minimum viable for POC)
3. Run `docker compose up -d`
4. Open n8n at `http://localhost:5678`, log in with credentials from `.env`
5. Import workflow from `n8n-workflows/irbas_whatsapp_flow.json` via Settings → Import
6. Set up credentials in n8n (Gmail OAuth2, any HTTP header auth)
7. Run schema in Supabase SQL editor
8. Activate the workflow in n8n
9. Run mock scripts to test
10. Open `approval-ui/index.html` to process the queue

### Testing each scenario:
- Payment proof with bank email match
- Payment proof without bank email match (still goes to queue)
- Expense proof
- Unrecognised message
- Approving a payment and verifying ledger entry created

### Troubleshooting common issues

---

## Part 7 — API Keys Required

At the end of the README and as a standalone section here, list every credential needed with exactly where to get it:

### Minimum for basic POC (no real WhatsApp, no real bank email):
These allow you to test classification and Supabase storage with mock scripts.

| Key | Where to get it | Notes |
|-----|----------------|-------|
| `GROQ_API_KEY` | console.groq.com → API Keys | Free tier — 30 req/min, 14,400 req/day. No credit card needed. Model: `llama3-8b-8192` |
| `SUPABASE_URL` | Supabase project → Settings → API → Project URL | Free tier is fine |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API → service_role key | Keep secret — full DB access |
| `N8N_BASIC_AUTH_USER` | Any string you choose | e.g. `admin` |
| `N8N_BASIC_AUTH_PASSWORD` | Any string you choose | e.g. `irbas_poc_2024` |
| `N8N_ENCRYPTION_KEY` | Any random 32-char string | Run: `openssl rand -hex 16` |
| `WHATSAPP_VERIFY_TOKEN` | Any string you choose | e.g. `test_token_123` — used to authenticate mock scripts |

### Additional for bank email verification:

| Key | Where to get it | Notes |
|-----|----------------|-------|
| `GMAIL_CLIENT_ID` | console.cloud.google.com → OAuth 2.0 Client IDs | Create a project, enable Gmail API, create OAuth credentials |
| `GMAIL_CLIENT_SECRET` | Same as above | Download the JSON, copy secret |
| `GMAIL_REFRESH_TOKEN` | Use OAuth Playground: developers.google.com/oauthplayground | Scope: `https://www.googleapis.com/auth/gmail.readonly` |
| `IRBAS_BANK_EMAIL` | The "from" address on IRBAS bank transaction emails | e.g. `alerts@hbl.com` — check actual bank email |

### For real WhatsApp (production path only — not needed for POC):

| Key | Where to get it | Notes |
|-----|----------------|-------|
| `WHATSAPP_API_TOKEN` | Meta Developer Console → WhatsApp → API Setup | Requires approved WhatsApp Business account |
| `WHATSAPP_PHONE_NUMBER_ID` | Same as above | The phone number ID of the registered business number |

---

## Implementation Notes for Claude Code

- Use `n8n-nodes-base.httpRequest` for all Supabase calls rather than the Supabase community node — it's more reliable and easier to debug in POC
- The Gmail node requires OAuth2 credentials set up inside n8n UI — the workflow JSON should reference credential name `IRBAS Gmail` and the user will need to connect it after import
- All monetary amounts should be stored as `numeric(14,2)` — never as strings
- The bank email matching logic (Node A2) is the most failure-prone part — add generous console.log / error output in the Code node so failures are visible in n8n execution logs
- For the approval UI, use Supabase anon key (not service role key) with row-level security disabled for POC — note this in the README as something to fix before production
- If Groq API returns malformed JSON in the classification response, catch the parse error and default classification to `unrecognised` — never let a bad AI response crash the workflow. Groq with llama3-8b-8192 occasionally adds markdown backticks around the JSON despite instructions — strip them with a regex before parsing: `response.replace(/```json|```/g, '').trim()`
- Test the workflow with all three mock scripts before declaring the POC complete
- The entire POC should be runnable on a MacBook with 8GB RAM — keep Docker resource usage minimal

---

## Deliverables Checklist

Before finishing, confirm every item exists and works:

- [ ] `docker-compose.yml` starts n8n successfully on port 5678
- [ ] `.env.example` lists all required keys with descriptions
- [ ] `supabase/schema.sql` runs without errors and seeds 3 ROs + 6 customers
- [ ] `n8n-workflows/irbas_whatsapp_flow.json` imports cleanly into n8n
- [ ] All 5 workflow branches connect without errors in n8n canvas
- [ ] `mock-data/send_payment_proof.sh` triggers the full payment branch
- [ ] `mock-data/send_expense_proof.sh` triggers the expense branch
- [ ] `mock-data/send_unknown.sh` triggers the unrecognised branch
- [ ] `approval-ui/index.html` opens in browser, shows pending items, approve/reject works
- [ ] `README.md` covers setup, testing, and all API keys
