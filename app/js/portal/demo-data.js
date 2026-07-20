import { getPlan, formatPrice } from '../shared/billingPlans.js';

const businessPlan = getPlan('business');

export const DEMO_COMPANY_ID = 'demo-central-motors';

export const DEMO_BRANDING = {
  logoUrl: 'https://ui-avatars.com/api/?name=Central+Motors&background=1e40af&color=fff&size=128&bold=true',
  primaryColor: '#1e40af',
  faviconUrl: 'assets/favicon-portal.svg',
  emailSignature: 'Best regards,\nThe Central Motors Team\n+27 11 555 0100 | centralmotors.co.za',
  aiAvatarUrl: '',
  whatsappGreeting: 'Hi! Welcome to Central Motors. How can we help you find your next vehicle today?',
};

export const DEMO_TEAM = [
  {
    id: 'tm-1',
    companyId: DEMO_COMPANY_ID,
    name: 'John Smith',
    email: 'john@centralmotors.co.za',
    role: 'owner',
    status: 'active',
    lastActive: '2025-07-18T12:00:00.000Z',
    avatar: 'JS',
  },
  {
    id: 'tm-2',
    companyId: DEMO_COMPANY_ID,
    name: 'Sarah van Wyk',
    email: 'sarah@centralmotors.co.za',
    role: 'manager',
    status: 'active',
    lastActive: '2025-07-18T11:30:00.000Z',
    avatar: 'SV',
  },
  {
    id: 'tm-3',
    companyId: DEMO_COMPANY_ID,
    name: 'Mike Ndlovu',
    email: 'mike@centralmotors.co.za',
    role: 'sales',
    status: 'active',
    lastActive: '2025-07-18T10:15:00.000Z',
    avatar: 'MN',
  },
];

export const DEMO_USAGE = {
  companyId: DEMO_COMPANY_ID,
  plan: businessPlan.id,
  planLabel: businessPlan.label,
  messagesUsed: 342,
  messagesLimit: 5000,
  tokensUsed: 89400,
  tokensLimit: 500000,
  storageUsedMb: 128,
  storageLimitMb: 2048,
  renewalDate: '2025-08-01',
  billingCycle: businessPlan.billingCycle,
  amount: businessPlan.price,
  currency: businessPlan.currency,
};

export const DEMO_INVOICES = [
  { id: 'inv-2025-07', date: '2025-07-01', amount: businessPlan.price, status: 'paid', plan: businessPlan.label },
  { id: 'inv-2025-06', date: '2025-06-01', amount: businessPlan.price, status: 'paid', plan: businessPlan.label },
  { id: 'inv-2025-05', date: '2025-05-01', amount: businessPlan.price, status: 'paid', plan: businessPlan.label },
];

export const DEMO_NOTIFICATIONS = [
  {
    id: 'n-1',
    companyId: DEMO_COMPANY_ID,
    type: 'workflow_failed',
    icon: 'fa-diagram-project',
    color: 'red',
    title: 'Workflow failed',
    message: 'Finance Enquiry workflow failed for David Nkosi — timeout on CRM task step.',
    read: false,
    time: '5m ago',
    createdAt: '2025-07-18T11:55:00.000Z',
  },
  {
    id: 'n-2',
    companyId: DEMO_COMPANY_ID,
    type: 'payment',
    icon: 'fa-credit-card',
    color: 'green',
    title: 'Payment received',
    message: `${businessPlan.label} plan renewal — ${formatPrice(businessPlan.price)} paid successfully.`,
    read: false,
    time: '2h ago',
    createdAt: '2025-07-18T10:00:00.000Z',
  },
  {
    id: 'n-3',
    companyId: DEMO_COMPANY_ID,
    type: 'customer',
    icon: 'fa-user-plus',
    color: 'blue',
    title: 'New customer',
    message: 'James K. started a WhatsApp conversation via Sarah (AI).',
    read: true,
    time: '3h ago',
    createdAt: '2025-07-18T09:00:00.000Z',
  },
  {
    id: 'n-4',
    companyId: DEMO_COMPANY_ID,
    type: 'knowledge',
    icon: 'fa-book',
    color: 'yellow',
    title: 'Knowledge trained',
    message: 'Vehicle Catalogue 2025.pdf finished training — 142 chunks created.',
    read: true,
    time: 'Yesterday',
    createdAt: '2025-07-17T14:30:00.000Z',
  },
  {
    id: 'n-5',
    companyId: DEMO_COMPANY_ID,
    type: 'system',
    icon: 'fa-bolt',
    color: 'purple',
    title: 'Usage alert',
    message: 'You have used 7% of your monthly message quota (342 / 5,000).',
    read: true,
    time: 'Yesterday',
    createdAt: '2025-07-17T08:00:00.000Z',
  },
];

export const DEMO_ACTIVITY = [
  { id: 'a-1', actor: 'John Smith', action: 'created AI Employee', target: 'Sarah (Sales Consultant)', time: '2025-07-10T09:00:00.000Z', ago: '8 days ago', icon: 'fa-robot' },
  { id: 'a-2', actor: 'Sarah van Wyk', action: 'published workflow', target: 'Test Drive Booking', time: '2025-07-10T16:00:00.000Z', ago: '8 days ago', icon: 'fa-diagram-project' },
  { id: 'a-3', actor: 'John Smith', action: 'uploaded knowledge', target: 'Vehicle Catalogue 2025.pdf', time: '2025-07-14T10:00:00.000Z', ago: '4 days ago', icon: 'fa-book' },
  { id: 'a-4', actor: 'Mike Ndlovu', action: 'replied in inbox', target: 'David Nkosi — finance enquiry', time: '2025-07-18T08:35:00.000Z', ago: '4h ago', icon: 'fa-inbox' },
  { id: 'a-5', actor: 'Sarah (AI)', action: 'handled conversation', target: 'John Smith — Hilux enquiry', time: '2025-07-18T09:15:00.000Z', ago: '3h ago', icon: 'fa-comments' },
  { id: 'a-6', actor: 'John Smith', action: 'invited team member', target: 'Mike Ndlovu (Sales)', time: '2025-07-05T11:00:00.000Z', ago: '13 days ago', icon: 'fa-user-plus' },
  { id: 'a-7', actor: 'John Smith', action: 'updated branding', target: 'Primary color → #1e40af', time: '2025-07-01T14:00:00.000Z', ago: '17 days ago', icon: 'fa-palette' },
  { id: 'a-8', actor: 'Sarah van Wyk', action: 'edited FAQ', target: 'Test Drive Booking', time: '2025-07-15T10:30:00.000Z', ago: '3 days ago', icon: 'fa-circle-question' },
  { id: 'a-9', actor: 'System', action: 'workflow executed', target: 'Finance Enquiry — David Nkosi', time: '2025-07-18T08:32:00.000Z', ago: '4h ago', icon: 'fa-bolt' },
  { id: 'a-10', actor: 'John Smith', action: 'exported analytics', target: 'July 2025 report (CSV)', time: '2025-07-17T17:00:00.000Z', ago: '1 day ago', icon: 'fa-file-export' },
];

/** Company-scoped dashboard metrics (not platform-wide). */
export function demoCompanyDashboard(companyId) {
  return {
    companyId,
    conversationsToday: 47,
    activeConversations: 8,
    aiHandledPct: 87,
    avgResponseSec: 1.4,
    satisfaction: 96,
    messagesThisMonth: 342,
    messagesLimit: 5000,
    customersTotal: 156,
    agentsActive: 1,
    knowledgeItems: 14,
    workflowsPublished: 2,
    trends: {
      conversations: 12.4,
      satisfaction: 2.1,
      messages: 8.7,
      customers: 5.2,
    },
    isDemo: true,
  };
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Client-side fallback when dashboard API is unavailable. */
export function demoChartSeries(companyId, messagesTotal = 342, tokensTotal = 89400) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const currentDay = now.getDate();
  const seed = hashSeed(companyId || 'default');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const labels = [];
  const messages = [];
  const tokens = [];
  const weights = [];

  for (let day = 1; day <= currentDay; day += 1) {
    const date = new Date(year, month, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const base = 0.55 + ((seed + day * 23) % 80) / 100;
    weights.push(base * (isWeekend ? 0.72 : 1) * (day === currentDay ? 1.15 : 1));
  }

  const weightSum = weights.reduce((sum, w) => sum + w, 0) || 1;

  for (let day = 1; day <= currentDay; day += 1) {
    labels.push(String(day));
    messages.push(Math.max(1, Math.round((messagesTotal * weights[day - 1]) / weightSum)));
    tokens.push(Math.max(80, Math.round((tokensTotal * weights[day - 1]) / weightSum)));
  }

  return {
    labels,
    messages,
    tokens,
    month: month + 1,
    monthLabel: monthNames[month],
    year,
    currentDay,
  };
}

export function demoQuickStats(metrics = {}) {
  return {
    responseRate: 94,
    avgResponseSec: metrics.avgResponseSec ?? 1.4,
    activeConversations: metrics.activeConversations ?? 8,
    leadsThisWeek: 23,
    aiResolutionRate: metrics.aiHandledPct ?? 87,
    humanTakeovers: 2,
    workflowsRunning: metrics.workflowsPublished ?? 2,
    testDrivesBooked: 6,
    trends: {
      responseRate: 2.3,
      avgResponseSec: -0.2,
      leadsThisWeek: 15.2,
      aiResolutionRate: 3.1,
    },
  };
}

/** Tenant-scoped analytics demo data for portal Analytics module. */
export function demoAnalyticsData(companyId) {
  const seed = hashSeed(companyId || 'default');
  const factor = companyId === DEMO_COMPANY_ID ? 1 : 0.35 + (seed % 40) / 100;

  const baseRows = [
    { date: '2025-07-17', conversations: 41, tokensUsed: 9640, avgResponseTimeMs: 1240, whatsappMessages: 136, satisfaction: 4.6 },
    { date: '2025-07-16', conversations: 38, tokensUsed: 9020, avgResponseTimeMs: 1180, whatsappMessages: 124, satisfaction: 4.5 },
    { date: '2025-07-15', conversations: 31, tokensUsed: 7960, avgResponseTimeMs: 1320, whatsappMessages: 102, satisfaction: 4.4 },
    { date: '2025-07-14', conversations: 28, tokensUsed: 7300, avgResponseTimeMs: 1410, whatsappMessages: 96, satisfaction: 4.3 },
    { date: '2025-07-13', conversations: 20, tokensUsed: 4420, avgResponseTimeMs: 980, whatsappMessages: 62, satisfaction: 4.7 },
    { date: '2025-07-12', conversations: 18, tokensUsed: 4100, avgResponseTimeMs: 1050, whatsappMessages: 58, satisfaction: 4.5 },
    { date: '2025-07-11', conversations: 25, tokensUsed: 5880, avgResponseTimeMs: 1120, whatsappMessages: 78, satisfaction: 4.4 },
  ];

  const rows = baseRows.map((r) => ({
    ...r,
    conversations: Math.max(1, Math.round(r.conversations * factor)),
    tokensUsed: Math.max(100, Math.round(r.tokensUsed * factor)),
    whatsappMessages: Math.max(1, Math.round(r.whatsappMessages * factor)),
  }));

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const series = {
    labels,
    conversations: rows.slice(0, 7).reverse().map((r) => r.conversations),
    aiHandled: rows.slice(0, 7).reverse().map((r) => Math.round(r.conversations * 0.82)),
    whatsappMessages: rows.slice(0, 7).reverse().map((r) => r.whatsappMessages),
    tokensUsed: rows.slice(0, 7).reverse().map((r) => r.tokensUsed),
    satisfaction: rows.slice(0, 7).reverse().map((r) => r.satisfaction),
  };

  const conversations7d = rows.reduce((s, r) => s + r.conversations, 0);
  const whatsapp7d = rows.reduce((s, r) => s + r.whatsappMessages, 0);
  const tokens7d = rows.reduce((s, r) => s + r.tokensUsed, 0);
  const avgSatisfaction = (rows.reduce((s, r) => s + r.satisfaction, 0) / rows.length).toFixed(1);

  return {
    series,
    rows,
    summary: {
      conversations7d,
      whatsapp7d,
      tokens7d,
      avgSatisfaction,
      aiResolutionRate: companyId === DEMO_COMPANY_ID ? 87 : Math.round(72 + (seed % 20) * factor),
      avgResponseSec: companyId === DEMO_COMPANY_ID ? 1.4 : Number((1.2 + (seed % 30) / 20).toFixed(1)),
      trends: {
        conversations: 12.4,
        whatsapp: 9.8,
        tokens: -3.2,
        satisfaction: 2.1,
        avgResponseSec: -0.2,
      },
    },
    isDemo: true,
  };
}

/** Demo profile resolver — maps Firebase user to tenant profile. */
export function resolveDemoProfile(user) {
  const storedRole = localStorage.getItem('ziric-portal-demo-role') || 'owner';
  const teamMember = DEMO_TEAM.find((m) => m.email === user?.email);
  const role = teamMember?.role || storedRole;
  const member = teamMember || DEMO_TEAM.find((m) => m.role === role) || DEMO_TEAM[0];

  return {
    uid: user?.uid,
    email: user?.email || member.email,
    fullName: member.name,
    name: member.name,
    role,
    companyId: DEMO_COMPANY_ID,
    status: 'active',
    isDemo: true,
  };
}
