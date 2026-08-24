# Durable job queue

Inbound WhatsApp messages flow through `conversationPipeline.ingest` → `jobQueue.enqueue` → `messageWorker`. By default the queue is **in-memory** (fine for local dev). For production on Railway, attach **Postgres** and set `DATABASE_URL`.

## Backend selection

| Env | Backend | Durability |
|-----|---------|------------|
| *(unset)* | memory | Lost on restart |
| `DATABASE_URL` | Postgres | Survives restart |
| `REDIS_URL` only | memory (+ warning) | Redis path documented; use Postgres today |

## Railway setup (recommended)

1. Railway project → **New** → **Database** → **PostgreSQL**
2. Copy `DATABASE_URL` from the Postgres service → Variables on the API service
3. Redeploy API — logs should show `[queue] Postgres backend initialized`

No Firestore billing required. Tenant data can remain on `STORAGE_BACKEND=memory` while the **job queue** is durable via Postgres.

## Job states

`queued` → `processing` → `completed` | `failed`  
Retries use `retrying` with exponential backoff (`QUEUE_BASE_DELAY_MS * 2^attempt`).

## Idempotency

- **Inbound (wamid):** claimed at ingest (`tryClaimInboundMessage`), marked processed **only after worker success** (fixes early-mark bug).
- **Outbound:** `outboundSent` + `outboundMetaMessageId` on the job row — worker skips resend on retry.
- **Duplicate webhook while in-flight:** second delivery returns `{ duplicate: true, inFlight: true }`.

## Observability

Structured logs prefix `[queue]` with `jobId`, `jobType`, `companyId`, `customerId`, `conversationId`, `channel`, truncated `externalMessageId`.

## Env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Enables Postgres backend |
| `QUEUE_CONCURRENCY` | `1` | Parallel workers |
| `QUEUE_MAX_ATTEMPTS` | `5` | Retries before permanent failure |
| `QUEUE_BASE_DELAY_MS` | `1000` | Backoff base |
| `QUEUE_POLL_INTERVAL_MS` | `250` | Claim poll interval |

## Verify

```bash
npm run test:queue
# With Postgres:
DATABASE_URL=postgres://... npm run test:queue
```

## Alternatives (not bundled)

| Option | Pros | Cons |
|--------|------|------|
| **Railway Postgres** | `SKIP LOCKED` claims, fits Railway, single `pg` dep | Extra service (~$5/mo) |
| **Upstash Redis** | Fast, serverless | Needs Redis backend + second state store for idempotency |
| **BullMQ** | Rich tooling | Heavier; Redis required |
| **SQLite** | Simple locally | Railway disk is ephemeral — not production-safe |
| **Firestore** | Already in project | Billing blocked for this project |
| **In-memory** | Zero infra | Not durable |
