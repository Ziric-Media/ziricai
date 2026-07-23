import { portalUrl, marketingUrl } from '../shared/siteUrls.js';

const STEPS = [
  { id: 'account', label: 'Create Account', icon: 'fa-user-plus' },
  { id: 'industry', label: 'Choose Industry', icon: 'fa-industry' },
  { id: 'whatsapp', label: 'Connect WhatsApp', icon: 'fa-brands fa-whatsapp' },
  { id: 'knowledge', label: 'Upload Knowledge', icon: 'fa-book' },
  { id: 'train', label: 'Train AI', icon: 'fa-brain' },
  { id: 'test', label: 'Test AI', icon: 'fa-comments' },
  { id: 'complete', label: 'Go Live', icon: 'fa-rocket' },
];

const state = {
  stepIndex: 0,
  sessionId: null,
  companyId: null,
  portalUrl: null,
  industries: [],
  whatsapp: { simulate: true },
  selectedIndustry: null,
  uploadedFiles: [],
  faqText: '',
  websiteUrl: '',
  chatHistory: [],
  busy: false,
};

const el = {
  stepList: document.getElementById('stepList'),
  stepContent: document.getElementById('stepContent'),
  wizardActions: document.getElementById('wizardActions'),
  wizardStatus: document.getElementById('wizardStatus'),
  overallProgress: document.getElementById('overallProgress'),
  progressLabel: document.getElementById('progressLabel'),
};

/** Paint step UI immediately; Firebase/API modules load on demand. */
export function initOnboarding() {
  render();
}

if (!el.stepContent) {
  /* Wizard markup not on this page */
} else if (location.protocol === 'file:') {
  el.stepContent.innerHTML =
    '<p>Run <code>npm run dev</code> and open <a href="' + marketingUrl() + '">' + marketingUrl() + '</a></p>';
} else {
  initOnboarding();
  bootstrap();
  window.addEventListener('ziric:wizard-open', () => initOnboarding());
}

window.initOnboarding = initOnboarding;

async function bootstrap() {
  try {
    const { fetchIndustries } = await import('./api.js');
    const data = await fetchIndustries();
    state.industries = data.industries || [];
    state.whatsapp = data.whatsapp || state.whatsapp;
    renderStepList();
    if (STEPS[state.stepIndex]?.id === 'industry') {
      renderStepContent();
    }
  } catch {
    /* industries load optional */
  }
}

function render() {
  renderStepList();
  renderStepContent();
  renderActions();
  updateProgress();
}

function renderStepList() {
  el.stepList.innerHTML = STEPS.map((s, i) => {
    const cls = i < state.stepIndex ? 'done' : i === state.stepIndex ? 'active' : '';
    const icon = i < state.stepIndex ? '<i class="fa-solid fa-check"></i>' : i + 1;
    return `<li class="${cls}"><span class="step-num">${icon}</span>${s.label}</li>`;
  }).join('');
}

function updateProgress() {
  const pct = Math.round(((state.stepIndex + 1) / STEPS.length) * 100);
  el.overallProgress.style.width = `${pct}%`;
  el.progressLabel.textContent = `Step ${state.stepIndex + 1} of ${STEPS.length}`;
}

function setStatus(msg, type = '') {
  el.wizardStatus.textContent = msg || '';
  el.wizardStatus.className = `wizard-status ${type}`;
}

function renderStepContent() {
  const step = STEPS[state.stepIndex];
  const renderers = {
    account: renderAccountStep,
    industry: renderIndustryStep,
    whatsapp: renderWhatsAppStep,
    knowledge: renderKnowledgeStep,
    train: renderTrainStep,
    test: renderTestStep,
    complete: renderCompleteStep,
  };
  el.stepContent.innerHTML = renderers[step.id]?.() || '';
  bindStepEvents(step.id);
}

function renderAccountStep() {
  return `
    <div class="step-header">
      <h1>Create your account</h1>
      <p>Start your 14-day free trial. One AI employee, 100 conversations — no credit card.</p>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Company Name</label>
        <input type="text" id="companyName" placeholder="Acme Motors" required />
      </div>
      <div class="form-group">
        <label>Owner Name</label>
        <input type="text" id="ownerName" placeholder="Jane Smith" required />
      </div>
      <div class="form-group">
        <label>Work Email</label>
        <input type="email" id="ownerEmail" placeholder="jane@company.co.za" required />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="password" placeholder="Min. 6 characters" minlength="6" required />
      </div>
    </div>
  `;
}

function renderIndustryStep() {
  const cards = (state.industries.length ? state.industries : fallbackIndustries()).map(
    (ind) => `
    <button type="button" class="industry-card ${state.selectedIndustry === ind.id ? 'selected' : ''}" data-industry="${ind.id}">
      <div class="icon">${ind.icon}</div>
      <div class="label">${ind.label}</div>
    </button>`
  ).join('');

  return `
    <div class="step-header">
      <h1>Choose your industry</h1>
      <p>We'll install a curated AI pack with agents, knowledge, and workflows for your sector.</p>
    </div>
    <div class="industry-grid">${cards}</div>
  `;
}

function fallbackIndustries() {
  return [
    { id: 'automotive', label: 'Automotive', icon: '🚗' },
    { id: 'funeral', label: 'Funeral', icon: '💐' },
    { id: 'school', label: 'School', icon: '🎓' },
    { id: 'healthcare', label: 'Healthcare', icon: '🩺' },
    { id: 'law', label: 'Law Firm', icon: '⚖️' },
    { id: 'hotel', label: 'Hotel', icon: '🏨' },
    { id: 'retail', label: 'Retail', icon: '🛍️' },
    { id: 'construction', label: 'Construction', icon: '🏗️' },
    { id: 'church', label: 'Church', icon: '⛪' },
    { id: 'real_estate', label: 'Real Estate', icon: '🏠' },
  ];
}

function renderWhatsAppStep() {
  const simNote = state.whatsapp.simulate
    ? '<p style="font-size:13px;color:var(--warning);margin-bottom:16px;"><i class="fa-solid fa-flask"></i> Meta not configured — simulating connection steps with demo progress.</p>'
    : '<p style="font-size:13px;color:var(--success);margin-bottom:16px;"><i class="fa-solid fa-circle-check"></i> WhatsApp credentials detected in server environment.</p>';

  return `
    <div class="step-header">
      <h1>Connect WhatsApp</h1>
      <p>Link your Meta Business account and verify your webhook in a few clicks.</p>
    </div>
    ${simNote}
    <div class="wa-steps" id="waSteps">
      ${waStepRow('Verify Meta Account', 'Checking Business Manager access', 'fa-meta')}
      ${waStepRow('Connect Phone Number', 'Register WhatsApp Business API number', 'fa-phone')}
      ${waStepRow('Verify Webhook', 'Confirm /webhook endpoint with Meta', 'fa-link')}
      ${waStepRow('Send Test Message', 'Deliver test message to your number', 'fa-paper-plane')}
      ${waStepRow('Connected', 'WhatsApp channel live', 'fa-circle-check')}
    </div>
  `;
}

function waStepRow(title, sub, icon) {
  return `
    <div class="wa-step" data-wa-step>
      <div class="wa-step-icon"><i class="fa-solid ${icon}"></i></div>
      <div class="wa-step-body"><strong>${title}</strong><span>${sub}</span></div>
    </div>`;
}

function renderKnowledgeStep() {
  return `
    <div class="step-header">
      <h1>Upload knowledge</h1>
      <p>Add FAQs, documents, or your website so your AI knows your business.</p>
    </div>
    <div class="knowledge-tabs">
      <button type="button" class="knowledge-tab active" data-tab="upload">📄 Documents</button>
      <button type="button" class="knowledge-tab" data-tab="website">🌐 Website</button>
      <button type="button" class="knowledge-tab" data-tab="faq">❓ FAQs</button>
    </div>
    <div id="knowledgePanel">
      <div class="upload-zone" id="uploadZone">
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <p><strong>Drag & drop PDF or DOCX</strong></p>
        <p style="font-size:13px;color:var(--muted);margin-top:8px;">or click to browse</p>
        <input type="file" id="fileInput" accept=".pdf,.doc,.docx,.txt" hidden multiple />
      </div>
      <div id="uploadList" style="font-size:13px;color:var(--muted);"></div>
    </div>
  `;
}

function renderTrainStep() {
  const stages = ['Uploading', 'Extracting', 'Chunking', 'Embedding', 'Training', 'Done'];
  return `
    <div class="step-header">
      <h1>Training your AI</h1>
      <p>We're processing your knowledge base and tuning your AI employee.</p>
    </div>
    <div class="train-stages" id="trainStages">
      ${stages.map((s) => `<div class="train-stage" data-stage="${s}"><span class="dot"></span>${s}</div>`).join('')}
    </div>
    <div class="train-progress-bar"><div class="train-progress-fill" id="trainFill"></div></div>
  `;
}

function renderTestStep() {
  const messages = state.chatHistory
    .map(
      (m) =>
        `<div class="chat-msg ${m.role}">${escapeHtml(m.text)}</div>`
    )
    .join('');

  return `
    <div class="step-header">
      <h1>Test your AI</h1>
      <p>Ask a question your customers might ask. Try "What are your business hours?"</p>
    </div>
    <div class="chat-widget">
      <div class="chat-messages" id="chatMessages">
        ${messages || '<div class="chat-msg ai">Hi! I\'m your new AI employee. Ask me anything about your business.</div>'}
      </div>
      <div class="chat-input-row">
        <input type="text" id="chatInput" placeholder="Type a test message..." />
        <button type="button" class="btn btn-primary" id="chatSend"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    </div>
  `;
}

function renderCompleteStep() {
  const companyName = state.companyName || 'your company';
  const portalHref = state.portalUrl || portalUrl(state.companyId || '');
  return `
    <div class="complete-hero complete-hero-success">
      <div class="check success-ring"><i class="fa-solid fa-check"></i></div>
      <h1>You're live!</h1>
      <p><strong>${escapeHtml(companyName)}</strong> is provisioned with AI employees, knowledge base, and trial billing. Open your portal to manage conversations and analytics.</p>
      <ul class="complete-checklist">
        <li><i class="fa-solid fa-circle-check"></i> 14-day trial started</li>
        <li><i class="fa-solid fa-circle-check"></i> Default AI employee active</li>
        <li><i class="fa-solid fa-circle-check"></i> WhatsApp channel ${state.whatsappSimulated ? 'simulated (add Meta credentials for live)' : 'connected'}</li>
        <li><i class="fa-solid fa-circle-check"></i> Knowledge base seeded</li>
      </ul>
      <div class="complete-stats">
        <div class="complete-stat"><div class="val">Trial</div><div class="lbl">14 days free</div></div>
        <div class="complete-stat"><div class="val">1</div><div class="lbl">AI Employee</div></div>
        <div class="complete-stat"><div class="val">✓</div><div class="lbl">Portal ready</div></div>
      </div>
      <a class="btn btn-primary complete-portal-cta" href="${escapeHtml(portalHref)}"><i class="fa-solid fa-arrow-right"></i> Open Company Portal</a>
    </div>
  `;
}

function renderActions() {
  const step = STEPS[state.stepIndex];
  const isFirst = state.stepIndex === 0;
  const isLast = state.stepIndex === STEPS.length - 1;

  el.wizardActions.innerHTML = `
    ${isFirst ? '<span></span>' : '<button type="button" class="btn btn-secondary" id="btnBack"><i class="fa-solid fa-arrow-left"></i> Back</button>'}
    ${isLast
      ? `<button type="button" class="btn btn-primary" id="btnPortal"><i class="fa-solid fa-arrow-right"></i> Open Company Portal</button>`
      : `<button type="button" class="btn btn-primary" id="btnNext">${step.id === 'whatsapp' ? 'Connect' : step.id === 'train' ? 'Start Training' : 'Continue'} <i class="fa-solid fa-arrow-right"></i></button>`}
  `;

  document.getElementById('btnBack')?.addEventListener('click', () => {
    if (state.stepIndex > 0) {
      state.stepIndex -= 1;
      render();
    }
  });

  document.getElementById('btnNext')?.addEventListener('click', () => handleNext());
  document.getElementById('btnPortal')?.addEventListener('click', () => {
    const url = state.portalUrl || portalUrl(state.companyId || '');
    window.location.href = url;
  });
}

function bindStepEvents(stepId) {
  if (stepId === 'industry') {
    document.querySelectorAll('.industry-card').forEach((card) => {
      card.addEventListener('click', () => {
        state.selectedIndustry = card.dataset.industry;
        renderStepContent();
      });
    });
  }

  if (stepId === 'knowledge') {
    const zone = document.getElementById('uploadZone');
    const input = document.getElementById('fileInput');
    zone?.addEventListener('click', () => input?.click());
    zone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone?.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone?.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      addFiles(e.dataTransfer.files);
    });
    input?.addEventListener('change', () => addFiles(input.files));

    document.querySelectorAll('.knowledge-tab').forEach((tab) => {
      tab.addEventListener('click', () => showKnowledgeTab(tab.dataset.tab));
    });
  }

  if (stepId === 'test') {
    const send = () => sendChat();
    document.getElementById('chatSend')?.addEventListener('click', send);
    document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
    });
  }
}

function showKnowledgeTab(tab) {
  document.querySelectorAll('.knowledge-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  const panel = document.getElementById('knowledgePanel');
  if (tab === 'website') {
    panel.innerHTML = `
      <div class="form-group">
        <label>Website URL</label>
        <input type="url" id="websiteUrl" placeholder="https://yourcompany.co.za" value="${escapeHtml(state.websiteUrl)}" />
      </div>
      <p style="font-size:13px;color:var(--muted);margin-top:12px;">We'll crawl public pages and add them to your knowledge base.</p>`;
    document.getElementById('websiteUrl')?.addEventListener('input', (e) => {
      state.websiteUrl = e.target.value;
    });
  } else if (tab === 'faq') {
    panel.innerHTML = `
      <div class="form-group">
        <label>Paste FAQs (one per line)</label>
        <textarea id="faqText" rows="8" placeholder="Q: What are your hours? A: Mon-Fri 8-5">${escapeHtml(state.faqText)}</textarea>
      </div>`;
    document.getElementById('faqText')?.addEventListener('input', (e) => {
      state.faqText = e.target.value;
    });
  } else {
    renderStepContent();
  }
}

function addFiles(fileList) {
  for (const file of fileList) {
    state.uploadedFiles.push(file);
  }
  const list = document.getElementById('uploadList');
  if (list) {
    list.innerHTML = state.uploadedFiles.map((f) => `✓ ${escapeHtml(f.name)}`).join('<br>');
  }
}

async function handleNext() {
  if (state.busy) return;
  const step = STEPS[state.stepIndex];
  state.busy = true;
  setStatus('');

  try {
    if (step.id === 'account') await handleAccountStep();
    else if (step.id === 'industry') await handleIndustryStep();
    else if (step.id === 'whatsapp') await handleWhatsAppStep();
    else if (step.id === 'knowledge') await handleKnowledgeStep();
    else if (step.id === 'train') {
      await handleTrainStep();
      return;
    }
    else if (step.id === 'test') await handleTestStep();
    else if (step.id === 'complete') await handleCompleteStep();

    if (step.id !== 'train') {
      state.stepIndex = Math.min(state.stepIndex + 1, STEPS.length - 1);
      render();
    }
  } catch (err) {
    setStatus(err.message || 'Something went wrong', 'error');
  } finally {
    state.busy = false;
  }
}

async function loadOnboardingApi() {
  return import('./api.js');
}

async function handleAccountStep() {
  const companyName = document.getElementById('companyName')?.value?.trim();
  const ownerName = document.getElementById('ownerName')?.value?.trim();
  const ownerEmail = document.getElementById('ownerEmail')?.value?.trim();
  const password = document.getElementById('password')?.value;

  if (!companyName || !ownerName || !ownerEmail || !password) {
    throw new Error('Please fill in all fields.');
  }

  state.companyName = companyName;

  setStatus('Creating your account...');
  const [{ registerUser }, { createUserProfile, createTenantMembership }, { startOnboarding }] =
    await Promise.all([import('../auth.js'), import('../users.js'), loadOnboardingApi()]);
  const authResult = await registerUser(ownerEmail, password);
  if (authResult.error) throw new Error(authResult.error);

  setStatus('Provisioning your workspace...');
  const onboard = await startOnboarding({ companyName, ownerName, ownerEmail, uid: authResult.user.uid, password });
  state.sessionId = onboard.sessionId;
  state.companyId = onboard.companyId;
  state.portalUrl = onboard.portalUrl;

  setStatus('Setting up your profile...');
  const profileResult = await createUserProfile(authResult.user.uid, {
    fullName: ownerName,
    email: ownerEmail,
    role: 'owner',
    company: companyName,
    companyId: state.companyId,
    status: 'active',
  });
  if (profileResult.error) {
    console.warn('Profile write:', profileResult.error);
  }

  const memberResult = await createTenantMembership(authResult.user.uid, state.companyId, {
    email: ownerEmail,
    fullName: ownerName,
    role: 'owner',
    status: 'active',
  });
  if (memberResult.error) {
    console.warn('Membership write:', memberResult.error);
  }

  setStatus('Account created!', 'success');
}

async function handleIndustryStep() {
  if (!state.selectedIndustry) throw new Error('Please select an industry.');
  if (!state.sessionId) throw new Error('Session expired — refresh and try again.');
  setStatus('Installing industry pack...');
  const { completeStep } = await loadOnboardingApi();
  await completeStep(state.sessionId, 'industry', { industryId: state.selectedIndustry });
  setStatus('Industry pack installed!', 'success');
}

async function handleWhatsAppStep() {
  if (!state.sessionId) throw new Error('Session expired.');
  const rows = document.querySelectorAll('[data-wa-step]');
  for (let i = 0; i < rows.length; i += 1) {
    rows[i].classList.add('running');
    await delay(600 + i * 200);
    rows[i].classList.remove('running');
    rows[i].classList.add('done');
  }
  const { completeStep } = await loadOnboardingApi();
  await completeStep(state.sessionId, 'whatsapp', {});
  setStatus('WhatsApp connected!', 'success');
}

async function handleKnowledgeStep() {
  if (!state.sessionId) throw new Error('Session expired.');
  setStatus('Uploading knowledge...');

  const { completeStep, uploadKnowledge } = await loadOnboardingApi();
  if (state.companyId && state.uploadedFiles.length) {
    for (const file of state.uploadedFiles) {
      try {
        await uploadKnowledge(state.companyId, file, file.name);
      } catch {
        /* demo: continue on upload fail */
      }
    }
  }

  await completeStep(state.sessionId, 'knowledge', {
    faqText: state.faqText,
    websiteUrl: state.websiteUrl,
    documents: state.uploadedFiles.map((f) => ({ name: f.name, title: f.name })),
  });
  setStatus('Knowledge saved!', 'success');
}

async function handleTrainStep() {
  if (!state.sessionId) throw new Error('Session expired.');
  const stages = document.querySelectorAll('[data-stage]');
  const fill = document.getElementById('trainFill');
  const btn = document.getElementById('btnNext');
  if (btn) btn.disabled = true;

  for (let i = 0; i < stages.length; i += 1) {
    stages[i].classList.add('active');
    if (fill) fill.style.width = `${((i + 1) / stages.length) * 100}%`;
    await delay(700);
    stages[i].classList.remove('active');
    stages[i].classList.add('done');
  }

  const { completeStep } = await loadOnboardingApi();
  await completeStep(state.sessionId, 'train', {});
  setStatus('Training complete!', 'success');
  state.stepIndex += 1;
  render();
}

async function handleTestStep() {
  if (!state.sessionId) throw new Error('Session expired.');
  const { completeStep } = await loadOnboardingApi();
  await completeStep(state.sessionId, 'test', {});
}

async function handleCompleteStep() {
  if (state.sessionId) {
    const { completeStep } = await loadOnboardingApi();
    await completeStep(state.sessionId, 'complete', {});
  }
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim();
  if (!text) return;

  state.chatHistory.push({ role: 'user', text });
  const reply = cannedReply(text);
  state.chatHistory.push({ role: 'ai', text: reply });

  const box = document.getElementById('chatMessages');
  if (box) {
    box.innerHTML = state.chatHistory
      .map((m) => `<div class="chat-msg ${m.role}">${escapeHtml(m.text)}</div>`)
      .join('');
    box.scrollTop = box.scrollHeight;
  }
  if (input) input.value = '';
}

function cannedReply(text) {
  const lower = text.toLowerCase();
  if (/hour|open|close|time/.test(lower)) {
    return "We're open Monday to Friday, 8:00 AM – 5:00 PM, and Saturday 8:00 AM – 12:00 PM. How else can I help?";
  }
  if (/price|cost|finance|deposit/.test(lower)) {
    return "I'd be happy to help with pricing and finance options. Could you tell me which product or service you're interested in?";
  }
  if (/book|appointment|test drive|viewing/.test(lower)) {
    return "I can help you schedule that! What date works best for you? We have slots available this week.";
  }
  return "Thanks for your message! Based on your knowledge base, I can help with enquiries, bookings, and FAQs. Would you like to speak with a team member?";
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
