/**

 * Portal Data Hub — single snapshot for BOS Overview and shared widgets.

 * Aggregates tenant-scoped metrics without per-module duplicate storage calls.

 */

import { listTenantConversations } from '../tenants/conversationService.js';

import { listTenantCustomers, listLeads } from '../tenants/crmService.js';

import { listUpcomingAppointments } from '../tenants/appointmentService.js';

import { listTenantNotifications } from '../tenants/notificationService.js';

import { listAutomationRuns } from '../automation/automationEngine.js';

import {

  getPortalUsageAsync,

  getPortalQuickStats,

  getPortalActivity,

  PORTAL_DEMO_ACTIVITY,

} from './portalDemo.js';

import { getDashboardSnapshot } from '../analytics/dashboardService.js';

import { getWorkspaceSnapshot, getWorkspaceResourceCounts } from './workspaceService.js';

import { getCompany } from '../tenants/companyService.js';

import { isDemoTenant as isDemoTenantId } from '../core/dataMode.js';

const DEMO_COMPANY_ID = 'demo-central-motors';



function emptyMetrics() {

  return {

    conversationsToday: 0,

    appointmentsBooked: 0,

    appointmentsToday: 0,

    leadsCaptured: 0,

    revenueGenerated: 0,

    aiAccuracy: 0,

    responseTimeSec: 0,

    customerSatisfaction: 0,

    missedChats: 0,

    activeConversations: 0,

    customersTotal: 0,

    knowledgeItems: 0,

    inboxUnread: 0,

    automationRuns: 0,

    crmLeads: 0,

    trends: {},

  };

}



/** Seeded demo metrics — only for demo-central-motors tenant. */

function demoMetrics() {

  return {

    conversationsToday: 47,

    appointmentsBooked: 6,

    appointmentsToday: 2,

    leadsCaptured: 23,

    revenueGenerated: 48500,

    aiAccuracy: 87,

    responseTimeSec: 1.4,

    customerSatisfaction: 96,

    missedChats: 2,

    activeConversations: 8,

    customersTotal: 156,

    knowledgeItems: 14,

    inboxUnread: 3,

    automationRuns: 12,

    crmLeads: 23,

    trends: {

      conversations: 12.4,

      appointments: 8.2,

      leads: 15.2,

      revenue: 6.8,

      satisfaction: 2.1,

      responseTime: -0.2,

      aiResolutionRate: 3.1,

    },

  };

}



function countConversationsToday(conversations = []) {

  const today = new Date().toISOString().slice(0, 10);

  return conversations.filter((c) => {

    const ts = c.lastMessageAt || c.updatedAt || c.createdAt || c.time;

    if (!ts) return false;

    const iso = String(ts);

    if (iso.length >= 10) return iso.slice(0, 10) === today;

    return false;

  }).length;

}



function countActiveConversations(conversations = []) {

  return conversations.filter(

    (c) => c.status !== 'resolved' && c.status !== 'closed' && c.status !== 'archived'

  ).length;

}



function buildLiveMetrics({

  conversationsRaw,

  customers,

  leads,

  appointments,

  automationRuns,

  analyticsSnapshot,

  resourceCounts,

  quickStats,

  isDemoTenant,

}) {

  if (isDemoTenant) {

    const demo = demoMetrics();

    const kpis = analyticsSnapshot?.kpis || {};

    const summary = analyticsSnapshot?.summary || {};

    return {

      ...demo,

      conversationsToday: kpis.conversations || demo.conversationsToday,

      leadsCaptured: kpis.leads || demo.leadsCaptured,

      revenueGenerated: kpis.revenue || demo.revenueGenerated,

      customersTotal: customers.length || demo.customersTotal,

      knowledgeItems: resourceCounts?.knowledge ?? demo.knowledgeItems,

      trends: summary.trends || demo.trends,

    };

  }



  const today = new Date().toISOString().slice(0, 10);

  const base = emptyMetrics();

  const kpis = analyticsSnapshot?.kpis || {};

  const summary = analyticsSnapshot?.summary || {};

  const unreadFromInbox = (conversationsRaw || []).filter((c) => c.unread).length;

  const appointmentsToday = appointments.filter(

    (a) => a.scheduledAt?.slice(0, 10) === today && a.status === 'scheduled'

  ).length;



  const conversationsToday = countConversationsToday(conversationsRaw);

  const activeConversations = countActiveConversations(conversationsRaw);



  return {

    ...base,

    conversationsToday: kpis.conversations ?? conversationsToday,

    appointmentsBooked: kpis.appointments ?? appointments.length,

    appointmentsToday: kpis.appointmentsToday ?? appointmentsToday,

    leadsCaptured: kpis.leads ?? leads.length,

    revenueGenerated: kpis.revenue ?? 0,

    aiAccuracy: kpis.aiAccuracy ?? quickStats?.aiResolutionRate ?? 0,

    responseTimeSec: kpis.responseTimeSec ?? quickStats?.avgResponseSec ?? 0,

    customerSatisfaction: kpis.customerSatisfaction ?? 0,

    missedChats: kpis.missedOpportunities ?? 0,

    activeConversations: activeConversations || quickStats?.activeConversations || 0,

    customersTotal: customers.length || kpis.crmCustomers || resourceCounts?.crm || 0,

    knowledgeItems: resourceCounts?.knowledge ?? 0,

    inboxUnread: kpis.inboxUnread ?? unreadFromInbox,

    automationRuns: automationRuns.length,

    crmLeads: leads.length,

    trends: summary.trends || {},

  };

}



function mapConversationPreview(conv) {

  return {

    id: conv.id || conv.phone,

    customerName: conv.customerName || conv.name || conv.phone || 'Unknown',

    phone: conv.phone,

    preview: conv.lastMessage || conv.preview || '',

    status: conv.status || 'in_progress',

    channel: conv.channel || 'whatsapp',

    channelLabel: conv.channelLabel || conv.channel || 'whatsapp',

    channelColor: conv.channelColor || 'green',

    time: conv.time || conv.lastMessageAt || '—',

    unread: Boolean(conv.unread),

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

    'fa-building': 'green',

    'fa-calendar-check': 'green',

    'fa-store': 'purple',

  };

  return map[icon] || 'grey';

}



function mapNotificationToActivity(item) {

  return {

    id: item.id,

    actor: item.actor || 'System',

    action: item.title || item.type || 'updated',

    target: item.message || '',

    time: item.createdAt || item.time,

    ago: item.time || item.ago,

    icon: item.icon || 'fa-bell',

    color: activityColorForIcon(item.icon),

    text: item.text || `<strong>${item.title || 'System'}</strong> ${item.message || ''}`,

  };

}



const DEMO_HUB_CONVERSATIONS = [

  { id: 'conv-john-smith', customerName: 'John Smith', preview: 'Toyota Hilux enquiry — finance options?', status: 'in_progress', channel: 'whatsapp', channelLabel: 'WhatsApp', channelColor: 'green', time: '5m ago', unread: true },

  { id: 'conv-david-nkosi', customerName: 'David Nkosi', preview: 'Finance enquiry workflow in progress', status: 'waiting', channel: 'whatsapp', channelLabel: 'WhatsApp', channelColor: 'green', time: '18m ago', unread: false },

  { id: 'conv-james-k', customerName: 'James K.', preview: 'Started via Sarah (AI) — test drive request', status: 'in_progress', channel: 'facebook', channelLabel: 'Facebook', channelColor: 'blue', time: '1h ago', unread: true },

  { id: 'conv-sarah-vw', customerName: 'Sarah van Wyk', preview: 'Web chat — pricing question', status: 'resolved', channel: 'webchat', channelLabel: 'Web', channelColor: 'purple', time: '3h ago', unread: false },

];



/**

 * @param {string} companyId

 * @returns {Promise<object>}

 */

export async function getPortalHub(companyId) {

  const today = new Date().toISOString().slice(0, 10);



  const [

    usagePayload,

    conversationsRaw,

    analyticsSnapshot,

    workspace,

    companyRecord,

    customers,

    leads,

    appointments,

    automationRuns,

    notificationsRaw,

  ] = await Promise.all([

    getPortalUsageAsync(companyId),

    listTenantConversations(companyId, { limit: 50 }).catch(() => []),

    getDashboardSnapshot(companyId, { days: 7 }).catch(() => null),

    getWorkspaceSnapshot(companyId).catch(() => null),

    getCompany(companyId).catch(() => null),

    listTenantCustomers(companyId, { limit: 500 }).catch(() => []),

    listLeads(companyId).catch(() => []),

    listUpcomingAppointments(companyId).catch(() => []),

    listAutomationRuns(companyId, { limit: 10 }).catch(() => []),

    listTenantNotifications(companyId).catch(() => []),

  ]);



  const resourceCounts = workspace?.resources || (await getWorkspaceResourceCounts(companyId).catch(() => null));

  const isDemoTenantFlag = isDemoTenantId(companyId) && (usagePayload.isDemo ?? true);

  const isProvisioned = Boolean(companyRecord || workspace?.company);



  const quickStats = isDemoTenantFlag

    ? usagePayload.quickStats || getPortalQuickStats(companyId)

    : {

        aiResolutionRate: analyticsSnapshot?.kpis?.aiAccuracy ?? 0,

        avgResponseSec: analyticsSnapshot?.kpis?.responseTimeSec ?? 0,

        activeConversations: countActiveConversations(conversationsRaw),

      };



  const metrics = buildLiveMetrics({

    conversationsRaw,

    customers,

    leads,

    appointments,

    automationRuns,

    analyticsSnapshot,

    resourceCounts,

    quickStats,

    isDemoTenant: isDemoTenantFlag,

  });



  const notifications = notificationsRaw.length ? notificationsRaw : [];

  const unreadNotifications = notifications.filter((n) => !n.read).length;



  let recentActivity = [];

  if (isDemoTenantFlag) {

    const activitySource = getPortalActivity(companyId);

    recentActivity = (activitySource.length ? activitySource : PORTAL_DEMO_ACTIVITY)

      .slice(0, 8)

      .map((item) => ({

        ...item,

        color: activityColorForIcon(item.icon),

        text: `<strong>${item.actor}</strong> ${item.action} <em>${item.target}</em>`,

      }));

  } else if (notifications.length) {

    recentActivity = notifications.slice(0, 8).map(mapNotificationToActivity);

  } else if (automationRuns.length) {

    recentActivity = automationRuns.slice(0, 6).map((run) => ({

      id: run.id,

      actor: 'Automation',

      action: run.success ? 'ran workflow' : 'workflow failed',

      target: run.workflowName || run.workflowId || '',

      time: run.completedAt || run.startedAt,

      icon: 'fa-bolt',

      color: run.success ? 'green' : 'red',

      text: `<strong>Automation</strong> ${run.success ? 'ran' : 'failed'} <em>${run.workflowName || 'workflow'}</em>`,

    }));

  }



  const recentConversations = (conversationsRaw || [])

    .slice(0, 6)

    .map(mapConversationPreview);



  const conversations =

    recentConversations.length > 0

      ? recentConversations

      : isDemoTenantFlag

        ? DEMO_HUB_CONVERSATIONS

        : [];



  const appointmentsToday = appointments.filter(

    (a) => a.scheduledAt?.slice(0, 10) === today && a.status === 'scheduled'

  ).length;

  const unreadFromInbox = (conversationsRaw || []).filter((c) => c.unread).length;



  return {

    companyId,

    generatedAt: new Date().toISOString(),

    company: workspace?.company || companyRecord || null,

    workspace: workspace

      ? {

          departments: workspace.departments,

          teamCount: workspace.teamCount,

          resources: {

            ...workspace.resources,

            crm: customers.length || workspace.resources?.crm,

            leads: leads.length,

            appointments: appointments.length,

            automations: workspace.resources?.automations,

          },

          workspaceLinks: workspace.workspaceLinks,

          provisionedAt: workspace.provisionedAt,

        }

      : resourceCounts

        ? {

            teamCount: resourceCounts.team,

            resources: {

              ...resourceCounts,

              crm: customers.length || resourceCounts.crm,

              leads: leads.length,

            },

          }

        : null,

    metrics: {

      ...metrics,

      aiHandledPct: quickStats.aiResolutionRate ?? metrics.aiAccuracy,

      avgResponseSec: quickStats.avgResponseSec ?? metrics.responseTimeSec,

    },

    ops: {

      crm: { customers: customers.length, leads: leads.length },

      inbox: { total: conversationsRaw.length, unread: unreadFromInbox },

      appointments: { today: appointmentsToday, upcoming: appointments.length },

      automation: { recentRuns: automationRuns.length },

    },

    quickStats,

    usage: usagePayload.usage,

    chartSeries: usagePayload.chartSeries,

    recentConversations: conversations,

    recentActivity,

    notifications: {

      items: notifications.slice(0, 5),

      unreadCount: unreadNotifications,

    },

    isDemo: isDemoTenantFlag && !isProvisioned,

    isProvisioned,

    analytics: analyticsSnapshot

      ? {

          summary: analyticsSnapshot.summary,

          series: analyticsSnapshot.series,

          recentEvents: analyticsSnapshot.recentEvents,

          aiInsights: analyticsSnapshot.aiInsights,

        }

      : null,

  };

}



export { getWorkspaceSnapshot } from './workspaceService.js';


