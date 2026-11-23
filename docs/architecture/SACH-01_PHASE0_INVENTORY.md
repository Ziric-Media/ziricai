# SACH-01 — Phase 0 implementation inventory

**Tenant:** `sach-consult` (Sach Accounting Solutions / Sach Consult) — **extend only; no duplicate tenant.**

**Spec reference:** Company Sarah Functional Specification (sections 1–24, proposed).

## Already implemented (platform + prior Sach work)

| Area | Status | Notes |
|------|--------|--------|
| Tenant `sach-consult` | Done | Provisioned; Discover public; owner `hello@sachaccounting.co.za` |
| Company Sarah / AI employee | Done | Default reception agent via standard provisioning |
| Portal shell, CRM, appointments, KB, conversations | Done | Shared ZiricAI modules |
| Initial KB + profile bootstrap | Done | `services/consulting/sachConsultBootstrap.js` (3 docs) |
| Runbook | Done | `docs/tenants/SACH_CONSULT.md` |

## Phase 1 delivered in repo (this increment)

| Area | Status | Location |
|------|--------|----------|
| Service catalogue + statuses | Done | `services/consulting/sachAccountingConfig.js` |
| Tenant detection | Done | `services/consulting/sachAccountingIndustryPreset.js` |
| Extended KB + system prompt | Done | `services/storage/sachAccountingKnowledge.js` |
| Client profiles + service requests + audit | Done | `services/consulting/sachAccountingServiceRequestService.js` |
| Firestore collections | Done | `SACH_CLIENT_PROFILES`, `SACH_SERVICE_REQUESTS`, `SACH_SERVICE_AUDIT` in `schema.js` |
| Sarah App chat vertical + tools | Done | `companyReceptionSachAccountingChat.js`, `sachAccountingChatTools.js`, wired in `companyReceptionChatService.js` |
| REST APIs | Done | `services/api/sachAccountingRoutes.js` |
| Portal queue | Done | `js/portal/modules/sachServiceRequests.js` |
| Bootstrap script | Done | `scripts/bootstrap-sach-accounting.mjs` |
| Unit test (memory) | Done | `test/sach-accounting-service-requests.test.mjs` |

**Phase 2 (workflow packs):** see `docs/architecture/SACH-02_PHASE2_WORKFLOWS.md`.

## Partially implemented

| Area | Gap |
|------|-----|
| Service-specific question trees (§6–9) | **22** workflow packs covering main published services; generic `consultation` / `quotation` without dedicated packs |
| Document checklists by service | Seeded on request from packs; **no portal editor** yet |
| Consultation booking | Uses `saveAppointmentRecord` — no accounting-specific smart-booking preset yet |
| Client notifications / follow-ups (§13) | Platform notifications exist; Sach-specific triggers not configured |
| Service plans as binding quotes (§14) | KB lists website plans; **requires Sach sign-off** before Sarah quotes as firm policy |
| Internal manager dashboards (§15.2) | Portal queue only; no workload/deadline aggregates |
| Integrations Sage/Xero/SARS/CIPC (§17) | Documented as integration-ready only — no credentials assumed |

## Missing (later phases)

| Phase | Items |
|-------|--------|
| Phase 2 | Dedicated workflow configs per VAT, PAYE, EMP501, CIPC, payroll monthly, etc. |
| Phase 3 | Automated document chasers, consultation reminders, manager summaries |
| Phase 4 | Verified external integrations |
| Phase 5 | Full acceptance test run on Railway with test client + portal E2E |

## Reuse

- Educare pattern: chat tools → structured records → portal queue (`schoolAdmissions.js`).
- Appointments: shared `appointmentService`.
- Permissions: `canManageNetwork` for staff queue (same as admissions).

## Technical risks

1. Live tenant KB duplication if bootstrap run repeatedly — upserts by doc id (safe).
2. Price/governance: Sarah must not bind quotes until Sach approves plan config in portal.
3. Firestore writes for production bootstrap require `railway run`.

## Spencer — your turn

1. After deploy: `railway run node scripts/bootstrap-sach-accounting.mjs` (once).
2. Open portal `?company=sach-consult` → **Service requests** nav item → confirm empty queue loads.
3. Sarah App chat with `sach-consult` → test VAT enquiry → confirm reference appears in portal.
4. Confirm whether website plan prices in `SACH-KB-PLANS` are approved for Sarah to repeat verbatim.