# CH2 — Person-to-person

**Status:** Delivered (2026-11-08)  
**Spec:** [SARAH_APP_CHAT_01_SPEC_AND_AUDIT.md](./SARAH_APP_CHAT_01_SPEC_AND_AUDIT.md) §5 (CH2)

## Delivered

| Area | Change |
|------|--------|
| **Contracts** | `buildPersonToPersonConversationId`, `buildPersonToPersonConversationMeta` in `messagingContracts.js` |
| **P2P store** | `personToPersonConversationService.js` — consumer index only (no tenant CRM) |
| **Blocking** | `personBlockService.js` — mutual enforcement on send |
| **API** | `chatPersonRoutes.js` — open/list/messages/send + block list |
| **Tests** | `test/ch2-person-to-person.test.mjs` |

## Not in CH2 (later)

- Federated Chat home index (CH4)
- Sarah invite into P2P (CH3 D1 orchestration)
- Firestore-first P2P index parity (uses same mirror hook as CH1 when enabled)
