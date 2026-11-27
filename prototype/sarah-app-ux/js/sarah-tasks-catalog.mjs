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
    taskKind: 'reminder',
    buildTitle: (fd) => `${fd.get('title') || 'Reminder'} (${fd.get('freq') || 'repeat'})`,
    footnote: 'Sarah will repeat this on your schedule once ST-03 server recurrence is live.',
    fields: [
      { name: 'title', label: 'What to remember', type: 'text', required: true },
      { name: 'freq', label: 'How often', type: 'select', options: ['Daily', 'Weekly', 'Monthly'], required: true },
      { name: 'weekdays', label: 'Weekdays (if weekly)', type: 'text', placeholder: 'e.g. Mon, Wed, Fri' },
      { name: 'time', label: 'Time', type: 'time', required: true },
      { name: 'start', label: 'Starts on', type: 'date', required: true },
      { name: 'until', label: 'Until (optional)', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  job: {
    heading: 'Job application',
    taskType: 'job',
    buildTitle: (fd) => `Apply — ${fd.get('role') || fd.get('company') || 'role'}`,
    fields: [
      { name: 'organisation', label: 'Organisation offering the role', type: 'text', required: true, placeholder: 'Company or institution name' },
      { name: 'company', label: 'Company (if different)', type: 'text' },
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
      { name: 'organisation', label: 'University / college', type: 'text', required: true },
      { name: 'institution', label: 'Institution campus (optional)', type: 'text' },
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
  bursary: {
    heading: 'Bursary application',
    taskType: 'bursary',
    buildTitle: (fd) => `Bursary — ${fd.get('provider') || 'application'}`,
    checklist: ['Check eligibility', 'Gather transcripts', 'Prepare motivation letter', 'Submit before deadline', 'Track outcome'],
    fields: [
      { name: 'organisation', label: 'Organisation offering the bursary', type: 'text', required: true },
      { name: 'provider', label: 'Programme name (optional)', type: 'text' },
      { name: 'deadline', label: 'Deadline', type: 'date', required: true },
      { name: 'documents', label: 'Required documents', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  funding: {
    heading: 'Funding application',
    taskType: 'funding',
    buildTitle: (fd) => `Funding — ${fd.get('programme') || 'grant'}`,
    checklist: ['Read criteria', 'Budget breakdown', 'Supporting letters', 'Submit application'],
    fields: [
      { name: 'organisation', label: 'Organisation / funder', type: 'text', required: true },
      { name: 'programme', label: 'Grant or programme', type: 'text', required: true },
      { name: 'deadline', label: 'Deadline', type: 'date', required: true },
      { name: 'amount', label: 'Amount requested', type: 'text' },
      { name: 'documents', label: 'Required documents', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  loan: {
    heading: 'Loan application',
    taskType: 'loan',
    buildTitle: (fd) => `Loan — ${fd.get('lender') || 'application'}`,
    checklist: ['Proof of income', 'Bank statements', 'ID documents', 'Submit application'],
    fields: [
      { name: 'organisation', label: 'Lender / financial institution', type: 'text', required: true },
      { name: 'lender', label: 'Branch or product (optional)', type: 'text' },
      { name: 'amount', label: 'Loan amount', type: 'text' },
      { name: 'deadline', label: 'Submit by', type: 'date' },
      { name: 'documents', label: 'Required documents', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  accommodation: {
    heading: 'Accommodation application',
    taskType: 'accommodation',
    buildTitle: (fd) => `Accommodation — ${fd.get('place') || 'application'}`,
    fields: [
      { name: 'organisation', label: 'Landlord / institution / agent', type: 'text', required: true },
      { name: 'place', label: 'Property or residence name', type: 'text', required: true },
      { name: 'deadline', label: 'Apply by', type: 'date', required: true },
      { name: 'deposit', label: 'Deposit / budget', type: 'text' },
      { name: 'documents', label: 'Required documents', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  government: {
    heading: 'Government service',
    taskType: 'government',
    buildTitle: (fd) => `${fd.get('service') || 'Government'} application`,
    fields: [
      { name: 'service', label: 'Service or department', type: 'text', required: true },
      { name: 'reference', label: 'Reference number', type: 'text' },
      { name: 'deadline', label: 'Appointment or due date', type: 'date' },
      { name: 'documents', label: 'Bring / submit', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  collect: {
    heading: 'Collect an order',
    taskType: 'collect',
    buildTitle: (fd) => `Collect — ${fd.get('store') || 'order'}`,
    fields: [
      { name: 'store', label: 'Collection point', type: 'text', required: true },
      { name: 'reference', label: 'Order reference', type: 'text', required: true },
      { name: 'date', label: 'Collect on', type: 'date', required: true },
      { name: 'time', label: 'Time', type: 'time' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  payment: {
    heading: 'Make a payment',
    taskType: 'payment',
    buildTitle: (fd) => `Pay — ${fd.get('payee') || 'recipient'}`,
    fields: [
      { name: 'payee', label: 'Pay to', type: 'text', required: true },
      { name: 'amount', label: 'Amount', type: 'text', required: true },
      { name: 'method', label: 'Payment method', type: 'text', placeholder: 'EFT, card, cash…' },
      { name: 'date', label: 'Pay by', type: 'date', required: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  delivery: {
    heading: 'Arrange delivery',
    taskType: 'delivery',
    buildTitle: (fd) => `Delivery — ${fd.get('item') || 'items'}`,
    fields: [
      { name: 'item', label: 'What is being delivered', type: 'text', required: true },
      { name: 'address', label: 'Delivery address', type: 'text', required: true },
      { name: 'date', label: 'Delivery date', type: 'date' },
      { name: 'window', label: 'Time window', type: 'text' },
      { name: 'notes', label: 'Instructions', type: 'textarea' },
    ],
  },
  errands: {
    heading: 'Run errands',
    taskType: 'errands',
    buildTitle: (fd) => `Errands — ${fd.get('area') || 'today'}`,
    fields: [
      { name: 'area', label: 'Area or route', type: 'text' },
      { name: 'stops', label: 'Stops (one per line)', type: 'textarea', required: true },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'time', label: 'Start time', type: 'time' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  compare: {
    heading: 'Compare products',
    taskType: 'compare',
    kind: 'execution',
    buildTitle: (fd) => `Compare — ${(fd.get('item') || 'products').slice(0, 40)}`,
    fields: [
      { name: 'item', label: 'What to compare', type: 'text', required: true },
      { name: 'budget', label: 'Budget', type: 'text' },
      { name: 'criteria', label: 'Criteria', type: 'textarea', placeholder: 'Price, warranty, reviews…' },
      { name: 'deadline', label: 'Decide by', type: 'date' },
    ],
  },
  vehicle: {
    heading: 'Vehicle servicing',
    taskType: 'vehicle',
    buildTitle: (fd) => `Service — ${fd.get('vehicle') || 'vehicle'}`,
    fields: [
      { name: 'vehicle', label: 'Vehicle', type: 'text', required: true },
      { name: 'workshop', label: 'Workshop', type: 'text' },
      { name: 'date', label: 'Service date', type: 'date', required: true },
      { name: 'time', label: 'Drop-off time', type: 'time' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  renew: {
    heading: 'Renew documents',
    taskType: 'renew',
    buildTitle: (fd) => `Renew — ${fd.get('document') || 'document'}`,
    fields: [
      { name: 'document', label: 'Document', type: 'text', required: true },
      { name: 'expires', label: 'Expires on', type: 'date', required: true },
      { name: 'location', label: 'Where to renew', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  followup: {
    heading: 'Follow up with someone',
    taskType: 'followup',
    buildTitle: (fd) => `Follow up — ${fd.get('person') || 'contact'}`,
    fields: [
      { name: 'person', label: 'Who', type: 'text', required: true },
      { name: 'topic', label: 'About', type: 'text', required: true },
      { name: 'date', label: 'Follow up on', type: 'date', required: true },
      { name: 'time', label: 'Time', type: 'time' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  goals: {
    heading: 'Personal goal',
    taskType: 'goals',
    buildTitle: (fd) => fd.get('goal') || 'Personal goal',
    fields: [
      { name: 'goal', label: 'Goal', type: 'text', required: true },
      { name: 'milestone', label: 'Next milestone', type: 'text' },
      { name: 'date', label: 'Target date', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  wellness: {
    heading: 'Health and wellness',
    taskType: 'wellness',
    buildTitle: (fd) => fd.get('routine') || 'Wellness routine',
    fields: [
      { name: 'routine', label: 'Routine or habit', type: 'text', required: true },
      { name: 'freq', label: 'How often', type: 'select', options: ['Daily', 'Weekly', 'As needed'] },
      { name: 'time', label: 'Time', type: 'time' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  routine: {
    heading: 'Regular responsibility',
    taskType: 'routine',
    buildTitle: (fd) => fd.get('title') || 'Regular task',
    fields: [
      { name: 'title', label: 'Responsibility', type: 'text', required: true },
      { name: 'freq', label: 'How often', type: 'select', options: ['Daily', 'Weekly', 'Monthly'] },
      { name: 'date', label: 'Next due', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  business_meeting: {
    heading: 'Prepare for business meeting',
    taskType: 'business_meeting',
    buildTitle: (fd) => `Meeting prep — ${fd.get('title') || 'meeting'}`,
    checklist: ['Review agenda', 'Prepare slides or notes', 'Confirm attendees', 'Test AV or link', 'Print handouts'],
    fields: [
      { name: 'title', label: 'Meeting subject', type: 'text', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'time', label: 'Time', type: 'time', required: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  business_trip: {
    heading: 'Business trip',
    taskType: 'business_trip',
    buildTitle: (fd) => `Business trip — ${fd.get('destination') || ''}`,
    checklist: ['Flights and transfers', 'Hotel', 'Client materials', 'Expense policy', 'Pack formal wear'],
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true },
      { name: 'date', label: 'Depart', type: 'date', required: true },
      { name: 'return', label: 'Return', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  exam: {
    heading: 'School or examination',
    taskType: 'exam',
    buildTitle: (fd) => `Exam — ${fd.get('subject') || 'preparation'}`,
    checklist: ['Study schedule', 'Past papers', 'Stationery ready', 'Confirm venue', 'Rest plan'],
    fields: [
      { name: 'subject', label: 'Subject or module', type: 'text', required: true },
      { name: 'date', label: 'Exam date', type: 'date', required: true },
      { name: 'time', label: 'Time', type: 'time' },
      { name: 'venue', label: 'Venue', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  event: {
    heading: 'Event or special occasion',
    taskType: 'event',
    buildTitle: (fd) => `Event — ${fd.get('name') || ''}`,
    checklist: ['Outfit', 'Gift', 'RSVP', 'Transport', 'Confirm timing'],
    fields: [
      { name: 'name', label: 'Event name', type: 'text', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'time', label: 'Time', type: 'time' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  new_job: {
    heading: 'Starting a new job',
    taskType: 'new_job',
    buildTitle: (fd) => `New job — ${fd.get('employer') || 'Day 1'}`,
    checklist: ['Bank details', 'Contract signed', 'First-day attire', 'Route and parking', 'IT access'],
    fields: [
      { name: 'employer', label: 'Employer', type: 'text', required: true },
      { name: 'date', label: 'Start date', type: 'date', required: true },
      { name: 'time', label: 'Arrive at', type: 'time' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  find_provider: {
    heading: 'Find a service provider',
    taskType: 'find_provider',
    kind: 'execution',
    buildTitle: (fd) => `Find — ${(fd.get('need') || 'provider').slice(0, 40)}`,
    fields: [
      { name: 'need', label: 'What service do you need?', type: 'textarea', required: true },
      { name: 'area', label: 'Area', type: 'text' },
      { name: 'budget', label: 'Budget', type: 'text' },
      { name: 'deadline', label: 'Need by', type: 'date' },
    ],
  },
  prepare_doc: {
    heading: 'Prepare a document',
    taskType: 'prepare_doc',
    kind: 'execution',
    buildTitle: (fd) => `Document — ${(fd.get('doc') || 'draft').slice(0, 40)}`,
    fields: [
      { name: 'doc', label: 'Document type', type: 'text', required: true },
      { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
      { name: 'deadline', label: 'Due by', type: 'date' },
    ],
  },
  compare_products: {
    heading: 'Compare products',
    taskType: 'compare_products',
    kind: 'execution',
    buildTitle: (fd) => `Compare — ${(fd.get('item') || '').slice(0, 35)}`,
    fields: [
      { name: 'item', label: 'Products to compare', type: 'text', required: true },
      { name: 'budget', label: 'Budget', type: 'text' },
      { name: 'notes', label: 'Must-haves', type: 'textarea' },
    ],
  },
  draft_application: {
    heading: 'Draft an application',
    taskType: 'draft_application',
    kind: 'execution',
    buildTitle: (fd) => `Draft application — ${(fd.get('for') || '').slice(0, 35)}`,
    fields: [
      { name: 'for', label: 'Application for', type: 'text', required: true },
      { name: 'instructions', label: 'Instructions', type: 'textarea' },
      { name: 'deadline', label: 'Submit by', type: 'date' },
    ],
  },
  find_booking: {
    heading: 'Find a booking',
    taskType: 'find_booking',
    kind: 'execution',
    buildTitle: (fd) => `Booking — ${(fd.get('type') || '').slice(0, 35)}`,
    fields: [
      { name: 'type', label: 'What to book', type: 'text', required: true },
      { name: 'when', label: 'Preferred date or time', type: 'text' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  online_process: {
    heading: 'Assist with online process',
    taskType: 'online_process',
    kind: 'execution',
    buildTitle: (fd) => `Online assist — ${(fd.get('process') || '').slice(0, 35)}`,
    fields: [
      { name: 'process', label: 'Website or process', type: 'text', required: true },
      { name: 'goal', label: 'What to complete', type: 'textarea', required: true },
      { name: 'notes', label: 'Login or permissions', type: 'textarea' },
    ],
  },
};

const EXECUTION_TYPES = new Set(
  Object.entries(SCHEMA_FORMS)
    .filter(([, v]) => v.kind === 'execution')
    .map(([k]) => k)
);

export function isExecutionTaskType(typeId) {
  return EXECUTION_TYPES.has(typeId);
}

export function schemaKeyFor(categoryId, typeId) {
  if (SCHEMA_FORMS[typeId]) return typeId;
  if (categoryId === 'applications' && SCHEMA_FORMS[typeId]) return typeId;
  if (categoryId === 'shopping' && ['groceries', 'product'].includes(typeId)) return typeId;
  if (categoryId === 'personal' && typeId === 'household') return typeId;
  if (categoryId === 'delegate' && typeId === 'research') return typeId;
  return null;
}