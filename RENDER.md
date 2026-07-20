# Deploying Orbit + n8n to Render (demo / free plan)

This deploys five services from `render.yaml`: **Postgres**, **Key Value** (Redis),
**orbit-api** (NestJS), **orbit-web** (Next.js), **orbit-n8n** (workflow engine).

> Free-plan reality check: web services **sleep after ~15 min idle**. Before a live
> WhatsApp test, open the n8n URL once to wake it so Meta's webhook lands. Free
> Postgres is removed after ~30 days. Uploaded files are ephemeral. All fine for a demo.

---

## 1. Create the blueprint

1. Push `render.yaml` to `master` (done by the deploy commit).
2. Render Dashboard → **New → Blueprint** → connect the **MAK-esoft/Orbit** repo.
3. Render parses `render.yaml` and lists the 5 resources → **Apply**.
4. It will prompt for every `sync: false` value. You can leave the cross-service
   URLs blank on the first apply, let the services get their URLs, then fill them
   in (step 3) and redeploy.

## 2. Note the assigned URLs

After the first deploy each web service has a public URL, e.g.:

| Service | Example URL |
|---|---|
| orbit-api | `https://orbit-api-xxxx.onrender.com` |
| orbit-web | `https://orbit-web-xxxx.onrender.com` |
| orbit-n8n | `https://orbit-n8n-xxxx.onrender.com` |

## 3. Fill the environment variables

**orbit-api** (Environment tab):
| Key | Value |
|---|---|
| `FRONTEND_URL` | the **web** URL |
| `API_URL` | the **api** URL |
| `PUBLIC_API_BASE_URL` | the **api** URL |
| `N8N_APP_SUBMISSION_WEBHOOK_URL` | `<n8n URL>/webhook/app-submission` (optional; app round-trip) |

**orbit-web**:
| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | the **api** URL |

**orbit-n8n**:
| Key | Value |
|---|---|
| `N8N_HOST` | the n8n **hostname only** (e.g. `orbit-n8n-xxxx.onrender.com`, no `https://`) |
| `WEBHOOK_URL` | the full **n8n** URL (`https://orbit-n8n-xxxx.onrender.com`) |
| `ORBIT_API_BASE_URL` | `<api URL>/api` |
| `GROQ_API_KEY` | your Groq key |
| `OPENAI_API_KEY` | your OpenAI key |
| `WHATSAPP_VERIFY_TOKEN` | `orb_token_44440` (any string; reused in Meta) |
| `WHATSAPP_API_TOKEN` | Meta access token — **use a permanent System User token** (see §7) |
| `WHATSAPP_PHONE_NUMBER_ID` | `1234940546363386` |

`INTEGRATION_API_KEY` and the JWT/encryption secrets are auto-generated and shared
by the blueprint — leave them alone. After editing, **Manual Deploy → Deploy latest**
on the affected services.

## 4. Import the workflow into hosted n8n

The hosted n8n starts empty. Open the **n8n URL** (basic-auth user `admin`, password
= the auto-generated `N8N_BASIC_AUTH_PASSWORD` from its Environment tab), then:

- **⋯ → Import from File** → upload `orbit-n8n/irbas-n8n-poc/n8n-workflows/irbas_whatsapp_flow.json`
- **Save**, then toggle **Active**.

This registers `POST/GET /webhook/whatsapp-incoming` and `/webhook/app-submission`
on the public n8n URL. Because all secrets come from `$env.*`, no n8n credentials
need to be configured.

## 5. Assign RO WhatsApp numbers

Log into the web app as admin (`review@orbit.irbas.com` / `ChangeMe123!`) →
**Regional Offices** → use the **WhatsApp #** action per office:
- Lahore RO → `03012715214`
- Islamabad RO → `03045842361`

(These are seeded blank on a fresh DB; the local dev DB already had them set.)

## 6. Point Meta at the hosted webhook

Meta → your app → **WhatsApp → Configuration → Webhook → Edit**:
- **Callback URL** → `https://orbit-n8n-xxxx.onrender.com/webhook/whatsapp-incoming`
- **Verify token** → `orb_token_44440`
- **Verify and save**, then **Subscribe** to the **`messages`** field.

This URL is **stable** (unlike the local tunnel) — set it once.

## 7. Use a permanent WhatsApp token

The API-Setup access token expires in ~24h. For a demo that outlives a day, create a
**System User token** (Meta Business Settings → System Users → Add → assign the WhatsApp
account → Generate token with `whatsapp_business_messaging` + `whatsapp_business_management`),
and put it in `orbit-n8n`'s `WHATSAPP_API_TOKEN`.

## 8. Smoke test

1. Open the n8n URL once to wake it (free tier).
2. From `03012715214`, WhatsApp the test number a text proof → it should appear in
   the web app under **All Requests** (WhatsApp / Lahore / Submitted) with an
   **Extracted Information** panel.
3. Send a slip image with a caption → the vision path fills dynamic fields.

## Login accounts (seeded)

All passwords `ChangeMe123!`: admin `review@orbit.irbas.com`,
RO Lahore `ro.lahore@orbit.irbas.com`, RO Islamabad `ro.islamabad@orbit.irbas.com`.
