# Sarah App — U0 Evidence-Based Acceptance Checklist

**Purpose:** Formal gate for **stakeholder U0 sign-off** (Phase 0 / Gate 2)  
**Status:** **NOT APPROVED** — pending evidence review  
**Audit:** [SARAH_APP_PROGRAMME_READINESS_AUDIT.md](./SARAH_APP_PROGRAMME_READINESS_AUDIT.md)  
**Note:** [U0_ACCEPTANCE_CHECKLIST.md](./U0_ACCEPTANCE_CHECKLIST.md) records “Approved 2026-11-04”; this document **supersedes for sign-off** until reconciled.

**Classification key:** ✅ Accepted · 🟡 Partial · ❌ Outstanding · ⚖ Decision · ⚖️ Legal

---

## A. Identity and access separation

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| A1 | Shared Firebase UID across portals | ✅ | [SARAH_APP_IDENTITY_AND_ACCESS.md](./SARAH_APP_IDENTITY_AND_ACCESS.md), [authService.js](../../services/auth/authService.js) |
| A2 | Consumer access requires `userProfiles/{uid}` | ✅ | [consumerAuth.js](../../services/auth/consumerAuth.js) |
| A3 | Tenant routes reject consumer-only accounts | 🟡 | Documented; **needs regression test suite in CI** |
| A4 | Consumers cannot call `/api/sarah/chat` for portal tools | ✅ | Separate routes: personal-sarah, user-conversations |
| A5 | `accountKinds` ≠ authorization | ✅ | Documented in identity doc |

---

## B. Consumer vs tenant data isolation

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| B1 | Personal data outside `companies/{id}/` | ✅ | [SARAH_APP_DATA_ARCHITECTURE.md](./SARAH_APP_DATA_ARCHITECTURE.md), personal* services |
| B2 | My Knowledge not visible to tenants without consent | ✅ | Trust doc + server-only APIs |
| B3 | Tenant dual-write for chat does not expose personal KB | 🟡 | U5 writes messages only; **review Company Sarah prompt leakage** |
| B4 | Firestore rules for consumer paths | 🟡 | [firestore.rules](../../firestore.rules) lines 62–87 — **deploy to Firebase unverified** |

---

## C. Personal data architecture

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| C1 | `userProfiles`, `personalSarah`, `personalKnowledge` paths | ✅ | schema + services |
| C2 | Storage layout for uploads documented | 🟡 | U3 metadata; full upload pipeline partial |
| C3 | Session persistence model | 🟡 | Personal Sarah sessions in Firestore-capable storage; **depends on STORAGE_BACKEND** |

---

## D. Sarah Network consent and revocation

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| D1 | Consent before Personal→Company enquiry | ✅ | U4 grant required — [sarahNetworkService.js](../../services/sarah/network/sarahNetworkService.js) |
| D2 | Consent UI in Sarah App | ❌ | API only; no in-app grant flow |
| D3 | Revocation / activity log per trust doc | ❌ | Not implemented |
| D4 | Audit trail for network requests | 🟡 | In-memory audit in U4 store |

---

## E. POPIA-related controls

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| E1 | Privacy doc + consent version on bootstrap | 🟡 | `POPIA_CONSENT_VERSION` in client; legal review **pending** |
| E2 | Purpose limitation for ads/targeting | ✅ | Documented in revenue + trust docs |
| E3 | DPIA / legal sign-off | ⚖️ Legal | [SARAH_APP_DATA_PROTECTION.md](./SARAH_APP_DATA_PROTECTION.md) — **Outstanding** |

---

## F. Encryption and data protection

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| F1 | TLS in transit (Firebase, HTTPS) | ✅ | Standard platform |
| F2 | Client-side encryption (optional vault) | ⚖ Decision | R5 in U0 doc — deferred |
| F3 | At-rest (Firestore/Google) | ✅ | Platform default; **policy acknowledgment** |

---

## G. Export, deletion, retention

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| G1 | Export workflow documented | 🟡 | Data protection doc; **no automated export API** |
| G2 | Account deletion / anonymization | ❌ | Documented; not implemented |
| G3 | Retention policies | 🟡 | Documented; not enforced in code |

---

## H. Auditability

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| H1 | `auditLog` for consumer bootstrap, network, chat | 🟡 | Partial events in services |
| H2 | Immutable financial audit (revenue) | 🟡 | R0 design; in-memory only |
| H3 | MC visibility for consumer incidents | ❌ | Future |

---

## I. Scalability and operations

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| I1 | Stateless API design | ✅ | [SARAH_APP_SCALABILITY_AND_OPERATIONS.md](./SARAH_APP_SCALABILITY_AND_OPERATIONS.md) |
| I2 | Horizontal scaling (Railway replicas) | ✅ | Documented |
| I3 | Queue/worker for Sarah Network | 🟡 | Sync only in U4/U5 |
| I4 | AI cost / usage controls | 🟡 | R0 entitlements shadow; **no hard limits on free tier in prod** |
| I5 | Rate limiting | 🟡 | authRateLimit on some routes; not comprehensive |
| I6 | Independent Netlify deploy for Sarah | 🟡 | Site exists; custom domain pending |

---

## J. Production security boundaries

| # | Requirement | Class | Evidence |
|---|-------------|-------|----------|
| J1 | No accidental cross-deploy (app vs sarah sites) | 🟡 | Incident documented in u3 audit — **process fix needed** |
| J2 | WhatsApp / tenant configs untouched by Sarah deploy | ✅ | Separate code paths |
| J3 | Revenue commercial activation off | ✅ | [revenueConfig.js](../../services/revenue/revenueConfig.js) defaults false |

---

## K. Architecture deliverables (documentation)

| Document | Status |
|----------|--------|
| SARAH_APP_MASTER_ARCHITECTURE.md | ✅ |
| SARAH_APP_IDENTITY_AND_ACCESS.md | ✅ |
| SARAH_APP_TRUST_AND_CONSENT.md | ✅ |
| SARAH_APP_DATA_PROTECTION.md | ✅ |
| SARAH_APP_DATA_ARCHITECTURE.md | ✅ |
| SARAH_APP_SCALABILITY_AND_OPERATIONS.md | ✅ |
| SARAH_APP_DEPLOYMENT.md | ✅ |
| PERSONAL_SARAH_ARCHITECTURE.md | ✅ |
| SARAH_NETWORK_PROTOCOL.md | ✅ |
| SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md | ✅ (U6/U7 product) |

---

## Outstanding decisions for sign-off

| ID | Topic | Owner |
|----|-------|-------|
| U0-D1 | Reconcile “Approved 2026-11-04” vs this evidence matrix | Product owner |
| U0-D2 | POPIA legal review date | Legal |
| U0-D3 | Accept in-memory U4/U5 for pilot vs block until Firestore | Technical lead |
| U0-D4 | Firestore rules deploy approval | Ops |
| U0-D5 | Consumer free-tier AI limits before public marketing | Product + finance |

---

## Sign-off (intentionally blank)

| Role | Name | Date | Signature / Approved |
|------|------|------|----------------------|
| Product owner | | | ☐ |
| Technical lead | | | ☐ |
| Legal / POPIA | | | ☐ |

**Gate 2 is closed only when all mandatory rows are ✅ or accepted 🟡 with written waiver.**
