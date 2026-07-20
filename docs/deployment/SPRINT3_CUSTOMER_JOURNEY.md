# Sprint 3 — Customer Journey Testing

## Automated smoke test

```bash
STORAGE_BACKEND=memory npm run verify:journey
```

Simulates:

1. Onboarding start (signup)
2. Industry → WhatsApp stub → knowledge FAQ → PDF upload → train → test → complete
3. Trial billing record
4. Inbound WhatsApp message via `conversationPipeline.ingest`
5. Conversation in tenant inbox
6. Analytics snapshot updated

### Memory backend (default for CI/local)

No Firestore required. Uses in-process storage + job queue.

### Firestore production path

1. Set `STORAGE_BACKEND=firestore`
2. Deploy rules + indexes: `firebase deploy --only firestore:rules,firestore:indexes`
3. Set `TENANT_SCOPE_ENFORCEMENT=strict`
4. Run journey against staging HTTPS URL (extend script with `BASE_URL` env if needed)
5. Confirm Meta webhook on `/webhooks/whatsapp/:companyId`

## Manual checklist

- [ ] Complete onboarding wizard at `/onboarding.html` with new email
- [ ] Go-live screen shows checklist + portal CTA
- [ ] Portal overview loads with live (empty or seeded) metrics
- [ ] Upload FAQ or PDF in wizard — appears in Knowledge module
- [ ] Send test WhatsApp (or simulate via API) — appears in Inbox
- [ ] Analytics shows conversation event within 60s
- [ ] Billing shows trial plan
- [ ] Super Admin → Companies lists new tenant via `/api/platform/companies`

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run verify:sprint1` | Sprint 1 connect chain |
| `npm run verify:journey` | Sprint 3 customer journey |
