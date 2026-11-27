/**
 * ST-UX-03 — South Africa government directory (seed v1; verify programmes before submit).
 * Data-only — update without app release via future API sync.
 */

export const GOV_ASSIST_OPTIONS = [
  { id: 'explain', label: 'Explain requirements' },
  { id: 'eligibility', label: 'Check my eligibility' },
  { id: 'documents', label: 'Prepare my documents' },
  { id: 'complete', label: 'Help complete the application' },
  { id: 'submit', label: 'Help submit via official channel' },
];

/** @type {{ id: string, name: string, services: string[] }[]} */
export const GOV_DEPARTMENTS = [
  {
    id: 'dha',
    name: 'Department of Home Affairs',
    services: [
      'Smart ID',
      'ID replacement',
      'Passport',
      'Birth certificate',
      'Marriage certificate',
      'Citizenship',
      'Book Home Affairs appointment',
    ],
  },
  {
    id: 'dot',
    name: 'Department of Transport',
    services: ['Driving licence', "Learner's licence", 'Vehicle licensing', 'Traffic fines'],
  },
  {
    id: 'sars',
    name: 'South African Revenue Service (SARS)',
    services: ['Tax registration', 'Income tax return', 'Tax clearance', 'PAYE / VAT'],
  },
  {
    id: 'del',
    name: 'Department of Employment and Labour',
    services: ['UIF', 'CCMA referral', 'COIDA / Compensation Fund', 'Employment equity'],
  },
  {
    id: 'dsd',
    name: 'Department of Social Development',
    services: ['Social grants', 'SASSA referral', 'Child support enquiry'],
  },
  {
    id: 'dhs',
    name: 'Department of Human Settlements',
    services: ['Housing subsidy', 'Housing waiting list', 'Provincial housing referral'],
  },
  {
    id: 'dhrt',
    name: 'Department of Higher Education and Training',
    services: ['TVET admissions', 'Higher education enquiry'],
  },
  {
    id: 'dbe',
    name: 'Department of Basic Education',
    services: ['School registration', 'Teaching programme enquiry'],
  },
  {
    id: 'nsfas',
    name: 'NSFAS',
    services: ['Student financial aid application', 'NSFAS status check'],
  },
  {
    id: 'funza',
    name: 'Funza Lushaka',
    services: ['Teaching bursary application'],
  },
  {
    id: 'nsf',
    name: 'National Skills Fund',
    services: ['Skills programme', 'Bursary enquiry'],
  },
  {
    id: 'nrf',
    name: 'National Research Foundation',
    services: ['Research funding', 'Postgraduate support'],
  },
  {
    id: 'dsbd',
    name: 'Department of Small Business Development (DSBD)',
    services: ['MSME support', 'Co-operative Development Support', 'Youth Challenge Fund enquiry'],
  },
  {
    id: 'sedfa',
    name: 'Small Enterprise Development and Finance Agency (SEDFA)',
    services: ['OneSEDFA funding application', 'Enterprise finance enquiry'],
  },
  {
    id: 'nyda',
    name: 'National Youth Development Agency (NYDA)',
    services: ['Youth enterprise grant', 'Business development support'],
  },
  {
    id: 'dtic',
    name: 'Department of Trade, Industry and Competition (the dtic)',
    services: ['Industrial incentives', 'Business support programmes'],
  },
  {
    id: 'idc',
    name: 'Industrial Development Corporation (IDC)',
    services: ['Business finance application'],
  },
  {
    id: 'tia',
    name: 'Technology Innovation Agency (TIA)',
    services: ['Innovation funding enquiry'],
  },
  {
    id: 'dffe',
    name: 'Department of Forestry, Fisheries and the Environment',
    services: ['Environmental permits', 'Fisheries licences'],
  },
  {
    id: 'dsti',
    name: 'Department of Science, Technology and Innovation',
    services: ['Research and innovation programmes'],
  },
  {
    id: 'dsac',
    name: 'Department of Sport, Arts and Culture',
    services: ['Arts funding', 'National Arts Council referral'],
  },
  {
    id: 'nac',
    name: 'National Arts Council',
    services: ['Arts project funding'],
  },
  {
    id: 'dt',
    name: 'Department of Tourism',
    services: ['Tourism enterprise funding', 'Market access support'],
  },
  {
    id: 'dwyl',
    name: 'Department of Women, Youth and Persons with Disabilities',
    services: ['Targeted programme enquiry'],
  },
  {
    id: 'dmr',
    name: 'Department of Mineral and Petroleum Resources',
    services: ['Mining rights', 'Permit enquiry'],
  },
  {
    id: 'dws',
    name: 'Department of Water and Sanitation',
    services: ['Water use licence', 'Sanitation programme'],
  },
  {
    id: 'dag',
    name: 'Department of Agriculture',
    services: ['Farmer support', 'Agricultural grant enquiry'],
  },
  {
    id: 'municipal',
    name: 'Municipality / local government',
    services: ['Indigent support', 'Rates enquiry', 'Municipal housing', 'Permits'],
  },
  {
    id: 'other',
    name: 'Other — type organisation name',
    services: [],
  },
];

export function departmentById(id) {
  return GOV_DEPARTMENTS.find((d) => d.id === id) || null;
}

export function searchDepartments(query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return GOV_DEPARTMENTS;
  return GOV_DEPARTMENTS.filter((d) => d.name.toLowerCase().includes(q) || d.id.includes(q));
}