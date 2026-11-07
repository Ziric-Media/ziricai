# Personal Sarah — Architecture

**Scope:** The user’s private AI assistant in Sarah App (**My Sarah** module).

---

## Design intent

Personal Sarah is a **distinct AI employee type**, not a Company Sarah prompt swap.

**Founder & company identity:** Approved ZiricAI / Spencer Gore facts are injected via [`founderCompanyIdentity.js`](../../services/sarah/knowledge/founderCompanyIdentity.js) in [`personalSarahContext.js`](../../services/sarah/personal/personalSarahContext.js) — see [`docs/knowledge/ZIRICAI_FOUNDER_COMPANY_IDENTITY_PROFILE.md`](../knowledge/ZIRICAI_FOUNDER_COMPANY_IDENTITY_PROFILE.md).

| Dimension | Personal Sarah | Company Sarah (portal) |
|-----------|----------------|-------------------------|
| Owner | User | Tenant |
| Storage | `personalSarah/{uid}/…` | `companies/{cid}/sarahSessions/…` |
| Knowledge | My Knowledge (user) | Tenant KB |
| Tools | Personal + Sarah Network client | CRM, finance, ops, integrations |
| Visibility | User only | Tenant members |

---

## Proposed service layout

New package boundary under `services/sarah/personal/` (paths not yet in repo):

| Module | Responsibility |
|--------|----------------|
| `personalSarahOrchestrator.js` | Entry from `POST /api/personal-sarah/chat`; persona `PERSONAL_ASSISTANT` |
| `personalSarahContext.js` | Assemble profile, preferences, calendar hints, authorized conversation summaries |
| `personalSarahMemory.js` | Long-term preferences and episodic memory (user-owned) |
| `personalSarahPermissions.js` | Map user settings → tool allow/deny + consent checks |
| `personalSarahTools.js` | Tool implementations (reminders, search Discover, initiate network request) |
| `personalKnowledgeService.js` | CRUD + retrieval for My Knowledge sections |
| `personalSarahActionService.js` | Execute approved actions (book, submit, pay) idempotently |

**Reuse from existing stack:**

- OpenAI loop pattern from [sarahOrchestrator.js](../../services/sarah/sarahOrchestrator.js)
- Message sanitization from [sanitizeSarahPayload.js](../../services/sarah/sanitizeSarahPayload.js)
- Consent defer patterns from [navigationConsent.js](../../services/sarah/navigationConsent.js) (generalize to action consent)
- Session TTL pattern from [sarahSessionStore.js](../../services/sarah/sarahSessionStore.js)

**Do not reuse:**

- `assertSarahChatAccess` tenant membership path for personal chat
- Tenant finance / MC tools from [toolRegistry.js](../../services/sarah/toolRegistry.js)

---

## Persona registration

Extend [sarahPersona.js](../../services/sarah/sarahPersona.js):

```javascript
// Proposed additions
SARAH_PERSONA.PERSONAL_ASSISTANT = "PERSONAL_ASSISTANT";
SARAH_PERSONA.COMPANY_RECEPTION = "COMPANY_RECEPTION"; // consumer ↔ tenant Sarah App
SARAH_TOOL_POLICY.PERSONAL = "personalTools";
SARAH_TOOL_POLICY.COMPANY_RECEPTION = "companyReceptionTools";
```

Surface strings (API contract):

| Surface | Persona | Route |
|---------|---------|-------|
| `personal_app` | `PERSONAL_ASSISTANT` | `/api/personal-sarah/chat` |
| `company_app` | `COMPANY_RECEPTION` | `/api/user-conversations/:companyId/messages` |
| `portal` | `CLIENT_OPERATOR` | `/api/sarah/chat` (unchanged) |

---

## My Knowledge (“My Life Profile”)

Structured sections (not a single upload dump):

| Section key | Examples | Default sensitivity |
|-------------|----------|---------------------|
| `personal_profile` | Name, languages, location | Medium |
| `family` | Spouse, children | High |
| `education` | Qualifications | Medium |
| `career` | CV, skills | Medium |
| `documents` | Files in Storage | High |
| `health` | Preferences, conditions user chooses to store | **Restricted** |
| `finance` | Budget goals | **Restricted** |
| `lifestyle` | Hobbies | Low |
| `important_dates` | Birthdays, anniversaries | Medium |
| `goals` | Personal / career | Medium |

Each record:

- `classification`, `updatedAt`, `source` (user | inferred)
- `sarahMayUse` boolean per section (user toggle)
- `embeddingRef` optional for RAG

Personal Sarah prompts must treat inferred data as **unverified** until user confirms.

---

## Personal Sarah capabilities (by phase)

| Phase | Capability |
|-------|------------|
| U2 | Chat, reminders (manual), section CRUD for My Knowledge |
| U3 | Read authorized **Chats** summaries |
| U4 | Initiate Sarah Network enquiries (with consent) |
| U6 | Compare school/job/product responses |
| U8 | Execute booked actions after approval (appointments, applications) |

---

## Scheduling and notifications

Split **reasoning** from **delivery**:

1. Personal Sarah proposes `proposedReminder` tool → writes `personalSarah/{uid}/tasks/{taskId}`
2. **Scheduler worker** (existing queue pattern in [jobQueue.js](../../services/queue/jobQueue.js)) fires push/email/in-app at `dueAt`

Do not rely on an open chat session for delivery.

---

## Interaction with Company conversations

Personal Sarah may call `personalSarahContext.loadConversationSummary(userId, companyId)` only when:

- User owns the `userConversations` thread, and
- User has not disabled “allow My Sarah to read my business chats” in preferences

Summaries are **derived** (server-generated), not raw tenant CRM exports.

---

## Safety guardrails (product policy → code)

1. Final decision always user — use `personalSarahActionService` pending states
2. No autonomous payment or submission
3. Company Sarah never receives bulk KB export — only disclosed fields per grant
4. Activity log in Profile: “Sarah did X because Y” with links to grants

---

## Testing strategy (when implemented)

- Unit: permission matrix and consent expiration
- Integration: personal chat cannot invoke `viewFinanceTransactions`
- E2E pilot: SmileMore thread summary flow (see master architecture)
