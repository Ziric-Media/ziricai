# CH6 — Human handover

**Status:** MVP delivered

- `handoverStateService.js` — ownership mapping, intent detection, consumer request API
- `companyReceptionChatService` — pauses Company Sarah when human-controlled
- `setHumanTakeover` syncs `ownershipState` on `sarah_app` consumer conv
- `POST /api/user-conversations/:companyId/request-human`
- Consumer system messages on state transitions

**Remaining:** Full assignment queue, escalation rules (D3), all §3.3 states beyond MVP subset.
