# Educare Sarah — Knowledge Base and Admissions Specification

**Version:** 1.0 — working draft  
**School:** Educare Christian Combined School (Pty) Ltd, Rustenburg, North West  
**Approval:** Management review required before production use  

**Engineering mirror:** Structured knowledge lives in `services/storage/educareKnowledgePacksV1.js` (+ EDU-KB-001–007). Programme pipeline: [EDUCARE_KNOWLEDGE_PIPELINE.md](./EDUCARE_KNOWLEDGE_PIPELINE.md).

---

## Deliverables

1. **Knowledge library** — what Sarah knows and how she answers parents, guardians, and learners.  
2. **Operational admissions** — collect, validate, submit, and track applications through the Company Portal — **specified; persistent multi-state workflow not live until release gate.**

**Boundary:** This document and the seeded KB are a working specification. Facts marked *management confirmation required* are not authoritative until Educare approves them.

---

## Part A — School knowledge (summary)

- **Principles:** accuracy before confidence; contextual answers; national vs Educare separation; escalation; privacy; no false admission promises.  
- **Identity:** Christian CAPS school; published **Grade R–9**; two campuses — Primary **25 Von Wielligh St**; High School **155 Leyds St** (not 158).  
- **Uniform:** describe photo-visible items only; no invented compulsory rules or prices.  
- **Curriculum:** four CAPS phases R–12 reference library; Educare offering confirmed per grade/year by admissions.  
- **Admissions knowledge:** application types, typical fields, documents, age/grade guidance — no automatic rejection for missing docs unless policy says so.  
- **Fees / operations / parent services / safeguarding:** as in knowledge packs; fees and calendar never invented.

Full narrative from the programme brief is encoded in the six packs and EDU-KB-001–007.

---

## Part B — Conversational capabilities

Guided consultation (welcome → grade/year → campus → process → optional application). Multi-intent handling. Warm, professional tone. Uncertainty → what we know + what school must confirm + contact or handoff.

---

## Part C — Application processing (target state)

**Lifecycle states:** draft → … → submitted → under_review → decision → closed (see `edu-pack-admissions`).

**Sarah steps:** start → learner → guardian → documents → review → consent → submit → acknowledgement (reference only if saved) → authenticated status.

**Validation:** fields, DOB, grade/campus availability, duplicates flagged not merged, uploads, consent.

**Current ZiricAI:** guardian application + portal verification (EDU-03/04), not the full lifecycle.

---

## Part D — Company Portal (target state)

Admissions workspace, roles (Admissions Officer, Manager, Principal, Finance, Teacher, Admin), auditable operations API list — see programme brief Part D / `edu-pack-policies`.

---

## Part E — Governance

Category IDs: EDU-IDENTITY, EDU-CAMPUS, EDU-CURRICULUM, EDU-GRADE, EDU-ADMISSIONS, EDU-FEES, EDU-UNIFORM, EDU-CALENDAR, EDU-ATTENDANCE, EDU-ACTIVITIES, EDU-TRANSPORT, EDU-SUPPORT, EDU-SAFETY, EDU-POLICIES, EDU-PARENT-SERVICES, EDU-ESCALATION.

Recommended record metadata: knowledge id, approval status (`draft` | `pending_review` | `approved` | …), source, review date, escalation destination (portal workflow future).

---

## Part F — Implementation stages

| Stage | Content | Status |
|-------|---------|--------|
| 1 Knowledge foundation | Packs + DBE reference in KB | **In repo (draft)** |
| 2 Sarah consultation | Retrieval + prompt | **Deployed on reseed** |
| 3 Admissions service | Persistent applications | **Built (pilot)** — `npm run verify:edu-07` |
| 4 Company Portal admissions UI | Queues, decisions | **Built (pilot)** — Admissions nav module |
| 5 Pilot + sign-off | Acceptance tests 1–22 | **Pending** |

**Release gate:** No live admissions submissions until policy approval, security testing, staff pilot, management sign-off.

---

## Part G — Management information required

1. Official legal and school name  
2. Registration / independent-school details  
3. Vision, mission, motto, values  
4. Exact grades per campus  
5. Grades 10–12 offered or planned  
6. Campus addresses and official contacts  
7. School and office hours  
8. Fee schedule and payment rules  
9. Application fees, deposits, refunds  
10. Admission requirements and deadlines  
11. Assessment / interview rules  
12. Uniform schedule and supplier  
13. Extracurricular activities  
14. Transport routes and prices  
15. Boarding, if any  
16. Term calendar  
17. Attendance and late-coming policy  
18. Code of conduct  
19. Bullying and safeguarding procedures  
20. Learning support capacity  
21. Parent communication procedures  
22. Admissions roles and decision authority  
23. Privacy notice and retention  
24. Processing expectations and notifications  

---

## DBE references (curriculum pack)

CAPS Grades R–12; Promotion Requirements policy; National Protocol for Assessment; applicable amendments — used for **national** explanations only.