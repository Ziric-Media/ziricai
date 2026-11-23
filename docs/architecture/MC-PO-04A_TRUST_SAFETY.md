# MC-PO-04A — Sarah Trust & Safety (v1)

## Scope

- Rule-based **safety classification** on Personal Sarah and Company Sarah inbound messages (`consumerSafetyClassifier.js`).
- **Signals** in `platformSafetySignals`; auto **cases** for elevated/critical (`consumerSafetyDetectionService.js`).
- Mission Control: **Sarah Users** profile (MC-PO-02A) + **Trust & Safety** dashboard (MC-PO-04).
- **No** full private chat browsing in MC; redacted excerpts on signals/case reasons only.

## API

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/platform/governance/safety/overview` | `SAFETY_READ` |
| GET | `/api/platform/governance/safety/cases` | `SAFETY_READ` |
| POST | `/api/platform/governance/safety/cases` | `SAFETY_WRITE` |
| POST | `/api/platform/governance/safety/cases/:caseId/decision` | `SAFETY_WRITE` |

## Chat integration

- `handlePersonalSarahChat` — blocks reply when `shouldBlock` (critical patterns).
- `sendCompanySarahMessage` — same; persists user + safety assistant message.

## Follow-ups (programme)

- MC-PO-04B: reviewer roles, scoped transcript access + audit.
- MC-PO-04D: self-harm emergency playbook (not ticket-only).
- MC-PO-09: legal investigation requests and disclosure register.
- Model-based classification alongside rules (with human review).

## Verify

```bash
node --test test/mc-consumer-safety.test.mjs
```