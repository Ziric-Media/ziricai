# CH4 — Business / unified Chat home

**Status:** MVP delivered

- `chatConversationIndexService.js` federates business, P2P, group, and network threads
- `GET /api/chat/conversations?filter=` 
- Consumer `chats.js` filters + handover hint on business threads
- `companyChat.js` — `fetchChatConversations`, `requestHumanHandover` client

**Delivered (post-MVP):** Live prototype Chats open P2P/group/network threads; federated search `GET /api/chat/search`; mute/archive/report UI hooks in `js/users/modules/chats.js`.

**Remaining:** Full Discover Firestore directory parity on every org profile.
