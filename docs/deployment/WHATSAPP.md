# WhatsApp Integration — Deployment & Development

ZiricAI connects to Meta's WhatsApp Cloud API for inbound webhooks and outbound replies. This guide covers development sandbox restrictions, production setup, and troubleshooting.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PHONE_NUMBER_ID` | Yes | Meta WhatsApp phone number ID |
| `WHATSAPP_TOKEN` | Yes | Permanent access token from Meta |
| `VERIFY_TOKEN` | Yes | Webhook verification token (you choose this value) |
| `META_APP_SECRET` | Recommended | Validates `X-Hub-Signature-256` on webhooks |
| `WHATSAPP_DEV_MODE` | Optional | Set to `true` to skip outbound sends (logs only) |
| `DEFAULT_COMPANY_ID` | Optional | Tenant when not resolved from phone number ID |

## Development vs production

### Development (Meta sandbox)

Meta's WhatsApp **test/sandbox** environment only allows outbound messages to phone numbers on the **To** list in Meta Business Manager.

1. Open [Meta for Developers](https://developers.facebook.com/) → your app → **WhatsApp** → **API Setup**.
2. Under **Send and receive messages**, find the **To** field.
3. Click **Manage phone number list** and add each test recipient in **E.164 digits only** (no `+`), e.g. `27821234567`.
4. Save and wait a few seconds before messaging again.

**Common sandbox signals:**

- Meta's automated test sender `16315551181` is used for **Step 2** in API Setup (Meta → you). It is **not** the same as your assigned sandbox business number.
- Sandbox `phone_number_id` is often `123456123`. ZiricAI auto-detects this and treats the environment as dev (same as `WHATSAPP_DEV_MODE=true`).

### ZiricAI dev sandbox (this project)

| Role | Display | E.164 digits | Notes |
|------|---------|--------------|-------|
| **Test business number** — message **to** this | +1 (555) 182-9611 | `15551829611` | Shown in Meta → WhatsApp → API Setup. Set `PHONE_NUMBER_ID=1209265748933699` in `.env`. |
| **Test recipient** — message **from** this | +27 84 900 0523 | `27849000523` | Add to Meta **To** list (digits only, no `+`). Used as demo CRM contact "John Smith" in seed data. |

**Inbound test:** From your phone (`27849000523`), send WhatsApp to the test business number (`15551829611`). Meta POSTs to your webhook → ZiricAI ingests → AI reply goes back to `27849000523` (requires To-list entry in dev).

**Outbound-only test (Meta Step 2):** Meta sends from `16315551181` to numbers on the To list — this proves credentials but does **not** exercise your inbound webhook.

**Error 131030 — "Recipient phone number not in allowed list"**

This is expected in dev when the recipient is not on the Meta To list. ZiricAI treats this as **non-retryable**: inbound messages are still ingested and saved; only the outbound reply is skipped after logging an actionable message.

Set `WHATSAPP_DEV_MODE=true` locally if you want to process inbound + AI replies without calling Meta's send API at all.

### Production

In production (live WhatsApp Business number):

- Any user who has opted in and messaged your business number can receive replies — no To list required.
- Use your **live** `PHONE_NUMBER_ID` and token from a verified Meta Business account.
- Do **not** set `WHATSAPP_DEV_MODE=true`.

## Webhook setup

**Canonical callback URL:** `https://your-domain.com/webhook`

Meta Developer Console → WhatsApp → Configuration:

1. Deploy ZiricAI with a public HTTPS URL (e.g. Railway, ngrok for local dev).
2. Set **Callback URL** to `https://your-domain.com/webhook` (not `/webhooks/whatsapp`).
3. Set **Verify token** to the same value as Railway/env `VERIFY_TOKEN` (no leading/trailing spaces).
4. Set `META_APP_SECRET` to your Meta app secret (Settings → Basic) — required for POST signature validation.
5. Subscribe to `messages` (and optionally `message_status`).

`/webhooks/whatsapp` is a legacy alias that delegates to the same handler; prefer `/webhook` in Meta.

## End-to-end test flow

1. Add your real mobile number to the Meta **To** list (dev only) — e.g. `27849000523` for +27 84 900 0523.
2. Send a WhatsApp message **from that phone** to the test business number in API Setup — e.g. `15551829611` (+1 555 182-9611).
3. Confirm logs:
   - `POST /webhook` → inbound received
   - Pipeline ingest + `PROCESS_INBOUND_MESSAGE` enqueued
   - Outbound send succeeds (or dev-mode skip logged)
4. Check the conversation in the ZiricAI admin UI — inbound and AI reply should appear even if outbound to Meta failed (dev allowlist).

## Error handling behavior

| Condition | Retries | Job impact |
|-----------|---------|------------|
| Meta code **131030** (allowlist) | No | Inbound succeeds; outbound logged only |
| Other **131xxx** config errors | No | Same |
| HTTP **429** / rate limit | Yes (up to 3) | Inbound succeeds; outbound retried separately |
| HTTP **5xx** | Yes (up to 3) | Same |
| `WHATSAPP_DEV_MODE=true` | N/A | Outbound skipped; job completes |

Outbound retries use exponential backoff (1s, 2s, 4s) via the integration retry queue. Inbound processing (`PROCESS_INBOUND_MESSAGE`) is never failed solely because outbound delivery failed.

## Related docs

- [Integration Hub](../architecture/INTEGRATION_HUB.md) — adapter architecture and webhook routes
- [Railway deployment](./RAILWAY.md) — hosting the API + webhook endpoint

## Railway production troubleshooting

Production URL: `https://ziricai-production.up.railway.app/webhook`

### 1. Confirm the API is up

```bash
curl https://ziricai-production.up.railway.app/health
curl https://ziricai-production.up.railway.app/api/integrations/health
```

Expect `whatsapp: true` and `channels[].configured: true` for WhatsApp when `PHONE_NUMBER_ID` and `WHATSAPP_TOKEN` are set on Railway.

### 2. Webhook verify must return the challenge (not 403)

```bash
curl "https://ziricai-production.up.railway.app/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

- **200 + body `test123`** — verify token matches Railway `VERIFY_TOKEN`
- **403 Forbidden** — `VERIFY_TOKEN` on Railway does **not** match Meta Developer Console → fix env var, redeploy, re-verify webhook in Meta

Set in Railway → Variables:

| Variable | Example (ZiricAI sandbox) |
|----------|---------------------------|
| `VERIFY_TOKEN` | Must match Meta webhook verify token exactly |
| `PHONE_NUMBER_ID` | `1209265748933699` |
| `WHATSAPP_TOKEN` | Permanent token from Meta → WhatsApp → API Setup |
| `META_APP_SECRET` | Meta app secret (Settings → Basic). Must match app; wrong value drops inbound POSTs |
| `OPENAI_API_KEY` | Required for AI replies |
| `DEFAULT_COMPANY_ID` | e.g. `demo-central-motors` — tenant for legacy `/webhook` |
| `WHATSAPP_DEV_MODE` | **Do not set** on production unless you intentionally skip outbound sends |

After changing variables: **Redeploy** the Railway service.

### 3. Meta Developer Console

1. **Callback URL:** `https://ziricai-production.up.railway.app/webhook`
2. **Verify token:** same string as Railway `VERIFY_TOKEN`
3. Subscribe to **messages**
4. **Sandbox only:** add test recipient `27849000523` (E.164 digits, no `+`) to Meta → WhatsApp → API Setup → **To** list

### 4. Why "hi" gets no reply — checklist

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Verify returns 403 | `VERIFY_TOKEN` mismatch | Align Railway + Meta, redeploy, re-verify webhook |
| No `POST /webhook` in Railway logs | Webhook not subscribed / wrong URL | Fix verify + Meta callback URL |
| POST logged but no reply | `WHATSAPP_DEV_MODE=true` | Remove from Railway env |
| POST logged, worker runs, no WhatsApp | Sandbox **131030** (not on To list) | Add `27849000523` to Meta To list |
| Outbound Meta 401/190 | Expired `WHATSAPP_TOKEN` | Regenerate token in Meta, update Railway |
| POST returns 401 | `META_APP_SECRET` wrong or signature mismatch | Set correct app secret; ensure latest deploy (raw body capture for signatures) |

Inbound messages are still saved when outbound fails (131030). Check Railway deploy logs for `[webhook]`, `[worker]`, and `[whatsapp]` lines.
