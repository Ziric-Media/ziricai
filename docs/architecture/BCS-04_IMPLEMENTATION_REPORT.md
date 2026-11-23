# BCS-04 — Babes Car Sales: sales conversation & CRM handoff

**Date:** 2026-11-23  
**Tenant:** `babes-car-sales-cc`  
**Benchmark:** Central Motors automotive **tools only** — no CM data or credentials

---

## Delivered

| Area | Detail |
|------|--------|
| **CRM enquiry tool** | `recordSalesEnquiry` — finance, trade-in, sourcing, callback, general → tenant lead + timeline via `syncFromSalesTurn` |
| **Prompt rules** | WhatsApp `WHATSAPP_ACTION_TOOL_RULES` + Sarah App automotive channel rules for finance/trade-in handoff |
| **Knowledge** | Babes playbooks: finance, trade-in, test drive, demo phrase list (`babes-kn-*`) in `babesCarSalesBootstrap.js` |
| **Bootstrap** | `scripts/bootstrap-babes-bcs04.mjs` (idempotent KB upsert) |
| **Verification** | `scripts/verify-babes-bcs04.mjs`, `test/babes-car-sales-bcs04.test.mjs` |

## Presentation flows (Sarah App / future WhatsApp)

1. **Discovery** — e.g. *automatic SUV under R250,000* → `searchInventory`
2. **Specific stock** — e.g. *Toyota Fortuner?* → `searchInventory`
3. **Finance** — explain process from KB → collect details → `recordSalesEnquiry` (`finance`)
4. **Trade-in** — collect vehicle details → `recordSalesEnquiry` (`trade_in`)
5. **Test drive** — `checkTestDriveAvailability` → `bookTestDrive` (unchanged CM path)

Sarah must **not** quote approved finance or final trade values without human confirmation.

## Ops

```bash
# Code verification (memory backend)
node scripts/verify-babes-bcs04.mjs
node test/babes-car-sales-bcs04.test.mjs

# Production KB refresh (Firestore admin)
railway run node scripts/bootstrap-babes-bcs04.mjs
```

Deploy **API/Railway** when `recordSalesEnquiry` and prompt changes should be live for Sarah App consumers.

## Spencer — your turn

1. Deploy **main** to Railway (if not auto-deployed).
2. Run `railway run node scripts/bootstrap-babes-bcs04.mjs` (KB playbooks on tenant).
3. Sarah App → Discover → **Babes Car Sales CC**:
   - *automatic SUV under R250,000*
   - *Toyota Fortuner?*
   - *I need finance on the Fortuner — I can put R50k down*
   - *I want to trade my 2015 Polo*
   - Book a **test drive** on a listed vehicle (time + `bookTestDrive` confirmation).
4. Portal CRM (`babes-car-sales-cc`) → confirm **leads/timeline** after finance/trade-in chats.
5. Paste back: any wrong stock, missing handoff wording, or booking slot issues.

## Next — BCS-05

Presentation checklist, owner portal login demo, WhatsApp ready-for-setup (no live number until authorised).