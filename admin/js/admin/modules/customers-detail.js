import {
  escapeHtml,
  formatDate,
  showToast,
  loadingState,
} from '../ui.js';
import {
  sentimentDisplay,
  renderLeadScoreBreakdown,
  renderRecommendationCard,
  renderTimelineFeed,
  renderMessageThread,
} from './customers-ui.js';
import {
  getCustomerProfile,
  patchCustomer,
  getCustomerMessages,
  normalizeCustomerPhone,
} from '../services/customers.js';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'fa-gauge-high' },
  { id: 'conversation', label: 'Conversation History', icon: 'fa-comments' },
  { id: 'summary', label: 'AI Summary', icon: 'fa-wand-magic-sparkles' },
  { id: 'notes', label: 'Notes', icon: 'fa-note-sticky' },
  { id: 'tasks', label: 'Tasks', icon: 'fa-list-check' },
  { id: 'documents', label: 'Documents', icon: 'fa-file' },
  { id: 'orders', label: 'Orders', icon: 'fa-cart-shopping' },
  { id: 'timeline', label: 'Timeline', icon: 'fa-clock-rotate-left' },
  { id: 'analytics', label: 'Analytics', icon: 'fa-chart-line' },
];

export async function renderCustomerDetail(container, phone, { onBack } = {}) {
  container.innerHTML = loadingState('Loading customer profile...');
  const result = await getCustomerProfile(phone);
  if (result.error || !result.customer) {
    container.innerHTML = `<div class="empty-panel">${escapeHtml(result.error || 'Customer not found')}</div>`;
    return;
  }

  const customer = result.customer;
  let activeTab = 'overview';
  let messages = customer.messages || [];

  if (!messages.length) {
    const msgRes = await getCustomerMessages(customer.phone || customer.id);
    messages = msgRes.items || [];
  }

  const paint = () => {
    container.innerHTML = `
      <div class="crm-detail-page">
        <div class="crm-detail-top">
          <button type="button" class="btn btn-secondary btn-sm" id="crmBackBtn">
            <i class="fa-solid fa-arrow-left"></i> Back to Customers
          </button>
          <span class="crm-source-badge">${escapeHtml(result.source === 'api' ? 'Live API' : 'Demo data')}</span>
        </div>

        <div class="crm-header-card profile-card">
          <div class="crm-header-main">
            <div class="crm-header-avatar"><i class="fa-solid fa-user"></i></div>
            <div>
              <div class="crm-header-title">
                <h2>${escapeHtml(customer.name || 'Customer')}</h2>
                ${customer.online ? '<span class="presence online"><span class="dot"></span> Online</span>' : '<span class="presence offline">Offline</span>'}
              </div>
              <div class="crm-header-contact">${escapeHtml(customer.phoneDisplay || customer.phone || '—')}</div>
              <div class="crm-header-contact">${escapeHtml(customer.email || '—')}</div>
              <div class="crm-header-meta">Customer since: ${formatDate(customer.customerSince || customer.createdAt)}</div>
            </div>
          </div>
          <div class="crm-header-stats">
            <div><span>Lead Score</span><strong>${customer.leadScore ?? '—'}/100</strong></div>
            <div><span>Sentiment</span><strong>${sentimentDisplay(customer)}</strong></div>
            <div><span>AI Confidence</span><strong>${customer.aiConfidence ?? '—'}%</strong></div>
            <div><span>Assigned AI Employee</span><strong>${escapeHtml(customer.assignedAiEmployee || '—')}</strong></div>
            <div><span>Assigned Human Agent</span><strong>${escapeHtml(customer.assignedHumanAgent || customer.assignedEmployee || 'Unassigned')}</strong></div>
          </div>
        </div>

        <div class="crm-tabs" id="crmTabs">
          ${TABS.map(
            (t) => `
            <button type="button" class="crm-tab ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
              <i class="fa-solid ${t.icon}"></i> ${escapeHtml(t.label)}
            </button>`
          ).join('')}
        </div>

        <div class="crm-tab-panel" id="crmTabPanel">${renderTabContent(activeTab, customer, messages)}</div>
      </div>
    `;

    bindDetailEvents(container, customer, messages, paint, onBack);
  };

  paint();
}

function renderTabContent(tab, customer, messages) {
  switch (tab) {
    case 'overview':
      return `
        <div class="crm-overview-grid">
          ${renderRecommendationCard(customer.recommendedAction)}
          <div class="profile-card">
            <h3><i class="fa-solid fa-bolt"></i> Key Metrics</h3>
            <dl class="profile-dl">
              <dt>Messages</dt><dd>${customer.analytics?.messages ?? customer.totalMessages ?? '—'}</dd>
              <dt>Conversations</dt><dd>${customer.totalConversations ?? '—'}</dd>
              <dt>Top Topic</dt><dd>${escapeHtml(customer.analytics?.topTopic || '—')}</dd>
              <dt>Company</dt><dd>${escapeHtml(customer.companyName || '—')}</dd>
              <dt>Tags</dt><dd>${(customer.tags || []).map((t) => `<span class="tag-chip active">${escapeHtml(t)}</span>`).join(' ') || '—'}</dd>
            </dl>
            ${customer.interests ? `
              <h4 style="margin-top:16px;">Interests</h4>
              <dl class="profile-dl">
                ${Object.entries(customer.interests).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}
              </dl>` : ''}
          </div>
          ${renderLeadScoreBreakdown(customer.leadScoreBreakdown, customer.leadScore)}
          <div class="profile-card">
            <h3><i class="fa-solid fa-clock"></i> Recent Activity</h3>
            ${renderTimelineFeed((customer.timeline || []).slice(0, 3))}
          </div>
        </div>`;

    case 'conversation':
      return `
        <div class="profile-card">
          <div class="crm-tab-actions">
            <a href="#" class="btn btn-secondary btn-sm" id="openInInboxBtn"><i class="fa-solid fa-inbox"></i> Open in Live Conversations</a>
          </div>
          ${renderMessageThread(messages)}
        </div>`;

    case 'summary':
      return `
        <div class="profile-card">
          <h3><i class="fa-solid fa-wand-magic-sparkles"></i> Living AI Summary</h3>
          <p class="panel-hint">Auto-updated from WhatsApp conversations. Editable for internal corrections.</p>
          <textarea id="crmAiSummary" rows="8" class="crm-summary-text">${escapeHtml(customer.aiSummary || '')}</textarea>
          <button type="button" class="btn btn-primary btn-sm" id="saveSummaryBtn">Save Summary</button>
        </div>`;

    case 'notes':
      return `
        <div class="profile-card">
          <h3><i class="fa-solid fa-note-sticky"></i> Private Notes</h3>
          <p class="panel-hint">Invisible to customer</p>
          <div id="crmNotesList">${renderNotesList(customer.notesList)}</div>
          <div class="crm-add-form">
            <textarea id="newNoteText" rows="2" placeholder="Add a private note..."></textarea>
            <button type="button" class="btn btn-primary btn-sm" id="addNoteBtn">Add Note</button>
          </div>
        </div>`;

    case 'tasks':
      return `
        <div class="profile-card">
          <h3><i class="fa-solid fa-list-check"></i> Tasks</h3>
          <div id="crmTasksList">${renderTasksList(customer.tasks)}</div>
          <div class="crm-add-form crm-task-form">
            <input type="text" id="newTaskTitle" placeholder="Task title (e.g. Call customer)" />
            <input type="date" id="newTaskDeadline" />
            <select id="newTaskPriority">
              <option value="high">High</option>
              <option value="medium" selected>Medium</option>
              <option value="low">Low</option>
            </select>
            <input type="text" id="newTaskAssignee" placeholder="Assigned to" value="Unassigned" />
            <button type="button" class="btn btn-primary btn-sm" id="addTaskBtn">Add Task</button>
          </div>
        </div>`;

    case 'documents':
      return `
        <div class="profile-card">
          <h3><i class="fa-solid fa-file"></i> Documents</h3>
          <p class="panel-hint">Attached files (placeholder UI)</p>
          <div class="crm-doc-list">
            ${(customer.documents || []).length
              ? customer.documents.map((d) => `
                <div class="crm-doc-item"><i class="fa-solid fa-file"></i> ${escapeHtml(d.name)} <span>${formatDate(d.uploadedAt)}</span></div>`).join('')
              : '<div class="attachment-placeholder"><i class="fa-solid fa-cloud-arrow-up"></i> Upload coming soon</div>'}
          </div>
        </div>`;

    case 'orders':
      return `
        <div class="profile-card">
          <h3><i class="fa-solid fa-cart-shopping"></i> Order History</h3>
          <table class="org-table">
            <thead><tr><th>Order</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              ${(customer.orders || [{ label: 'No orders yet', status: '—', amount: '—', date: null }])
                .map((o) => `<tr><td>${escapeHtml(o.label)}</td><td>${escapeHtml(o.status || '—')}</td><td>${o.amount ? `R${Number(o.amount).toLocaleString()}` : '—'}</td><td>${formatDate(o.date)}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        </div>`;

    case 'timeline':
      return `<div class="profile-card">${renderTimelineFeed(customer.timeline || [])}</div>`;

    case 'analytics':
      return `
        <div class="crm-analytics-grid">
          <div class="kpi-card blue"><div class="kpi-label">Messages</div><div class="kpi-value">${customer.analytics?.messages ?? '—'}</div></div>
          <div class="kpi-card purple"><div class="kpi-label">AI Replies</div><div class="kpi-value">${customer.analytics?.aiReplies ?? '—'}</div></div>
          <div class="kpi-card green"><div class="kpi-label">Human Replies</div><div class="kpi-value">${customer.analytics?.humanReplies ?? '—'}</div></div>
          <div class="kpi-card orange"><div class="kpi-label">Avg Response Time</div><div class="kpi-value">${customer.analytics?.avgResponseTimeMs ? `${Math.round(customer.analytics.avgResponseTimeMs / 1000)}s` : '—'}</div></div>
          <div class="profile-card">
            <dl class="profile-dl">
              <dt>Last Seen</dt><dd>${formatDate(customer.analytics?.lastSeen || customer.lastSeen)}</dd>
              <dt>Top Topic</dt><dd>${escapeHtml(customer.analytics?.topTopic || '—')}</dd>
              <dt>Lifetime Value</dt><dd>${customer.analytics?.ltv ? `R${Number(customer.analytics.ltv).toLocaleString()}` : customer.lifetimeValue ? `R${Number(customer.lifetimeValue).toLocaleString()}` : '—'}</dd>
              <dt>Purchase Probability</dt><dd>${customer.analytics?.purchaseProbability ?? '—'}%</dd>
            </dl>
          </div>
          ${renderLeadScoreBreakdown(customer.leadScoreBreakdown, customer.leadScore)}
        </div>`;

    default:
      return '<div class="empty-panel">Tab not found.</div>';
  }
}

function renderNotesList(notes = []) {
  if (!notes.length) return '<div class="empty-panel">No notes yet.</div>';
  return notes
    .map(
      (n) => `
    <div class="crm-note-item" data-id="${escapeHtml(n.id)}">
      <div class="crm-note-text">${escapeHtml(n.text)}</div>
      <div class="crm-note-meta">${escapeHtml(n.author)} · ${formatDate(n.createdAt)}
        <button type="button" class="btn btn-secondary btn-sm crm-delete-note" data-id="${escapeHtml(n.id)}">Delete</button>
      </div>
    </div>`
    )
    .join('');
}

function renderTasksList(tasks = []) {
  if (!tasks.length) return '<div class="empty-panel">No tasks yet.</div>';
  return tasks
    .map(
      (t) => `
    <div class="crm-task-item ${t.done ? 'done' : ''}" data-id="${escapeHtml(t.id)}">
      <label><input type="checkbox" class="crm-task-check" data-id="${escapeHtml(t.id)}" ${t.done ? 'checked' : ''} /> ${escapeHtml(t.title)}</label>
      <div class="crm-task-meta">
        <span class="priority ${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
        · ${escapeHtml(t.assignedTo || 'Unassigned')}
        · Due ${formatDate(t.deadline)}
      </div>
    </div>`
    )
    .join('');
}

function bindDetailEvents(container, customer, messages, repaint, onBack) {
  const phone = normalizeCustomerPhone(customer.phone || customer.id);

  container.querySelector('#crmBackBtn')?.addEventListener('click', () => onBack?.());

  container.querySelectorAll('.crm-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.crm-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      container.querySelector('#crmTabPanel').innerHTML = renderTabContent(tab, customer, messages);
      bindTabSpecificEvents(container, customer, messages, phone, repaint);
    });
  });

  bindTabSpecificEvents(container, customer, messages, phone, repaint);
}

function bindTabSpecificEvents(container, customer, messages, phone, repaint) {
  container.querySelector('#openInInboxBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    import('../router.js').then(({ navigateTo }) => {
      import('../state.js').then(({ setState }) => {
        setState({ selectedCustomerPhone: phone });
        navigateTo('conversations');
      });
    });
  });

  container.querySelector('#saveSummaryBtn')?.addEventListener('click', async () => {
    const aiSummary = container.querySelector('#crmAiSummary')?.value || '';
    const res = await patchCustomer(phone, { aiSummary });
    if (res.customer) {
      Object.assign(customer, res.customer);
      showToast('AI summary saved', 'success');
    }
  });

  container.querySelector('#addNoteBtn')?.addEventListener('click', async () => {
    const text = container.querySelector('#newNoteText')?.value?.trim();
    if (!text) return;
    const res = await patchCustomer(phone, { note: { text, author: 'Admin' } });
    if (res.customer) {
      customer.notesList = res.customer.notesList;
      container.querySelector('#crmNotesList').innerHTML = renderNotesList(customer.notesList);
      container.querySelector('#newNoteText').value = '';
      showToast('Note added', 'success');
    }
  });

  container.querySelectorAll('.crm-delete-note').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await patchCustomer(phone, { deleteNoteId: btn.dataset.id });
      if (res.customer) {
        customer.notesList = res.customer.notesList;
        container.querySelector('#crmNotesList').innerHTML = renderNotesList(customer.notesList);
        showToast('Note deleted', 'success');
      }
    });
  });

  container.querySelector('#addTaskBtn')?.addEventListener('click', async () => {
    const title = container.querySelector('#newTaskTitle')?.value?.trim();
    if (!title) return;
    const deadline = container.querySelector('#newTaskDeadline')?.value;
    const priority = container.querySelector('#newTaskPriority')?.value;
    const assignedTo = container.querySelector('#newTaskAssignee')?.value?.trim() || 'Unassigned';
    const res = await patchCustomer(phone, {
      task: {
        title,
        deadline: deadline ? `${deadline}T17:00:00.000Z` : null,
        priority,
        assignedTo,
      },
    });
    if (res.customer) {
      customer.tasks = res.customer.tasks;
      container.querySelector('#crmTasksList').innerHTML = renderTasksList(customer.tasks);
      container.querySelector('#newTaskTitle').value = '';
      showToast('Task added', 'success');
    }
  });

  container.querySelectorAll('.crm-task-check').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const task = (customer.tasks || []).find((t) => t.id === chk.dataset.id);
      if (!task) return;
      const res = await patchCustomer(phone, { updateTask: { id: task.id, done: chk.checked } });
      if (res.customer) {
        customer.tasks = res.customer.tasks;
        container.querySelector('#crmTasksList').innerHTML = renderTasksList(customer.tasks);
      }
    });
  });
}

export function openCustomerDetail(container, phone, onBack) {
  return renderCustomerDetail(container, phone, { onBack });
}
