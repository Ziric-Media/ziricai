# ZiricAI Intelligence Library

## Vision

The ZiricAI Intelligence Library is the authoritative intelligence ecosystem powering every AI employee, sales conversation, support interaction, tutorial, and executive decision on the platform. It extends beyond a traditional FAQ into multiple specialized collections—each maintained as official documentation and production training data.

**Principle:** One source of truth. Every response, script, workflow, and training scenario draws from curated, versioned, metadata-rich content—not ad hoc answers.

---

## Version Roadmap

| Version | Name | Target | Scope |
| --- | --- | ---: | --- |
| **v1.0** | Knowledge Base | 10,000+ entries | Core platform Q&A across 25 modules |
| **v2.0** | Industry Intelligence | 2,000+ per vertical | Industry-specific knowledge, workflows, terminology |
| **v3.0** | Training Scenarios | 5,000+ scenarios | Realistic customer/employee conversation training data |
| **v4.0** | Technical Documentation | 3,000+ entries | API references, SDKs, integration guides, architecture |
| **v5.0** | Sales & CS Intelligence | 4,000+ entries | Scripts, objection handling, ROI models, success playbooks |

---

## v1.0 Module Targets (10 Core Modules → 10,000 entries)

| Module | File | Target | Description |
| ---: | --- | ---: | --- |
| 01 | `01_About_ZiricAI.md` | 300 | Platform introduction, vision, positioning, capabilities |
| 02 | `02_Pricing.md` | 300 | Plans, billing, trials, upgrades, discounts |
| 03 | `03_FAQ.md` | 800 | General platform questions and troubleshooting |
| 04 | `04_Industries.md` | 2,000 | Vertical-specific use cases and configurations |
| 05 | `05_AI_Employees.md` | 500 | Roles, configuration, testing, limits |
| 06 | `06_Marketplace.md` | 400 | Industry packs, templates, plugins |
| 07 | `07_Automation.md` | 600 | Workflows, triggers, actions, webhooks |
| 08 | `08_CRM.md` | 600 | Contacts, pipelines, tags, segments |
| 09 | `10_WhatsApp.md` | 500 | Setup, templates, Meta verification, broadcasts |
| 10 | `11_Integrations.md` | 400 | Channels, API connectors, third-party systems |

Additional modules (Analytics, API, Tutorials, Documentation, Company, Sales, Objection Handling, Competitive Comparison, Security, POPIA, GDPR, Support, Billing, Blogs, Updates) contribute toward the 10,000+ v1.0 total and the long-term 50,000 target.

---

## Intelligence Library Collections

Beyond the Knowledge Base Q&A modules, the Intelligence Library will contain ten specialized collections:

| Collection | Purpose | Primary Audience |
| --- | --- | --- |
| **Knowledge Base** | Authoritative Q&A — platform features, pricing, setup | All |
| **Sales Library** | Scripts, discovery questions, ROI calculations, closing techniques | Sales, Partners |
| **Industry Library** | Vertical terminology, workflows, compliance, use cases | Customers, Sales |
| **Conversation Library** | Realistic customer interaction examples for AI training | AI Employees, Training |
| **Workflow Library** | Pre-built automations for HR, CRM, finance, support | Customers, Admins |
| **Prompt Library** | Optimized system prompts per AI employee role | Developers, Admins |
| **Policy Library** | Security, compliance, governance, data handling | Legal, Security, Admins |
| **Developer Library** | API references, SDKs, integration examples, webhooks | Developers |
| **Training Library** | Onboarding paths, tutorials, certification content | Customers, Partners |
| **Executive Library** | KPIs, dashboards, business insights, decision support | Executives, Owners |

Each collection shares the same metadata schema (ID, category, audience, intent, keywords, ai_response_style, related) for consistent retrieval by Sarah and AI employees.

---

## Entry Format (Official v1.0 Spec)

```yaml
---
id: KB-ABOUT-0001
category: About ZiricAI
sub_category: Introduction
difficulty: Beginner
intent: Platform Introduction          # optional
keywords:
  - ZiricAI
  - AI Business Operating System
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

**A:** (2–4 paragraphs of detailed, professional answer)
```

### Field Reference

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | `KB-{PREFIX}-{NNNN}` — unique across all modules |
| `category` | Yes | Module category title |
| `sub_category` | Yes | Section within module (e.g. Introduction, Platform Features) |
| `difficulty` | Yes | Beginner, Intermediate, Advanced |
| `intent` | No | Query intent for retrieval tuning |
| `keywords` | Yes | Search and matching terms |
| `audience` | Yes | Target audiences for filtering |
| `ai_response_style` | No | How Sarah/AI employees should tailor responses |
| `last_updated` | Yes | ISO date of last content review |
| `related` | Yes | KB IDs or question text for follow-ups |

---

## Phase / Module Progress Tracker

Progress is computed by `getKnowledgeStats()` in `services/knowledge/platformKnowledgeLoader.js` and written to `knowledge/stats.json` on each `npm run build:knowledge` run.

### Module 01 — About ZiricAI

| Section | Target | Status |
| --- | ---: | --- |
| A — Introduction | 80 | In progress |
| B — Platform Features | 60 | Planned |
| C — Concepts & Architecture | 40 | Planned |
| D — Audience & Use Cases | 40 | Planned |
| E — Enterprise & Partners | 40 | Planned |
| F — Operations & Support | 40 | Planned |
| **Module total** | **300** | **In progress** |

### v1.0 Overall

Run `npm run build:knowledge` and inspect `knowledge/stats.json` → `v1.progressPct` for current percentage toward the 10,000-entry target.

---

## Build & Maintenance Workflow

1. Author entries in `knowledge/NN_ModuleName.md` with full YAML frontmatter
2. Link related entries via `related: [KB-XXX-NNNN]` or question text
3. Run `npm run build:knowledge` to regenerate browser bundles and stats
4. Run `npm run prepare:sites marketing` to sync marketing site bundles
5. Commit markdown source and generated bundles together
6. Monitor progress via `knowledge/stats.json` or `GET /api/sarah/knowledge`

---

## Related Documentation

- [Knowledge Base Architecture](./KNOWLEDGE_BASE.md)
- [Sarah AI Integration](./SARAH.md)
- Source: `knowledge/*.md`
- Loader: `services/knowledge/platformKnowledgeLoader.js`
