# CH4 — Business / unified Chat home

**Status:** MVP delivered

- `chatConversationIndexService.js` federates business, P2P, group, and network threads
- `GET /api/chat/conversations?filter=` 
- Consumer `chats.js` filters + handover hint on business threads
- `companyChat.js` — `fetchChatConversations`, `requestHumanHandover` client

**Remaining:** Open non-business thread types in UI (list-only parity today); org profile CTAs beyond Discover pilot.
