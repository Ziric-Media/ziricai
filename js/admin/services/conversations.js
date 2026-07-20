import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { listDocuments, getDocument, updateDocument, db } from './firestore-base.js';
import {
  DEMO_INBOX_CONVERSATIONS,
  filterDemoInboxByCompany,
  getDemoInboxConversation,
} from '../demo-data.js';
import { fetchConversationsFromApi, fetchConversationMessagesFromApi } from '../api.js';
import { patchConversationOverride, getConversationOverride } from '../inbox-state.js';

const COLLECTION = 'conversations';

function nowTimeLabel() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function msgId(prefix = 'm') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeApiConversation(row) {
  return {
    id: row.id || row.phone,
    companyId: row.companyId || null,
    companyName: row.companyName || '',
    customerId: row.customerId || row.id,
    customerName: row.name || row.customerName || row.phone || 'Customer',
    phone: row.phone || row.id,
    channel: row.channel || 'whatsapp',
    status: row.status || 'in_progress',
    mode: row.mode || 'ai',
    unread: Boolean(row.unread),
    online: Boolean(row.online),
    lastSeenMinutes: row.lastSeenMinutes ?? null,
    preview: row.preview || row.lastMessage || '',
    lastMessage: row.lastMessage || '',
    time: row.time || '—',
    assignedTo: row.assignedTo || null,
    leadScore: row.leadScore ?? 50,
    lastOrder: row.lastOrder || '—',
    conversationCount: row.conversationCount ?? 1,
    lastPurchase: row.lastPurchase || '—',
    aiConfidence: row.aiConfidence ?? 85,
    knowledgeUsed: row.knowledgeUsed || 'Knowledge Base',
    suggestedReply: row.suggestedReply || '',
    tags: row.tags || [],
    notes: row.notes || '',
    messages: row.messages || [],
  };
}

function normalizeFirestoreMessage(doc) {
  const data = doc.data();
  const created = data.createdAt?.toDate?.();
  return {
    id: doc.id,
    role: data.role === 'assistant' ? 'ai' : data.role === 'user' ? 'customer' : data.role,
    message: data.message || data.text || data.content || '',
    time: created ? created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : nowTimeLabel(),
    senderName: data.senderName || null,
  };
}

export async function listConversations(companyId) {
  const apiRes = await fetchConversationsFromApi(companyId);
  if (apiRes.data?.items?.length) {
    return { items: apiRes.data.items.map(normalizeApiConversation), source: 'api' };
  }

  const fsRes = await listDocuments(COLLECTION, {
    companyId,
    orderByField: 'updatedAt',
  });
  if (fsRes.items?.length) {
    return { items: fsRes.items.map(normalizeApiConversation), source: 'firestore' };
  }

  const demo = filterDemoInboxByCompany(companyId);
  return { items: demo, source: 'demo', error: fsRes.error };
}

export async function getConversation(id) {
  const apiRes = await fetchConversationMessagesFromApi(id);
  if (apiRes.data?.conversation) {
    return { item: normalizeApiConversation(apiRes.data.conversation), source: 'api' };
  }

  const fsRes = await getDocument(COLLECTION, id);
  if (fsRes.item) {
    return { item: normalizeApiConversation(fsRes.item), source: 'firestore' };
  }

  const demo = getDemoInboxConversation(id);
  if (demo) return { item: { ...demo }, source: 'demo' };

  return { error: 'Conversation not found' };
}

export async function getMessages(conversationId) {
  const override = getConversationOverride(conversationId);
  if (override.messages?.length) {
    const seed = getDemoInboxConversation(conversationId);
    const base = seed?.messages || [];
    return { items: [...base, ...override.messages] };
  }

  const apiRes = await fetchConversationMessagesFromApi(conversationId);
  if (apiRes.data?.items?.length) {
    return {
      items: apiRes.data.items.map((m) => ({
        id: m.id || msgId(),
        role: m.role === 'assistant' ? 'ai' : m.role === 'user' ? 'customer' : m.role,
        message: m.message || m.content || m.text || '',
        time: m.time || nowTimeLabel(),
        senderName: m.senderName || null,
      })),
      source: 'api',
    };
  }

  try {
    const q = query(
      collection(db, 'customers', conversationId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    const snapshot = await getDocs(q);
    if (snapshot.size) {
      return { items: snapshot.docs.map(normalizeFirestoreMessage), source: 'firestore-customer' };
    }
  } catch (err) {
    /* fall through to demo */
  }

  try {
    const q = query(
      collection(db, COLLECTION, conversationId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    const snapshot = await getDocs(q);
    if (snapshot.size) {
      return { items: snapshot.docs.map(normalizeFirestoreMessage), source: 'firestore' };
    }
  } catch (err) {
    /* fall through */
  }

  const demo = getDemoInboxConversation(conversationId);
  return { items: demo?.messages || [], source: 'demo' };
}

export function generateAiReply(conversation, userText) {
  const text = (userText || '').toLowerCase();
  const companyId = conversation?.companyId || '';

  if (companyId === 'demo-econo-funerals' || /funeral|package|burial|memorial/.test(text)) {
    return {
      message:
        'We offer Basic (from R8,500), Standard (from R14,900), and Premium (from R24,500) packages. Each includes transport and a dedicated family liaison. Which level would you like details on?',
      knowledgeUsed: 'Econo Funerals Services',
      confidence: 88,
      suggestedReply:
        'I can email a full package comparison. May I have your email address, or would you prefer a call from our care team?',
    };
  }

  if (/hilux|toyota|corolla|vehicle|car|test drive/.test(text)) {
    return {
      message:
        'We have the Toyota Hilux 2.4 GD-6 Raider from R549,900 and the Corolla 1.8 XS from R329,900. Would you like to book a test drive or receive a finance quote?',
      knowledgeUsed: 'Vehicle Catalogue 2025',
      confidence: 97,
      suggestedReply:
        'I can reserve a Hilux test drive for you this week. What day works best — weekday or Saturday morning?',
    };
  }

  if (/finance|deposit|loan|credit|balloon/.test(text)) {
    return {
      message:
        'For new vehicles the minimum deposit is 10% (15% for pre-owned). Finance is subject to credit approval through WesBank, MFC, or Standard Bank. What is your approximate monthly budget?',
      knowledgeUsed: 'Finance Terms',
      confidence: 92,
      suggestedReply:
        'If you share your budget range, I can suggest suitable models and connect you with our finance consultant.',
    };
  }

  if (/guard|security|estate|patrol/.test(text)) {
    return {
      message:
        'We can deploy a guard within 4 hours in Gauteng. Emergency armed response averages 12 minutes. How many guards do you need and for which dates?',
      knowledgeUsed: 'Golden Cat Security FAQ',
      confidence: 85,
      suggestedReply:
        'Would you like a free site assessment before the weekend deployment?',
    };
  }

  return {
    message:
      conversation?.suggestedReply ||
      'Thank you for your message. Let me look that up in our knowledge base and get back to you with the best option.',
    knowledgeUsed: conversation?.knowledgeUsed || 'Knowledge Base',
    confidence: conversation?.aiConfidence ?? 85,
    suggestedReply:
      'Is there anything specific about our products or services I can clarify for you right now?',
  };
}

export async function sendMessage(conversationId, text, sender, meta = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { error: 'Message cannot be empty' };

  const message = {
    id: msgId(),
    role: sender === 'ai' ? 'ai' : sender === 'human' ? 'human' : 'customer',
    message: trimmed,
    time: nowTimeLabel(),
    ...(meta.senderName ? { senderName: meta.senderName } : {}),
  };

  const override = getConversationOverride(conversationId);
  const messages = [...(override.messages || []), message];

  patchConversationOverride(conversationId, {
    messages,
    lastMessage: trimmed,
    preview: trimmed.slice(0, 40) + (trimmed.length > 40 ? '...' : ''),
    time: 'Just now',
    unread: sender === 'customer',
  });

  try {
    await addDoc(collection(db, COLLECTION, conversationId, 'messages'), {
      role: message.role,
      message: trimmed,
      senderName: meta.senderName || null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    /* demo/local mode — ignore Firestore write failures */
  }

  return { message, success: true };
}

export async function setTakeoverMode(conversationId, mode) {
  const human = mode === 'human';
  patchConversationOverride(conversationId, {
    mode,
    status: human ? 'human_takeover' : 'in_progress',
    assignedTo: human ? (setTakeoverMode.assignedAgent || 'Agent') : null,
  });

  try {
    await updateDocument(COLLECTION, conversationId, {
      mode,
      status: human ? 'human_takeover' : 'in_progress',
    });
  } catch (err) {
    /* ignore */
  }

  return { success: true, mode };
}

export function setAssignedAgent(name) {
  setTakeoverMode.assignedAgent = name;
}

export async function saveNotes(conversationId, notes) {
  patchConversationOverride(conversationId, { notes });
  try {
    await updateDocument(COLLECTION, conversationId, { notes });
  } catch (err) {
    /* ignore */
  }
  return { success: true };
}

export async function saveTags(conversationId, tags) {
  patchConversationOverride(conversationId, { tags });
  try {
    await updateDocument(COLLECTION, conversationId, { tags });
  } catch (err) {
    /* ignore */
  }
  return { success: true };
}

export async function markConversationRead(conversationId) {
  patchConversationOverride(conversationId, { unread: false });
  return { success: true };
}

export async function regenerateSuggestedReply(conversationId, conversation) {
  const lastCustomer = [...(conversation.messages || [])]
    .reverse()
    .find((m) => m.role === 'customer');
  const ai = generateAiReply(conversation, lastCustomer?.message || conversation.lastMessage);
  patchConversationOverride(conversationId, {
    suggestedReply: ai.suggestedReply,
    aiConfidence: ai.confidence,
    knowledgeUsed: ai.knowledgeUsed,
  });
  return ai;
}
