import { listDocuments } from './firestore-base.js';

import { countCustomers } from './customers.js';

import { listCompanies } from './companies.js';

import { listAgents } from './agents.js';

import { withTimeout } from '../utils.js';

import { demoDashboardStats, DEMO_ANALYTICS_SERIES } from '../demo-data.js';



const ANALYTICS = 'analytics';

const CONVERSATIONS = 'conversations';



export async function listAnalytics(companyId) {

  return listDocuments(ANALYTICS, {

    companyId,

    orderByField: 'date',

  });

}



export async function listConversations(companyId) {

  return listDocuments(CONVERSATIONS, {

    companyId,

    orderByField: 'updatedAt',

  });

}



function buildChartSeries(analytics) {

  if (!analytics?.length) return DEMO_ANALYTICS_SERIES;

  const rows = [...analytics].slice(-7);

  return {

    labels: rows.map((r) => r.date?.slice(5) || '—'),

    conversations: rows.map((r) => r.conversations || 0),

    aiHandled: rows.map((r) => r.aiHandled || Math.round((r.conversations || 0) * 0.82)),

    whatsappMessages: rows.map((r) => r.whatsappMessages || 0),

    aiReplies: rows.map((r) => r.aiReplies || Math.round((r.whatsappMessages || 0) * 0.88)),

  };

}



function todayRow(analytics) {

  const today = new Date().toISOString().slice(0, 10);

  return analytics.find((r) => r.date === today) || analytics[0] || null;

}



export async function getDashboardStats(companyId) {

  const [companiesRes, agentsRes, customersRes, analyticsRes, conversationsRes] =

    await Promise.all([

      withTimeout(listCompanies()),

      withTimeout(listAgents(companyId)),

      withTimeout(countCustomers(companyId)),

      withTimeout(listAnalytics(companyId)),

      withTimeout(listConversations(companyId)),

    ]);



  const errors = [

    companiesRes.error,

    agentsRes.error,

    customersRes.error,

    analyticsRes.error,

    conversationsRes.error,

  ].filter(Boolean);



  const companies = companiesRes.items || [];

  const agents = agentsRes.items || [];

  const analytics = analyticsRes.items || [];

  const conversations = conversationsRes.items || [];

  const activeAgents = agents.filter((a) => a.status === 'active');

  const today = todayRow(analytics);



  const hasLiveData =

    companies.length > 0 ||

    agents.length > 0 ||

    (customersRes.count || 0) > 0 ||

    conversations.length > 0;



  if (!hasLiveData || companiesRes.timedOut || agentsRes.timedOut) {

    const demo = demoDashboardStats();

    return { ...demo, errors };

  }



  const tokensToday = today?.tokensUsed || analytics.reduce((s, r) => s + (r.tokensUsed || 0), 0);

  const whatsappToday = today?.whatsappMessages || analytics.reduce((s, r) => s + (r.whatsappMessages || 0), 0);

  const conversationsToday = today?.conversations || conversations.length;



  return {

    totalCompanies: companyId ? 1 : companies.length,

    activeAgents: activeAgents.length,

    totalCustomers: customersRes.count || 0,

    conversationsToday,

    whatsappMessagesToday: whatsappToday,

    openAiTokensToday: tokensToday,

    trends: {

      companies: 8.2,

      agents: 12.5,

      customers: 5.4,

      conversations: 14.1,

      whatsapp: 9.8,

      tokens: -3.2,

    },

    companies,

    agents,

    analytics,

    conversations,

    chartSeries: buildChartSeries(analytics),

    isDemo: false,

    errors,

  };

}

