# CH3 — Media & groups

**Status:** Delivered (MVP 2026-11-08)

## Delivered

- `groupConversationService.js` — personal groups, member add, D1 Sarah invite + `consentGranted`
- Attachment metadata on P2P, group, and business messages (`normalizeAttachments`)
- `chatGroupRoutes.js` — CRUD-style group API
- `test/ch3-media-groups.test.mjs`

## Delivered (post-MVP 2026-11-08)

- Signed upload token path `POST /api/chat/media/uploads` + `PUT /api/chat/media/:uploadId`
- Organisation groups `POST /api/group-conversations/organisation` (consent required)
- Personal Sarah invite routes (group + P2P)

## Not in CH3

- Object storage backend (GCS/S3) for media blobs
- Sarah orchestration reading group threads end-to-end
