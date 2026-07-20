import { state, setState } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  loadingState,
  showToast,
} from '../../admin/ui.js';
import { applyBranding } from '../auth-guard.js';
import { patchPortalBranding } from '../api.js';
import { DEMO_BRANDING, DEMO_TEAM } from '../demo-data.js';
import { PORTAL_ROLES, roleLabel, getPermissions } from '../permissions.js';

export async function renderSettings(container) {
  container.innerHTML = loadingState('Loading settings...');

  const branding = state.branding || DEMO_BRANDING;
  const company = state.company || {};
  const workspace = state.workspace || state.hubData?.workspace || null;
  const resources = workspace?.resources || {};
  const links = workspace?.workspaceLinks || state.hubData?.workspace?.workspaceLinks || {};
  const primaryColor = branding.primaryColor || '#1e40af';
  const companyInitials = (company.name || 'CM').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  container.innerHTML = `
    ${pageHeader('Settings', 'White-label branding and company configuration.')}

    <div class="portal-settings-tabs">
      <button class="portal-settings-tab active" data-tab="branding" type="button">
        <i class="fa-solid fa-palette"></i> Brand Identity
      </button>
      <button class="portal-settings-tab" data-tab="communications" type="button">
        <i class="fa-solid fa-message"></i> Communications
      </button>
      <button class="portal-settings-tab" data-tab="workspace" type="button">
        <i class="fa-solid fa-sitemap"></i> Workspace
      </button>
      <button class="portal-settings-tab" data-tab="company" type="button">
        <i class="fa-solid fa-building"></i> Company
      </button>
      <button class="portal-settings-tab" data-tab="demo" type="button">
        <i class="fa-solid fa-flask"></i> Demo Role
      </button>
    </div>

    <div class="settings-panel active" id="tab-branding">
      <div class="portal-settings-layout">
        <div class="portal-settings-forms">
          <div class="portal-form-section">
            <div class="portal-form-section-header">
              <div class="portal-form-section-icon"><i class="fa-solid fa-palette"></i></div>
              <div>
                <h4>Brand Identity</h4>
                <p>Logo, colors, and favicon for your white-label portal</p>
              </div>
            </div>
            <div class="form-group">
              <label for="brandLogoUrl">Logo URL</label>
              <input type="url" id="brandLogoUrl" value="${escapeHtml(branding.logoUrl || '')}" placeholder="https://..." />
              <p class="form-hint">Displayed in sidebar and login screen. Recommended 128×128px.</p>
            </div>
            <div class="form-group">
              <label for="brandPrimaryColor">Primary Color</label>
              <div class="portal-color-field">
                <input type="color" id="brandPrimaryColor" value="${escapeHtml(primaryColor)}" />
                <input type="text" id="brandPrimaryColorHex" value="${escapeHtml(primaryColor)}" maxlength="7" />
              </div>
              <p class="form-hint">Applied to buttons, sidebar active state, and charts.</p>
            </div>
            <div class="form-row portal-form-row">
              <div class="form-group">
                <label for="brandFaviconUrl">Favicon URL</label>
                <input type="url" id="brandFaviconUrl" value="${escapeHtml(branding.faviconUrl || '')}" placeholder="assets/favicon-portal.svg" />
              </div>
              <div class="form-group">
                <label for="brandAiAvatar">AI Avatar URL</label>
                <input type="url" id="brandAiAvatar" value="${escapeHtml(branding.aiAvatarUrl || '')}" placeholder="Optional default AI avatar" />
              </div>
            </div>
            <div class="portal-form-actions">
              <button class="btn btn-primary" type="button" id="saveBrandingBtn"><i class="fa-solid fa-check"></i> Save Branding</button>
            </div>
          </div>
        </div>

        <div class="portal-preview-panel">
          <div class="portal-brand-preview">
            <h4>Live Preview</h4>
            <div class="portal-preview-sidebar-mock">
              <div class="portal-preview-sidebar-brand">
                <div class="preview-logo" id="previewLogo" style="background:${escapeHtml(primaryColor)}">
                  ${branding.logoUrl ? `<img src="${escapeHtml(branding.logoUrl)}" alt="" />` : escapeHtml(companyInitials)}
                </div>
                <div>
                  <div style="font-weight:700;font-size:14px;">${escapeHtml(company.name || 'Your Company')}</div>
                  <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Company Portal</div>
                </div>
              </div>
              <div class="portal-preview-nav-item active"><i class="fa-solid fa-gauge-high"></i> Dashboard</div>
              <div class="portal-preview-nav-item"><i class="fa-solid fa-robot"></i> AI Employees</div>
              <div class="portal-preview-nav-item"><i class="fa-solid fa-inbox"></i> Conversations</div>
            </div>
            <button class="brand-preview-btn" id="previewBtn" type="button" style="background:${escapeHtml(primaryColor)}">Primary Button</button>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-panel" id="tab-communications">
      <div class="portal-settings-layout">
        <div class="portal-settings-forms">
          <div class="portal-form-section">
            <div class="portal-form-section-header">
              <div class="portal-form-section-icon"><i class="fa-brands fa-whatsapp"></i></div>
              <div>
                <h4>WhatsApp Greeting</h4>
                <p>First message customers see when starting a chat</p>
              </div>
            </div>
            <div class="form-group">
              <label for="brandWhatsappGreeting">Greeting Message</label>
              <textarea id="brandWhatsappGreeting" rows="4" placeholder="Hi! Welcome to...">${escapeHtml(branding.whatsappGreeting || company.settings?.whatsappGreeting || '')}</textarea>
            </div>
          </div>

          <div class="portal-form-section">
            <div class="portal-form-section-header">
              <div class="portal-form-section-icon"><i class="fa-solid fa-envelope"></i></div>
              <div>
                <h4>Email Signature</h4>
                <p>Appended to outbound emails from your team</p>
              </div>
            </div>
            <div class="form-group">
              <label for="brandEmailSig">Signature</label>
              <textarea id="brandEmailSig" rows="5" placeholder="Best regards,...">${escapeHtml(branding.emailSignature || '')}</textarea>
            </div>
          </div>

          <div class="portal-form-actions">
            <button class="btn btn-primary" type="button" id="saveCommunicationsBtn"><i class="fa-solid fa-check"></i> Save Changes</button>
          </div>
        </div>

        <div class="portal-preview-panel">
          <div class="portal-brand-preview">
            <h4>Message Previews</h4>
            <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-muted);">WhatsApp</div>
            <div class="portal-preview-whatsapp">
              <div class="bubble" id="previewWhatsapp">${escapeHtml(branding.whatsappGreeting || company.settings?.whatsappGreeting || 'Hi! How can we help you today?')}</div>
            </div>
            <div style="font-size:12px;font-weight:600;margin:16px 0 8px;color:var(--text-muted);">Email Signature</div>
            <div class="portal-preview-email" id="previewEmail">${escapeHtml(branding.emailSignature || 'Best regards,\nYour Team')}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-panel" id="tab-workspace">
      <div class="portal-form-section">
        <div class="portal-form-section-header">
          <div class="portal-form-section-icon"><i class="fa-solid fa-sitemap"></i></div>
          <div>
            <h4>Workspace Overview</h4>
            <p>Provisioned areas under companies/${escapeHtml(state.companyId || '—')}/</p>
          </div>
        </div>
        <div class="info-row"><span class="label">Departments</span><span class="value">${resources.departments ?? workspace?.departments?.length ?? '—'}</span></div>
        <div class="info-row"><span class="label">Team members</span><span class="value">${workspace?.teamCount ?? state.team?.length ?? '—'}</span></div>
        <div class="info-row"><span class="label">AI employees</span><span class="value">${resources.aiEmployees ?? '—'}</span></div>
        <div class="info-row"><span class="label">Knowledge items</span><span class="value">${resources.knowledge ?? '—'}</span></div>
        <div class="info-row"><span class="label">CRM contacts</span><span class="value">${resources.crm ?? '—'}</span></div>
        <div class="info-row"><span class="label">Automations</span><span class="value">${resources.automations ?? '—'}</span></div>
        ${workspace?.provisionedAt ? `<div class="info-row"><span class="label">Provisioned</span><span class="value">${escapeHtml(String(workspace.provisionedAt).slice(0, 19))}</span></div>` : ''}
        <div style="margin-top:20px;display:grid;gap:8px;">
          ${[
            ['Dashboard', links.dashboard || '#dashboard'],
            ['Team', links.team || '#team'],
            ['AI Employees', links.aiEmployees || '#agents'],
            ['Knowledge', links.knowledge || '#knowledge'],
            ['CRM', links.crm || '#customers'],
            ['Analytics', links.analytics || '#analytics'],
            ['Billing', links.billing || '#billing'],
            ['Automation', links.automation || '#automation'],
          ].map(([label, href]) => `<a class="btn btn-secondary btn-sm" href="${escapeHtml(href)}" style="justify-content:flex-start;">${escapeHtml(label)}</a>`).join('')}
        </div>
      </div>
    </div>

    <div class="settings-panel" id="tab-company">
      <div class="portal-form-section">
        <div class="portal-form-section-header">
          <div class="portal-form-section-icon"><i class="fa-solid fa-building"></i></div>
          <div>
            <h4>Company Details</h4>
            <p>Read-only tenant information</p>
          </div>
        </div>
        <div class="info-row"><span class="label">Name</span><span class="value">${escapeHtml(company.name || '—')}</span></div>
        <div class="info-row"><span class="label">Industry</span><span class="value">${escapeHtml(company.industry || '—')}</span></div>
        <div class="info-row"><span class="label">Email</span><span class="value">${escapeHtml(company.email || '—')}</span></div>
        <div class="info-row"><span class="label">Phone</span><span class="value">${escapeHtml(company.phone || '—')}</span></div>
        <div class="info-row"><span class="label">Website</span><span class="value">${escapeHtml(company.website || '—')}</span></div>
        <div class="info-row"><span class="label">WhatsApp</span><span class="value">${escapeHtml(company.whatsappNumber || '—')} ${company.whatsappConnected ? '✅' : '⚠️'}</span></div>
        <div class="info-row"><span class="label">Company ID</span><span class="value"><code>${escapeHtml(state.companyId || '—')}</code></span></div>
      </div>
    </div>

    <div class="settings-panel" id="tab-demo">
      <div class="portal-form-section">
        <div class="portal-form-section-header">
          <div class="portal-form-section-icon"><i class="fa-solid fa-flask"></i></div>
          <div>
            <h4>Demo Role Switcher</h4>
            <p>Test permission gating across portal modules</p>
          </div>
        </div>
        <p class="form-hint">Switch your demo role to test permission gating. Production uses Firestore profile.role.</p>
        <div class="form-group"><label for="demoRoleSelect">Act as role</label>
          <select id="demoRoleSelect">
            ${PORTAL_ROLES.map((r) => `<option value="${r}" ${state.profile?.role === r ? 'selected' : ''}>${escapeHtml(roleLabel(r))}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary btn-sm" type="button" id="applyDemoRoleBtn">Apply Role</button>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-light);">
          <h4 style="margin:0 0 12px;font-size:14px;">Demo Team Members</h4>
          ${DEMO_TEAM.map((m) => `<div class="info-row"><span class="label">${escapeHtml(m.name)}</span><span class="value">${escapeHtml(roleLabel(m.role))} · ${escapeHtml(m.email)}</span></div>`).join('')}
        </div>
      </div>
    </div>
  `;

  bindSettingsEvents(container, companyInitials);
}

function bindSettingsEvents(container, companyInitials) {
  container.querySelectorAll('.portal-settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.portal-settings-tab').forEach((t) => t.classList.remove('active'));
      container.querySelectorAll('.settings-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector(`#tab-${tab.dataset.tab}`)?.classList.add('active');
    });
  });

  const colorInput = container.querySelector('#brandPrimaryColor');
  const hexInput = container.querySelector('#brandPrimaryColorHex');
  const logoInput = container.querySelector('#brandLogoUrl');
  const whatsappInput = container.querySelector('#brandWhatsappGreeting');
  const emailInput = container.querySelector('#brandEmailSig');

  const syncColor = (hex) => {
    const previewBtn = container.querySelector('#previewBtn');
    const previewLogo = container.querySelector('#previewLogo');
    const navActive = container.querySelector('.portal-preview-nav-item.active');
    if (previewBtn) previewBtn.style.background = hex;
    if (previewLogo && !logoInput?.value?.trim()) previewLogo.style.background = hex;
    if (navActive) navActive.style.background = hex;
  };

  colorInput?.addEventListener('input', () => {
    if (hexInput) hexInput.value = colorInput.value;
    syncColor(colorInput.value);
  });

  hexInput?.addEventListener('input', () => {
    const val = hexInput.value;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      if (colorInput) colorInput.value = val;
      syncColor(val);
    }
  });

  logoInput?.addEventListener('input', () => {
    const previewLogo = container.querySelector('#previewLogo');
    if (!previewLogo) return;
    const url = logoInput.value.trim();
    previewLogo.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="" />` : escapeHtml(companyInitials);
  });

  whatsappInput?.addEventListener('input', () => {
    const el = container.querySelector('#previewWhatsapp');
    if (el) el.textContent = whatsappInput.value || 'Hi! How can we help you today?';
  });

  emailInput?.addEventListener('input', () => {
    const el = container.querySelector('#previewEmail');
    if (el) el.textContent = emailInput.value || 'Best regards,\nYour Team';
  });

  container.querySelector('#saveBrandingBtn')?.addEventListener('click', () => saveBranding(container));
  container.querySelector('#saveCommunicationsBtn')?.addEventListener('click', () => saveBranding(container));

  container.querySelector('#applyDemoRoleBtn')?.addEventListener('click', () => {
    const role = container.querySelector('#demoRoleSelect')?.value;
    if (!role) return;
    localStorage.setItem('ziric-portal-demo-role', role);
    const member = DEMO_TEAM.find((m) => m.role === role) || DEMO_TEAM[0];
    setState({
      profile: { ...state.profile, role, fullName: member.name, name: member.name },
      permissions: getPermissions(role),
    });
    showToast(`Demo role set to ${roleLabel(role)} — reloading…`, 'info');
    setTimeout(() => location.reload(), 800);
  });
}

function collectBranding(container) {
  return {
    logoUrl: container.querySelector('#brandLogoUrl')?.value?.trim() || '',
    primaryColor: container.querySelector('#brandPrimaryColor')?.value || '#1e40af',
    faviconUrl: container.querySelector('#brandFaviconUrl')?.value?.trim() || '',
    aiAvatarUrl: container.querySelector('#brandAiAvatar')?.value?.trim() || '',
    emailSignature: container.querySelector('#brandEmailSig')?.value || '',
    whatsappGreeting: container.querySelector('#brandWhatsappGreeting')?.value || '',
  };
}

async function saveBranding(container) {
  const branding = collectBranding(container);
  const result = await patchPortalBranding(state.companyId, branding);
  setState({ branding, company: { ...state.company, branding } });
  applyBranding(branding);

  const laxMode = localStorage.getItem('ziric-portal-demo-role');
  if (laxMode || state.profile?.isDemo) {
    localStorage.setItem(`ziric-portal-branding-${state.companyId}`, JSON.stringify(branding));
  }

  if (result.error) {
    showToast(result.error, 'error');
    return;
  }
  showToast('Settings saved', 'success');
}
