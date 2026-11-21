# Sarah App — U6 Discover & U7 Status Implementation Readiness

**Audit date:** 2026-11-04  
**Status:** Architecture **ready to implement** after Gates 3–4; **not started in code** (except U5 Discover pilot list)

**Primary spec:** [SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md](./SARAH_APP_STATUS_DISCOVER_ARCHITECTURE.md)

---

## 1. Alignment with agreed product direction

| Theme | Spec coverage | Code today |
|-------|---------------|------------|
| Discover = **profiles**, not post feed | ✅ | Pilot `GET /api/discover/companies` only |
| Status = **Facebook-style timeline** | ✅ | Placeholder nav hint U7 |
| Creators + companies + users on Status | ✅ | Not built |
| Connect with Company Sarah on profile | ✅ | U5 chat by companyId; no profile page |
| Sponsored RS03 / RS04 | ✅ in revenue + product docs | RMS flags off; no ad engine |
| Organic + labelled sponsored | ✅ | N/A |

**Conclusion:** Product direction is **documented consistently** across master architecture, roadmap, data architecture, trust, and revenue specs.

---

## 2. U6 Discover — requirement checklist

| Capability | Spec | Dependencies | Ready? |
|------------|------|--------------|--------|
| Infinite-scroll directory | ✅ | Pagination cursors, CDN for banners | 🟡 Design ready |
| Search (company, service, product, location) | ✅ | **R2:** Firestore vs Typesense/Algolia | ⚖ Decision |
| Industry browse (preset-driven) | ✅ | Industry Preset Library API | 🟡 |
| Compact cards (banner, avatar, description) | ✅ | Storage, `businessDirectory` sync | ❌ |
| Sponsored slots (RS04) | ✅ | RMS ad campaign service U6+ | ❌ |
| Company **profile** page | ✅ | Business Profile Engine | ❌ |
| Services, products, reviews | ✅ | Tenant public settings + reviews model | 🟡 Partial tenant data |
| Connect with Company Sarah | ✅ | U5 chat + profile CTA | 🟡 Chat exists |
| Discover analytics | ✅ | Analytics engine | ❌ |
| Verification badge rules | ✅ | MC workflow **R3** | 🟡 Documented |

### U6 data model (from data architecture)

- `businessDirectory/{companyId}` + sections  
- `discoverSponsored/{slotId}` (RMS sync)  
- Not yet in Firestore production

### U6 dependencies

- **Gate 3** — production API stable  
- **U5 hardening** — recommended before driving traffic to Discover  
- Sarah Network **consent UX** for profile “Connect”  
- Decision **R2** (search backend) before sprint planning  

---

## 3. U7 Status — requirement checklist

| Capability | Spec | Dependencies | Ready? |
|------------|------|--------------|--------|
| Infinite-scroll feed | ✅ | Feed engine, ranking | ❌ |
| Text / image / video / mixed | ✅ | Firebase Storage, transcoding policy | ❌ |
| Publisher types (company, creator, influencer, user) | ✅ | Creator onboarding, moderation | ❌ |
| Likes, comments, saves, shares, views | ✅ | Engagement engine + view rules | ❌ |
| Follow vs notify vs paid subscribe | ✅ | Follow engine | ❌ |
| For You / Following / Companies / Creators / Videos | ✅ | Ranking + tabs | ❌ |
| Feed ranking (hybrid) | ✅ | ML/heuristics TBD | 🟡 |
| Status Boost (RS03) | ✅ | RMS + feed injection | ❌ |
| Creator profiles + future monetisation | ✅ | Creator platform phase 2 | 🟡 |
| Moderation / reporting | ✅ | MC queue | ❌ |

### U7 data model (planned)

- `statusPosts/{postId}`, `statusEngagement/*`, `creatorProfiles/{uid}`  
- Legacy `companyStatus/` migration noted in data architecture  

### U7 dependencies

- **U6** partially parallel; Status can follow Discover for business traffic  
- **Content moderation** ops model before creator/user publishing  
- **Media costs** and AI moderation budget  
- **Gate 5** explicit approval before implementation  

---

## 4. Platform engines (spec vs implementation)

| Engine | U6 | U7 |
|--------|----|----|
| Social Content Engine | — | ❌ |
| Infinite Feed Engine | Discover scroll | Status scroll ❌ |
| Engagement Engine | — | ❌ |
| Follow & Notification Engine | Follow company from post (future) | ❌ |
| Business Profile Engine | ❌ | — |
| Discover Engine | ❌ | — |
| Advertising Engine (client) | ❌ | ❌ |
| Analytics Engine | ❌ | ❌ |

---

## 5. Architectural gaps / missing decisions

| ID | Gap | Recommendation |
|----|-----|----------------|
| G-U6-1 | Search technology | Decide before U6 sprint 1 |
| G-U6-2 | Business verification automation | Manual MC for first launch |
| G-U6-3 | Review authenticity | Verified purchasers only? |
| G-U7-1 | Video length / hosting limits | Product policy |
| G-U7-2 | Creator verification | Separate from business verification |
| G-U7-3 | Feed ranking transparency | Document for trust |
| G-U7-4 | Cross-link Status post → profile | Deep links in U6 profile routes |

---

## 6. Implementation readiness verdict

| Phase | Spec complete? | Can implement after gates? |
|-------|----------------|----------------------------|
| **U6 Discover** | **Yes** | **Yes** — after Gate 4 + R2 decision |
| **U7 Status** | **Yes** | **Yes** — after Gate 5 + moderation plan |

**Do not start U6/U7 coding** until Phase 0 close and Gates 2–3 (and Gate 4 for U6) are explicitly approved.

---

## 7. Suggested U6/U7 delivery order (when authorized)

1. U6: `businessDirectory` sync + profile page + organic Discover scroll  
2. U6: Search MVP (Firestore) → upgrade index if needed  
3. U6: Connect Sarah on profile (reuse U5)  
4. U6: RS04 sponsored slots (architecture only until RMS R1b)  
5. U7: Company publishing from portal + consumer feed read  
6. U7: Engagement metrics + follow graph  
7. U7: Creator MVP + moderation  
8. U7: RS03 Boost (RMS R1b)
