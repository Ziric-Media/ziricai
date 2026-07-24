# ZiricAI Knowledge Base Architecture

## Overview

The ZiricAI platform knowledge base is a **metadata-rich, 25-category Q&A system** designed to scale to **25,000–50,000 curated question-answer pairs**. It powers Sarah (AI Operating Assistant) on the landing page, Company Portal, and Railway API.

**Source of truth:** `knowledge/*.md` (25 numbered category files)

## Folder Structure

```
knowledge/
├── README.md                 # Format spec, phase tracker, category index
├── stats.json                # Auto-generated counts (npm run build:knowledge)
├── 01_About_ZiricAI.md
├── 02_Pricing.md
├── 03_FAQ.md
├── 04_Industries.md
├── 05_AI_Employees.md
├── 06_Marketplace.md
├── 07_Automation.md
├── 08_CRM.md
├── 09_Analytics.md
├── 10_WhatsApp.md
├── 11_Integrations.md
├── 12_API.md
├── 13_Tutorials.md
├── 14_Documentation.md
├── 15_Company.md
├── 16_Sales.md
├── 17_Objection_Handling.md
├── 18_Competitive_Comparison.md
├── 19_Security.md
├── 20_POPIA.md
├── 21_GDPR.md
├── 22_Support.md
├── 23_Billing.md
├── 24_Blogs.md
└── 25_Updates.md
```

## Metadata Entry Format

Every Q&A entry includes YAML frontmatter:

```yaml
---
id: KB-ABOUT-0001
category: About ZiricAI
sub_category: Introduction
difficulty: Beginner
keywords:
  - AI Business Operating System
audience:
  - Customer
  - Sales
last_updated: 2026-07-24
related:
  - KB-ABOUT-0002
---

## Q: What is ZiricAI?

**A:** ZiricAI is an AI Business Operating System...
```

### ID Convention

`KB-{CATEGORY_PREFIX}-{NNNN}` — e.g. `KB-PRICING-0042`, `KB-AIEMP-0121`

## Phased Roadmap

| Phase | Name | Target | Scope |
| --- | --- | ---: | --- |
| 1 | Core | ~2,000 | About, FAQ, Pricing, AI Employees, Features, Company |
| 2 | Business Platform | ~3,000 | CRM, Automation, Marketplace, Analytics, WhatsApp, Integrations, API |
| 3 | Sales & Growth | ~2,500 | Sales, Objections, Comparisons, Industries |
| 4 | Technical & Compliance | ~3,000 | Documentation, Tutorials, Support, Security, POPIA, GDPR, Billing |
| 5 | Content | ~5,000 | Blogs, Updates, Best Practices, Success Stories |

**Long-term target:** 25,000–50,000 curated Q&A pairs

## Loader API

**Module:** `services/knowledge/platformKnowledgeLoader.js`

| Function | Description |
|----------|-------------|
| `loadAllKnowledgeFiles()` | Read all `knowledge/NN_*.md`, parse YAML + Q&A, dedupe |
| `parseFrontmatter(yaml)` | Parse YAML metadata block |
| `getPlatformKnowledgeSummary({ query, audience })` | Category manifest + smart retrieval for Sarah |
| `searchKnowledge(query, { category, subCategory, audience })` | Metadata-aware keyword search |
| `getRelatedEntries(id)` | Follow-up questions via `related` links + same sub_category |
| `getKnowledgeStats()` | Counts by category and phase with progress percentages |
| `matchPlatformQuestion(text)` | Best single match (legacy compat) |

### Smart Retrieval (Sarah)

Sarah does **not** dump all entries into every prompt. Instead:

1. **System prompt** includes category manifest + top matches for the user's message, filtered by audience (Sales vs Customer)
2. **`platformHelp` tool** calls `searchKnowledge()` with category/audience/sub_category filters
3. **Related entries** surfaced via `getRelatedEntries()` for follow-up suggestions
4. Token budget: ~4,500 chars for knowledge summary (configurable)

## Build Pipeline

```bash
npm run seed:knowledge    # Regenerate starter markdown with metadata IDs
npm run build:knowledge   # Parse markdown → browser bundles + stats
```

**Outputs:**
- `js/shared/platformKnowledgeData.js` — ES module with full metadata
- `js/shared/platformKnowledge.browser.js` — IIFE for landing Sarah
- Synced copies in `marketing/`, `admin/`, `app/` js/shared/
- `knowledge/stats.json` — Q&A counts per file and phase

## API

`GET /api/sarah/knowledge` supports:

| Param | Description |
| --- | --- |
| `q` | Search query |
| `category` | Category ID filter (e.g. `pricing`, `about-ziricai`) |
| `sub_category` | Sub-category filter (e.g. `Introduction`, `Plans`) |
| `audience` | Audience filter (`Customer`, `Sales`, `Developer`, `Internal`) |
| `related` / `id` | Get related entries for a KB ID |
| `limit` | Max results (default 8, max 20) |

## Sarah Integration

| Component | Role |
|-----------|------|
| `services/sarah/prompts/systemPrompt.js` | Injects metadata-aware summary with audience filter |
| `services/sarah/tools/platformHelp.js` | Search + related entries with metadata in response |
| `api/app.js` | Public knowledge search endpoint |

## Landing Page (Netlify)

Static sites use the generated browser bundle:

- `marketing/js/shared/platformKnowledge.browser.js` → `window.ZiricPlatformKnowledge`
- Supports `searchKnowledge()`, `getRelatedEntries()`, audience filtering

## Pricing Accuracy

Pricing Q&A in `02_Pricing.md` and `23_Billing.md` must match `services/platform/billingPlans.js`:

- **Trial:** Free, 14 days
- **Starter:** R999.99/month
- **Professional:** R2,999/month
- **Business:** R4,999/month
- **Enterprise:** Custom

Run `npm run build:knowledge` after any pricing plan changes.

## Growth Workflow

1. Add Q&A with full YAML frontmatter to the appropriate category file
2. Link related entries via `related: [KB-XXX-NNNN]`
3. Run `npm run build:knowledge`
4. Commit both markdown and generated bundles
5. Monitor progress via `knowledge/stats.json` or `getKnowledgeStats()`

## Related Docs

- [Sarah AI](../agents/04-sarah-ai.md)
- [Knowledge Base Agent](../agents/06-knowledge-base.md)
- [Billing Plans](../../services/platform/billingPlans.js)
