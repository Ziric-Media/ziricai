# Sarah — Google Play store listing (copy/paste)

## App identity

| Field | Value |
|-------|--------|
| App name | Sarah |
| Default language | English (South Africa) — or English (United States) |
| App or game | App |
| Free or paid | Free |
| Category | Lifestyle (or Education if school-first positioning) |
| Package name | `com.ziricai.sarah.twa` (set automatically from AAB) |

## Privacy & contact

| Field | Value |
|-------|--------|
| Privacy policy URL | https://marketing.ziricai.com/sarah-privacy.html *(after marketing deploy — not the business `/privacy.html`)* |
| Website | https://sarah.ziricai.com |
| Email | *(your Play developer contact email)* |

## Short description (max 80 chars)

```
Sarah — your AI assistant for businesses, bookings, and school enquiries.
```

## Full description (max 4000 chars)

```
Sarah is your personal AI assistant from ZiricAI.

• Chat with Sarah at home — tasks, bookings, and follow-ups
• Open any business on Discover and talk to their Company Sarah
• School parents: enrolment enquiries and support where your school uses ZiricAI Educare

Sarah runs as a secure connection to sarah.ziricai.com — the same experience as the web app, packaged for your phone.

You need a Sarah account to sign in. Businesses choose what Sarah can do on their side; Sarah never makes binding school admission or payment decisions without staff approval.

Questions: support via your ZiricAI business contact or the website.
```

## Data safety (honest minimum — adjust with legal)

- **Data collected:** Account info (email/phone via Firebase Auth), app activity (messages you send in chat), optional photos if you attach them.
- **Data shared:** Processed by ZiricAI to operate the service; not sold.
- **Encryption in transit:** Yes (HTTPS).
- **Deletion:** User can request account/data deletion via support (document your process).

## Content rating

Complete Play’s questionnaire — expect **Everyone** or **Teen** depending on user-generated chat; no violence/gambling in the app shell.

## Graphics (you must upload)

| Asset | Spec |
|-------|------|
| App icon | 512×512 PNG (use `prototype/sarah-app-ux/assets/sarah-avatar.png` scaled) |
| Feature graphic | 1024×500 (optional for testing track) |
| Phone screenshots | At least 2 × 16:9 or 9:16 from Sarah on device or Chrome mobile |

Internal testing can ship with minimal graphics; production needs full set.