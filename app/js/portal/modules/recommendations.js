/**
 * Company Portal — Sarah Recommendations (REC-03/04/09 UI).
 */
import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, showToast, errorState } from '../../admin/ui.js';
import { can } from '../permissions.js';
import {
  fetchRecOfferings,
  createRecOffering,
  submitRecOfferingVerification,
  fetchRecPackages,
  fetchRecCampaigns,
  createRecCampaign,
  submitRecCampaign,
  activateRecCampaign,
  fetchRecCampaignUsage,
  startRecCampaignCheckout,
  confirmRecCampaignCheckout,
} from '../api.js';

const fmtZar = (cents) => `R ${(Number(cents || 0) / 100).toFixed(0)}`;

function pill(tone, text) {
  return `<span class="rec-pill rec-pill--${tone}">${escapeHtml(text)}</span>`;
}

function statusTone(status) {
  if (status === 'active' || status === 'verified' || status === 'paid') return 'success';
  if (status === 'rejected' || status === 'failed' || status === 'suspended') return 'danger';
  if (status === 'submitted' || status === 'pending' || status === 'pending_approval') return 'info';
  return 'neutral';
}

function tabBtn(id, label, active) {
  return `<button type="button" class="rec-tab${active ? ' is-active' : ''}" data-rec-tab="${id}">${escapeHtml(label)}</button>`;
}

function offeringsPanel(offerings, canWrite) {
  const rows = offerings.length
    ? offerings
        .map(
          (o) => `<tr>
        <td>${escapeHtml(o.displayName)}</td>
        <td>${escapeHtml((o.categoryIds || []).join(', ') || '—')}</td>
        <td>${pill(statusTone(o.verificationStatus), o.verificationStatus)}</td>
        <td>${pill(statusTone(o.status), o.status)}</td>
        <td class="rec-actions">
          ${
            canWrite && o.verificationStatus === 'unverified' && o.status !== 'archived'
              ? `<button type="button" class="btn btn-secondary btn-sm" data-off-submit="${escapeHtml(o.offeringId)}">Submit verification</button>`
              : ''
          }
        </td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="5" class="rec-empty">No offerings yet.</td></tr>`;

  const form = canWrite
    ? `<section class="rec-card">
      <h3>Add offering</h3>
      <div class="rec-form-grid">
        <div class="form-group"><label for="recOffName">Name</label><input id="recOffName" type="text" maxlength="160" placeholder="e.g. Grade 1 admissions" /></div>
        <div class="form-group"><label for="recOffCats">Categories (comma)</label><input id="recOffCats" type="text" placeholder="education" /></div>
        <div class="form-group rec-span-2"><label for="recOffDesc">Description</label><textarea id="recOffDesc" rows="3" maxlength="4000"></textarea></div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="recOffCreate">Create draft</button>
    </section>`
    : `<p class="rec-ro">You can view offerings; only owners and managers can create or submit verification.</p>`;

  return `${form}
    <section class="rec-card">
      <h3>Your offerings</h3>
      <table class="rec-table"><thead><tr><th>Name</th><th>Categories</th><th>Verification</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
}

function campaignsPanel(campaigns, packages, canWrite, usageMap) {
  const pkgOpts = packages
    .map((p) => `<option value="${escapeHtml(p.skuId)}">${escapeHtml(p.name)} — ${fmtZar(p.amountCents)}/mo · ${p.monthlyAllowance} presentations</option>`)
    .join('');

  const rows = campaigns.length
    ? campaigns
        .map((c) => {
          const usage = usageMap[c.campaignId];
          const allowance =
            usage?.remainingPresentations != null
              ? `${usage.remainingPresentations}/${c.monthlyAllowance} left`
              : `—`;
          const pay =
            canWrite && c.approvalStatus === 'approved' && c.paymentStatus !== 'paid'
              ? `<button type="button" class="btn btn-secondary btn-sm" data-camp-pay="${escapeHtml(c.campaignId)}">Pay / checkout</button>`
              : '';
          const act =
            canWrite && c.approvalStatus === 'approved' && (c.paymentStatus === 'paid' || c.status === 'approved')
              ? `<button type="button" class="btn btn-primary btn-sm" data-camp-activate="${escapeHtml(c.campaignId)}">Activate</button>`
              : '';
          return `<tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.packageName || c.packageSkuId)}</td>
          <td>${pill(statusTone(c.approvalStatus), c.approvalStatus)}</td>
          <td>${pill(statusTone(c.paymentStatus), c.paymentStatus)}</td>
          <td>${pill(statusTone(c.status), c.status)}</td>
          <td>${escapeHtml(allowance)}</td>
          <td class="rec-actions">${pay} ${act}</td>
        </tr>`;
        })
        .join('')
    : `<tr><td colspan="7" class="rec-empty">No campaigns yet.</td></tr>`;

  const form = canWrite
    ? `<section class="rec-card">
      <h3>New campaign</h3>
      <div class="rec-form-grid">
        <div class="form-group"><label for="recCampName">Name</label><input id="recCampName" type="text" maxlength="120" /></div>
        <div class="form-group"><label for="recCampPkg">Package</label><select id="recCampPkg">${pkgOpts}</select></div>
        <div class="form-group"><label for="recCampCats">Target categories</label><input id="recCampCats" placeholder="education" /></div>
        <div class="form-group"><label for="recCampCity">Target city</label><input id="recCampCity" placeholder="Rustenburg" /></div>
        <div class="form-group rec-span-2"><label for="recCampOfferings">Offering IDs (comma, verified only)</label><input id="recCampOfferings" placeholder="rec_off_…" /></div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="recCampCreate">Save draft</button>
      <p class="form-hint">After MC approval, pay for the month (RS09), then activate.</p>
    </section>`
    : '';

  return `${form}
    <section class="rec-card">
      <h3>Campaigns</h3>
      <table class="rec-table"><thead><tr><th>Name</th><th>Package</th><th>Approval</th><th>Payment</th><th>Status</th><th>Allowance</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
}

/**
 * @param {HTMLElement} container
 */
export async function renderRecommendations(container) {
  const companyId = state.companyId;
  container.innerHTML = loadingState('Loading Sarah Recommendations…');
  if (!companyId) {
    container.innerHTML = errorState('No company selected.');
    return;
  }

  const canWrite = can(state.profile?.role, 'canManageNetwork');
  const [offRes, pkgRes, campRes] = await Promise.all([
    fetchRecOfferings(companyId),
    fetchRecPackages(companyId),
    fetchRecCampaigns(companyId),
  ]);

  if (offRes.error || campRes.error) {
    container.innerHTML = `${pageHeader('Sarah Recommendations', 'Sponsored discovery in Sarah chats — separate from Status or Discover ads.')}
      ${errorState(offRes.error || campRes.error)}`;
    return;
  }

  const offerings = offRes.data?.offerings || [];
  const packages = pkgRes.data?.packages || [];
  const campaigns = campRes.data?.campaigns || [];
  const usageMap = {};
  await Promise.all(
    campaigns.map(async (c) => {
      const u = await fetchRecCampaignUsage(companyId, c.campaignId);
      if (!u.error && u.data) usageMap[c.campaignId] = u.data.usage || u.data;
    })
  );

  let activeTab = 'offerings';

  const draw = () => {
    const body =
      activeTab === 'campaigns'
        ? campaignsPanel(campaigns, packages, canWrite, usageMap)
        : offeringsPanel(offerings, canWrite);
    container.innerHTML = `
      <div class="rec-page">
        ${pageHeader('Sarah Recommendations', 'Verified offerings and monthly sponsored campaigns in Sarah conversations. Payment buys visibility — not endorsement.')}
        <div class="rec-hero">
          <p><strong>Trust:</strong> Sarah shows relevant options only. Sponsored placements are always labelled in the Sarah App.</p>
        </div>
        <div class="rec-tabs">${tabBtn('offerings', 'Offerings', activeTab === 'offerings')}${tabBtn('campaigns', 'Campaigns', activeTab === 'campaigns')}</div>
        ${body}
      </div>`;
    bindRecommendationsUi(container, companyId, canWrite, { offerings, campaigns, packages, usageMap, setTab: (t) => { activeTab = t; draw(); }, redraw: () => renderRecommendations(container) });
  };

  draw();
}

function bindRecommendationsUi(container, companyId, canWrite, ctx) {
  container.querySelectorAll('[data-rec-tab]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.setTab(btn.getAttribute('data-rec-tab') || 'offerings'));
  });

  container.querySelector('#recOffCreate')?.addEventListener('click', async () => {
    const displayName = container.querySelector('#recOffName')?.value?.trim();
    const description = container.querySelector('#recOffDesc')?.value?.trim();
    const categoryIds = String(container.querySelector('#recOffCats')?.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!displayName) return showToast('Name is required', 'error');
    const res = await createRecOffering(companyId, { displayName, description, categoryIds });
    if (res.error) return showToast(res.error, 'error');
    showToast('Offering created', 'success');
    ctx.redraw();
  });

  container.querySelectorAll('[data-off-submit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-off-submit');
      const res = await submitRecOfferingVerification(companyId, id);
      if (res.error) return showToast(res.error, 'error');
      showToast('Submitted for verification', 'success');
      ctx.redraw();
    });
  });

  container.querySelector('#recCampCreate')?.addEventListener('click', async () => {
    const name = container.querySelector('#recCampName')?.value?.trim();
    const packageSkuId = container.querySelector('#recCampPkg')?.value;
    const offeringIds = String(container.querySelector('#recCampOfferings')?.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const targetCategoryIds = String(container.querySelector('#recCampCats')?.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const city = container.querySelector('#recCampCity')?.value?.trim();
    if (!name) return showToast('Campaign name is required', 'error');
    const res = await createRecCampaign(companyId, {
      name,
      packageSkuId,
      offeringIds,
      targetCategoryIds,
      targetGeo: city ? { city, country: 'ZA' } : {},
    });
    if (res.error) return showToast(res.error, 'error');
    showToast('Campaign draft saved', 'success');
    const camp = res.data?.campaign;
    if (camp?.campaignId) {
      const sub = await submitRecCampaign(companyId, camp.campaignId);
      if (sub.error) showToast(`Draft saved; submit failed: ${sub.error}`, 'warn');
      else showToast('Submitted for Mission Control approval', 'success');
    }
    ctx.redraw();
  });

  container.querySelectorAll('[data-camp-activate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-camp-activate');
      const res = await activateRecCampaign(companyId, id);
      if (res.error) return showToast(res.error, 'error');
      showToast('Campaign activated', 'success');
      ctx.redraw();
    });
  });

  container.querySelectorAll('[data-camp-pay]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-camp-pay');
      const start = await startRecCampaignCheckout(companyId, id);
      if (start.error) return showToast(start.error, 'error');
      const checkout = start.data?.checkout || start.data;
      const ref = checkout?.reference;
      const mode = checkout?.mode;
      if (mode === 'pilot' && window.confirm(`Pilot checkout ref ${ref}. Confirm you've arranged payment with Ziricai?`)) {
        const conf = await confirmRecCampaignCheckout(companyId, id, { reference: ref, pilotAcknowledged: true });
        if (conf.error) return showToast(conf.error, 'error');
        showToast('Payment recorded — you can activate when ready', 'success');
      } else {
        showToast(checkout?.instructions || `Checkout started (${ref})`, 'info');
      }
      ctx.redraw();
    });
  });

  if (!canWrite) return;
}