/**
 * Portal demo seed/fallback layer — NOT primary data for authenticated provisioned tenants.
 * Live data comes from tenant services + /api/portal/* routes.
 * Used only for demo-central-motors or when workspace is unprovisioned.
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { getPlan, buildUsageFromPlan, getAllPlans, formatPrice } from "../platform/billingPlans.js";

const businessPlan = getPlan("business");

export const PORTAL_DEMO_BRANDING = {
  logoUrl: 'https://ui-avatars.com/api/?name=Central+Motors&background=1e40af&color=fff&size=128&bold=true',
  primaryColor: '#1e40af',
  faviconUrl: '',
  emailSignature: 'Best regards,\nThe Central Motors Team\n+27 11 555 0100 | centralmotors.co.za',
  aiAvatarUrl: '',
  whatsappGreeting: 'Hi! Welcome to Central Motors. How can we help you find your next vehicle today?',
};

export const PORTAL_DEMO_COMPANY = {
  id: 'demo-central-motors',
  name: 'Central Motors',
  industry: 'Automotive',
  plan: 'business',
  status: 'active',
  email: 'info@centralmotors.co.za',
  phone: '+27 11 555 0100',
  website: 'https://centralmotors.co.za',
  whatsappNumber: '+27 71 000 1234',
  whatsappConnected: true,
  owner: 'John Smith',
  ownerEmail: 'john@centralmotors.co.za',
  branding: PORTAL_DEMO_BRANDING,
};

export const PORTAL_DEMO_TEAM = [
  { id: 'tm-1', companyId: 'demo-central-motors', name: 'John Smith', email: 'john@centralmotors.co.za', role: 'owner', status: 'active', lastActive: '2025-07-18T12:00:00.000Z', avatar: 'JS' },
  { id: 'tm-2', companyId: 'demo-central-motors', name: 'Sarah van Wyk', email: 'sarah@centralmotors.co.za', role: 'manager', status: 'active', lastActive: '2025-07-18T11:30:00.000Z', avatar: 'SV' },
  { id: 'tm-3', companyId: 'demo-central-motors', name: 'Mike Ndlovu', email: 'mike@centralmotors.co.za', role: 'sales', status: 'active', lastActive: '2025-07-18T10:15:00.000Z', avatar: 'MN' },
];

export const PORTAL_DEMO_USAGE = {
  companyId: 'demo-central-motors',
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

export const PORTAL_DEMO_INVOICES = [
  { id: 'inv-2025-07', date: '2025-07-01', amount: businessPlan.price, status: 'paid', plan: businessPlan.label },
  { id: 'inv-2025-06', date: '2025-06-01', amount: businessPlan.price, status: 'paid', plan: businessPlan.label },
  { id: 'inv-2025-05', date: '2025-05-01', amount: businessPlan.price, status: 'paid', plan: businessPlan.label },
];

export const PORTAL_DEMO_NOTIFICATIONS = [
  { id: 'n-1', companyId: 'demo-central-motors', type: 'workflow_failed', icon: 'fa-diagram-project', color: 'red', title: 'Workflow failed', message: 'Finance Enquiry workflow failed for David Nkosi — timeout on CRM task step.', read: false, time: '5m ago', createdAt: '2025-07-18T11:55:00.000Z' },
  { id: 'n-2', companyId: 'demo-central-motors', type: 'payment', icon: 'fa-credit-card', color: 'green', title: 'Payment received', message: `${businessPlan.label} plan renewal — ${formatPrice(businessPlan.price)} paid successfully.`, read: false, time: '2h ago', createdAt: '2025-07-18T10:00:00.000Z' },
  { id: 'n-3', companyId: 'demo-central-motors', type: 'customer', icon: 'fa-user-plus', color: 'blue', title: 'New customer', message: 'James K. started a WhatsApp conversation via Sarah (AI).', read: true, time: '3h ago', createdAt: '2025-07-18T09:00:00.000Z' },
  { id: 'n-4', companyId: 'demo-central-motors', type: 'knowledge', icon: 'fa-book', color: 'yellow', title: 'Knowledge trained', message: 'Vehicle Catalogue 2025.pdf finished training — 142 chunks created.', read: true, time: 'Yesterday', createdAt: '2025-07-17T14:30:00.000Z' },
  { id: 'n-5', companyId: 'demo-central-motors', type: 'system', icon: 'fa-bolt', color: 'purple', title: 'Usage alert', message: 'You have used 7% of your monthly message quota (342 / 5,000).', read: true, time: 'Yesterday', createdAt: '2025-07-17T08:00:00.000Z' },
];

export const PORTAL_DEMO_ACTIVITY = [
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

/** In-memory branding overrides (demo persistence). */
const brandingOverrides = new Map();

async function loadProvisionedCompany(companyId) {
  try {
    const adapter = await getStorageAdapter();
    if (adapter.getPortalCompany) {
      return adapter.getPortalCompany(companyId);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function getPortalCompanyAsync(companyId) {
  const provisioned = await loadProvisionedCompany(companyId);
  if (provisioned) {
    const branding = brandingOverrides.get(companyId) || provisioned.branding || PORTAL_DEMO_BRANDING;
    return {
      company: { ...provisioned, branding },
      branding,
      subscription: { plan: provisioned.plan || 'starter', status: provisioned.status || 'active' },
      isDemo: false,
      isProvisioned: true,
    };
  }
  return getPortalCompany(companyId);
}

export function getPortalCompany(companyId) {
  if (companyId !== 'demo-central-motors') {
    return {
      company: { id: companyId, name: companyId, plan: 'starter', status: 'active' },
      branding: PORTAL_DEMO_BRANDING,
      subscription: { plan: 'starter', status: 'active' },
    };
  }
  const branding = brandingOverrides.get(companyId) || PORTAL_DEMO_BRANDING;
  return {
    company: { ...PORTAL_DEMO_COMPANY, branding },
    branding,
    subscription: { plan: 'business', status: 'active', renewalDate: PORTAL_DEMO_USAGE.renewalDate },
    isDemo: true,
  };
}

export async function updatePortalBranding(companyId, branding) {
  const { saveCompanyBranding } = await import("../tenants/companyService.js");
  try {
    return await saveCompanyBranding(companyId, branding);
  } catch {
    brandingOverrides.set(companyId, { ...(brandingOverrides.get(companyId) || PORTAL_DEMO_BRANDING), ...branding });
    return brandingOverrides.get(companyId);
  }
}

export function getPortalTeam(companyId) {
  return PORTAL_DEMO_TEAM.filter((m) => m.companyId === companyId);
}

export async function getPortalTeamAsync(companyId) {
  try {
    const { listTeamMembers } = await import("../tenants/userService.js");
    const items = await listTeamMembers(companyId);
    if (items.length) return { items, isDemo: false };
  } catch {
    /* fall through */
  }
  return { items: getPortalTeam(companyId), isDemo: true };
}

export async function getPortalNotificationsAsync(companyId) {
  try {
    const adapter = await getStorageAdapter();
    if (adapter.getPortalNotifications) {
      const live = await adapter.getPortalNotifications(companyId);
      if (live.length) return live;
    }
  } catch {
    /* ignore */
  }
  return getPortalNotifications(companyId);
}

export function getPortalNotifications(companyId) {
  return PORTAL_DEMO_NOTIFICATIONS.filter((n) => n.companyId === companyId);
}

export async function getPortalActivityAsync(companyId) {
  try {
    const adapter = await getStorageAdapter();
    if (adapter.getPortalActivity) {
      const live = await adapter.getPortalActivity(companyId);
      if (live.length) return live;
    }
  } catch {
    /* ignore */
  }
  return getPortalActivity(companyId);
}

export function getPortalActivity(companyId) {
  return companyId === 'demo-central-motors' ? PORTAL_DEMO_ACTIVITY : [];
}

/** Deterministic seed per tenant for demo variance. */
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Daily message + token usage for the current calendar month (tenant-scoped). */
export function generateMonthlyUsageSeries(companyId, messagesTotal = 342, tokensTotal = 89400) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const currentDay = now.getDate();
  const seed = hashSeed(companyId || 'default');

  const labels = [];
  const messages = [];
  const tokens = [];
  const weights = [];

  for (let day = 1; day <= currentDay; day += 1) {
    const date = new Date(year, month, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const base = 0.55 + ((seed + day * 23) % 80) / 100;
    const weekendFactor = isWeekend ? 0.72 : 1;
    const todayBoost = day === currentDay ? 1.15 : 1;
    weights.push(base * weekendFactor * todayBoost);
  }

  const weightSum = weights.reduce((sum, w) => sum + w, 0) || 1;

  for (let day = 1; day <= currentDay; day += 1) {
    labels.push(String(day));
    messages.push(Math.max(1, Math.round((messagesTotal * weights[day - 1]) / weightSum)));
    tokens.push(Math.max(80, Math.round((tokensTotal * weights[day - 1]) / weightSum)));
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

export function getPortalQuickStats(companyId) {
  const seed = hashSeed(companyId || 'default');
  const isDemo = companyId === 'demo-central-motors';

  if (isDemo) {
    return {
      responseRate: 94,
      avgResponseSec: 1.4,
      activeConversations: 8,
      leadsThisWeek: 23,
      aiResolutionRate: 87,
      humanTakeovers: 2,
      workflowsRunning: 4,
      testDrivesBooked: 6,
      trends: {
        responseRate: 2.3,
        avgResponseSec: -0.2,
        leadsThisWeek: 15.2,
        aiResolutionRate: 3.1,
      },
    };
  }

  const factor = 0.35 + (seed % 40) / 100;
  return {
    responseRate: Math.round(78 + (seed % 18) * factor),
    avgResponseSec: Number((1.2 + (seed % 30) / 20).toFixed(1)),
    activeConversations: Math.max(1, Math.round(3 + (seed % 12) * factor)),
    leadsThisWeek: Math.max(1, Math.round(8 + (seed % 20) * factor)),
    aiResolutionRate: Math.round(72 + (seed % 22) * factor),
    humanTakeovers: Math.max(0, Math.round((seed % 5) * factor)),
    workflowsRunning: Math.max(0, Math.round((seed % 4) * factor)),
    testDrivesBooked: Math.max(0, Math.round((seed % 8) * factor)),
    trends: {
      responseRate: Number(((seed % 10) - 3).toFixed(1)),
      avgResponseSec: Number((((seed % 6) - 3) / 10).toFixed(1)),
      leadsThisWeek: Number(((seed % 14) - 2).toFixed(1)),
      aiResolutionRate: Number(((seed % 8) - 2).toFixed(1)),
    },
  };
}

export async function getPortalDashboard(companyId) {
  const usagePayload = await getPortalUsageAsync(companyId);
  const activity = getPortalActivity(companyId).slice(0, 6).map((item) => ({
    ...item,
    color: activityColorForIcon(item.icon),
    text: `<strong>${item.actor}</strong> ${item.action} <em>${item.target}</em>`,
  }));

  return {
    ...usagePayload,
    recentActivity: activity,
  };
}

function activityColorForIcon(icon) {
  const map = {
    'fa-robot': 'purple',
    'fa-diagram-project': 'blue',
    'fa-book': 'yellow',
    'fa-inbox': 'green',
    'fa-comments': 'purple',
    'fa-user-plus': 'blue',
    'fa-palette': 'yellow',
    'fa-circle-question': 'yellow',
    'fa-bolt': 'orange',
    'fa-file-export': 'grey',
  };
  return map[icon] || 'grey';
}

async function loadCompanyPlan(companyId) {
  try {
    const adapter = await getStorageAdapter();
    if (adapter.getPortalCompany) {
      const company = await adapter.getPortalCompany(companyId);
      if (company?.plan) return company.plan;
    }
  } catch {
    /* ignore */
  }
  return companyId === 'demo-central-motors' ? 'business' : 'trial';
}

export function getPortalUsage(companyId) {
  return getPortalUsageAsync(companyId);
}

export async function getPortalUsageAsync(companyId) {
  let usage;
  let invoices = [];
  let isDemo = false;
  const seed = hashSeed(companyId || 'default');

  if (companyId === 'demo-central-motors') {
    usage = {
      ...PORTAL_DEMO_USAGE,
      aiEmployeesUsed: 1,
      aiEmployeesLimit: 10,
      conversationsUsed: 87,
      conversationsLimit: 5000,
      usersUsed: 3,
      usersLimit: 50,
      knowledgeDocsUsed: 24,
      knowledgeDocsLimit: null,
      knowledgeSizeMbUsed: 128,
      knowledgeSizeMbLimit: null,
      workflowRunsUsed: 156,
      workflowRunsLimit: null,
      apiCallsUsed: 4200,
      apiCallsLimit: 50000,
    };
    invoices = PORTAL_DEMO_INVOICES;
    isDemo = true;
  } else {
    const planId = await loadCompanyPlan(companyId);
    usage = { companyId, ...buildUsageFromPlan(planId, seed) };
    isDemo = false;
  }

  const chartSeries = generateMonthlyUsageSeries(
    companyId,
    usage.messagesUsed || 0,
    usage.tokensUsed || 0
  );
  const quickStats = getPortalQuickStats(companyId);
  const plans = getAllPlans();

  return { usage, invoices, chartSeries, quickStats, plans, isDemo };
}

/** Tenant-scoped analytics for portal Analytics module. */
export function getPortalAnalytics(companyId) {
  const seed = hashSeed(companyId || 'default');
  const factor = companyId === 'demo-central-motors' ? 1 : 0.35 + (seed % 40) / 100;

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
  const ordered = rows.slice(0, 7).reverse();
  const series = {
    labels,
    conversations: ordered.map((r) => r.conversations),
    aiHandled: ordered.map((r) => Math.round(r.conversations * 0.82)),
    whatsappMessages: ordered.map((r) => r.whatsappMessages),
    tokensUsed: ordered.map((r) => r.tokensUsed),
    satisfaction: ordered.map((r) => r.satisfaction),
  };

  const conversations7d = rows.reduce((s, r) => s + r.conversations, 0);
  const whatsapp7d = rows.reduce((s, r) => s + r.whatsappMessages, 0);
  const tokens7d = rows.reduce((s, r) => s + r.tokensUsed, 0);

  return {
    series,
    rows,
    summary: {
      conversations7d,
      whatsapp7d,
      tokens7d,
      avgSatisfaction: (rows.reduce((s, r) => s + r.satisfaction, 0) / rows.length).toFixed(1),
      aiResolutionRate: companyId === 'demo-central-motors' ? 87 : Math.round(72 + (seed % 20) * factor),
      avgResponseSec: companyId === 'demo-central-motors' ? 1.4 : Number((1.2 + (seed % 30) / 20).toFixed(1)),
      trends: {
        conversations: 12.4,
        whatsapp: 9.8,
        tokens: -3.2,
        satisfaction: 2.1,
        avgResponseSec: -0.2,
      },
    },
    isDemo: companyId === 'demo-central-motors',
  };
}
