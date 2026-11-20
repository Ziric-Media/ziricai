# SN-NEWS-01 — Sarah News Product Specification (Duta-Inspired Edition)

**Status:** Product specification — authoritative for programme direction (Astra · Spencer)  
**Owner:** Sarah App consumer experience  
**Tagline:** *Your world. Your interests. Your news. Curated by Sarah.*  
**Principle:** One **Sarah Intelligence** engine for the **Newsroom** (News tab) and the **News Assistant** (Personal Sarah). No duplicate aggregation or summarisation stacks.

**Related:** [SN-NEWS-00](./SN-NEWS-00_SARAH_NEWS_INTELLIGENCE.md) (engineering architecture), [SHI-01](./SHI-01_SARAH_HOME_INTELLIGENCE.md), [SARAH_APP_MASTER_ARCHITECTURE.md](./SARAH_APP_MASTER_ARCHITECTURE.md)

---

## 1. Product concept

Sarah News is an **AI-powered news aggregation, personalisation, and delivery** service. Users receive reporting from multiple publishers without visiting each site individually.

Sarah acts as:

| Role | Description |
|------|-------------|
| Personal news editor | Curates editions to profile and delivery slots |
| News researcher | Retrieves and cross-checks sources on demand |
| News aggregator | Allow-listed feeds and (future) partner APIs |
| News summariser | In-app Sarah voice; not full republication of copyright body |
| Breaking-news reporter | Event detection, verification, selective push (R3) |
| Trend analyst | Emerging topics and “trending now” (R4) |
| Conversational news assistant | Natural-language news via Personal Sarah |

**Consumption modes**

- **Passive** — scheduled briefings and breaking alerts (when opted in).
- **Active** — browse headlines, open story experience, ask Sarah in-chat or on-story.

---

## 2. News categories and channels

### 2.1 Geographic news families

| Channel | Scope |
|---------|--------|
| **South African news** | National govt, politics, economy, crime, business, provinces, municipalities, education, infrastructure, community |
| **Zimbabwean news** | Govt, politics, economy, business, currency, mining, agriculture, infrastructure, education |
| **African news** | Continental developments, AU, regional politics, trade, investment |
| **World news** | International politics, conflicts, diplomacy, global economy |

**Future geographic expansion:** Europe, Asia, Middle East, North America, Latin America, Oceania, local city, provincial.

### 2.2 Interest families (non-geographic)

Organised for profile UI and feed routing (not all need dedicated RSS day one):

| Family | Example topics |
|--------|----------------|
| **Business & economic** | Markets, banking, startups, investment, crypto, policy, labour, corporates, real estate, mining, energy, agribusiness, manufacturing |
| **Technology & innovation** | AI, robotics, software, cybersecurity, telecoms, gadgets, space, science, digital economy, EVs, emerging tech |
| **Sports** | Football, rugby, cricket, basketball, tennis, athletics, boxing, motorsport, golf, Olympics, esports, sports business (fixtures/scores R4+) |
| **Entertainment & lifestyle** | Music, film, TV, celebrity, regional entertainment, fashion, beauty, gaming, creators, events |
| **Society, science & special** | Health, education, religion, environment, travel, human rights, law, public safety, weather/disasters, jobs, research, community |

### 2.3 UX mapping (v1 prototype → product)

Current setup uses **regions** (ZA, ZW, Africa, World) and **interest chips** aligned with this taxonomy; expand chips and backend routing as sources are licensed.

---

## 3. Delivery services (Duta-style schedules)

| Service | Suggested window | Content |
|---------|------------------|---------|
| **Morning briefing** | 06:00–08:00 local | Overnight + day-ahead, top stories, profile mix |
| **Lunchtime briefing** | 12:00–13:00 | Updates since morning |
| **Evening briefing** | 18:00–20:00 | Day summary |
| **Breaking news alerts** | Event-driven | Significant verified events only (opt-in) |

**Future:** weekly roundup, weekend news, monthly industry review, daily sports/business briefings, custom briefing.

**Rule:** Do not repeat the same story in a later slot unless there is a **meaningful update** (new facts, status change, cluster merge).

---

## 4. Personalised news subscriptions

Users build a **news profile** (regions, interests, briefings, breaking, language). Stored server-side (`sarahNews` on consumer preferences) with local device cache.

**Conversational follow (R1+ / SN-05):**

- “Follow developments about Elon Musk.”
- “Keep me updated on Zimbabwe’s mining sector.”
- “Follow Manchester United.”
- “Stop sending me politics.”

Sarah maps utterances to **topic follow rules** on the same `newsProfile` (no parallel preference store).

**Example profile (illustrative)**

| Dimension | Values |
|-----------|--------|
| Geographic | South Africa, Zimbabwe, Africa, World |
| Interests | Business, Technology, AI, Politics, Football, Entertainment, Mining |
| Delivery | Morning 07:00, Lunch 12:30, Evening 18:30, Breaking on, English |

---

## 5. Headline and article presentation

### 5.1 Newsroom — headline card

| Element | Purpose |
|---------|---------|
| Featured image | Visual identification (RSS → og:image → publisher fallback) |
| Headline | Main story |
| Category / region | Classification |
| Publisher | Original source attribution |
| Publication time | Freshness |
| Summary | Quick understanding |
| Story status | Breaking / developing / updated (R3+) |

### 5.2 Story experience (in-app)

On tap, user stays in Sarah App (no required outbound visit):

1. Full headline  
2. Featured image  
3. Sarah-written summary / article body (from verified feed facts)  
4. Important facts & background (R2+: structured fields)  
5. Timeline of developments (R3+)  
6. Related articles / multi-source (R3+)  
7. Source footnote (publisher name; optional original link when licensed — **not** full reproduction)  
8. **Ask Sarah** — opinion, explain, compare, follow topic  

**Legal:** Sarah summarises and attributes; does not replace licensed full article text without partner agreement.

### 5.3 Dual UX (strategic)

| Experience | Surface | Role |
|------------|---------|------|
| **Newsroom** | News tab | Browse, briefings, cards, story pages |
| **News Assistant** | Personal Sarah | Commands, research, follow/unfollow, deep Q&A |

Both use **`sarahNewsIntelligenceService`** + edition compiler (see SN-00).

---

## 6. Conversational news (improved Duta)

Natural-language commands (non-exhaustive):

| User intent | Sarah action |
|-------------|----------------|
| Give me today’s news | Compile / show latest edition |
| What’s happening in Zimbabwe? | Region-filtered headlines |
| Business / sports / trending | Interest or trends retrieval |
| More on this story / explain | Story context + retrieval |
| Follow / stop this topic | Profile update |
| What happened overnight? | Morning-slot edition |

**Tool (live):** `fetchSarahNewsHeadlines` on Personal Sarah — same RSS engine as News tab.

**Target:** Continuous thread with **storyId / edition context** retained across turns (SN-02+).

---

## 7. Breaking news intelligence (R3)

**Sarah Breaking** — separate pipeline inside Sarah News:

1. Monitor allow-listed sources  
2. Ingest new items  
3. Detect significant events  
4. Cluster same-event reporting  
5. Cross-publisher comparison  
6. Credibility / confidence scoring  
7. Geo + interest relevance  
8. Notify opted-in users  
9. Monitor updates  
10. Merge into story record  

**Breaking categories:** emergencies, major politics, conflicts, disasters, economic announcements, major business/tech/sports, public safety.

**Notification tone:** selective, labelled *Developing* / *Verified*, no alert spam.

---

## 8. Intelligence features (roadmap)

| Feature | Release |
|---------|---------|
| Top stories, personalised digest | R1 (partial — live) |
| Trending now | R4 |
| Story timeline, related news | R3 |
| News analysis, fact context, compare publishers | R2–R4 |
| Topic tracker, search, archive | R4 |

**Editorial types:** reporting vs analysis vs opinion vs **sponsored** — always labelled.

---

## 9. Adjacent Duta-style services (progressive)

Introduce via Personal Sarah tools / SHI cards — **not** all as primary nav tabs:

| Service | Examples |
|---------|----------|
| Sarah Sports | Scores, fixtures, standings (R4+) |
| Sarah Weather | Forecasts, warnings |
| Sarah Finance info | FX, indicators, explainers |
| Sarah Language | Translate, definitions |
| Sarah Knowledge search | Research, explain |
| Sarah Daily inspiration | Devotional / motivational (opt-in) |

---

## 10. Sources and publisher partnerships

**v1 (engineering):** public RSS allow-list — SA, ZW, Africa, world, tech, business, etc. Attribution in footnotes. eNCA and some outlets: RSS pending or partner-only.

**Target categories (not commitments):**

| Category | Examples |
|----------|----------|
| International | Reuters, AP, BBC, Al Jazeera, CNN, Guardian |
| South Africa | SABC, IOL, Citizen, Daily Maverick, BusinessTech; eNCA, News24 (partner/RSS) |
| Zimbabwe | NewsDay, Herald, ZBC |
| Business / tech / sports | FT, Bloomberg, TechCrunch, Verge, BBC Sport, etc. |

**Future:** Sarah Network publisher registrations — licensed metadata, breaking feeds, multimedia, branded channels (SN-06).

---

## 11. Commercial model (principles)

| Stream | Notes |
|--------|--------|
| Freemium | Basic personalised news in app |
| Premium briefings / deep research | Higher tier + token budget (US-04) |
| Publisher partnerships | Distribution, rev share |
| Sponsored placements | Clearly labelled; never masquerade as newsroom |
| Industry briefings | B2B-style add-ons |

**Editorial independence** protected — payment does not buy undeclared placement in the main digest.

---

## 12. Platform architecture (logical)

```
Sarah News Experience (UI)
  → Headlines · Stories · Briefings · Search · Preferences

Sarah News Intelligence (shared)
  → Personalisation · Ranking · Summarisation · Story analysis

News Aggregator          → Allow-listed RSS/API (multi-publisher)
Breaking Engine (R3)    → Detection · verification · notify
Briefing Engine (R2)    → Schedulers · dedupe · slot editions
Trends Engine (R4)      → Emerging topics

Personal Sarah          → Conversational tools (same engine)
SHI-01 Home             → Cards deep-linking to News
```

**Code anchors (programme):**

| Component | Path |
|-----------|------|
| Sources | `services/sarah/news/sarahNewsSources.js` |
| RSS | `services/sarah/news/sarahNewsRss.js` |
| Images | `services/sarah/news/sarahNewsImageService.js` |
| Article copy | `services/sarah/news/sarahNewsArticleComposer.js` |
| Edition compile | `services/sarah/news/sarahNewsEditionService.js` |
| Shared snapshot | `services/sarah/news/sarahNewsIntelligenceService.js` |
| Personal Sarah tool | `services/sarah/personal/personalSarahNewsTools.js` |
| Consumer API | `/api/personal-sarah/news/*` |
| Newsroom UI | `prototype/sarah-app-ux/js/sarah-news.js` |

---

## 13. Development roadmap (product releases)

| Release | Product scope | Engineering phases |
|---------|---------------|-------------------|
| **R1 — Sarah News** | Aggregation, headlines, in-app stories, profile, multi-publisher RSS, images, Ask Sarah on story, Personal Sarah headlines tool | SN-01 … SN-03 (in progress) |
| **R2 — Sarah Briefings** | Reliable morning/lunch/evening push + in-app editions; dedupe across slots | SN-03 |
| **R3 — Sarah Breaking** | Event clustering, confidence, breaking UI + notifications, story updates | SN-04 |
| **R4 — Sarah Intelligence** | Trends, deep research, topic follow, search/archive, publisher APIs, sports data | SN-05 … SN-06 |

### R1 build status (as of SN-03 deploy)

| Capability | State |
|------------|--------|
| News tab, setup profile, sync cloud | Live |
| Multi-publisher RSS (SA, ZW, Africa, world, interests) | Live |
| Banner cards + in-app story page + source footnote | Live |
| Image: RSS + og:image + fallback | Live |
| Thin-story filter, Daily Maverick `content:encoded` | Live |
| Personal Sarah `fetchSarahNewsHeadlines` | Live |
| Scheduled push for three slots | R2 |
| Breaking detector + push | R3 |
| Topic follow via chat | R4 |
| Full story room (timeline, related, multi-source) | R2–R3 |
| Publisher partnerships | SN-06 |

---

## 14. Mission and pillars

**Mission:** Make reliable, relevant, timely information accessible through a personalised AI-powered news experience.

**Core promise:** Sarah knows what is happening, understands what matters to you, and brings it to you — in the Newsroom or in conversation.

**Product pillars**

- Personalised news  
- Scheduled briefings  
- Breaking news  
- Conversational news  
- Intelligent research  
- Trend monitoring  
- Adjacent information services (sports, weather, …)  
- Publisher partnerships  

---

## 15. Governance

- **Spencer** — product go/no-go, publisher deals, commercial, production alerts.  
- **Astra** — programme briefs, phase gates, strict rules.  
- **Cursor** — implementation, tests, technical reports, deploy documentation.

Changes to allow-list, breaking rules, or republication policy require **Astra brief + Spencer approval** before production enablement.

---

*Sarah News is a flagship Sarah App experience: not only what happened, but what it means — with sources you can trust.*