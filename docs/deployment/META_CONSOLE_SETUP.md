# Meta Developer Console — WhatsApp setup (Client Zero / production)

Use this when Meta’s **WhatsApp Direct Signup Config V2** wizard shows console errors but you still need a live number on ZiricAI.

## Console errors — what they mean

### `Fetch API cannot load … on.aws/events?cee=no` (CSP)

This comes from **Meta’s own** JavaScript (telemetry). It is blocked by Meta’s Content Security Policy on their domain. It does **not** block ZiricAI and you can ignore it.

### `[GraphAPICore] WhatsAppDirectSignupConfigV2ComposeMessageStep … error 100`

Meta’s **in-console “send a test message”** step failed. Common causes:

| Cause | What to do |
|--------|------------|
| Wizard sends a payload Graph rejects (often must be a **template**, not free text) | **Skip** the compose step if Meta allows **Continue** / finish configuration elsewhere |
| Phone number ID not fully linked to the app / WABA | WhatsApp → **API Setup** → confirm **Phone number ID** matches the ID in the error URL (e.g. `1367658163096002`) |
| App still in **Development** mode | Add your personal number to **API Setup → To** list (E.164 **digits only**, no `+`) |
| Missing permissions | App Review / permissions: `whatsapp_business_messaging`, `whatsapp_business_management` |
| Business verification or display name pending | Finish in Business Manager; retry later |
| Marketing / WhatsApp Business TOS not accepted | Accept all prompts in Business Manager and WhatsApp Manager |

You do **not** need that wizard step to succeed for ZiricAI. You need: **webhook verified**, **permanent token**, **phone number ID**, and Railway env vars (below).

## Recommended path (manual — works with ZiricAI)

### 1. Webhook (Meta → WhatsApp → Configuration)

| Field | Value |
|--------|--------|
| **Callback URL** | `https://ziricai-production.up.railway.app/webhook` (or your `PUBLIC_API_BASE_URL` + `/webhook`) |
| **Verify token** | Same string as Railway `VERIFY_TOKEN` (no spaces) |
| **Subscribe** | `messages` (optional: `message_status`) |

Click **Verify and save**. If it fails, fix Railway `VERIFY_TOKEN` and redeploy, then verify again.

Local check (replace token):

```bash
curl "https://ziricai-production.up.railway.app/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

Expect HTTP **200** and body `test123`.

Set **App secret** on Railway as `META_APP_SECRET` (Meta → App → Settings → Basic).

### 2. Credentials (Meta → WhatsApp → API Setup)

Copy:

- **Phone number ID** → Railway `PHONE_NUMBER_ID` (and optional `CLIENT_ZERO_WHATSAPP_PHONE_NUMBER_ID`)
- **WhatsApp Business Account ID** → optional `WHATSAPP_BUSINESS_ACCOUNT_ID` / `CLIENT_ZERO_WHATSAPP_WABA_ID`
- **Temporary** token from API Setup, or a **System User** permanent token with WhatsApp permissions → Railway `WHATSAPP_TOKEN`

### 3. Railway variables (Client Zero)

| Variable | Purpose |
|----------|---------|
| `PHONE_NUMBER_ID` | Meta phone number ID |
| `WHATSAPP_TOKEN` | Permanent access token |
| `VERIFY_TOKEN` | Webhook verify (must match Meta) |
| `META_APP_SECRET` | Validates inbound webhook signatures |
| `DEFAULT_COMPANY_ID` | `ziricai` (fallback tenant for legacy routing) |
| `OPENAI_API_KEY` | Sarah replies |

Do **not** set `WHATSAPP_DEV_MODE=true` in production.

Redeploy after changes.

### 4. Link tenant in ZiricAI (Meta already done)

**Option A — Mission Control (fastest):** **Tenants → Ziricai → Edit Company** → WhatsApp section → **Link Meta number from Railway**. Expect **Runtime ready** and status **Active**.

**Option B — Company Portal:** Settings → Channels → WhatsApp → **Link Client Zero WhatsApp**.

**Option C — Redeploy Railway:** Startup runs Client Zero sync automatically when `WHATSAPP_TOKEN` and `PHONE_NUMBER_ID` are set.

This writes the integration doc so webhooks map **phone_number_id → ziricai**.

### 5. Test outside Meta’s broken wizard

**Development app:** add your mobile number to Meta **To** list, then run:

```bash
node scripts/verify-meta-whatsapp-config.js
```

Or send **hello_world** from API Setup / Graph API Explorer:

`POST /{PHONE_NUMBER_ID}/messages` with `type: template`, template `hello_world`, language `en_US`.

**Production number:** message the business WhatsApp from your phone; check Railway logs for `POST /webhook`.

## Embedded Signup (Company Portal → Connect WhatsApp)

**Configuration ID:** `2689933368070171` (`ZiricAI WhatsApp Embedded Sign`)

### Meta console (must match production)

| Setting | Value |
|--------|--------|
| **Allowed JavaScript SDK domain** | `ziricai.com` (and `app.ziricai.com` if users open the portal there) |
| **Valid OAuth Redirect URI** | `https://ziricai.com` |
| **Embedded Signup config** | Login variation: WhatsApp Embedded Signup; products: Cloud API + Marketing Messages |

Add `app.ziricai.com` under **Allowed domains** if the portal is not proxied through the apex domain.

### Railway / API env (required for self-serve connect)

| Variable | Purpose |
|----------|---------|
| `META_APP_ID` | ZiricAI Meta app ID |
| `META_APP_SECRET` | Server-only — OAuth code exchange |
| `WHATSAPP_EMBEDDED_CONFIG_ID` | `2689933368070171` |
| `META_GRAPH_VERSION` | `v26.0` (supported; override only if Meta docs require another version for a specific call) |
| `WHATSAPP_TOKEN` | System-user token (used when Meta returns IDs only, or as fallback after exchange) |
| `VERIFY_TOKEN` / `META_APP_SECRET` | Webhook verify + signature validation |

Secrets must **never** ship to Netlify static sites — only the Railway API holds `META_APP_SECRET` and tokens.

### Flow

1. Tenant owner/manager → **Integrations** → **Connect WhatsApp** → **Continue with Meta**
2. Browser loads Facebook JS SDK with public `appId` + `configId` from `GET /api/integrations/whatsapp/embedded-signup-config`
3. Meta returns WABA / phone IDs via postMessage; authorization `code` goes to the API
4. API exchanges code (when present), verifies Graph access, subscribes webhooks, stores integration under `companies/{id}/integrations/whatsapp`

Without `META_APP_ID` + `WHATSAPP_EMBEDDED_CONFIG_ID`, Client Zero can still use the **manual link** flow above.

## When to contact Meta

If signup fails with `WA_EMBEDDED_SIGNUP` **ERROR** / **CANCEL**, note **error_code**, **session_id**, and **timestamp** from the browser console and use [Meta Business Support](https://business.facebook.com/business/help) or Developer Support.

## Related

- [WHATSAPP.md](./WHATSAPP.md) — env vars, sandbox 131030, Railway troubleshooting
- [RAILWAY.md](./RAILWAY.md) — deploy and optional WhatsApp vars
