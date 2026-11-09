# Sarah App — Development Roadmap (U0–U9)

**Programme name:** Sarah App  
**Runs parallel to:** WhatsApp Gateway (G7–G11) — no replacement  
**Implementation rule:** Complete U0 sign-off before consumer Firestore writes or new orchestrator personas in production.

---

## Phase summary

| Phase | Name | Deliverable | Evidence |
|-------|------|-------------|----------|
| **U0** | Product & architecture | Specs + codebase audit | This doc set + review |
| **U1** | App foundation | Registration, login, shell, Profile stub | E2E auth tests; `users/` site deploy |
| **U2** | Personal Sarah | My Sarah chat (MVP tools) | `POST /api/personal-sarah/chat` |
| **U3** | My Knowledge | Sections + document upload | POPIA retention hooks |
| **U4** | Sarah Network (core) | Protocol + audit + single-hop P→C enquiry | Integration tests |
| **U5** | Company Conversations ✅ | Discover pilot → chat → Chats list | SmileMore pilot |
| **U6** | Discover | Profile-centric directory, infinite scroll cards, industry browse, sponsored slots (RS04), company profile + Connect Sarah | [Status/Discover spec](./SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md) |
| **U7** | Status | Social timeline, media posts, engagement metrics, creator publishing, feed tabs, Boost (RS03) | Follow ≠ paid subscribe; view counting rules |
| **U8** | Personal services | Reminders, bookings, applications w/ approval | Consent grants |
| **U9** | Scale & launch | Security review, perf, monitoring | Launch checklist |

---

## U0 — Product architecture ✅ (current)

**Outputs:**

- [SARAH_APP_MASTER_ARCHITECTURE.md](./SARAH_APP_MASTER_ARCHITECTURE.md)
- [SARAH_APP_IDENTITY_AND_ACCESS.md](./SARAH_APP_IDENTITY_AND_ACCESS.md)
- [PERSONAL_SARAH_ARCHITECTURE.md](./PERSONAL_SARAH_ARCHITECTURE.md)
- [SARAH_NETWORK_PROTOCOL.md](./SARAH_NETWORK_PROTOCOL.md)
- [SARAH_APP_DATA_ARCHITECTURE.md](./SARAH_APP_DATA_ARCHITECTURE.md)
- [SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md](./SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md)

**Exit:** Stakeholder sign-off, domain/trademark check, POPIA checklist assigned.

---

## U1 — Users App foundation (PWA first)

**Scope:**

- **Web PWA** on `https://sarah.ziricai.com` (installable, responsive; native apps later)
- [prepare-sites.js](../../scripts/prepare-sites.js) `users` target + [users/netlify.toml](../../users/netlify.toml) (site created after U0 sign-off)
- Consumer signup/login (shared Firebase); create `userProfiles/{uid}`
- Navigation: Chats, My Sarah, Status, Discover, Profile (placeholders OK)
- `manifest.webmanifest` + service worker (static cache only)
- `requireConsumerScope()` middleware + route registry domain `consumer`
- Firebase authorized domain + DNS CNAME (manual steps in [SARAH_APP_DEPLOYMENT.md](./SARAH_APP_DEPLOYMENT.md))

**Out of scope:** Sarah Network, tenant data migration, App Store / Play Store binaries

**Tests:** Auth boundary — consumer token rejected on `/api/companies/:id/...` without membership

---

## U2 — Personal Sarah

**Scope:**

- `services/sarah/personal/*` (see Personal Sarah architecture)
- Persona `PERSONAL_ASSISTANT` wired into orchestrator
- Sessions under `personalSarah/{uid}/sessions`
- Tools: general Q&A, profile-aware greetings, create reminder task (no external send)

---

## U3 — My Knowledge

**Scope:**

- Section CRUD API `/api/personal-knowledge/*`
- Storage uploads with classification
- Retrieval injected into Personal Sarah context
- User toggles per section (`sarahMayUse`)

---

## U4 — Sarah Network ✅ (core API)

**Scope:**

- Request/response store + audit (`services/sarah/network/*`)
- Consent grant validation (`POST /api/sarah-network/grants`)
- Synchronous Company Reception dispatch (`POST /api/sarah-network/enquiries`)
- Discoverability gate (`businessDirectoryService` — pilot: `smilemore-demo`)
- Rate limits per user

**API:** `/api/sarah-network/grants`, `/enquiries`, `/requests/:requestId`

**Pilot sub-goal:** One approved Personal → Company structured enquiry (single tenant) — **met in tests**

**Next (U5):** Persist conversations + Chats UI + user-facing Company Sarah chat thread

---

## U5 — Company Conversations (SmileMore pilot) ✅

**Scope (implemented):**

- `userConversationService` + tenant dual-write (`channel: sarah_app`, `resolveSarahAppCustomerId`)
- Company Sarah `COMPANY_RECEPTION` via `companyReceptionChatService`
- APIs: `/api/discover/companies`, `/api/user-conversations/*`
- Sarah App UI: **Discover** (pilot list), **Chats** (list + thread)
- Greeting: “Hello {preferredName}, welcome to {companyName}…”
- Personal Sarah tool: `summarizeCompanyConversation`

**Tests:** `test/user-conversations-u5.test.mjs`

**Pilot acceptance (manual):**

1. Register consumer account  
2. Discover → SmileMore → **Chat with Sarah**  
3. Send message — Company Sarah replies  
4. **Chats** shows thread  
5. My Sarah → “Summarize my SmileMore chat” (or demo suggest button)  

---

## U6 — Discover

**Scope:** See [SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md](./SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md).

- **Discover Engine:** search (company, service, product, location), configurable industry filters (Industry Preset Library — not hardcoded UI)
- Infinite scroll **compact business cards** (banner, avatar, industry, location, short description, rating, sponsored label, **View Business Profile**)
- **RS04:** sponsored slots before organic; organic always present; sponsored ≠ verified
- **Business Profile Engine:** full profile (about, services, products, reviews, location, contact, bookings stub)
- Primary CTA: **Connect with Company Sarah** (Sarah Network + consent)
- `businessDirectory/{companyId}` denormalized public index

**Exit criteria:**

1. User can browse All + at least one industry filter with cursor pagination  
2. Sponsored card labelled; organic results still appear  
3. Profile opens from card; Connect Sarah launches network flow (U4 dependency)  
4. Verification badge rules documented and enforced in MC  

**Reuse:** Tenant public settings; not B2B [Marketplace](./MARKETPLACE.md) pack installer

---

## U7 — Status

**Scope:** See [SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md](./SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md).

- **Social Content Engine:** text, image, video, mixed posts (`company`, `influencer`, `creator`, `user` publishers)
- **Infinite Feed Engine:** For You (default), Following, Companies, Creators, Videos — cursor pagination
- **Engagement Engine:** likes, comments, saves, shares, qualified **view** counts
- **Follow & Notification Engine:** free follow; notify prefs separate; chat does not auto-follow
- Company Portal publishing for businesses; Sarah App publishing for creators/users (policy)
- **RS03 Status Boost:** labelled sponsored insertion; campaign analytics in portal
- Creator profiles MVP (bio, followers, content list) — full monetisation deferred

**Exit criteria:**

1. Infinite scroll feed with lazy media  
2. Engagement counters with anti-inflation view rules  
3. At least one Boost campaign visible as Sponsored in staging  
4. Report/hide flows wired to moderation queue (stub OK)  
5. Journey: Status post → company profile → Connect Sarah  

---

## U8 — Personal services

**Scope:**

- Scheduler worker for reminders
- Appointment / application flows with Sarah Trust & Consent approvals
- Personal Sarah multi-company compare (schools, products)

---

## U9 — Scale and launch

**Scope:**

- Load tests on Discover and messaging
- POPIA DPIA completion
- Abuse reporting, block company, rate limits
- Cost monitoring per user / tenant for AI calls
- App store packaging (if mobile wrapper planned)

---

## Engineering dependencies (repo)

| Existing asset | Sarah App use |
|--------------|---------------|
| Firebase Auth + [authService.js](../../services/auth/authService.js) | Shared identity |
| [sarahOrchestrator.js](../../services/sarah/sarahOrchestrator.js) | Extend personas |
| [conversationService.js](../../services/conversationService.js) | New channel `sarah_app` |
| [auditLog](../../services/audit/auditLog.js) | Consent + network |
| SmileMore demo tenant | U5 pilot company Sarah |
| WhatsApp Gateway | Optional parallel channel for same tenant |

---

## What we explicitly defer

- Replacing WhatsApp for existing tenants
- Full mobile native apps (U1 can be PWA)
- Cross-company Sarah negotiations without user in the loop
- Automatic sharing of My Knowledge to businesses

---

## Recommended next step after U0 sign-off

Start **U1** in a feature branch: app shell + consumer auth only — no orchestrator changes until U2 branch merges with tests.
