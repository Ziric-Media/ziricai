# ZiricAI Knowledge Base Architecture

## Overview

The **ZiricAI Knowledge Base v1.0** is the official, metadata-rich documentation system that serves as the **single source of truth** for Sarah, AI employees, landing pages, and the Company Portal. It is designed to scale to **10,000+ curated entries in v1.0** and **50,000+ long-term**.

**Source of truth:** `knowledge/*.md` (25 numbered category files)

**Branding:** `ZIRICAI KNOWLEDGE BASE v1.0 | MODULE NN: {NAME} | SECTION N: {SECTION}`

See also: [Intelligence Library Vision](./INTELLIGENCE_LIBRARY.md)

## Folder Structure

```
knowledge/
├── README.md                 # Format spec, phase tracker, category index
├── stats.json                # Auto-generated counts (npm run build:knowledge)
├── 01_About_ZiricAI.md       # Module 01 — target 300 entries
├── 02_Pricing.md             # Module 02 — target 300 entries
├── 03_FAQ.md                 # Module 03 — target 800 entries
├── 04_Industries.md          # Module 04 — target 2,000 entries
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

## Official Entry Format (v1.0)

Every Q&A entry includes YAML frontmatter followed by a detailed answer (typically 2–4 paragraphs):

```yaml
---
id: KB-ABOUT-0001
category: About ZiricAI
sub_category: Introduction
difficulty: Beginner
intent: Platform Introduction
keywords:
  - ZiricAI
  - AI Business Operating System
  - AI BOS
audience:
  - General
  - Prospects
  - Customers
  - Partners
  - Sales
ai_response_style: "Explain using simple business language. Avoid technical jargon unless requested."
last_updated: 2026-07-24
related:
  - KB-ABOUT-0002
  - What are AI Employees?
---

## Q: What is ZiricAI?

**A:** ZiricAI is an AI Business Operating System (AI BOS) developed by Ziric Media...
```

### Metadata Fields

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | `KB-{PREFIX}-{NNNN}` |
| `category` | Yes | Module category |
| `sub_category` | Yes | Section within module |
| `difficulty` | Yes | Beginner / Intermediate / Advanced |
| `intent` | No | Query intent for retrieval |
| `keywords` | Yes | Search terms |
| `audience` | Yes | Customer, Sales, Developer, Partners, etc. |
| `ai_response_style` | No | How Sarah should tailor responses by audience |
| `last_updated` | Yes | ISO date |
| `related` | Yes | KB IDs or question text for follow-ups |

### ID Convention

`KB-{CATEGORY_PREFIX}-{NNNN}` — e.g. `KB-ABOUT-0001`, `KB-PRICING-0042`, `KB-AIEMP-0121`

## Version Roadmap

| Version | Name | Target | Scope |
| --- | --- | ---: | --- |
| **v1.0** | Knowledge Base | 10,000+ | Core platform Q&A (25 modules) |
| **v2.0** | Industry Intelligence | — | Industry-specific knowledge |
| **v3.0** | Training Scenarios | — | AI conversation training data |
| **v4.0** | Technical Docs | — | API, SDK, integration guides |
| **v5.0** | Sales & CS Intelligence | — | Scripts, objections, ROI playbooks |

**Long-term target:** 50,000 curated entries across all Intelligence Library collections

## Loader API

**Module:** `services/knowledge/platformKnowledgeLoader.js`

| Function | Description |
|----------|-------------|
| `loadAllKnowledgeFiles()` | Read all `knowledge/NN_*.md`, parse YAML + Q&A, dedupe |
| `parseFrontmatter(yaml)` | Parse YAML metadata block (supports `intent`, `ai_response_style`) |
| `getPlatformKnowledgeSummary({ query, audience })` | Category manifest + smart retrieval for Sarah |
| `searchKnowledge(query, { category, subCategory, audience })` | Metadata-aware keyword search; returns `aiResponseStyle` |
| `getRelatedEntries(id)` | Follow-up questions via `related` IDs or question text |
| `getKnowledgeStats()` | Counts by category, phase, and v1.0 progress |
| `matchPlatformQuestion(text)` | Best single match (legacy compat) |

### Smart Retrieval (Sarah)

Sarah does **not** dump all entries into every prompt. Instead:

1. **System prompt** includes category manifest + top matches for the user's message, filtered by audience, including `ai_response_style` when present
2. **`platformHelp` tool** calls `searchKnowledge()` with category/audience/sub_category filters
3. **Related entries** surfaced via `getRelatedEntries()` — resolves both KB IDs and question text
4. Token budget: ~4,500 chars for knowledge summary (configurable)

## Build Pipeline

```bash
npm run build:knowledge   # Parse markdown → browser bundles + stats
npm run prepare:sites marketing  # Sync bundles to marketing site
```

**Outputs:**
- `js/shared/platformKnowledgeData.js` — ES module with full metadata
- `js/shared/platformKnowledge.browser.js` — IIFE for landing Sarah
- Synced copies in `marketing/`, `admin/`, `app/` js/shared/
- `knowledge/stats.json` — Q&A counts, v1.0 progress, per-module stats

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
| `services/sarah/prompts/systemPrompt.js` | Injects metadata-aware summary; follows `ai_response_style` |
| `services/sarah/tools/platformHelp.js` | Search + related entries with metadata in response |
| `api/app.js` | Public knowledge search endpoint |

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
2. Write detailed 2–4 paragraph answers (not one-liners)
3. Set `ai_response_style` for audience-sensitive topics
4. Link related entries via `related: [KB-XXX-NNNN]` or question text
5. Run `npm run build:knowledge`
6. Commit both markdown and generated bundles
7. Monitor progress via `knowledge/stats.json` → `v1.progressPct`

## Related Docs

- [Intelligence Library Vision](./INTELLIGENCE_LIBRARY.md)
- [Sarah AI](./SARAH.md)
- [Billing Plans](../../services/platform/billingPlans.js)
