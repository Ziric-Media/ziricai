# CH6 — Human handover

**Status:** MVP delivered

- `handoverStateService.js` — ownership mapping, intent detection, consumer request API
- `companyReceptionChatService` — pauses Company Sarah when human-controlled
- `setHumanTakeover` syncs `ownershipState` on `sarah_app` consumer conv
- `POST /api/user-conversations/:companyId/request-human`
- Consumer system messages on state transitions

**Delivered (post-MVP):** `sarahInboxHandoverService` — assign, accept, transfer, escalate, return-to-Sarah; accept queue API; consumer ownership sync.

**Remaining:** D3 rules engine per-tenant config UI; durable queue store (Firestore).
