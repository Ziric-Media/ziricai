# G6 — WhatsApp Gateway behavioral readiness

**Status:** Implemented in repo (code + tests + read-only APIs). **Not deployed** unless separately authorized.  
**Authorization scope:** G6 development only — does **not** authorize G5 flag changes, Railway env, Firestore mutations, Meta changes, or live WhatsApp probes.

---

## 1. Strategic outcome

WhatsApp becomes a **managed service** when we can show **evidence** across:

| Layer | Question |
|-------|----------|
| Infrastructure | Are platform credentials and webhook **configuration** present? |
| Allocation | Does registry assignment match the tenant projection? |
| Inbound | Does a message **resolve** to the correct `companyId` (and Sarah)? |
| Outbound | Can we **send** from the assigned Phone Number ID under registry rules? |
| End-to-end | Inbound → Sarah → outbound with **correlation** |

**A token and Phone Number ID alone must not produce `OPERATIONAL`.**

---

## 2. Phase A — Read-only audit (existing vs G6)

### 2.1 Already exists (do not duplicate)

| Capability | Location | Limitation |
|------------|----------|------------|
| Config readiness (L5–L6 partial) | `assessRuntimeReadiness()` in `platformWhatsAppIntegrationService.js` | No allocation, routing, Sarah, or behavioral proof |
| Tenant diagnostic tool | `diagnoseWhatsAppIntegration.js` (Sarah tool) | Tenant-scoped; no gateway aggregate; no OPERATIONAL gate |
| G4 inbound routing | `whatsappGatewayService.js` + `integrationConfig.js` | Runtime only; not surfaced as readiness |
| G4 outbound registry gate | `assertManagedOutboundRegistryAllowed()` in `whatsapp.js` | Blocks sends; no positive “verified send” |
| G2 reconciliation | `reconcileWhatsAppPhoneAssignments.js` | Drift detection |
| G5 drift scan | `whatsappGatewayRecovery.js` + `GET …/projection-drift` | Platform-wide misalignment |
| Proactive signals | `whatsappProactiveSignals.js` | Heuristic; not operator readiness UI |

### 2.2 G6 additions

| Component | Purpose |
|-----------|---------|
| `whatsappGatewayReadinessStates.js` | State vocabulary |
| `whatsappGatewayReadinessService.js` | Dimension evaluation + `OPERATIONAL` gate |
| `whatsappGatewayProbeService.js` | **Simulated** probes; live blocked by default |
| `whatsappGatewayProbeStore.js` | Probe history (in-memory; durable store future) |
| Read-only + simulate APIs | See §7 |
| `test/whatsapp-gateway-readiness.test.mjs` | Automated checks (no Meta) |

---

## 3. Phase B — Readiness dimensions (10)

| # | Dimension ID | What it checks |
|---|----------------|----------------|
| 1 | `meta_registration` | Phone Number ID present on integration |
| 2 | `platform_credentials` | Wraps `assessRuntimeReadiness` (env / tenant token) |
| 3 | `registry_allocation` | Managed: registry `assigned` → this `companyId` |
| 4 | `projection_consistency` | Managed: registry phone + active integration align |
| 5 | `webhook_infrastructure` | `VERIFY_TOKEN` + `META_APP_SECRET` on host (**not** recent POST proof) |
| 6 | `inbound_routing` | `resolveWhatsAppInboundCompanyId` → this tenant |
| 7 | `tenant_resolution` | Same evidence as inbound (explicit company match) |
| 8 | `sarah_availability` | Default AI employee exists |
| 9 | `outbound_capability` | Config gate (credentials + allocation); **not** live Graph |
| 10 | `end_to_end` | Recorded probe events with success |

BYO (`credentialsSource: tenant`): dimensions 3–4 marked available with BYO note; registry not required.

---

## 4. Phase C — Readiness states & transitions

### 4.1 States

`NOT_CONFIGURED`, `NOT_REGISTERED`, `AVAILABLE`, `ALLOCATION_REQUIRED`, `PROJECTION_DRIFT`, `CREDENTIALS_UNAVAILABLE`, `WEBHOOK_UNVERIFIED`, `ROUTING_UNVERIFIED`, `SARAH_UNAVAILABLE`, `OUTBOUND_UNVERIFIED`, `OPERATIONAL`, `DEGRADED`, `SUSPENDED`.

### 4.2 Overall state rules (implemented)

1. **Worst meaningful config failure wins** (suspended → drift → allocation → credentials → Sarah).  
2. **`configurationComplete`** = all dimensions `ok`.  
3. **`overallState = ROUTING_UNVERIFIED`** when config complete but **no behavioral probe evidence**.  
4. **`OPERATIONAL`** only when:
   - `configurationComplete === true`
   - `behavioralEvidence === true` (recorded probe events)
   - End-to-end dimension `ok` (live or approved simulated E2E — see probes)
   - `operational === true` on report

**Simulated inbound routing alone does not set `OPERATIONAL`.** It improves evidence toward E2E.

### 4.3 Evidence classes

| Class | Meaning |
|-------|---------|
| `configuration` | Static checks + simulated routing resolution |
| `behavioral` | Requires probe store events; live probes future |

Reports include `evidenceClass` so UI can show “Configured” vs “Verified live”.

---

## 5. Phase D — Controlled probes

### 5.1 Simulated (authorized in G6 code)

- `simulateInboundRoutingProbe({ phoneNumberId, expectedCompanyId })`
- `simulateOutboundRegistryProbe({ companyId, phoneNumberId, credentialsSource })`
- API: `POST /api/platform/companies/:companyId/whatsapp-gateway/simulate-probe` (platform auth, **no Meta traffic**)

Events stored in `whatsappGatewayProbeStore` (no message bodies, no tokens).

### 5.2 Live (NOT authorized by G6 development)

- Requires **`WHATSAPP_GATEWAY_LIVE_PROBE_AUTHORIZED=true`** plus future approved recipient list.
- `executeLiveInboundProbe` / `executeLiveOutboundProbe` throw until workflow implemented.
- **Do not enable** live flag without programme sign-off and approved test numbers.

### 5.3 Safety

- No unsolicited customer messages.
- No production number as test destination without approval.
- Probe responses mask Phone Number ID; never return tokens.

---

## 6. Phase E — Diagnostics & observability

### 6.1 Tenant report

`GET /api/platform/companies/:companyId/whatsapp-gateway/readiness`

Returns: `overallState`, `operational`, `dimensions[]`, `remediation[]`, `correlationId`, `lastProbes`, `gatewayRoutingMode`.

### 6.2 Platform health

`GET /api/platform/whatsapp-gateway/health`

Returns: projection drift summary, G4/G5 **env flag values** (read-only), live probe flag status.

### 6.3 CLI

`scripts/g6-evaluate-readiness-readonly.mjs --company=…`

### 6.4 Future (G7 MC UI)

Target company card (illustrative):

- Assigned number · ZiricAI-managed  
- Number allocation · Verified / Failed  
- Inbound routing · Verified / Unverified  
- Sarah connection · Verified / Unverified  
- Outbound messaging · Verified / Unverified  
- End-to-end test · Verified / Not run  
- **Operational** only when evidence supports it

---

## 7. Phase F — Tenant isolation (design + tests)

| Scenario | Mechanism |
|----------|-----------|
| A cannot route as B | G4 primary + registry assign; G6 inbound dimension |
| A cannot send as B’s number | G4 outbound registry assert; G6 outbound probe |
| Sarah context | Tenant-scoped tools; readiness checks default agent per company |
| BYO isolation | Readiness skips managed allocation; credentials `tenant` |
| Client Zero (6157) | Legacy routing path unchanged; evaluate via company report only |
| Central Motors (3699) | Managed path; no special-case code — production data untouched |

---

## 8. Phase G — Tests & acceptance

### 8.1 Automated (no Meta)

- `test/whatsapp-gateway-readiness.test.mjs` — assign + routing dimension + simulated probe  
- `test/whatsapp-gateway-assignment.test.mjs` (G5)  
- `test/whatsapp-gateway-routing.test.mjs` (G4)

### 8.2 Acceptance (G6 code complete)

- [x] Readiness service with 10 dimensions  
- [x] `OPERATIONAL` gated on behavioral evidence  
- [x] Simulated probes + probe store  
- [x] Live probes blocked by default  
- [x] Platform + tenant read-only APIs  
- [x] No duplicate of `assessRuntimeReadiness` logic  
- [ ] Production deploy (separate authorization)  
- [ ] Live E2E probe workflow (separate authorization)  
- [ ] Durable probe persistence (optional follow-up)

---

## 9. G5 rollout (unchanged by G6)

1. Deploy `7ad9f16`+ when authorized.  
2. `scripts/g5-scan-projection-drift-readonly.mjs` / `GET …/projection-drift`.  
3. Confirm 3699 + Client Zero via readiness + reconciliation (read-only).  
4. Enable `WHATSAPP_GATEWAY_ASSIGN_TRANSACTIONS` only after staging concurrency test.  
5. Enable `WHATSAPP_GATEWAY_STRICT_PROJECTION` only after MC operator workflow verified.

**G6 does not change these flags.**

---

## 10. Affected files (G6)

| File | Role |
|------|------|
| `services/platform/whatsappGatewayReadinessStates.js` | States / dimension IDs |
| `services/platform/whatsappGatewayReadinessService.js` | Evaluation engine |
| `services/platform/whatsappGatewayProbeService.js` | Simulated / live guard |
| `services/platform/whatsappGatewayProbeStore.js` | Probe history |
| `api/app.js` | Readiness + health + simulate-probe routes |
| `scripts/g6-evaluate-readiness-readonly.mjs` | Operator CLI |
| `test/whatsapp-gateway-readiness.test.mjs` | Unit tests |

---

## 11. Operational risks

| Risk | Mitigation |
|------|------------|
| False “configured” confidence | `ROUTING_UNVERIFIED` ceiling without probes |
| False OPERATIONAL | Hard gate on `behavioralEvidence` + E2E dimension |
| Live probe abuse | Env flag + not implemented executors |
| Secret leakage | Masked phone IDs; no tokens in readiness/probes |
| MC bypass configure path | G5 strict projection still **off** until rollout |

---

## 12. Document history

| Date | Change |
|------|--------|
| 2026-11-01 | G6 spec + initial implementation (simulated probes only) |
