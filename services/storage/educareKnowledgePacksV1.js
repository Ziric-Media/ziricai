/**
 * Educare Sarah Knowledge Packs v1.0 — working draft.
 * Structured retrieval units for Company Sarah (EDU-CORE … EDU-POLICIES).
 * Approval: draft — management review required before production authority.
 */

export const EDUCARE_KNOWLEDGE_PACKS_V1 = [
    {
        id: "edu-pack-core",
        title: "EDU-CORE — School identity, ethos, campuses, response principles",
        category: "EDU-CORE",
        type: "overview",
        content: `EDU-CORE | Knowledge pack | Version 1.0 working draft | Approval: draft

RESPONSE PRINCIPLES (Sarah behaviour)
1. Accuracy before confidence — do not invent policies, prices, dates, availability, staff names, or admission decisions.
2. Helpful explanations — parent-friendly language, not policy jargon only.
3. Contextual answers — match the learner's grade/phase when known.
4. Guided assistance — offer the next practical step.
5. Clear separation — national DBE/CAPS information ≠ Educare-specific offering.
6. Human escalation — sensitive, exceptional, or unresolved matters → school official.
7. Privacy — collect learner/guardian data only for a defined school purpose.
8. No false promises — application acknowledgement is not admission or placement confirmation.

KNOWLEDGE SOURCE HIERARCHY
1. Approved Educare management policy/config
2. Authorised Company Portal records
3. Approved website/publications
4. DBE/CAPS references (general)
5. General educational guidance — label clearly as general

When sources conflict, newer approved management instruction wins; do not silently resolve — ask school to confirm.

INSTITUTION
Name: Educare Christian Combined School
Legal entity: Educare Christian Combined School (Pty) Ltd — confirm against registration
Location: Rustenburg, North West Province, South Africa
Identity: Christian education; academic, personal and character development; CAPS (national framework).

Published offering: education from Grade R through Grade 9 (website/public material).
Management also confirms a High School campus programme — exact overlap with published R–9 must be confirmed by admissions (see grade conflict note in EDU-CURRICULUM / EDU-KB-003).

ETHOS (respectful; do not assume every family's faith background)
Christian foundation: biblical values, prayer, religious education, character (respect, responsibility, honesty, discipline).
Vision summary (pending formal mission/motto records): develop learners academically, socially, morally and personally for responsible citizenship.

CAMPUSES (authoritative addresses for this project)
Primary Campus: 25 Von Wielligh Street, Rustenburg, North West, South Africa.
High School Campus: 155 Leyds Street, Rustenburg, North West, South Africa.
Do NOT use obsolete 158 Leyds Street from older chatbot drafts.

Contacts (historical website — verify with management before stating as current):
Phone +27 14 592 2854 | Email info@educarechristianschool.co.za | www.educarechristianschool.co.za
Reject unverified example contacts (+27 14 123 4567, admin@educare.co.za).

MANAGEMENT CONFIRMATION REQUIRED
Vision/mission/motto; exact grades per campus; Grade R campus; shared grades; campus phones/emails; office hours; visitor procedures.

KEYWORDS: identity, ethos, Christian, Rustenburg, Von Wielligh, Leyds 155, CAPS, Sarah principles`,
    },
    {
        id: "edu-pack-curriculum",
        title: "EDU-CURRICULUM — South African CAPS phases and terminology (Grades R–12)",
        category: "EDU-CURRICULUM",
        type: "reference",
        content: `EDU-CURRICULUM | National reference library | Version 1.0 working draft | Approval: draft

DISTINCTION (mandatory in every Educare-specific answer)
• What the national curriculum provides (Grades R–12)
• What a school is registered/equipped to offer
• What Educare currently offers and accepts applications for

Educare published material: Grade R–9, CAPS.
Do NOT tell parents Educare offers Grades 10–12 unless management confirms registration and programme.

FOUR NATIONAL PHASES

Foundation Phase — Grades R–3
Early literacy, numeracy, language, life skills, social/physical development, routines and guided play.
Explain Grade R readiness, transition into formal schooling, home support for reading/counting.

Intermediate Phase — Grades 4–6
Structured subjects: Home Language, First Additional Language, Mathematics, Natural Sciences & Technology, Social Sciences, Life Skills.
Study habits, homework routines, comprehension and writing.

Senior Phase — Grades 7–9
Languages, Mathematics, Natural Sciences, Technology, Social Sciences, EMS, Life Orientation, Creative Arts.
Independent study; subject performance before Grade 10 choices.

FET Phase — Grades 10–12
NSC pathway: compulsory/elective subjects, SBA, PATs where applicable, examinations.
Maths vs Mathematical Literacy; career/tertiary planning.
National reference only for Educare unless management confirms FET offering.

TERMINOLOGY
CAPS, NCS, DBE, GET, FET, Home Language, FET, SBA, PAT, formal/informal assessment, progression, promotion, NSC, subject choice, learning support, inclusive education.

SUBJECT AREAS BY PHASE (national — not all offered at every school)
Foundation: HL, FAL, Maths, Life Skills
Intermediate: HL, FAL, Maths, NST, Social Sciences, Life Skills
Senior: HL, FAL, Maths, Sciences, Technology, Social Sciences, EMS, LO, Creative Arts
FET: HL, FAL, Maths or Math Lit, LO, electives per school programme

GRADE PLACEMENT
Sarah must NOT place a learner from age alone; placement is a school decision (records, assessment, policy, capacity).

ASSESSMENT & PROGRESSION
Continuous vs formal assessment, SBA, exams, reports, intervention.
Never announce promotion/pass from incomplete parent information — use school records or academic office.

LEARNING SUPPORT
Explain barriers, early ID, accommodation, referrals, parent–teacher collaboration.
Do NOT diagnose ADHD, dyslexia, autism, etc.; do not promise specialist services without school confirmation.

GRADE CONFLICT NOTE (Educare)
Legacy website: Foundation R–3, Intermediate 4–6, Senior 7–9 on primary model.
Management: High School campus Grades 8–12 at 155 Leyds Street.
Sarah must ask intended grade/year and campus; direct admissions to confirm availability — do not merge conflicting sources silently.

SOURCES: DBE CAPS Grades R–12; National Policy on Promotion Requirements; National Protocol for Assessment.

KEYWORDS: CAPS, phases, Grade 4, Grade 6, Grade 9, Grade 10, NSC, subjects, national curriculum`,
    },
    {
        id: "edu-pack-admissions",
        title: "EDU-ADMISSIONS — Enrolment guidance and application lifecycle (specification)",
        category: "EDU-ADMISSIONS",
        type: "procedure",
        content: `EDU-ADMISSIONS | Version 1.0 working draft | Approval: draft

CAPABILITY STATUS (engineering)
• Parent consultation and checklist guidance: IN KNOWLEDGE BASE
• Persistent admissions API + portal workspace: IMPLEMENTED (pilot) — schoolAdmissionService.js, Portal Admissions module
• Production live intake: BLOCKED until Educare approves policy, POPIA notice, document storage security, and staff pilot (release gate)

OVERVIEW
Applying involves review by the authorised admissions team. Submitting an application does not guarantee acceptance or reserved placement.

APPLICATION TYPES
New learner; transfer (SA); transfer (international); Grade R; higher grade; sibling; re-enrolment; outstanding documents; learning support needs; uncertain availability.

TYPICAL DATA (management must approve final required fields)
Learner: legal names, preferred name, DOB, age, current grade, grade applying for, previous school, last grade completed, campus, year of entry, languages, support needs.
Guardian: name, relationship, mobile, email, address, preferred contact, legal guardian flag, second guardian if needed.
Emergency contact.
Documents: birth certificate/ID, guardian ID if required, latest report, transfer records, health/immunisation only if policy requires, educational reports if volunteered.

Age/grade: one factor among reports, transfer records, assessment, rules, capacity — never guarantee placement from age alone.

PARENT FAQ PATTERNS
Grades open? Documents? Transfer without latest report? Siblings? Fees for application? Assessment/interview? Status tracking? Updates after submit? Full grade?
If not in approved KB/system: admissions team must confirm.

LIFECYCLE STATES (target Company Portal — staff-authorised decisions only)
draft | awaiting_parent_confirmation | submitted | documents_pending | under_review | assessment_required | awaiting_parent_information | provisional_offer | accepted | declined | waitlisted | withdrawn | closed

SARAH STEPS (when backend connected)
Start (year, grade, campus, new vs transfer) → learner → guardian → document checklist → parent review → consent/privacy → submit → acknowledgement with real reference only after server save → status queries for authenticated guardian only.

VALIDATION (service layer)
Required fields; valid DOB; grade available for year; campus valid for grade; contact validation; duplicate detection (flag, do not auto-merge); file type/size; confirmation; no re-submit closed apps.

ZiricAI TODAY
Sarah App "Educare subscription" uses guardian-application API (verification queue) — NOT the full multi-state admissions module above.

KEYWORDS: apply, enrolment, documents, birth certificate, transfer, Grade R, sibling, waitlist, application reference`,
    },
    {
        id: "edu-pack-operations",
        title: "EDU-OPERATIONS — Uniform, calendar, hours, activities, transport",
        category: "EDU-OPERATIONS",
        type: "reference",
        content: `EDU-OPERATIONS | Version 1.0 working draft | Approval: draft

UNIFORM (photo reference only until official policy)
Visible combinations: white shirts; blue ties; red jerseys (blue/white trim); royal/navy jerseys (red trim); blue trousers; checked pinafores (red/navy/light); blue/red sportswear; black shoes; badges.
Multiple combinations exist — do not assume interchangeable or one set for all grades/campuses.
Sarah may describe visible items; must NOT invent compulsory day rules, grade rules, tie rules, tracksuit-as-uniform, prices, suppliers, hair/jewellery rules.

CALENDAR
Four-term SA pattern on website — Educare term dates NOT loaded; never reuse last year's dates.
Load from approved annual calendar only.

HOURS
Website mentioned ~07:30–14:00 historically; KB records campus operating 07:00–16:00 Mon–Fri (management) — confirm lesson start/end and office hours.

ACTIVITIES (proposed until confirmed)
Choir, drama, chess, public speaking, spelling bee, soccer, netball, coding/robotics — confirm schedules, costs, age groups.

TRANSPORT
Earlier chatbot claimed service — NOT verified; no routes, fees, or booking promises until management confirms.

BOARDING
Limited boarding mentioned historically — NOT verified; do not advertise.

FACILITIES / VISITS
Tour via school office; computer lab "under development" on website — confirm status.

KEYWORDS: uniform, jersey, pinafore, term dates, school hours, extramural, transport, boarding, tour`,
    },
    {
        id: "edu-pack-parent-services",
        title: "EDU-PARENT-SERVICES — Fees, reports, meetings, complaints",
        category: "EDU-PARENT-SERVICES",
        type: "policy",
        content: `EDU-PARENT-SERVICES | Version 1.0 working draft | Approval: draft

FEES
Never invent tuition, registration, deposits, banking details, references, discounts, or late penalties.
Fee answers only from approved schedule or finance office; no cross-family account disclosure.
Standard redirect: +27 14 592 2854 | info@educarechristianschool.co.za

HOMEWORK & ACADEMIC SUPPORT
General expectations, study routines, missed work — school-specific intervention/extra lessons require confirmation.

REPORTS & MEETINGS
Report dates, interpretation, parent-teacher meetings — use authorised calendar/comms; escalate academic concerns to grade head/academic office.

COMPLAINTS & FEEDBACK
Listen; acknowledge; minimal necessary detail; categorise (academics, conduct, safety, finance, admin, facilities); immediate danger → safeguarding escalation; trackable case if system supports; no unapproved resolution SLAs.

CONSULTATION BEHAVIOUR
Welcome → age/grade → entry year → current school → relevant campus/offering → application steps → offer application without forcing before Q&A.
Multi-intent messages: answer each part.
Uncertainty: state what is known, what needs confirmation, offer routing to correct team.

KEYWORDS: fees, payment, report, parent meeting, homework, complaint, finance office`,
    },
    {
        id: "edu-pack-policies",
        title: "EDU-POLICIES — Safeguarding, privacy, escalation, acceptance gates",
        category: "EDU-POLICIES",
        type: "compliance",
        content: `EDU-POLICIES | Version 1.0 working draft | Approval: draft

SAFEGUARDING
Route bullying, harassment, violence, injury, learner protection, missing learner, unsafe transport, serious distress per approved protocol.
Do not investigate serious allegations through extended chat; collect minimum to route safely.
Urgent harm: emergency services AND school — do not delay for chat.

PRIVACY & POPIA (draft engineering safeguards)
Purpose limitation; privacy notice at submission; guardian authority verification where required; private document storage; role-based access; audit on material changes; retention rules; restricted health/special-needs data; no unrelated marketing.
Final POPIA wording requires school legal sign-off.

ESCALATION DESTINATIONS
Admissions decisions; placement; fee disputes; discipline; bullying/safety; medical; learner records; staff complaints; guardianship disputes; confidential learner data.

ACCEPTANCE TEST SCENARIOS (v1.0 programme — pre-live gate)
Includes: correct campuses (155 Leyds); CAPS phases; Grade 6 subjects; Grade 9 vs 10 distinction; national vs Educare offering; Grade R guidance; transfer Grade 6; missing report; siblings; validation; pre-submit correction; consent; real reference; auth status; duplicate flag; staff document request; no unauthorised admission decision; safety escalation; no invented fees/routes/prices; audit trail.

RELEASE GATE
No live admissions submissions until: school policy approved; application service + document security tested; staff end-to-end pilot; management sign-off.

KEYWORDS: POPIA, safeguarding, bullying, escalation, privacy, child protection, acceptance tests`,
    },
];