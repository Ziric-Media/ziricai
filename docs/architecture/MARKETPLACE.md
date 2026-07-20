# ZiricAI Marketplace Architecture

One-click install of complete AI Employee packs — knowledge, flows, automations, integrations, prompts, FAQs, actions, and analytics — in under 5 minutes.

## System Overview

```mermaid
flowchart TB
    subgraph UI["Client UI"]
        Portal["Company Portal Marketplace"]
        Admin["Superadmin Marketplace"]
    end

    subgraph API["Express API"]
        Catalog["GET /api/marketplace/catalog"]
        Pack["GET /api/marketplace/pack/:packId"]
        Install["POST /api/marketplace/install"]
        Updates["GET /api/marketplace/installed/:companyId/updates"]
        Review["POST /api/marketplace/review"]
    end

    subgraph Services["Platform Services"]
        Registry["marketplaceRegistry.js"]
        Template["marketplaceTemplate.js"]
        Installer["marketplaceInstaller.js"]
        Versioning["marketplaceVersioning.js"]
        Industry["industryPackService.js"]
        Provision["provisioningService.js"]
    end

    subgraph Storage["Storage Adapter"]
        Memory["memoryAdapter (dev)"]
        Firestore["firestoreAdapter (prod)"]
    end

    Portal --> Catalog
    Portal --> Install
    Admin --> Catalog
    Admin --> Install
    Catalog --> Registry
    Catalog --> Template
    Pack --> Installer
    Install --> Installer
    Installer --> Industry
    Industry --> Provision
    Updates --> Versioning
    Versioning --> Storage
    Industry --> Storage
    Registry --> Template
```

## Installation Workflow (5 Steps)

```mermaid
sequenceDiagram
    participant User
    participant UI as Portal Wizard
    participant API as /api/marketplace/install
    participant Inst as marketplaceInstaller
    participant IPS as industryPackService
    participant Prov as provisioningService

    User->>UI: Click Install
    UI->>API: step=preview, packId
    API->>Inst: previewPack()
    Inst-->>UI: Contents checklist + reviews

    User->>UI: Customize branding (optional)
    UI->>API: step=branding
    Inst-->>UI: Validated branding

    User->>UI: Select integrations
    UI->>API: step=integrations
    Inst-->>UI: Enabled channels

    User->>UI: Confirm install
    UI->>API: step=install, demoMode=true
    Inst->>IPS: installIndustryPack(companyId, packId, customizations)
    IPS->>Prov: provisionAgent, createWorkflow, saveKnowledgeDoc
    IPS-->>UI: Success + links

    UI->>API: step=success
    Inst-->>UI: Navigation links + update badge
```

| Step | Name | Backend | Purpose |
|------|------|---------|---------|
| 1 | Preview | `previewPack()` | Contents checklist, rating, reviews, inheritance chain |
| 2 | Branding | `validateBranding()` | Optional agent name, greeting, colors |
| 3 | Integrations | `selectIntegrations()` | Enable WhatsApp, email, webchat, etc. |
| 4 | Install | `executeInstall()` | Provision all tenant resources + **post-install validation** |
| 5 | Success | `installSuccess()` | Links to Agents, Knowledge, Automation |

## Install validation

After `installIndustryPack()` completes, `marketplaceInstallValidator.validatePackInstall()` verifies resources exist in tenant APIs before the install is marked successful:

| Check | Tenant API | Requirement |
|-------|------------|-------------|
| AI employees | `listAiEmployees(companyId)` | Each provisioned agent has `systemPrompt` + `knowledgeBaseId` |
| Knowledge docs | `listKnowledgeDocuments(companyId)` | All `knowledgeDocIds` from install record resolve |
| Automations | `listWorkflows(companyId)` via `workflowRegistry` | Pack workflows saved as `status: active` with event triggers |

If validation fails, `executeInstall()` throws and the UI shows the error — broken templates are not marked installed.

Workflows from pack manifests are converted from node graphs to automation engine `trigger` + `actions` (not legacy `workflowService` in-memory store).

Success response includes `validation.verified` and `verifiedSummary` (e.g. `Installed: Emma (AI), 3 docs, 1 workflow`).

Portal/admin install flows call `invalidateHub()` + `prefetchHub()` after success so Overview widgets reflect new resources immediately.

## Template Inheritance

Base **Receptionist AI** (`pack-receptionist-ai`) provides shared front-desk knowledge, CRM stages, and enquiry workflow. Industry variants extend it:

```mermaid
flowchart LR
    Base["pack-receptionist-ai<br/>Receptionist AI"]
    School["pack-school-ai<br/>School AI"]
    Law["pack-law-ai<br/>Law Firm AI"]
    Clinic["pack-clinic-ai<br/>Clinic AI"]

    Base --> School
    Base --> Law
    Base --> Clinic

    School -.->|"+ School FAQs"| School
    Law -.->|"+ Legal intake"| Law
    Clinic -.->|"+ Patient privacy"| Clinic
```

**Merge rule:** Child packs inherit base knowledge and workflows; child-specific FAQs and prompts override/append. See `TEMPLATE_INHERITANCE` in `services/platform/marketplaceTemplate.js`.

## Version Management

- Packs use **semver** (e.g. `1.0.0`, `1.1.0`)
- Platform stores full templates at `platform/marketplace/packs/{packId}/versions/{version}`
- `checkForUpdates(companyId, packId)` compares installed version vs latest
- `applyUpdate(companyId, packId, targetVersion)` uses **merge strategy**:
  - **Preserve:** tenant branding, custom KB docs, disabled integrations
  - **Add:** new knowledge docs and workflows from update
  - **Update:** agent prompts and analytics defaults

## Paid vs Free Templates

| Price | Behavior |
|-------|----------|
| `0` | Free — instant install |
| `999` | Paid (demo) — returns 402 unless `demoMode: true` |

Paid packs show "Contact sales" in UI; demo tenants auto-install with `demoMode: true`.

## Flagship Marketplace Items

| Pack ID | Display Name | Category | Price |
|---------|--------------|----------|-------|
| `pack-school-ai` | School AI | Education | Free |
| `pack-law-ai` | Law Firm AI | Legal | Paid |
| `pack-clinic-ai` | Clinic AI | Healthcare | Free |
| `pack-funeral-ai` | Funeral AI | Funeral | Free |
| `pack-sales-ai` | Sales AI | Sales | Paid |
| `pack-receptionist-ai` | Receptionist AI | Hospitality | Free |
| `pack-church-ai` | Church AI | Faith | Free |
| `pack-construction-ai` | Construction AI | Construction | Paid |
| `pack-security-ai` | Security AI | Security | Paid |
| `pack-restaurant-ai` | Restaurant AI | Food | Free |
| `pack-automotive-ai` | Automotive AI | Automotive | Paid |
| `pack-retail-ai` | Retail AI | Retail | Free |

Legacy IDs (`pack-school-receptionist`, `pack-automotive`, etc.) resolve via `PACK_ALIASES` — existing installs are not broken.

## Pack Contents Manifest

Every pack exposes a normalized `contents` object:

```json
{
  "knowledge": ["Admissions Process", "..."],
  "flows": ["Parent Enquiry Intake"],
  "automations": ["Parent Enquiry Intake"],
  "integrations": ["whatsapp", "email"],
  "prompts": ["School Receptionist System Prompt"],
  "faqs": ["FAQ — School Fees & Payment"],
  "actions": ["Book Appointment", "Transfer to Human"],
  "analytics": ["admission_enquiries", "response_time"]
}
```

## Key Files

| File | Role |
|------|------|
| `services/platform/marketplaceRegistry.js` | Pack catalog, categories, aliases |
| `services/platform/marketplaceTemplate.js` | Inheritance, manifest, pricing, ratings |
| `services/platform/marketplaceInstaller.js` | 5-step wizard, search/filter, reviews, validation gate |
| `services/platform/marketplaceInstallValidator.js` | Post-install employee + KB + workflow verification |
| `services/platform/marketplaceVersioning.js` | Semver, updates, merge apply |
| `services/platform/industryPackService.js` | Install orchestration |
| `services/platform/employeePacks.js` | Role-based pack definitions |
| `services/database/schema.js` | Firestore path constants |
| `docs/architecture/MARKETPLACE_SCHEMA.md` | Database schema detail |
