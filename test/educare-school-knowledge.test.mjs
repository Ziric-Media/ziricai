#!/usr/bin/env node
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import { EDUCARE_KB_DOCUMENTS } from "../services/storage/educareSchoolKnowledge.js";
import { seedEducareKnowledge } from "../services/education/seedEducareKnowledge.js";
import { createCompany } from "../services/tenants/companyService.js";
import { provisionCompany } from "../services/platform/provisioningService.js";
import { listKnowledgeDocuments } from "../services/tenants/knowledgeService.js";

await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

const companyId = `educare-kb-mem-${Date.now()}`;
await createCompany(companyId, { name: "Educare KB Test", industry: "Education", ownerUid: "owner-1" });
await provisionCompany(companyId, { companyId, name: "Educare KB Test", ownerUid: "owner-1", agentName: "Sarah (AI)" });

const result = await seedEducareKnowledge(companyId);
assert.equal(result.documents, EDUCARE_KB_DOCUMENTS.length);

const docs = await listKnowledgeDocuments(companyId);
const ids = new Set(docs.map((d) => d.id));
for (const spec of EDUCARE_KB_DOCUMENTS) {
    assert.ok(ids.has(spec.id), `missing ${spec.id}`);
}

const kb003 = docs.find((d) => d.id === "edu-kb-003");
assert.match(kb003?.content || "", /Grade[s]? 8.{1,3}12/i);

const core = docs.find((d) => d.id === "edu-pack-core");
assert.match(core?.content || "", /155 Leyds Street/i);
assert.match(core?.content || "", /never 158 Leyds|obsolete 158 Leyds/i);

const admissions = docs.find((d) => d.id === "edu-pack-admissions");
assert.match(admissions?.content || "", /IMPLEMENTED \(pilot\)/i);

console.log("educare-school-knowledge: PASS");
