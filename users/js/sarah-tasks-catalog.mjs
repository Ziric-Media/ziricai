/** ST-01 — task types, schemas, and Before You Leave profile defaults. */

export const DEPARTURE_STORAGE_KEY = 'sarah.st.departure.profiles.v1';

export const DEFAULT_DEPARTURE_PROFILES = {
  leaving_home: ['House keys', 'Wallet', 'Mobile phone', 'Medication', 'Check doors and windows'],
  going_to_work: ['House keys', 'Wallet', 'Laptop', 'Work access card', 'Lunch', 'Phone charger'],
  going_to_meeting: ['Documents', 'Laptop', 'Notebook and pen', 'Meeting invite', 'Wallet'],
  going_to_school: ['Books', 'Stationery', 'Assignments', 'Student card', 'Lunch'],
  leaving_office: ['Laptop', 'Access card', 'Phone', 'Locker keys', 'Important documents'],
  leaving_car: ['Phone', 'Keys', 'Wallet', 'Valuables', 'Parking ticket'],
  going_on_trip: ['ID or passport', 'Tickets', 'Wallet and cards', 'Phone and charger', 'Luggage'],
};

export function loadDepartureProfiles() {
  try {
    const raw = localStorage.getItem(DEPARTURE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DEPARTURE_PROFILES };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DEPARTURE_PROFILES, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_DEPARTURE_PROFILES };
  }
}

export function saveDepartureProfiles(profiles) {
  try {
    localStorage.setItem(DEPARTURE_STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* ignore */
  }
}

export const CATEGORY_TYPES = {
  reminders: [
    { id: 'meeting', title: 'Meeting', desc: 'Location, travel time, what to bring' },
    { id: 'medical', title: 'Medical appointment', desc: 'Clinic, GP or hospital visit' },
    { id: 'birthday', title: 'Birthday or anniversary', desc: 'Never miss important dates' },
    { id: 'bill', title: 'Bill payment', desc: 'Amount, reference, pay-by date' },
    { id: 'deadline', title: 'Important deadline', desc: 'Submit, renew or complete by date' },
    { id: 'general', title: 'General reminder', desc: 'One-off or custom reminder' },
    { id: 'recurring', title: 'Recurring reminder', desc: 'Daily, weekly or monthly' },
  ],
  preparation: [
    { id: 'interview', title: 'Job interview', desc: 'Research, documents, mock practice' },
    { id: 'departure', title: 'Before you leave', desc: 'Reusable leaving checklists' },
    { id: 'trip', title: 'Trip or holiday', desc: 'Packing and departure timeline' },
    { id: 'business_meeting', title: 'Business meeting', desc: 'Agenda and preparation' },
    { id: 'business_trip', title: 'Business trip', desc: 'Travel, lodging and materials' },
    { id: 'exam', title: 'School or examination', desc: 'Study plan and materials' },
    { id: 'event', title: 'Event or special occasion', desc: 'Outfit, gifts, logistics' },
    { id: 'new_job', title: 'Starting a new job', desc: 'First-day preparation' },
  ],
  applications: [
    { id: 'job', title: 'Job application', desc: 'CV, cover letter, deadlines' },
    { id: 'university', title: 'University application', desc: 'Programmes and transcripts' },
    { id: 'bursary', title: 'Bursary application', desc: 'Funding requirements' },
    { id: 'funding', title: 'Funding application', desc: 'Grants and supporting docs' },
    { id: 'loan', title: 'Loan application', desc: 'Income and affordability' },
    { id: 'accommodation', title: 'Accommodation application', desc: 'Residence or rental' },
    { id: 'government', title: 'Government service', desc: 'IDs, forms and appointments' },
  ],
  shopping: [
    { id: 'groceries', title: 'Grocery shopping', desc: 'List, store, budget' },
    { id: 'product', title: 'Buy a specific product', desc: 'Model, price, retailer' },
    { id: 'collect', title: 'Collect an order', desc: 'Pickup slot and reference' },
    { id: 'payment', title: 'Make a payment', desc: 'Who, how much, by when' },
    { id: 'delivery', title: 'Arrange delivery', desc: 'Address and time window' },
    { id: 'errands', title: 'Run errands', desc: 'Multiple stops in one outing' },
    { id: 'compare', title: 'Compare products', desc: 'Sarah researches options' },
  ],
  personal: [
    { id: 'household', title: 'Household responsibilities', desc: 'Chores and maintenance' },
    { id: 'vehicle', title: 'Vehicle servicing', desc: 'Service date and workshop' },
    { id: 'renew', title: 'Renew documents', desc: 'Licence, passport, membership' },
    { id: 'followup', title: 'Follow up with someone', desc: 'Who and what to discuss' },
    { id: 'goals', title: 'Personal goals', desc: 'Milestones and check-ins' },
    { id: 'wellness', title: 'Health and wellness', desc: 'Routines and appointments' },
    { id: 'routine', title: 'Regular responsibilities', desc: 'Weekly or monthly tasks' },
  ],
  delegate: [
    { id: 'research', title: 'Research something', desc: 'Sarah gathers information' },
    { id: 'find_provider', title: 'Find a service provider', desc: 'Quotes and options' },
    { id: 'prepare_doc', title: 'Prepare a document', desc: 'Draft for your review' },
    { id: 'compare_products', title: 'Compare products', desc: 'Uses credits — approval required' },
    { id: 'draft_application', title: 'Draft an application', desc: 'You approve before submit' },
    { id: 'find_booking', title: 'Find a booking', desc: 'Appointments and availability' },
    { id: 'online_process', title: 'Assist online process', desc: 'Step-by-step with permission' },
  ],
};

/** Flat checklist labels for interview prep (ST-01D). */
export const INTERVIEW_CHECKLIST = [
  'Research the company',
  'Understand the job requirements',
  'Prepare likely interview questions',
  'Prepare your answers',
  'Organise qualifications and CV',
  'Prepare interview clothing',
  'Confirm transport or online link',
  'Prepare documents the night before',
  'Practise with Sarah (mock interview)',
];

export const TRIP_CHECKLIST = [
  'Identity document or passport',
  'Tickets or booking confirmation',
  'Accommodation confirmation',
  'Wallet and bank cards',
  'Phone and charger',
  'Clothing for the trip',
  'Toiletries',
  'Medication and essentials',
  'Important documents',
];

/** Dedicated multi-field forms (not generic single title field). */
export const SCHEMA_FORMS = {
  medical: {
    heading: 'Medical appointment',
    taskType: 'medical',
    buildTitle: (fd) => `Medical — ${fd.get('provider') || 'appointment'}`,
    fields: [
      { name: 'provider', label: 'Doctor, clinic or hospital', type: 'text', required: true },
      { name: 'purpose', label: 'Reason for visit', type: 'text' },
      { name: 'location', label: 'Address', type: 'text' },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'time', label: 'Time', type: 'time', required: true },
      { name: 'bring', label: 'Take with you', type: 'textarea', placeholder: 'Medical aid card, reports…' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  birthday: {
    heading: 'Birthday or anniversary',
    taskType: 'birthday',
    buildTitle: (fd) => `${fd.get('person') || 'Someone'} — ${fd.get('occasion') || 'special day'}`,
    fields: [
      { name: 'person', label: 'Whose day is it?', type: 'text', required: true },
      { name: 'occasion', label: 'Birthday or anniversary', type: 'text', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'gift', label: 'Gift or message plan', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  bill: {
    heading: 'Bill payment',
    taskType: 'bill',
    buildTitle: (fd) => `Pay ${fd.get('biller') || 'bill'}`,
    fields: [
      { name: 'biller', label: 'Who to pay', type: 'text', required: true },
      { name: 'amount', label: 'Amount', type: 'text' },
      { name: 'reference', label: 'Reference or account number', type: 'text' },
      { name: 'date', label: 'Pay by date', type: 'date', required: true },
      { name: 'time', label: 'Remind me at', type: 'time' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  deadline: {
    heading: 'Important deadline',
    taskType: 'deadline',
    buildTitle: (fd) => fd.get('title') || 'Deadline',
    fields: [
      { name: 'title', label: 'What is due?', type: 'text', required: true },
      { name: 'date', label: 'Deadline date', type: 'date', required: true },
      { name: 'time', label: 'Deadline time', type: 'time' },
      { name: 'consequence', label: 'Why it matters', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  general: {
    heading: 'General reminder',
    taskType: 'general',
    buildTitle: (fd) => fd.get('title') || 'Reminder',
    fields: [
      { name: 'title', label: 'Reminder title', type: 'text', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'time', label: 'Time', type: 'time', required: true },
      { name: 'notes', label: 'Details', type: 'textarea' },
    ],
  },
  recurring: {
    heading: 'Recurring reminder',
    taskType: 'recurring',
    buildTitle: (fd) => fd.get('title') || 'Recurring reminder',
    fields: [
      { name: 'title', label: 'What to remember', type: 'text', required: true },
      { name: 'freq', label: 'How often', type: 'select', options: ['Daily', 'Weekly', 'Monthly'], required: true },
      { name: 'time', label: 'Time', type: 'time', required: true },
      { name: 'start', label: 'Starts on', type: 'date', required: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  job: {
    heading: 'Job application',
    taskType: 'job',
    buildTitle: (fd) => `Apply — ${fd.get('role') || fd.get('company') || 'role'}`,
    fields: [
      { name: 'company', label: 'Company', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'text', required: true },
      { name: 'deadline', label: 'Application deadline', type: 'date', required: true },
      { name: 'documents', label: 'Required documents', type: 'textarea', placeholder: 'CV, ID, certificates…' },
      { name: 'status', label: 'Current status', type: 'select', options: ['Not started', 'In progress', 'Submitted'] },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    checklist: ['Tailor CV', 'Write cover letter', 'Gather certificates', 'Submit application', 'Follow up'],
  },
  university: {
    heading: 'University application',
    taskType: 'university',
    buildTitle: (fd) => `University — ${fd.get('programme') || 'application'}`,
    fields: [
      { name: 'institution', label: 'Institution', type: 'text', required: true },
      { name: 'programme', label: 'Programme', type: 'text', required: true },
      { name: 'deadline', label: 'Deadline', type: 'date', required: true },
      { name: 'documents', label: 'Required documents', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    checklist: ['Academic transcripts', 'Personal statement', 'References', 'Pay application fee', 'Submit online'],
  },
  groceries: {
    heading: 'Grocery shopping',
    taskType: 'groceries',
    buildTitle: (fd) => `Groceries — ${fd.get('store') || 'shopping'}`,
    fields: [
      { name: 'store', label: 'Shop', type: 'text' },
      { name: 'list', label: 'Shopping list', type: 'textarea', required: true, placeholder: 'One item per line' },
      { name: 'budget', label: 'Budget', type: 'text' },
      { name: 'date', label: 'Shop on', type: 'date' },
      { name: 'time', label: 'Time', type: 'time' },
    ],
  },
  product: {
    heading: 'Buy a specific product',
    taskType: 'product',
    buildTitle: (fd) => `Buy — ${fd.get('item') || 'product'}`,
    fields: [
      { name: 'item', label: 'Product', type: 'text', required: true },
      { name: 'budget', label: 'Budget', type: 'text' },
      { name: 'retailer', label: 'Preferred retailer', type: 'text' },
      { name: 'date', label: 'Buy by', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  research: {
    heading: 'Research something',
    taskType: 'research',
    kind: 'execution',
    buildTitle: (fd) => `Research — ${(fd.get('topic') || '').slice(0, 40)}`,
    fields: [
      { name: 'topic', label: 'What should Sarah research?', type: 'textarea', required: true },
      { name: 'deadline', label: 'Need results by', type: 'date' },
      { name: 'notes', label: 'Constraints', type: 'textarea' },
    ],
  },
  household: {
    heading: 'Household responsibilities',
    taskType: 'household',
    buildTitle: (fd) => fd.get('title') || 'Household task',
    fields: [
      { name: 'title', label: 'Task', type: 'text', required: true },
      { name: 'area', label: 'Area of home', type: 'text' },
      { name: 'date', label: 'Due date', type: 'date' },
      { name: 'time', label: 'Time', type: 'time' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
};

export function schemaKeyFor(categoryId, typeId) {
  if (SCHEMA_FORMS[typeId]) return typeId;
  if (categoryId === 'applications' && SCHEMA_FORMS[typeId]) return typeId;
  if (categoryId === 'shopping' && ['groceries', 'product'].includes(typeId)) return typeId;
  if (categoryId === 'personal' && typeId === 'household') return typeId;
  if (categoryId === 'delegate' && typeId === 'research') return typeId;
  return null;
}