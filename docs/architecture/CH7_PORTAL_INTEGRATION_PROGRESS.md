# CH7 — Portal Sarah Inbox integration

**Status:** MVP delivered

- `sarahAppConsumerMirrorService.js` — portal human replies mirrored to consumer (`sarah_app` only)
- `sendConversationReply` triggers consumer mirror (no WhatsApp send for Sarah App)
- Portal APIs: `assign`, `internal-note` on conversation routes
- `js/portal/api.js` client helpers

**Remaining:** Transfer/escalate UI, accept queue, Sarah summary payload, full RBAC per assignment.
