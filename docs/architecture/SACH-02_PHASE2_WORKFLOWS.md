# SACH-02 — Phase 2 service workflow packs

**Tenant:** `sach-consult` (extend only)

## Delivered (22 packs)

| Pack `serviceType` | Department | Spec alignment |
|--------------------|------------|----------------|
| `vat` | tax | §7.2 |
| `paye` | tax | §7.3 |
| `emp201` | tax | §7.3 |
| `emp501` | tax | §7.4 |
| `income_tax_personal` | tax | §7.5 |
| `income_tax_company` | tax | §7 company income tax |
| `provisional_tax` | tax | §7 provisional tax |
| `tax_clearance` | tax | §7.6 |
| `sars_correspondence` | tax | §7 / SARS letters |
| `bookkeeping` | accounting | §6.2 |
| `management_accounts` | accounting | §6.3 |
| `annual_financial_statements` | accounting | §6.4 |
| `payroll_onboarding` | payroll | §8.2 |
| `payroll_monthly` | payroll | §8.3 |
| `cipc_registration` | corporate_compliance | §9.2 |
| `cipc_annual_return` | corporate_compliance | §9.3 |
| `cipc_director_change` | corporate_compliance | §9.2 |
| `beneficial_ownership` | corporate_compliance | §9.4 |
| `coida` | corporate_compliance | §9.5 |
| `cidb` | corporate_compliance | §9.5 |
| `csd` | corporate_compliance | §9.5 |
| `rma` | corporate_compliance | §9.5 |

Canonical order: `SACH_WORKFLOW_PACK_ORDER` in `services/consulting/sachAccountingWorkflowPacks.js`.

## Behaviour

1. Sarah calls **`getSachServiceWorkflow`** when a service is identified.
2. **`saveSachServiceRequest`** accepts **`intakeAnswers`** (field ids from the pack).
3. New drafts auto-seed **`documentChecklist`** and **`assignedDepartment`**.
4. **`registerSachServiceDocument`** marks matching checklist rows `uploaded`.
5. Portal detail shows intake answers + checklist + uploads.

## APIs

- `GET /api/sach/v1/orgs/:companyId/workflow-packs`
- `GET /api/sach/v1/orgs/:companyId/workflow-packs/:serviceType`

## Tests

- `test/sach-accounting-workflow-packs.test.mjs`
- `test/sach-accounting-workflow-packs-all.test.mjs`
- `test/sach-accounting-workflow-packs-batch2.test.mjs`
- `test/sach-accounting-service-requests.test.mjs` (Phase 1)

## Still open (Phase 2+)

- Portal **editor** for Sach to customise questions/checklists (today: code-defined packs).
- Optional packs: `payslip_request`, `quotation`, `client_onboarding`, `business_advisory`, `consultation` (generic intake without pack).
- Smart-booking preset for accounting consultation types.
- Phase 3: notifications, manager summaries, booking preset.

## Deploy note

After API + portal deploy: `railway run node scripts/bootstrap-sach-accounting.mjs` (KB + `accountingPractice.enabled`).