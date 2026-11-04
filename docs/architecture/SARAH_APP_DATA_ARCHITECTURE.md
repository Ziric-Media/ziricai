# Sarah App — Data Architecture

**Scope:** Logical Firestore (and Storage) layout for consumer data **alongside** existing tenant schema ([schema.js](../../services/database/schema.js)).  
Lifecycle, export, deletion, POPIA: [SARAH_APP_DATA_PROTECTION.md](./SARAH_APP_DATA_PROTECTION.md).

---

## Ownership matrix

| Data | Owner | Root path |
|------|-------|-----------|
| Firebase Auth identity | Platform / user | Firebase Auth |
| Global account | User | `users/{uid}` |
| Consumer profile | User | `userProfiles/{uid}` |
| Personal Sarah sessions | User | `personalSarah/{uid}/sessions/{sessionId}` |
| Personal memory / tasks | User | `personalSarah/{uid}/memories/`, `tasks/` |
| My Knowledge | User | `personalKnowledge/{uid}/sections/{sectionId}`, `documents/{docId}` |
| User ↔ company chat index | User (view) + tenant (CRM) | `userConversations/{conversationId}` + tenant mirror |
| Follow graph | User | `userCompanies/{uid}/follows/{targetId}` — company, creator, or user |
| Consents | User | `consents/{uid}/grants/{grantId}` |
| Notifications | User | `userNotifications/{uid}/items/{id}` |
| Public business profile | Tenant (published) | `businessDirectory/{companyId}` + profile sections |
| Status posts (all publishers) | Publisher | `statusPosts/{postId}` |
| Engagement | User + post | `statusEngagement/{postId}/likes`, `comments`, `saves`; aggregates on post |
| Feed delivery | Platform | `statusFeed/{uid}/items/{feedItemId}` or cursor API without fan-out store (TBD U7) |
| Creator profile | User | `creatorProfiles/{uid}` |
| Discover sponsored inventory | Platform | `discoverSponsored/{campaignId}` (RMS sync) |
| Company status posts (legacy path) | Tenant | `companyStatus/{companyId}/posts/{postId}` → migrate to `statusPosts` with `publisherType: company` |
| Sarah Network audit | Platform | `sarahNetwork/requests/`, `audit/` |
| Tenant CRM, KB, ops | Tenant | `companies/{companyId}/…` (unchanged) |

---

## Proposed root collections (new)

```
users/{uid}                          # extend existing
userProfiles/{uid}                   # consumer profile doc
userPreferences/{uid}

personalSarah/{uid}/
  sessions/{sessionId}
  memories/{memoryId}
  tasks/{taskId}

personalKnowledge/{uid}/
  sections/{sectionKey}
  documents/{docId}                  # metadata; bytes in Storage

userConversations/{conversationId}/
  metadata                           # companyId, userId, lastMessageAt, titles
  messages/{messageId}               # consumer-facing copy

userCompanies/{uid}/
  follows/{companyId}                # follow flag, notify flag
  connections/{companyId}            # has active conversation

businessDirectory/{companyId}        # discover card + profile source (denormalized)
businessDirectory/{companyId}/sections/{sectionKey}  # services, products, etc.

statusPosts/{postId}                 # publisherType, publisherId, media, counts, sponsoredCampaignId
statusEngagement/{postId}/likes/{uid}
statusEngagement/{postId}/comments/{commentId}
statusEngagement/{postId}/saves/{uid}

creatorProfiles/{uid}                # influencer/creator public profile

discoverSponsored/{slotId}           # RS04 campaign mirror (server-only writes)

companyStatus/{companyId}/posts/{postId}  # deprecated — portal sync target until U7 migration

sarahNetwork/
  requests/{requestId}
  audit/{eventId}

consents/{uid}/grants/{grantId}

userNotifications/{uid}/notifications/{id}
```

### Storage (Firebase Storage)

```
personalKnowledge/{uid}/{documentId}/{filename}
```

---

## Tenant-side extensions (minimal)

Under `companies/{companyId}/`:

| Addition | Purpose |
|----------|---------|
| `conversations/{id}.channel` | `whatsapp` \| `sarah_app` \| … |
| `conversations/{id}.externalUserId` | Firebase uid for Sarah App user |
| `settings/publicProfile` | Source fields synced to `businessDirectory` |
| `integrations/sarahApp` | Enable/disable consumer channel |

Avoid duplicating full personal KB on tenant.

---

## Index and query patterns

| Query | Collection | Index |
|-------|------------|-------|
| User’s chat list | `userConversations` | `userId` + `lastMessageAt` desc |
| Messages in thread | `userConversations/{id}/messages` | `createdAt` asc |
| Discover search + infinite scroll | `businessDirectory` | `industryPresetId`, `geoHash`, `verified`, `searchTokens`, `sponsoredRank` |
| Status For You feed | `statusPosts` + ranking service | `publishedAt`, engagement signals, cursor |
| Status Following feed | `userCompanies/{uid}/follows` + `statusPosts` | `publisherId` in followed set |
| Post engagement | `statusEngagement/*` | idempotent like/save per uid |
| Network request status | `sarahNetwork/requests` | `userId` + `createdAt` |

Validate composite indexes before U5 launch.

---

## Security rules (direction)

New rules block required before client reads consumer collections:

```
match /userProfiles/{uid} {
  allow read, write: if request.auth.uid == uid;
}
match /personalKnowledge/{uid}/{document=**} {
  allow read, write: if request.auth.uid == uid;
}
match /userConversations/{convId} {
  allow read: if resource.data.userId == request.auth.uid;
  allow write: if false;  // server only
}
match /businessDirectory/{companyId} {
  allow read: if true;
  allow write: if false;  // server sync from tenant
}
```

Tenant rules in [firestore.rules](../../firestore.rules) remain unchanged for company subcollections.

**Production rule:** Consumer PII writes primarily **server-side** (Express + Admin SDK) until rules are proven.

---

## Sync and denormalization

| Event | Action |
|-------|--------|
| Company updates public profile | Job writes `businessDirectory/{companyId}` |
| Company publishes status | Write `companyStatus/...`; fan-out to followers’ feeds (U7) |
| User sends Sarah App message | Dual-write user + tenant conversation views |
| User deletes account | Anonymize `userConversations`; retain tenant CRM with redacted external id |

---

## Coexistence with strict tenant mode

Company Portal API continues to require `companies/{cid}/users/{uid}`.

Sarah App API requires consumer profile only.

Same UID may call both APIs when `accountKinds` includes both — middleware separates concerns.

---

## Migration strategy

| Phase | Migration |
|-------|-----------|
| U0 | No new collections in production |
| U1 | `userProfiles`, `userPreferences` for new signups |
| U2–U3 | `personalSarah`, `personalKnowledge` |
| U5 | `userConversations` + tenant channel field |
| U6–U7 | `businessDirectory`, `statusPosts`, `statusEngagement`, `creatorProfiles`, follows |

No backfill of WhatsApp history into Sarah App required.

---

## Data volume / scale notes

- Paginate messages (50–100 per fetch)
- Archive old `personalSarah` sessions to cold storage policy (user-configurable retention)
- Cache `businessDirectory` reads at CDN edge for Discover
- Do not store embeddings for all users in a single collection without sharding by uid prefix
