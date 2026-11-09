# SmileMore Dentists — Sarah App Production Pilot Acceptance

**Tenant ID:** `smilemore-demo` ([smilemorePractice.js](../../services/dental/smilemorePractice.js))  
**Phase:** 1 — U5 production pilot (Gate 3)  
**Prerequisites:** [SARAH_APP_PRODUCTION_DEPLOYMENT_READINESS.md](./SARAH_APP_PRODUCTION_DEPLOYMENT_READINESS.md)

---

## Pilot objective

Validate end-to-end consumer journey on **production** (or designated staging URL with production-like config):

1. Register / sign in to Sarah App  
2. Open **Discover** → SmileMore Dentists  
3. **Chat with Sarah** → greeting uses preferred name  
4. Send message → **Company Sarah** replies  
5. Thread appears under **Chats**  
6. **My Sarah** summarizes the conversation (tool or natural language)

---

## Preconditions

| # | Check | Pass |
|---|-------|------|
| P1 | `smilemore-demo` in `SARAH_NETWORK_PILOT_COMPANY_IDS` or default seed | ☐ |
| P2 | SmileMore tenant data available to API (knowledge / portal company) | ☐ |
| P3 | API deployed with U5 routes | ☐ |
| P4 | Sarah site reachable (Netlify URL or `sarah.ziricai.com`) | ☐ |
| P5 | Firebase auth works on Sarah domain | ☐ |

---

## Test script (manual)

### 1. Identity

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open Sarah App, register new test user | Firebase user created |
| 1.2 | Complete bootstrap / POPIA consent | `userProfiles/{uid}` exists (server) |
| 1.3 | Set preferred name e.g. “Thabo” | Profile PATCH or bootstrap |

### 2. Discover

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Navigate to **Discover** | SmileMore card visible |
| 2.2 | Card shows verified badge (if configured) | Label “Verified” |
| 2.3 | Tap **Chat with Sarah** | Redirect to Chats thread |

### 3. Company Sarah conversation

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Load thread | Greeting: “Hello Thabo, welcome to SmileMore…” |
| 3.2 | Send: “Do you accept new patients?” | 200 response; assistant reply |
| 3.3 | Reply is on-brand / uses KB if OpenAI enabled | Subjective QA |

### 4. Chats list

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Back to **All chats** | SmileMore thread listed |
| 4.2 | Preview shows last message | Non-empty |

### 5. Personal Sarah summary

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Open **My Sarah** | |
| 5.2 | Ask: “Summarize my chat with smilemore-demo” or use suggest chip | Summary includes user + Company Sarah lines |
| 5.3 | (Optional) API: `summarizeCompanyConversation` tool via chat | Tool success in response actions |

### 6. Tenant mirror (operator)

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Company Portal inbox for `smilemore-demo` | Thread with channel `sarah_app` **if inbox filters supported** |
| 6.2 | Customer id pattern `sarah_app::…` | Message history visible to tenant |

---

## API acceptance (optional curl / Postman)

Replace `TOKEN` and base URL.

1. `POST /api/users/bootstrap` — Bearer TOKEN  
2. `GET /api/discover/companies`  
3. `GET /api/user-conversations/smilemore-demo/messages`  
4. `POST /api/user-conversations/smilemore-demo/messages` `{ "message": "…" }`  
5. `GET /api/user-conversations`  

Sarah Network (parallel path, not required for U5 pilot):

- `POST /api/sarah-network/grants` → `POST /api/sarah-network/enquiries`

---

## Security checks

| # | Check | Pass |
|---|-------|------|
| S1 | User A cannot read User B conversation by companyId alone | ☐ |
| S2 | Undiscoverable company returns 404 | ☐ |
| S3 | No consumer access to `/api/companies/:id/*` without membership | ☐ |
| S4 | Revenue endpoints show checkout disabled | ☐ |

---

## Known pilot limitations (documented, not failures)

- User conversation list **in-memory** on API — restart clears consumer index (tenant mirror may remain)  
- Consent grants **in-memory** for U4  
- Discover is **pilot list**, not U6 search  
- No push notifications  

---

## Sign-off

| Role | Pass / Fail | Date | Notes |
|------|-------------|------|-------|
| Product owner | ☐ | | |
| Technical lead | ☐ | | |

**Gate 3 closed** → authorize U5 hardening and/or U6 planning (Gate 4).
