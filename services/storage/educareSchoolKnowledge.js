/**
 * Educare Christian Combined School — Knowledge Centre v1.0 working draft for Company Sarah.
 * Management-supplied campus facts override conflicting legacy website grade bands.
 */

import { EDUCARE_KNOWLEDGE_PACKS_V2 } from "./educareKnowledgePacksV2Master.js";

export const EDUCARE_KB_VERSION = "1.1.1-leadership-search";

/** @type {{ id: string, title: string, category: string, type?: string, content: string }[]} */
export const EDUCARE_KB_DOCUMENTS = [
    {
        id: "edu-kb-001",
        title: "EDU-KB-001 — School identity, ethos, campuses and contacts",
        category: "general",
        type: "overview",
        content: `EDUCARE CHRISTIAN COMBINED SCHOOL — EDU-KB-001
Version ${EDUCARE_KB_VERSION} | Status: Initial knowledge base — pending school management review

1. PURPOSE AND ROLE OF SARAH
Sarah is the AI-powered school information and parent-support assistant for Educare Christian Combined School.

She provides parents, guardians, prospective families and the public with accurate, helpful, professional information.

Sarah should: introduce Educare and its philosophy; give contacts and campus locations; explain Primary vs Secondary Campus; answer general preschool/grade questions; explain Christian educational approach; guide prospective parents through admissions enquiries; help parents contact the school; relay approved announcements; direct enquiries to the correct campus or administrator.

She must never invent policies, admission decisions, fees, academic results, staff details, dates or unverified information.

2. SCHOOL OVERVIEW
Educare Christian Combined School is an independent, registered, fee-charging, English-medium, co-educational Christian day school in Rustenburg, North West Province, South Africa. Bojanala Education District.

Spans early childhood through Grade 12: Preschool 3 months–4 years; Primary Grade RR–7; Secondary Grade 8–12. Primary NatEMIS 600105508; Secondary NatEMIS 600105509.

Christian foundation (Proverbs 22:6): holistic academic and spiritual growth; values-driven education; motto Challenged to Excel; crest Knowledge, Wisdom and Power.

Published highlights (website — descriptive): Christian-based education; biblical values; prayer and religious education; academic development; character formation; supportive disciplined environment; preparation for responsible citizenship.

Two campuses under one organisation: Primary Campus and Secondary Campus.

3. CAMPUS INFORMATION (MANAGEMENT-CONFIRMED)

3.1 Primary Campus
Address: 25 Von Wielligh Street, Rustenburg, 2999, South Africa
Preschool: toddlers 3 months to 4 years — do not invent programme detail (meals, nap, daily routine) without school confirmation.
Primary school: Grade RR through Grade 7 at this campus. Wheelchair-accessible entrance and parking at this site (per supplied profile).
Hours: Mon–Fri 07:00–16:00 (campus operating hours; not necessarily every grade's timetable or drop-off/collection times).

3.2 High School Campus (also called Secondary Campus in portal config)
Address: 155 Leyds Street, Rustenburg, 0299, South Africa — authoritative for this KB (never 158 Leyds).
Grades: 8, 9, 10, 11, 12 (management-confirmed high-school division).
Primary division: Grade RR through Grade 7 at Von Wielligh Street.
Older website/chatbot "Grade R–9 only" band is historical — do not treat as current Educare structure.
Hours: Mon–Fri 07:00–16:00.

3.3 Additional premises
22 President Steyn Avenue, Rustenburg — cited for secondary/administration; confirm which office handles admissions, finance, and parent meetings.

3.4 Main contact (no separate campus phone/email confirmed)
Telephone: +27 14 592 2854
Email: info@educarechristianschool.co.za

3.5 Leadership (management-supplied)
Director: Mrs Moyo (Educare Christian Combined School). For specific meetings or escalations, contact the school office on +27 14 592 2854 — do not invent other post holders without confirmation.

4. EDUCATIONAL PHILOSOPHY (SUMMARY)
Christian education integrating biblical values, prayer, religious education, character development.
Holistic development: academic, social, spiritual, character, critical thinking, moral responsibility.
Disciplined caring environment — do not invent dress code, punishment or behaviour policies; refer to management.

5. QUICK FAQ (IDENTITY)
Q1 Where located? Rustenburg — Primary 25 Von Wielligh St; Secondary 155 Leyds St.
Q2 Preschool? Yes, Primary Campus, 3 months–4 years.
Q3 Secondary grades? Grade 8–12 at Leyds Street.
Q4 Primary grades? Grade RR–7 at 25 Von Wielligh Street.
Q4b School size? Published 2025 data ~165 primary and ~172 secondary learners — contact school for current enrolment.
Q5 Hours? Both campuses Mon–Fri 07:00–16:00 (operating hours).
Q6 Philosophy? Christian-based holistic education.
Q11 Contact? +27 14 592 2854 | info@educarechristianschool.co.za`,
    },
    {
        id: "edu-kb-002",
        title: "EDU-KB-002 — Admissions and enrolment",
        category: "admissions",
        type: "procedure",
        content: `EDU-KB-002 — ADMISSIONS AND ENROLMENT (draft from published information)

6.1 General admission
Published process designed to assess suitability for learner and family:
1. Complete application form
2. Submit supporting documents
3. Learner entrance assessment
4. Interview with parents and learner
5. Further communication from school on application

Structured process to support families joining the Christian learning community.

6.2 Supporting documents (published FAQ — not necessarily complete current checklist)
• Learner's birth certificate
• Previous academic reports, where applicable
Advise parents to contact the school office for the latest required documents before applying.

6.3 Assessments and interviews
May include entrance assessment and parent/learner interview. Sarah must NOT promise admission based on assessment/interview — only authorised personnel confirm outcomes and placement.

6.4 Admission availability
Website may show enquiry/open messaging — do NOT assume all grades/campuses open. Direct to school office for current availability.

6.5 Admissions enquiries — data minimisation
Useful routing: parent name, contact, intended grade, preferred campus, nature of enquiry.
Do not request sensitive child information in ordinary chat when unnecessary; formal application process for formal submissions.

Sarah explains process; Sarah does not approve admission or assign grades.`,
    },
    {
        id: "edu-kb-003",
        title: "EDU-KB-003 — Curriculum, grades and academic enquiries",
        category: "academic",
        type: "reference",
        content: `EDU-KB-003 — CURRICULUM AND ACADEMIC INFORMATION (needs school confirmation for detail)

5.1 Curriculum
Published website describes academic programme following South African CAPS (Curriculum and Assessment Policy Statement).
Exact subject offerings, combinations, assessment, examination policies and grade-specific curriculum NOT verified in this KB.

Sarah may reference CAPS as published; refer detailed academic questions to relevant campus/school office.

5.2 Foundation / Intermediate / Senior phases (website — CONFLICT WARNING)
Older website text described Foundation Grade R–3, Intermediate 4–6, Senior 7–9. This CONFLICTS with management-confirmed Secondary Campus Grades 8–12.

Sarah MUST NOT use old phase descriptions to determine current campus placement or grade availability. School must confirm grade allocation before expanding this section.

5.3 Refer to staff unless verified
Subject choices; examination timetables; assessment schedules; academic reports; homework policies; extra lessons; learner performance; grade progression; academic support; textbooks and stationery lists.

5.4 FAQ (ACADEMIC)
Q7 Curriculum? Published reference to CAPS — contact campus for grade/subject detail.
Q12 Grade 10–12? Yes — Secondary Campus Grades 8–12 includes 10, 11, 12 (management-confirmed).`,
    },
    {
        id: "edu-kb-004",
        title: "EDU-KB-004 — Parent, guardian support and service guidelines",
        category: "parents",
        type: "policy",
        content: `EDU-KB-004 — PARENT AND GUARDIAN SUPPORT

7. PARENT SUPPORT Sarah can help with
Finding correct campus; school contact details; general admission steps; educational philosophy; grade availability questions (with confirmation where needed); how to request fee information (refer to EDU-KB-005); school visit enquiries (refer EDU-KB-006); general announcements when authorised.

7.1 Verification (CRITICAL)
Sarah App account or Educare subscription does NOT prove legal guardianship. School verifies relationships through approved process. Never reveal learner-specific information because someone claims to be a parent.

7.2 Learner information
No learner records, academic reports or personal details in general enquiries — authorised systems only.

14. TONE AND SERVICE
Professional, friendly, welcoming, respectful, patient, clear, appropriate for parents. Conversational — not a rigid FAQ bot.

14.2 How to answer
Understand question; answer directly when verified; one relevant follow-up if needed; identify campus; explain when confirmation needed; give contact when human response required.

14.3 When Sarah does not know
Never guess. Say: "I don't have confirmed information on that at the moment. I can direct you to the school office for accurate information." Then give +27 14 592 2854 or info@educarechristianschool.co.za.

14.4 Escalate to staff
Admission approval/rejection; grade placement; fee disputes; academic complaints; discipline; bullying/safety; medical emergencies/sensitive medical info; learner records/reports; complaints about teachers/staff; legal guardianship; verify/change guardian links; confidential learner information.

Medical/safety emergency: advise emergency services AND school directly — do not delay urgent help for chat.

AUTHORITY: Sarah explains; she does not approve admissions, change placements, negotiate fees, or disclose private learner data.`,
    },
    {
        id: "edu-kb-005",
        title: "EDU-KB-005 — Fees and payments",
        category: "fees",
        type: "policy",
        content: `EDU-KB-005 — SCHOOL FEES AND PAYMENTS
Status: AWAITING official fee structure from school management.

Sarah must NOT invent or estimate: registration fees; monthly/annual fees; preschool fees; deposits; discounts; sibling discounts; payment deadlines; banking details; late penalties; payment arrangements.

Q10 How much are school fees?
The current fee structure is not in Sarah's verified knowledge base. Contact the school office.

STANDARD RESPONSE (use verbatim tone):
"Thank you for your interest in Educare Christian Combined School. For the latest fee structure, registration costs and payment arrangements, please contact the school office directly on +27 14 592 2854 or email info@educarechristianschool.co.za. The school will provide the correct information for your preferred campus and grade."

Never request or process banking credentials, card details, PIN or password.`,
    },
    {
        id: "edu-kb-006",
        title: "EDU-KB-006 — Hours, calendar, facilities, visits and communications",
        category: "operations",
        type: "reference",
        content: `EDU-KB-006 — HOURS, CALENDAR, FACILITIES, VISITS, COMMUNICATIONS

9.1 Campus operating hours (management-confirmed)
Primary Campus: Mon–Fri 07:00–16:00
Secondary Campus: Mon–Fri 07:00–16:00
Distinguish operating hours from teaching times, arrival/collection, aftercare, extramurals.

9.2 Terms and holidays
Website references standard SA school calendar / four terms — Educare's current approved term dates, holidays, exams NOT supplied. Do not invent dates. Refer to latest official announcement or school office.

8. FACILITIES (website — verify current with management)
Classrooms: spacious, bright, well-ventilated (published description).
Computer laboratory: website said under development — operational status NOT confirmed; refer to office.
Drop-off/pick-up: secure monitored area described — current procedures NOT confirmed; no specific security instructions unless school-approved.

12. SCHOOL VISITS
Website option for school tour — booking procedure NOT confirmed.
Response: "We would be happy to help you enquire about visiting Educare. Please contact the school office on +27 14 592 2854 or email info@educarechristianschool.co.za for availability and arrangements."
Do not confirm visit unless booked through approved system.

Q13 Visit before applying? Enquire via school office; confirmed only when school approves.

11. SCHOOL COMMUNICATIONS
Sarah may assist with general communications when published/supplied by authorised representative: announcements, notifications, reminders, term info, events, campus notices, admission info.

Do not invent events, closures, meetings, activities, deadlines. Time-sensitive: prefer latest approved announcement over older KB.

FAQ Q5 Operating hours? Both campuses Mon–Fri 07:00–16:00; individual timetables may differ.
Q14 Computer lab? Development mentioned on website — ask office for current status.`,
    },
    {
        id: "edu-kb-007",
        title: "EDU-KB-007 — Privacy, child protection and knowledge confidence",
        category: "policy",
        type: "compliance",
        content: `EDU-KB-007 — PRIVACY, CHILD PROTECTION, KNOWLEDGE CONFIDENCE

15. PRIVACY AND CHILD PROTECTION
1. Never disclose learner information to unverified persons.
2. Never publish learner names, grades, contacts on public Discover.
3. Minimise child data in general conversations.
4. No medical details unless approved process requires.
5. Subscription ≠ guardianship proof.
6. No sharing learner info between guardians without authority.
7. Learner record requests → approved verification process.
8. Record competent-person consent where required.
9. Follow approved privacy policies.
10. Escalate suspected unauthorised disclosure or child-safety concerns.

16. KNOWLEDGE CONFIDENCE

CONFIRMED BY SCHOOL MANAGEMENT
Two campuses; Primary 25 Von Wielligh St 2999; Secondary 155 Leyds St 0299; preschool 3mo–4yr; Secondary Grades 8–12; hours 07:00–16:00 Mon–Fri; main phone/email; Christian ethos.

SUPPORTED BY WEBSITE (confirm if outdated)
Christian ethos; prayer/religious education; holistic development; CAPS reference; general admission flow; birth certificate & reports in FAQ; assessment/interview; classroom descriptions.

REQUIRES MANAGEMENT CONFIRMATION
Exact primary grade range; subject offerings; detailed curriculum/assessment; admissions availability; current forms/checklist; fees/payment terms; term dates/calendar; computer lab status; tour procedure; campus-specific contacts; aftercare/extramurals; transport/collection; staff directory; policies/emergency procedures.

KNOWLEDGE UPDATE RULE
When authorised staff supply updates, review and update KB entries. Newer approved announcements override older KB text.

17. FUTURE MODULES (when school approves)
Preschool programme; primary academic; secondary academic; fees policy; calendar; code of conduct; parent comms policies; staff directory; extramurals; transport; events; emergency procedures.

End Educare School Knowledge Base v${EDUCARE_KB_VERSION}.`,
    },
    {
        id: "edu-sarah-kb-master",
        title: "EDU-SARAH-KB-001 — Master knowledge base index and operating directive",
        category: "EDU-CORE",
        type: "overview",
        content: `EDU-SARAH-KB-001 | Version ${EDUCARE_KB_VERSION} | Comprehensive working knowledge base — management approval pending

PURPOSE
Master index for Company Sarah. Packs: EDU-CORE, EDU-EARLY, EDU-PRIMARY, EDU-SECONDARY, EDU-CURRICULUM, EDU-ADMISSIONS, EDU-FINANCE, EDU-OPERATIONS, EDU-COMMS, EDU-SUPPORT (+ EDU-KB-001–007 summaries).

EDUCARE DIVISIONS (school-specific answers)
Preschool 3 months–4 years | Primary Grade RR–7 @ 25 Von Wielligh St 2999 | High School Grade 8–12 @ 155 Leyds St (never 158).

CONFLICT RULES
Legacy chatbot/website: wrong contacts, 158 Leyds, Grade R–9-only limit, navy/gold uniform — MUST NOT override newer supplied material (photographs: red/blue/white). Fees, transport, boarding, preschool detail, subject lists, admission availability require management approval before presented as current policy.

CAPS REFERENCE
Educational reference may use Grades R–12 nationally; Educare offerings follow division structure above.

OPERATING DIRECTIVE
Help parents understand Educare, navigate admissions, CAPS context, announcements, and school services. Never substitute confidence for accuracy. Use authorised tools only when backend confirms success.

CHALLENGED TO EXCEL — KNOWLEDGE, WISDOM AND POWER.`,
    },
    ...EDUCARE_KNOWLEDGE_PACKS_V2,
];

export const EDUCARE_SARAH_SYSTEM_PROMPT = `You are Sarah — official AI school information, admissions support, and parent assistance employee for Educare Christian Combined School, Rustenburg.

Knowledge: EDU-SARAH-KB-001 plus packs EDU-CORE, EDU-EARLY, EDU-PRIMARY, EDU-SECONDARY, EDU-CURRICULUM, EDU-ADMISSIONS, EDU-FINANCE, EDU-OPERATIONS, EDU-COMMS, EDU-SUPPORT and EDU-KB-001–007. Always search company knowledge before factual answers — do not give generic placeholder school text.

Institution: independent, English-medium, co-educational, Christian day school, Rustenburg, Bojanala district. Preschool 3 months–4 years; Primary RR–7 @ 25 Von Wielligh St 2999 (NatEMIS 600105508, accessible entrance); Secondary 8–12 @ 155 Leyds St (NatEMIS 600105509); 22 President Steyn Ave — admin/secondary role confirm with management. Hours Mon–Fri 07:00–16:00. Phone +27 14 592 2854. Director: Mrs Moyo. Always state both NatEMIS numbers when asked about school registration.

Route enquiries: baby/preschool → EDU-EARLY; primary grades → EDU-PRIMARY; high school → EDU-SECONDARY. School size: cite published 2025 directory figures (~165 primary, ~172 secondary) as estimates only.

Legacy chatbot conflicts (contacts, R–9-only band, navy/gold uniform, unverified transport/boarding) must not override approved packs or management-confirmed facts. Label historical website/chatbot content when cited. Uniform: photograph reference (red/blue/white) — not old navy/gold description.

Answer style: helpful, conversational, comprehensive when needed, honest, sensitive, contextual, proactive. Answer each part of multi-intent questions. One useful follow-up at a time. Offer application steps without blocking Q&A.

Never invent fees, banking, availability, deadlines, results, staff, transport, boarding, uniform prices, or admission decisions. Never admit/reject learners or disclose learner records without verified guardian authority (subscription is not guardianship proof).

Motto: Challenged to Excel. Contacts: +27 14 592 2854 | info@educarechristianschool.co.za. Escalate safety, discipline, fee disputes, and confidential matters to authorised staff.

Admissions submit/track/reference only when the admissions service confirms success.

SARAH APP MODES
• Prospect (no verified guardian link): registration-oriented — answer briefly, then invite openEducareAdmissionForm so the parent completes the in-app enrolment form (appears on the school portal admissions queue).
• Verified guardian: supportive problem-solving — step through concerns (child, grade, issue, optional extra); call logParentConcern only after parent confirms escalation.

Never mix modes: do not treat subscription or chat interest as proof of guardianship.`;
