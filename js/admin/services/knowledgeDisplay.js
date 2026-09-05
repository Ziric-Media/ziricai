/** B-MC-3 display helpers — no Firestore/browser imports (safe for Node verify scripts). */

export const PRIMARY_PILOT_KB_ID = 'rtb-kb-1';

const DOCUMENT_TYPES = new Set(['document', 'manual', 'guide', 'brochure']);
const FAQ_TYPES = new Set(['faq']);
const POLICY_TYPES = new Set(['policy']);

/** Map tenant API type → Knowledge Base sidebar section id. */
export function knowledgeTypeToSection(type) {
  const normalized = String(type || '').toLowerCase();
  if (FAQ_TYPES.has(normalized)) return 'faqs';
  if (DOCUMENT_TYPES.has(normalized)) return 'documents';
  if (POLICY_TYPES.has(normalized)) return 'policies';
  if (normalized === 'product') return 'products';
  if (normalized === 'service') return 'services';
  if (normalized === 'website') return 'website';
  if (normalized === 'price-list') return 'price-lists';
  return 'documents';
}

/** First sidebar section that has content — avoids empty Documents tab when only FAQs exist. */
export function resolveDefaultKnowledgeSection(items) {
  if (!items?.length) return 'documents';

  const counts = {};
  for (const item of items) {
    const section = knowledgeTypeToSection(item.type);
    counts[section] = (counts[section] || 0) + 1;
  }

  const priority = ['faqs', 'documents', 'policies', 'products', 'services', 'website', 'price-lists'];
  for (const section of priority) {
    if (counts[section] > 0) return section;
  }
  return 'documents';
}

export function normalizeKnowledgeTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (value._seconds != null) {
    return new Date(value._seconds * 1000 + (value._nanoseconds || 0) / 1e6).toISOString();
  }
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Normalize tenant API documents for Mission Control display — no invented metrics.
 */
export function enrichKnowledgeForDisplay(items) {
  return (items || []).map((item) => {
    const updatedAt = normalizeKnowledgeTimestamp(item.updatedAt || item.createdAt);
    const knowledgeBaseId = item.knowledgeBaseId || item.knowledgeBase || null;

    return {
      ...item,
      knowledgeBaseId,
      question: item.question || (item.type === 'faq' ? item.title : item.question) || '',
      answer: item.answer || item.content || '',
      lastTrained: item.lastTrained || updatedAt,
      uploadedBy: item.uploadedBy || item.createdBy || null,
      status: item.status || 'pending',
    };
  });
}

/** Stats from real tenant items — treats guide/brochure as documents. */
export function computeKnowledgeDisplayStats(items) {
  const list = items || [];
  const documents = list.filter((i) => DOCUMENT_TYPES.has(String(i.type || '').toLowerCase())).length;
  const faqs = list.filter((i) => FAQ_TYPES.has(String(i.type || '').toLowerCase())).length;
  const webPages = list.reduce((sum, i) => {
    if (i.type === 'website') return sum + (i.pagesScraped || 0);
    return sum;
  }, 0);
  const chunks = list.reduce((sum, i) => sum + (i.chunks || 0), 0);
  const trainedDates = list
    .map((i) => i.lastTrained)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  const lastTrainingDate = trainedDates.length ? new Date(Math.max(...trainedDates)).toISOString() : null;
  return { documents, faqs, webPages, chunks, lastTrainingDate };
}

/** Infer primary KB id from loaded items or company record. */
export function resolveKnowledgeBaseLabel({ items = [], company = null, apiKnowledgeBaseId = null } = {}) {
  if (apiKnowledgeBaseId && !apiKnowledgeBaseId.startsWith('kb-')) {
    return apiKnowledgeBaseId;
  }
  const fromItems = items.find((i) => i.knowledgeBaseId)?.knowledgeBaseId;
  if (fromItems && !String(fromItems).startsWith('kb-')) return fromItems;
  if (company?.knowledgeBaseId) return company.knowledgeBaseId;
  if (fromItems) return fromItems;
  return apiKnowledgeBaseId || null;
}

/**
 * Resolve authoritative tenant KB for reads/writes from company, agents, or existing docs.
 * Prefers explicit tenant KB ids (e.g. rtb-kb-1) over auto-generated kb-{companyId}.
 */
export function resolveAuthoritativeKnowledgeBaseId({
  company = null,
  agents = [],
  existingItems = [],
} = {}) {
  if (company?.knowledgeBaseId) return company.knowledgeBaseId;

  const defaultAgent = agents.find((a) => a.isDefault) || agents[0];
  if (defaultAgent?.knowledgeBaseId) return defaultAgent.knowledgeBaseId;

  const fromItems = existingItems.find((i) => i.knowledgeBaseId)?.knowledgeBaseId;
  if (fromItems) return fromItems;

  return null;
}
