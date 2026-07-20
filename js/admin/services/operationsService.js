/**
 * Operations Center service — API-first with demo fallback.
 * Ready for Firestore realtime subscriptions later.
 */
import { fetchHealth } from '../api.js';
import { DEMO_OPERATIONS } from '../demo-data.js';

const API_BASE = '';

async function request(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export async function getMetrics() {
  const data = await request('/api/operations/metrics');
  if (data?.metrics) {
    return {
      metrics: data.metrics,
      trends: data.trends || {},
      leaderboards: data.leaderboards || { agents: [], companies: [] },
      trendingQuestions: data.trendingQuestions || [],
      humanTakeovers: data.humanTakeovers || [],
      hourlyConversations: data.hourlyConversations || [],
      queue: data.queue || null,
      storage: data.storage || null,
      isDemo: Boolean(data.isDemo),
    };
  }
  return { ...DEMO_OPERATIONS, isDemo: true, source: 'demo-fallback' };
}

export async function getActivityFeed() {
  const data = await request('/api/operations/activity');
  if (data?.items?.length) {
    return { items: data.items, isDemo: Boolean(data.isDemo) };
  }
  return { items: DEMO_OPERATIONS.activityFeed, isDemo: true, source: 'demo-fallback' };
}

export async function getLeaderboards(metricsBundle) {
  const bundle = metricsBundle || (await getMetrics());
  return {
    agents: bundle.leaderboards?.agents || DEMO_OPERATIONS.agentLeaderboard,
    companies: bundle.leaderboards?.companies || DEMO_OPERATIONS.companyLeaderboard,
    trendingQuestions: bundle.trendingQuestions || DEMO_OPERATIONS.trendingQuestions,
    humanTakeovers: bundle.humanTakeovers || DEMO_OPERATIONS.humanTakeovers,
  };
}

export async function getSystemHealth() {
  const [healthRes, metricsData] = await Promise.all([
    fetchHealth(),
    request('/api/operations/metrics'),
  ]);

  const health = healthRes.data || {};
  const queue = health.queue || metricsData?.queue || { pending: 0, active: 0 };
  const storage = health.storage || metricsData?.storage || 'demo';

  let firebaseStatus = 'demo';
  if (storage === 'firestore') firebaseStatus = 'connected';
  else if (storage === 'memory') firebaseStatus = health.status === 'ok' ? 'demo' : 'offline';

  return {
    whatsapp: Boolean(health.whatsapp),
    openai: Boolean(health.openai),
    firebase: firebaseStatus,
    queue: {
      pending: queue.pending ?? 0,
      active: queue.active ?? 0,
      concurrency: queue.concurrency ?? 1,
    },
    timestamp: health.timestamp || new Date().toISOString(),
  };
}
