# Sarah App Programme — U0 Acceptance Checklist

**Programme:** Sarah App (standalone consumer product)  
**Domain (locked):** `https://sarah.ziricai.com`  
**U1 direction (locked):** Web **PWA first**, mobile-ready for native later  
**U0 sign-off:** Approved 2026-11-04 — U1 implementation in progress  
**Implementation (U1+):** Authorized after U0 approval

---

## Product decisions

| # | Decision | Status |
|---|----------|--------|
| D1 | Sarah App is separate from Company Portal (not a skin) | ✅ Documented |
| D2 | Standalone Sarah consumer brand; ZiricAI = infrastructure | ✅ Documented |
| D3 | Shared Firebase identity, separate authorization boundaries | ✅ Documented |
| D4 | Personal data outside `companies/{companyId}/` | ✅ Documented |
| D5 | Do **not** expose `/api/sarah/chat` to consumers | ✅ Documented |
| D6 | Sarah Network protocol for AI-to-AI | ✅ Documented |
| D7 | WhatsApp optional; Sarah App primary consumer channel | ✅ Documented |
| D8 | Initial domain `sarah.ziricai.com` | ✅ Locked |
| D9 | Independent Netlify site (`users/`) | ✅ Config prepared |

---

## Architecture deliverables

| Document | Purpose | Status |
|----------|---------|--------|
| [SARAH_APP_MASTER_ARCHITECTURE.md](./SARAH_APP_MASTER_ARCHITECTURE.md) | Master + codebase audit | ✅ |
| [SARAH_APP_IDENTITY_AND_ACCESS.md](./SARAH_APP_IDENTITY_AND_ACCESS.md) | Identity, roles, middleware | ✅ Updated |
| [PERSONAL_SARAH_ARCHITECTURE.md](./PERSONAL_SARAH_ARCHITECTURE.md) | Personal Sarah services | ✅ |
| [SARAH_NETWORK_PROTOCOL.md](./SARAH_NETWORK_PROTOCOL.md) | Network envelopes | ✅ |
| [SARAH_APP_DATA_ARCHITECTURE.md](./SARAH_APP_DATA_ARCHITECTURE.md) | Firestore layout | ✅ |
| [SARAH_APP_DEVELOPMENT_ROADMAP.md](./SARAH_APP_DEVELOPMENT_ROADMAP.md) | U0–U9 phases | ✅ Updated |
| [SARAH_APP_SCALABILITY_AND_OPERATIONS.md](./SARAH_APP_SCALABILITY_AND_OPERATIONS.md) | 100M-evolution path | ✅ New |
| [SARAH_APP_TRUST_AND_CONSENT.md](./SARAH_APP_TRUST_AND_CONSENT.md) | Trust differentiator | ✅ New |
| [SARAH_APP_DATA_PROTECTION.md](./SARAH_APP_DATA_PROTECTION.md) | POPIA, export, deletion | ✅ New |
| [SARAH_APP_DEPLOYMENT.md](./SARAH_APP_DEPLOYMENT.md) | Netlify, DNS, Firebase | ✅ New |

---

## Five strengthened areas (review gate)

| Area | Where documented | Reviewer sign-off |
|------|------------------|-------------------|
| A. Global scalability | [SARAH_APP_SCALABILITY_AND_OPERATIONS.md](./SARAH_APP_SCALABILITY_AND_OPERATIONS.md) | ☑ |
| B. Sarah Trust & Consent | [SARAH_APP_TRUST_AND_CONSENT.md](./SARAH_APP_TRUST_AND_CONSENT.md) | ☑ |
| C. Identity (accountKinds ≠ access) | [SARAH_APP_IDENTITY_AND_ACCESS.md](./SARAH_APP_IDENTITY_AND_ACCESS.md) | ☑ |
| D. Personal data protection | [SARAH_APP_DATA_PROTECTION.md](./SARAH_APP_DATA_PROTECTION.md) | ☑ |
| E. Independent deployment | [SARAH_APP_DEPLOYMENT.md](./SARAH_APP_DEPLOYMENT.md) | ☑ |

---

## Unresolved architectural decisions (not blockers for U0 sign-off)

| ID | Topic | Options | Target phase |
|----|-------|---------|--------------|
| R1 | Future consumer TLD | `sarah.ai` vs stay on `sarah.ziricai.com` | Pre-launch marketing |
| R2 | Discover search backend | Firestore-only vs Typesense/Algolia | U6 |
| R3 | Business verification workflow | Manual MC vs automated KYC vendor | U6 |
| R4 | Message archive at scale | Firestore-only vs GCS cold store | U8–U9 |
| R5 | Optional client-side encrypted vault | Off vs premium feature | U3+ |
| R6 | Consumer pricing / AI quotas | Free tier limits vs subscription | U2 product |
| R7 | Native app framework | Capacitor vs RN vs Flutter | Post-PWA validation |
| R8 | CORS vs Netlify-only API proxy | Same-origin proxy (preferred) vs direct API | U1 |

---

## Production safety confirmation

| Check | Status |
|-------|--------|
| No Firestore collections created for Sarah App consumer data | ✅ |
| No Firestore security rules changed for consumer paths | ✅ |
| No Railway production env changed for Sarah App | ✅ |
| No DNS records added for `sarah.ziricai.com` | ✅ |
| No Netlify production deploy of Sarah App site | ✅ |
| No change to `app.ziricai.com` / `admin.ziricai.com` deploy config | ✅ |
| WhatsApp Gateway / tenant configs untouched | ✅ |

*Repo may contain **prepared** `users/netlify.toml` and `prepare-sites.js users` hook — not live until site created and DNS added.*

---

## U0 sign-off (stakeholder)

| Role | Name | Date | Approved |
|------|------|------|----------|
| Product owner | Approved | 2026-11-04 | ☑ |
| Technical lead | (Cursor U1) | 2026-11-04 | ☑ |

**After all boxes checked:** Authorise **U1** implementation (PWA shell on `sarah.ziricai.com` prep).

---

## U1 entry criteria (when approved)

1. Create Netlify site (base `users`)
2. Add Firebase authorized domain `sarah.ziricai.com`
3. First deploy → then DNS CNAME
4. Implement `requireConsumerScope()`, registration, navigation shell
5. Still **no** Sarah Network or personal KB in prod until U2/U3 gates
