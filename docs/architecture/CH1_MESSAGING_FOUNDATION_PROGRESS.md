# CH1 — Messaging foundation

**Status:** Delivered (2026-11-08)  
**Spec:** [SARAH_APP_CHAT_01_SPEC_AND_AUDIT.md](./SARAH_APP_CHAT_01_SPEC_AND_AUDIT.md) §5 (CH1)  
**Depends on:** C1 `identityContracts`, `userConversationService`, C2 Sarah Inbox labels

## Delivered

| Area | Change |
|------|--------|
| **Contracts** | `services/users/messagingContracts.js` — conversation types, participant model, message roles (`human`), handover state placeholder (`ai_active`) |
| **Schema constants** | `services/database/schema.js` — `CHAT_CONVERSATION_TYPES`, `CHAT_HANDOVER_STATES`, `USER_CONVERSATIONS.SCHEMA_VERSION` |
| **Identity alignment** | `identityContracts.js` extended typedefs + re-exports |
| **Consumer index** | `openUserConversation` sets `type`, `participants[]`, `ownershipState`, `companySarahAgentId`; hydrate backfill via `ensureConversationMessagingFoundation` |
| **Firestore mirror** | `userConversationFirestoreStore.js` persists CH1 fields on conversation + message docs (`authorParticipantId`) |
| **Portal channel fix** | `services/conversation/tenantConversationRef.js` + `services/tenants/conversationService.js` — `markConversationRead`, `setHumanTakeover`, `sendConversationReply` resolve `sarah_app` canonical ids (no hardcoded `whatsapp`) |
| **Tests** | `test/ch1-messaging-foundation.test.mjs` |

## Not in CH1

- P2P / groups (CH2–CH3)
- Consumer or portal handover UI (CH6–CH7)
- Full handover state machine transitions (CH6)
- Unified Chat home federation index (future CH1+ recommendation in audit)

## Locked decisions honoured (foundation only)

- **D1:** Participant kinds include `personal_sarah` / `company_sarah`; `invited` + `consentGranted` fields on participants (orchestration in later phases).
- **D3:** `ownershipState` stored; portal still uses `humanTakeover` boolean until CH6 maps both.

## Follow-up (CH6 / CH7)

- Map `humanTakeover` ↔ `ownershipState` transitions and consumer-visible system messages.
- Guard `companyReceptionChatService` when `ownershipState` is human-controlled.
- Employee assign / `employeeId` on participants when queue exists.
