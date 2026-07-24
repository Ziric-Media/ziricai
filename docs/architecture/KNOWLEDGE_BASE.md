# ZiricAI Knowledge Base Architecture

## Overview

The ZiricAI platform knowledge base is a **markdown-first, 30-category Q&A system** designed to scale to **15,000+ question-answer pairs**. It powers Sarah (AI Operating Assistant) on the landing page, Company Portal, and Railway API.

**Source of truth:** `knowledge/*.md`

## Folder Structure

```
knowledge/
├── README.md                 # Category index, format spec, stats
├── stats.json                # Auto-generated counts (npm run build:knowledge)
├── 01-about.md               # 30-category numbered files
├── 02-ai-employees.md
├── ...
├── 30-success-stories.md
├── faq.md                    # Cross-cutting FAQ index
└── about.md, pricing.md, ... # Flat aliases (synced from canonical files)
```

### 30-Category Taxonomy

| # | Category | File |
|---|----------|------|
| 1 | About | `01-about.md` |
| 2 | AI Employees | `02-ai-employees.md` |
| 3 | Features | `03-features.md` |
| 4 | Industries | `04-industries.md` |
| 5 | Pricing | `05-pricing.md` |
| 6 | Marketplace | `06-marketplace.md` |
| 7 | Automation | `07-automation.md` |
| 8 | CRM | `08-crm.md` |
| 9 | Analytics | `09-analytics.md` |
| 10 | WhatsApp | `10-whatsapp.md` |
| 11 | Integrations | `11-integrations.md` |
| 12 | API | `12-api.md` |
| 13 | Tutorials | `13-tutorials.md` |
| 14 | Documentation | `14-documentation.md` |
| 15 | Security | `15-security.md` |
| 16 | POPIA | `16-popia.md` |
| 17 | GDPR | `17-gdpr.md` |
| 18 | Sales | `18-sales.md` |
| 19 | Objection Handling | `19-objections.md` |
| 20 | Competitive Comparison | `20-comparisons.md` |
| 21 | Billing | `21-billing.md` |
| 22 | Support | `22-support.md` |
| 23 | Company | `23-company.md` |
| 24 | Blogs | `24-blogs.md` |
| 25 | Product Updates | `25-product-updates.md` |
| 26 | Glossary | `26-glossary.md` |
| 27 | Internal Policies | `27-internal-policies.md` |
| 28 | Technical Troubleshooting | `28-troubleshooting.md` |
| 29 | Best Practices | `29-best-practices.md` |
| 30 | Success Stories | `30-success-stories.md` |

## Markdown Q&A Format

Every Q&A pair uses this parseable format:

```markdown
# Category Title
> Category: category-id | ZiricAI Platform Knowledge Base

## Q: What is ZiricAI?
**A:** ZiricAI is an AI Business Operating System...

## Q: Who created ZiricAI?
**A:** ...
```

## Loader API

**Module:** `services/knowledge/platformKnowledgeLoader.js`

| Function | Description |
|----------|-------------|
| `loadAllKnowledgeFiles()` | Glob-read all `knowledge/*.md`, parse Q&A, dedupe |
| `getPlatformKnowledgeSummary({ query, maxChars })` | Category manifest + smart retrieval for Sarah prompt |
| `searchKnowledge(query, { limit, category })` | Keyword scoring search |
| `getKnowledgeStats()` | File count, Q count, per-category breakdown |
| `matchPlatformQuestion(text)` | Best single match (legacy compat) |
| `getPlatformAnswer(topic)` | Answer by category or free-text |

### Smart Retrieval (Sarah)

Sarah does **not** dump all 15k lines into every prompt. Instead:

1. **System prompt** includes category manifest + first Q per category + top 6 matches for the user's current message
2. **`platformHelp` tool** calls `searchKnowledge()` for precise Q&A on demand
3. Token budget: ~4,500 chars for knowledge summary (configurable)

## Build Pipeline

```bash
npm run seed:knowledge    # Regenerate starter markdown from seed script
npm run build:knowledge   # Parse markdown → browser bundles + stats
```

**Outputs:**
- `js/shared/platformKnowledgeData.js` — ES module for browser/Netlify
- `js/shared/platformKnowledge.browser.js` — IIFE for landing Sarah
- `knowledge/stats.json` — Q&A counts per file
- Flat alias files (`about.md`, `pricing.md`, etc.)

## Sarah Integration

| Component | Role |
|-----------|------|
| `services/sarah/prompts/systemPrompt.js` | Injects `getPlatformKnowledgeSummary({ query: userMessage })` |
| `services/sarah/tools/platformHelp.js` | Uses `searchKnowledge()` for on-demand lookup |
| `services/sarah/sarahOrchestrator.js` | Passes `lastUserMessage` to prompt builder |
| `api/app.js` | `GET /api/sarah/knowledge?q=...` public search endpoint |

## Landing Page (Netlify)

Static sites use the generated browser bundle:

- `js/shared/platformKnowledge.browser.js` → `window.ZiricPlatformKnowledge`
- `marketing/js/ziricai-landing.js` calls `matchPlatformQuestion()` locally
- Falls back to `POST /api/sarah/chat` when API is available

## Pricing Accuracy

Pricing Q&A in `05-pricing.md` and `21-billing.md` must match `services/platform/billingPlans.js`:

- **Trial:** Free, 14 days
- **Starter:** R999.99/month
- **Professional:** R2,999/month
- **Business:** R4,999/month
- **Enterprise:** Custom

Run `npm run build:knowledge` after any pricing plan changes.

## Growth Path to 15,000 Q&A

1. Add Q&A pairs to the appropriate category markdown file
2. Run `npm run build:knowledge`
3. Commit both markdown and generated bundles
4. Monitor progress via `knowledge/stats.json` or `getKnowledgeStats()`

Priority expansion areas: industries (per-vertical deep dives), objections, troubleshooting, tutorials.

## Related Docs

- [Sarah AI](../agents/04-sarah-ai.md)
- [Knowledge Base Agent](../agents/06-knowledge-base.md)
- [Billing Plans](../../services/platform/billingPlans.js)
