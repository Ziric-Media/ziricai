# Sarah App — Personal Data Protection and POPIA

**Scope:** My Knowledge, consumer profiles, consents, and lifecycle controls. **Designed in**, not bolted on after launch.

---

## Data classification

| Class | Examples | Controls |
|-------|----------|----------|
| **Public** | Discover business name, public status | CDN cache |
| **Account** | Email, uid, auth metadata | Firebase Auth + `users/{uid}` |
| **Personal** | Profile, preferences | User read/write; server validates |
| **Sensitive** | Health, finance, family, documents | Section flags; extra approval for disclosure |
| **Conversation** | Chats with businesses | Participant access only |
| **Audit** | Consent grants, network audit | User read own; platform ops restricted |

---

## Strict separation: personal vs company

| Rule | Enforcement |
|------|-------------|
| Personal KB never under `companies/{id}/` | Path + security rules |
| Company Sarah API cannot query `personalKnowledge/` | Server middleware |
| Tenant CRM cannot import user KB bulk | No API |
| Conversation dual-write | Tenant sees **business-relevant** thread only; not user's other companies |

---

## Encryption

| Layer | Approach |
|-------|----------|
| In transit | TLS everywhere (Netlify, Railway, Firebase) |
| At rest (Firestore/Storage) | Google Cloud default encryption |
| Sensitive documents (future U3+) | Optional client-side encryption for “vault” docs (architectural hook; defer implementation decision) |
| Secrets | Never in Sarah App bundle; Firebase config is public-by-design |

---

## Retention policies

| Data | Default retention | User control |
|------|-------------------|--------------|
| Personal Sarah sessions | 90 days inactive → archive | Delete session |
| My Knowledge documents | Until user deletes | Per-doc delete |
| Consent grants | 7 years audit (legal) | Revoke active grants |
| Network audit | Platform policy | Export includes related entries |
| Deleted account | 30-day soft delete → purge | Immediate purge request (jurisdiction-dependent) |

`userProfiles/{uid}.retentionPolicyVersion` tracks accepted policy.

---

## Data export (POPIA access right)

**API (U3+):** `POST /api/users/data-export`

- Async job builds ZIP: profile, preferences, knowledge metadata, document files user owns, consent history, activity log (last 12 months)
- Download link expires in 72 hours
- Audit log export request

---

## Account deletion

**API (U3+):** `POST /api/users/account-deletion`

Pipeline:

1. Revoke all active grants
2. Anonymize `userConversations` participant display
3. Delete `personalKnowledge`, `personalSarah` trees
4. Delete Storage prefix `personalKnowledge/{uid}/`
5. Remove `userProfiles`, consumer flags on `users/{uid}`
6. Firebase Auth user delete (or disable per legal hold)
7. **Do not** delete tenant CRM records; replace external uid with irreversible pseudonym

Confirmation: re-auth + typed “DELETE”.

---

## Access logs

| Event | Logged to |
|-------|-----------|
| Personal KB document read by Personal Sarah | `personalSarah/{uid}/accessLog` |
| Disclosure to company | `consents/` + `sarahNetwork/audit` |
| MC operator access to consumer data | **Denied by default**; break-glass future with dual control |

User can view **“Who accessed my data”** in Profile (Sarah-initiated disclosures only in v1).

---

## Consent history

Immutable append-only `consents/{uid}/history/{eventId}`:

- grant created, approved, denied, revoked, expired
- policy version accepted

---

## POPIA checklist (architecture)

| Requirement | Design element |
|-------------|----------------|
| Accountability | DPO contact in Profile; processing register (ops doc) |
| Processing limitation | Purpose on each grant |
| Minimization | Field-level `dataScope` |
| Consent | Sarah Trust approvals |
| Security safeguards | Encryption, auth, audit |
| Data subject participation | Export + deletion |
| Cross-border | Firebase region documented for users |

Legal review required before public launch — this doc is **engineering intent**.

---

## Related

- [SARAH_APP_TRUST_AND_CONSENT.md](./SARAH_APP_TRUST_AND_CONSENT.md)
- [SARAH_APP_DATA_ARCHITECTURE.md](./SARAH_APP_DATA_ARCHITECTURE.md)
