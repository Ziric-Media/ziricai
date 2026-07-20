# 06 — Knowledge Base Agent

## Agent Name & Role

Owns tenant knowledge bases, document upload/parsing, and KB management UI in portal and admin.

## Phase

**Phase 2 — AI Core**

## Responsibility

- Knowledge base and document tenant services
- File upload parsing (`parseUploadedFile`) for PDF/text
- Legacy `knowledgeService.js` bridge and tenant `documents` subcollection
- Portal and admin knowledge modules
- KB seeding from marketplace packs and provisioning
- RAG-ready document storage (content + metadata)

## Owns

- `services/knowledgeService.js` (legacy)
- `services/tenants/knowledgeService.js`
- `services/tenants/documentService.js`
- `js/portal/modules/knowledge.js`
- `js/admin/modules/knowledge.js`
- `js/admin/modules/knowledge-ui.js`
- `js/admin/services/knowledge.js`
- `knowledge/ziric-media.json`
- `server.js` (knowledge upload routes)
- `uploads/` directory policy

## Depends on

- **01 Platform Architecture Agent** — tenant document paths
- **03 Company Workspace Agent** — `ensureKnowledgeBase` on provision

## Do NOT touch

- OpenAI embedding pipeline (future — document in architecture only)
- Sarah trainAI tool internals beyond service API contract
- AI reply generation in message worker

## Cursor subagent prompt

```
Workspace: C:\Users\cash\OneDrive\DOCUMENTS\PROJECTS\ziricai

You are the Knowledge Base Agent. Own knowledge upload, storage, and KB UI.

Audit services/knowledgeService.js, services/tenants/knowledgeService.js, knowledge upload routes in server.js.
Review js/portal/modules/knowledge.js and js/admin/modules/knowledge.js.

Tasks:
1. Ensure upload requires companyId and writes to companies/{id}/documents.
2. Dual-write to legacy knowledge collection: document removal plan.
3. Portal KB module lists tenant documents with delete/replace actions.
4. Verify parseUploadedFile handles PDF, TXT, MD; add clear error messages.
5. Marketplace pack knowledge docs install into tenant KB on pack install.

Do NOT modify Sarah orchestrator or CRM modules.
Return: upload flow diagram, legacy path usage, UI/API gaps.
```

## Definition of Done

- [ ] Upload API tenant-scoped with file size limits enforced
- [ ] Documents stored under `companies/{id}/documents`
- [ ] KB auto-created (`kb-{companyId}`) on first upload
- [ ] Portal + admin list/search/delete documents
- [ ] Marketplace install seeds pack knowledge into tenant KB
- [ ] Legacy root `knowledge/` collection no longer written in production

## Current status

**82% — Integrated with AI Core**

### Already built

- Tenant upload via `saveKnowledgeDocument` → `companies/{id}/documents`
- Auto-create knowledge base `kb-{companyId}` on first upload (`ensureKnowledgeBase`)
- API: `GET /api/companies/:companyId/knowledge/documents`, `DELETE .../:docId`
- Legacy routes `/api/knowledge` and `/api/knowledge/upload` use tenant service
- Keyword RAG-lite search (`searchKnowledgeForQuery`) in messageWorker via `aiCoreBridge`
- Portal `knowledge.js` loads tenant documents API (demo fallback when empty)
- Sarah `uploadKnowledge` / `trainAI` write to employee-linked KB
- Marketplace pack install seeds docs via tenant `saveKnowledgeDocument`

### Remaining work

- Production Firestore migration off root `knowledge` collection
- Vector embedding / semantic search layer
- Portal/admin upload UI (buttons still demo-disabled in portal)
- Document versioning and approval workflow
- Firebase Storage for file blobs (local multer only today)
