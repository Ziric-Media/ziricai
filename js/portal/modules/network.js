/**
 * Company Portal — Sarah Network listing (SNET-03 UI) + verification requests (SNET-04).
 * Edit the public profile draft, publish / unpublish it on Sarah Discover, and submit verification evidence
 * references. Talks to /api/network/v1/orgs/:companyId/{listing,verification}; owners and managers write
 * (server enforces `canManageNetwork`), other members see it read-only.
 */
import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, showToast, statusBadge, errorState } from '../../admin/ui.js';
import { can } from '../permissions.js';
import {
  fetchNetworkListing,
  saveNetworkListingDraft,
  publishNetworkListing,
  unpublishNetworkListing,
  fetchNetworkVerification,
  submitNetworkVerification,
  addNetworkVerificationEvidence,
  uploadNetworkEvidenceFile,
} from '../api.js';

const FALLBACK_KINDS = ['registration_certificate', 'proof_of_address', 'ownership_proof', 'website', 'other'];

const VERIFICATION_COPY = {
  unverified: 'Not verified yet.',
  submitted: 'Submitted — waiting for a Ziricai verification officer.',
  under_review: 'Under review by a Ziricai verification officer.',
  info_requested: 'The reviewer needs more information — add evidence below.',
  verified: 'Verified. Customers see a verified badge that lists what was checked.',
  rejected: 'Rejected. Fix the issues below and request verification again.',
  restricted: 'Restricted. Contact support if you believe this is a mistake.',
};

const OPEN_STATES = new Set(['submitted', 'under_review', 'info_requested']);

const label = (s) => String(s || '').replace(/_/g, ' ');
const lines = (arr) => (Array.isArray(arr) ? arr : []);
const csv = (arr) => lines(arr).join(', ');
const splitCsv = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** "Mon-Fri: 08:00-17:00" per line → [{ day, time }] (split at the first colon). */
function parseHours(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? { day: l.slice(0, i).trim(), time: l.slice(i + 1).trim() } : null;
    })
    .filter((h) => h && h.day && h.time);
}

const hoursText = (hours) => lines(hours).map((h) => `${h.day}: ${h.time}`).join('\n');

function field(id, text, value, { type = 'text', hint = '', disabled = false, placeholder = '' } = {}) {
  return `<div class="form-group">
    <label for="${id}">${escapeHtml(text)}</label>
    <input type="${type}" id="${id}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}" ${disabled ? 'disabled' : ''} />
    ${hint ? `<div class="form-hint">${escapeHtml(hint)}</div>` : ''}
  </div>`;
}

function fieldError(res) {
  if (!res?.fields || typeof res.fields !== 'object') return res?.error || 'Request failed';
  const detail = Object.entries(res.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  return detail ? `${res.error} (${detail})` : res.error;
}

function evidenceListHtml(evidence) {
  if (!evidence?.length) return '<div class="panel-hint">No evidence references attached yet.</div>';
  return `<ul>${evidence
    .map((e) => {
      const href = typeof e.url === 'string' && /^https:\/\//i.test(e.url) ? e.url : '';
      const name = href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.label)}</a>`
        : escapeHtml(e.label);
      const file = e.file
        ? ` · file ${escapeHtml(e.file.fileName || 'upload')} (${escapeHtml(String(Math.max(1, Math.round((e.file.byteLength || 0) / 1024))))} KB, sha256 ${escapeHtml(String(e.file.sha256 || '').slice(0, 12))}…)`
        : '';
      return `<li>${name} <span class="panel-hint">${escapeHtml(label(e.kind))}${e.ref ? ` · ref ${escapeHtml(e.ref)}` : ''}${file}</span></li>`;
    })
    .join('')}</ul>`;
}

function statusCardHtml(listing, verification) {
  const published = listing.published;
  const vState = verification?.state || 'unverified';
  const blockers = [];
  if (listing.eligibility && listing.eligibility.eligible === false) {
    blockers.push(listing.eligibility.reason || 'This workspace is not eligible to be listed on Sarah Network.');
  }
  if (listing.entityStatus === 'suspended') blockers.push('Your listing is suspended by Ziricai. Contact support.');
  if (listing.missingRequired?.length) {
    blockers.push(`Complete before publishing: ${listing.missingRequired.map(label).join(', ')}.`);
  }
  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body">
        <div class="info-row"><span class="label">Discover listing</span><span class="value">${statusBadge(published ? 'active' : 'pending')} ${
          published ? 'Published on Sarah Discover' : 'Draft — not visible to customers'
        }</span></div>
        <div class="info-row"><span class="label">Sarah Network ID</span><span class="value">${escapeHtml(listing.snId || 'Assigned when you first save or publish')}</span></div>
        <div class="info-row"><span class="label">Verification</span><span class="value">${statusBadge(
          vState === 'verified' ? 'active' : vState === 'rejected' || vState === 'restricted' ? 'suspended' : 'pending'
        )} ${escapeHtml(label(vState))}</span></div>
        ${listing.publishedAt ? `<div class="info-row"><span class="label">Last published</span><span class="value">${escapeHtml(String(listing.publishedAt).slice(0, 10))}</span></div>` : ''}
        ${blockers.length ? `<div class="panel-hint" style="margin-top:8px;" id="networkBlockers">${blockers.map(escapeHtml).join('<br>')}</div>` : ''}
      </div>
    </div>`;
}

function formHtml(listing) {
  const p = listing.profile || {};
  const r = listing.restricted || {};
  const c = p.contact || {};
  const ro = !listing.canEdit;
  const selected = new Set(lines(p.categories));
  const cats = lines(listing.categoryOptions);
  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><h3>Public profile</h3></div>
      <div class="card-body">
        <p class="form-hint">What customers see on Sarah Discover once published. Changes stay in your draft until you publish.</p>
        ${field('nlDisplayName', 'Business name', p.displayName, { disabled: ro })}
        ${field('nlIndustry', 'Industry', p.industry, { disabled: ro, placeholder: 'e.g. Automotive dealership' })}
        <div class="form-group">
          <label for="nlShort">Short description</label>
          <textarea id="nlShort" rows="3" maxlength="600" ${ro ? 'disabled' : ''}>${escapeHtml(p.shortDescription || '')}</textarea>
        </div>
        ${field('nlLocation', 'Location (city, country)', p.location, { disabled: ro })}
        ${field('nlAddress', 'Street address (optional)', p.address, { disabled: ro })}
        ${
          cats.length
            ? `<div class="form-group"><label>Categories</label><div id="nlCategories">${cats
                .map(
                  (cat) =>
                    `<label style="display:inline-block;margin-right:12px;font-weight:400;"><input type="checkbox" name="nlCategory" value="${escapeHtml(cat.id)}" ${
                      selected.has(cat.id) ? 'checked' : ''
                    } ${ro ? 'disabled' : ''}> ${escapeHtml(cat.label)}</label>`
                )
                .join('')}</div><div class="form-hint">Leave empty to derive categories from your industry.</div></div>`
            : ''
        }
        ${field('nlTags', 'Keywords (comma separated)', csv(p.tags), { disabled: ro })}
        ${field('nlLanguages', 'Languages (comma separated)', csv(p.languages), { disabled: ro })}
        ${field('nlAreas', 'Service areas (comma separated)', csv(p.serviceAreas), { disabled: ro })}
        ${field('nlLogo', 'Logo URL (https)', p.logoUrl, { disabled: ro, type: 'url' })}
        ${field('nlCover', 'Cover image URL (https)', p.coverUrl, { disabled: ro, type: 'url' })}
        <div class="form-group">
          <label for="nlHours">Opening hours (one per line, e.g. "Mon-Fri: 08:00-17:00")</label>
          <textarea id="nlHours" rows="4" ${ro ? 'disabled' : ''}>${escapeHtml(hoursText(p.hours))}</textarea>
        </div>
        ${field('nlPhone', 'Contact phone', c.phone, { disabled: ro })}
        ${field('nlEmail', 'Contact email', c.email, { disabled: ro, type: 'email' })}
        ${field('nlWebsite', 'Website (https)', c.website, { disabled: ro, type: 'url' })}
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><h3>Registration details (private)</h3></div>
      <div class="card-body">
        <p class="form-hint">Used only for verification. Never shown to customers.</p>
        ${field('nlLegalName', 'Registered legal name', r.legalName, { disabled: ro })}
        ${field('nlRegNo', 'Registration number', r.registrationNumber, { disabled: ro })}
      </div>
    </div>

    <div class="form-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;">
      ${
        ro
          ? '<div class="panel-hint">Only owners and managers can edit the Sarah Network listing.</div>'
          : `<button class="btn btn-secondary" type="button" id="nlSave">Save draft</button>
             <button class="btn btn-primary" type="button" id="nlPublish">${listing.published ? 'Publish changes' : 'Publish to Sarah Discover'}</button>
             ${listing.published ? '<button class="btn btn-secondary" type="button" id="nlUnpublish">Unpublish</button>' : ''}`
      }
    </div>`;
}

function verificationHtml(listing, verification) {
  const vState = verification?.state || 'unverified';
  const latest = verification?.latestCase || null;
  const kinds = lines(verification?.evidenceKinds).length ? verification.evidenceKinds : FALLBACK_KINDS;
  const open = OPEN_STATES.has(vState);
  const canRequest = listing.canEdit && !open && vState !== 'verified' && vState !== 'restricted';
  const evidenceForm = (idPrefix) => `
    <div class="form-group"><label for="${idPrefix}Kind">Type</label>
      <select id="${idPrefix}Kind">${kinds.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(label(k))}</option>`).join('')}</select></div>
    ${field(`${idPrefix}Label`, 'Label', '', { placeholder: 'e.g. CIPC registration certificate' })}
    ${field(`${idPrefix}Url`, 'Public https link (optional)', '', { type: 'url', hint: 'Link to a document you host (Drive, Dropbox, your website). Files are not uploaded to Ziricai.' })}
    ${field(`${idPrefix}Ref`, 'Or external reference (optional)', '', { placeholder: 'e.g. document number' })}
    <div class="form-group"><label for="${idPrefix}File">Or attach a file (PDF / PNG / JPEG / WebP, max 5 MB)</label>
      <input type="file" id="${idPrefix}File" accept="application/pdf,image/png,image/jpeg,image/webp" />
      <div class="form-hint">A file reference (name, size, checksum) is recorded on the case. The file itself is not stored yet — keep a hosted link or reference as well.</div></div>`;
  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><h3>Verification</h3></div>
      <div class="card-body">
        <p>${escapeHtml(VERIFICATION_COPY[vState] || '')}</p>
        ${
          latest?.decisionNote && ['info_requested', 'rejected', 'restricted'].includes(vState)
            ? `<div class="info-row"><span class="label">Reviewer note</span><span class="value" id="nvNote">${escapeHtml(latest.decisionNote)}</span></div>`
            : ''
        }
        ${verification?.checked?.length ? `<div class="info-row"><span class="label">What was checked</span><span class="value">${verification.checked.map((c) => escapeHtml(label(c))).join(', ')}</span></div>` : ''}
        <h4 style="margin-top:12px;">Evidence references</h4>
        ${evidenceListHtml(latest?.evidence)}
        ${
          open && listing.canEdit
            ? `<h4 style="margin-top:12px;">Add evidence</h4>${evidenceForm('nvAdd')}
               <button class="btn btn-secondary btn-sm" type="button" id="nvAddBtn">Attach evidence</button>`
            : ''
        }
        ${
          canRequest
            ? `<h4 style="margin-top:12px;">Request verification</h4>
               <p class="form-hint">Requires your registered legal name and registration number above (save them first). You can attach one evidence reference now and add more later.</p>
               ${evidenceForm('nvNew')}
               <button class="btn btn-primary btn-sm" type="button" id="nvSubmit">Request verification</button>`
            : ''
        }
      </div>
    </div>`;
}

function readEvidence(container, prefix) {
  const get = (suffix) => container.querySelector(`#${prefix}${suffix}`)?.value?.trim() || '';
  const file = container.querySelector(`#${prefix}File`)?.files?.[0] || null;
  return { kind: get('Kind') || 'other', label: get('Label'), url: get('Url'), ref: get('Ref'), file };
}

/** Upload the chosen file (if any) and return the API item `{ kind, label, url, ref, uploadId? }`. */
async function evidenceToItem(companyId, ev) {
  const { file, ...item } = ev;
  if (!file) return { item };
  const up = await uploadNetworkEvidenceFile(companyId, file);
  if (up.error) return { error: fieldError(up) };
  return { item: { ...item, uploadId: up.data.uploadId } };
}

function readProfile(container) {
  const v = (id) => container.querySelector(`#${id}`)?.value?.trim() || '';
  const picked = [...container.querySelectorAll('input[name="nlCategory"]:checked')].map((i) => i.value);
  return {
    displayName: v('nlDisplayName'),
    industry: v('nlIndustry'),
    shortDescription: v('nlShort'),
    location: v('nlLocation'),
    address: v('nlAddress'),
    categories: picked,
    tags: splitCsv(v('nlTags')),
    languages: splitCsv(v('nlLanguages')),
    serviceAreas: splitCsv(v('nlAreas')),
    logoUrl: v('nlLogo'),
    coverUrl: v('nlCover'),
    hours: parseHours(container.querySelector('#nlHours')?.value),
    contact: { phone: v('nlPhone'), email: v('nlEmail'), website: v('nlWebsite') },
    legalName: v('nlLegalName'),
    registrationNumber: v('nlRegNo'),
  };
}

export async function renderNetwork(container) {
  const companyId = state.companyId;
  container.innerHTML = loadingState('Loading Sarah Network listing…');
  if (!companyId) {
    container.innerHTML = errorState('No company selected.');
    return;
  }

  const [listingRes, verificationRes] = await Promise.all([
    fetchNetworkListing(companyId),
    fetchNetworkVerification(companyId),
  ]);

  if (listingRes.error) {
    container.innerHTML = `
      ${pageHeader('Sarah Network', 'Manage how your business appears on Sarah Discover.')}
      ${errorState(listingRes.error)}
      <div style="text-align:center;margin-top:12px;"><button class="btn btn-secondary btn-sm" type="button" id="nlRetry">Retry</button></div>`;
    container.querySelector('#nlRetry')?.addEventListener('click', () => renderNetwork(container));
    return;
  }

  // Server decides write access; the role check is only a fast-path for the portal gate.
  const listing = { ...listingRes.data, canEdit: listingRes.data.canEdit ?? can(state.profile?.role, 'canManageNetwork') };
  const verification = verificationRes.error ? null : verificationRes.data;

  container.innerHTML = `
    ${pageHeader('Sarah Network', `How ${escapeHtml(state.company?.name || 'your business')} appears on Sarah Discover and who has verified it.`)}
    ${statusCardHtml(listing, verification)}
    ${formHtml(listing)}
    ${verificationRes.error ? `<div class="panel-hint">Verification status unavailable: ${escapeHtml(verificationRes.error)}</div>` : verificationHtml(listing, verification)}
  `;
  bind(container, companyId, listing);
}

function bind(container, companyId, listing) {
  const rerender = () => renderNetwork(container);
  const guard = (btn, fn) => async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      await fn();
    } finally {
      btn.disabled = false;
    }
  };

  const save = container.querySelector('#nlSave');
  if (save) {
    save.onclick = guard(save, async () => {
      const res = await saveNetworkListingDraft(companyId, readProfile(container));
      if (res.error) return showToast(fieldError(res), 'error');
      showToast('Draft saved', 'success');
      rerender();
    });
  }

  const publish = container.querySelector('#nlPublish');
  if (publish) {
    publish.onclick = guard(publish, async () => {
      // Save first so what the user sees in the form is what gets published.
      const saved = await saveNetworkListingDraft(companyId, readProfile(container));
      if (saved.error) return showToast(fieldError(saved), 'error');
      const res = await publishNetworkListing(companyId);
      if (res.error) {
        showToast(fieldError(res), 'error');
        return rerender();
      }
      showToast('Published on Sarah Discover', 'success');
      rerender();
    });
  }

  const unpublish = container.querySelector('#nlUnpublish');
  if (unpublish) {
    unpublish.onclick = guard(unpublish, async () => {
      if (!window.confirm('Remove your business from Sarah Discover? Customers will no longer find it.')) return;
      const res = await unpublishNetworkListing(companyId);
      if (res.error) return showToast(fieldError(res), 'error');
      showToast('Removed from Sarah Discover', 'success');
      rerender();
    });
  }

  const submit = container.querySelector('#nvSubmit');
  if (submit) {
    submit.onclick = guard(submit, async () => {
      const ev = readEvidence(container, 'nvNew');
      let evidence = [];
      if (ev.label || ev.url || ev.ref || ev.file) {
        const prepared = await evidenceToItem(companyId, ev);
        if (prepared.error) return showToast(prepared.error, 'error');
        evidence = [prepared.item];
      }
      // Persist the registration details the case is built from before requesting.
      const saved = await saveNetworkListingDraft(companyId, {
        legalName: container.querySelector('#nlLegalName')?.value?.trim() || '',
        registrationNumber: container.querySelector('#nlRegNo')?.value?.trim() || '',
      });
      if (saved.error) return showToast(fieldError(saved), 'error');
      const res = await submitNetworkVerification(companyId, { evidence });
      if (res.error) return showToast(fieldError(res), 'error');
      showToast('Verification requested', 'success');
      rerender();
    });
  }

  const add = container.querySelector('#nvAddBtn');
  if (add) {
    add.onclick = guard(add, async () => {
      const prepared = await evidenceToItem(companyId, readEvidence(container, 'nvAdd'));
      if (prepared.error) return showToast(prepared.error, 'error');
      const res = await addNetworkVerificationEvidence(companyId, [prepared.item]);
      if (res.error) return showToast(fieldError(res), 'error');
      showToast('Evidence attached', 'success');
      rerender();
    });
  }
}
