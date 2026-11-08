# CH7 — Portal Sarah Inbox integration

**Status:** MVP delivered

- `sarahAppConsumerMirrorService.js` — portal human replies mirrored to consumer (`sarah_app` only)
- `sendConversationReply` triggers consumer mirror (no WhatsApp send for Sarah App)
- Portal APIs: `assign`, `internal-note` on conversation routes
- `js/portal/api.js` client helpers

**Delivered (post-MVP):** Portal inbox handover toolbar (assign/accept/transfer/escalate/summary); APIs on `customerOpsRoutes`; return-to-Sarah via takeover button when human.

**Remaining:** Full RBAC per assignment; notifications on accept queue.
