/**
 * Company Portal — Sarah Network listing (SNET-03 UI) + verification requests (SNET-04).
 * Edit the public profile draft, publish / unpublish it on Sarah Discover, and submit verification evidence
 * references. Talks to /api/network/v1/orgs/:companyId/{listing,verification}; owners and managers write
 * (server enforces `canManageNetwork`), other members see it read-only.
 *
 * Layout: status hero → public profile (grid) → private registration → action bar → verification timeline.
 * Styles live in css/company-portal.css under "Sarah Network module (snet-*)".
 */
import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, showToast, errorState } from '../../admin/ui.js';
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
const titleCase = (s) => label(s).replace(/\b\w/g, (c) => c.toUpperCase());
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

/** Status pill: tone = success | warn | danger | info | neutral. */
function pill(tone, text) {
  return `<span class="snet-pill snet-pill--${tone}"><span class="snet-pill-dot" aria-hidden="true"></span>${escapeHtml(text)}</span>`;
}

function verificationTone(vState) {
  if (vState === 'verified') return 'success';
  if (vState === 'rejected' || vState === 'restricted') return 'danger';
  if (vState === 'info_requested') return 'warn';
  if (OPEN_STATES.has(vState)) return 'info';
  return 'neutral';
}

function field(id, text, value, { type = 'text', hint = '', disabled = false, placeholder = '', wide = false } = {}) {
  return `<div class="form-group snet-field${wide ? ' snet-field--wide' : ''}">
    <label for="${id}">${escapeHtml(text)}</label>
    <input type="${type}" id="${id}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}" ${disabled ? 'disabled' : ''} />
    ${hint ? `<div class="form-hint">${escapeHtml(hint)}</div>` : ''}
  </div>`;
}

function sectionCard({ icon, title, hint = '', body, tone = '' }) {
  return `
    <section class="snet-card">
      <header class="snet-card-head">
        <span class="snet-card-icon${tone ? ` snet-card-icon--${tone}` : ''}" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${hint ? `<p>${escapeHtml(hint)}</p>` : ''}
        </div>
      </header>
      <div class="snet-card-body">${body}</div>
    </section>`;
}

function fieldError(res) {
  if (!res?.fields || typeof res.fields !== 'object') return res?.error || 'Request failed';
  const detail = Object.entries(res.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  return detail ? `${res.error} (${detail})` : res.error;
}

function evidenceListHtml(evidence) {
  if (!evidence?.length) {
    return '<div class="snet-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i> No evidence attached yet.</div>';
  }
  return `<ul class="snet-evidence">${evidence
    .map((e) => {
      const href = typeof e.url === 'string' && /^https:\/\//i.test(e.url) ? e.url : '';
      const name = href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.label)}</a>`
        : escapeHtml(e.label);
      const file = e.file
        ? ` · file ${escapeHtml(e.file.fileName || 'upload')} (${escapeHtml(String(Math.max(1, Math.round((e.file.byteLength || 0) / 1024))))} KB, sha256 ${escapeHtml(String(e.file.sha256 || '').slice(0, 12))}…)${
            e.file.stored ? ' · stored for officer review' : ''
          }`
        : '';
      return `<li class="snet-evidence-item">
        <span class="snet-evidence-icon" aria-hidden="true"><i class="fa-solid ${e.file ? 'fa-file-shield' : 'fa-link'}"></i></span>
        <div><div class="snet-evidence-name">${name}</div>
        <div class="snet-evidence-meta">${escapeHtml(titleCase(e.kind))}${e.ref ? ` · ref ${escapeHtml(e.ref)}` : ''}${file}</div></div>
      </li>`;
    })
    .join('')}</ul>`;
}

function statusCardHtml(listing, verification, companyName) {
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
  const name = listing.profile?.displayName || companyName;
  return `
    <section class="snet-hero" aria-label="Sarah Network status">
      <div class="snet-hero-top">
        <span class="snet-hero-mark" aria-hidden="true"><i class="fa-solid fa-globe"></i></span>
        <div class="snet-hero-id">
          <div class="snet-hero-name">${escapeHtml(name)}</div>
          <div class="snet-hero-sub">Sarah Network ID · <code class="snet-code">${escapeHtml(listing.snId || 'Assigned when you first save or publish')}</code></div>
        </div>
      </div>
      <div class="snet-stats">
        <div class="snet-stat">
          <div class="snet-stat-label">Discover listing</div>
          <div class="snet-stat-value">${published ? pill('success', 'Published') : pill('warn', 'Draft')}</div>
          <div class="snet-stat-help">${published ? 'Visible to customers on Sarah Discover' : 'Not visible to customers yet'}</div>
        </div>
        <div class="snet-stat">
          <div class="snet-stat-label">Verification</div>
          <div class="snet-stat-value">${pill(verificationTone(vState), titleCase(vState))}</div>
          <div class="snet-stat-help">${escapeHtml(VERIFICATION_COPY[vState] || '')}</div>
        </div>
        <div class="snet-stat">
          <div class="snet-stat-label">Last published</div>
          <div class="snet-stat-value snet-stat-value--text">${listing.publishedAt ? escapeHtml(String(listing.publishedAt).slice(0, 10)) : '—'}</div>
          <div class="snet-stat-help">${listing.publishedAt ? 'Publish again to push profile changes live' : 'Publish once your profile is complete'}</div>
        </div>
      </div>
      ${
        blockers.length
          ? `<div class="snet-alert snet-alert--warn" id="networkBlockers" role="status"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div>${blockers.map(escapeHtml).join('<br>')}</div></div>`
          : ''
      }
    </section>`;
}

function formHtml(listing) {
  const p = listing.profile || {};
  const r = listing.restricted || {};
  const c = p.contact || {};
  const ro = !listing.canEdit;
  const selected = new Set(lines(p.categories));
  const cats = lines(listing.categoryOptions);

  const profileBody = `
    <div class="snet-grid">
      ${field('nlDisplayName', 'Business name', p.displayName, { disabled: ro })}
      ${field('nlIndustry', 'Industry', p.industry, { disabled: ro, placeholder: 'e.g. Automotive dealership' })}
      <div class="form-group snet-field snet-field--wide">
        <label for="nlShort">Short description</label>
        <textarea id="nlShort" rows="3" maxlength="600" ${ro ? 'disabled' : ''}>${escapeHtml(p.shortDescription || '')}</textarea>
        <div class="form-hint">Up to 600 characters — the first line customers read on your Discover card.</div>
      </div>
      ${field('nlLocation', 'Location (city, country)', p.location, { disabled: ro })}
      ${field('nlAddress', 'Street address (optional)', p.address, { disabled: ro })}
      ${
        cats.length
          ? `<div class="form-group snet-field snet-field--wide"><label>Categories</label><div id="nlCategories" class="snet-chips">${cats
              .map(
                (cat) =>
                  `<label class="snet-chip"><input type="checkbox" name="nlCategory" value="${escapeHtml(cat.id)}" ${
                    selected.has(cat.id) ? 'checked' : ''
                  } ${ro ? 'disabled' : ''}><span>${escapeHtml(cat.label)}</span></label>`
              )
              .join('')}</div><div class="form-hint">Leave empty to derive categories from your industry.</div></div>`
          : ''
      }
      ${field('nlTags', 'Keywords (comma separated)', csv(p.tags), { disabled: ro })}
      ${field('nlLanguages', 'Languages (comma separated)', csv(p.languages), { disabled: ro })}
      ${field('nlAreas', 'Service areas (comma separated)', csv(p.serviceAreas), { disabled: ro, wide: true })}
      ${field('nlLat', 'Map latitude (optional)', String(p.geo?.lat ?? ''), { disabled: ro })}
      ${field('nlLng', 'Map longitude (optional)', String(p.geo?.lng ?? ''), { disabled: ro })}
      <div class="form-hint snet-field--wide">Lets “near me” searches find you precisely (e.g. -25.8713, 29.2332). Shown to the public at about 1&nbsp;km precision. Leave empty to be placed from your location text.</div>
      ${field('nlLogo', 'Logo URL (https)', p.logoUrl, { disabled: ro, type: 'url' })}
      ${field('nlCover', 'Cover image URL (https)', p.coverUrl, { disabled: ro, type: 'url' })}
      <div class="form-group snet-field snet-field--wide">
        <label for="nlHours">Opening hours</label>
        <textarea id="nlHours" rows="4" ${ro ? 'disabled' : ''} placeholder="Mon-Fri: 08:00-17:00">${escapeHtml(hoursText(p.hours))}</textarea>
        <div class="form-hint">One per line, e.g. “Mon-Fri: 08:00-17:00”.</div>
      </div>
    </div>`;

  const contactBody = `
    <div class="snet-grid snet-grid--3">
      ${field('nlPhone', 'Contact phone', c.phone, { disabled: ro })}
      ${field('nlEmail', 'Contact email', c.email, { disabled: ro, type: 'email' })}
      ${field('nlWebsite', 'Website (https)', c.website, { disabled: ro, type: 'url' })}
    </div>`;

  const privateBody = `
    <div class="snet-grid">
      ${field('nlLegalName', 'Registered legal name', r.legalName, { disabled: ro })}
      ${field('nlRegNo', 'Registration number', r.registrationNumber, { disabled: ro })}
    </div>`;

  return `
    ${sectionCard({
      icon: 'fa-store',
      title: 'Public profile',
      hint: 'What customers see on Sarah Discover once published. Changes stay in your draft until you publish.',
      body: profileBody,
    })}
    ${sectionCard({ icon: 'fa-address-book', title: 'Contact', hint: 'How customers can reach you outside of Sarah.', body: contactBody })}
    ${sectionCard({
      icon: 'fa-lock',
      title: 'Registration details',
      hint: 'Private — used only for verification and never shown to customers.',
      body: privateBody,
      tone: 'private',
    })}

    <div class="snet-actionbar">
      ${
        ro
          ? '<div class="snet-readonly"><i class="fa-solid fa-eye" aria-hidden="true"></i> Only owners and managers can edit the Sarah Network listing.</div>'
          : `<div class="snet-actionbar-note">${
              listing.published ? 'Live on Sarah Discover — publish to push your latest changes.' : 'Draft saved privately until you publish.'
            }</div>
             <div class="snet-actionbar-buttons">
               ${listing.published ? '<button class="btn btn-secondary snet-btn-danger" type="button" id="nlUnpublish">Unpublish</button>' : ''}
               <button class="btn btn-secondary" type="button" id="nlSave">Save draft</button>
               <button class="btn btn-primary" type="button" id="nlPublish">${listing.published ? 'Publish changes' : 'Publish to Sarah Discover'}</button>
             </div>`
      }
    </div>`;
}

/** Timeline: Request → Review → Decision. */
function timelineHtml(vState) {
  const steps = [
    { id: 'request', label: 'Request', help: 'Legal name, registration number and evidence' },
    { id: 'review', label: 'Officer review', help: 'A Ziricai verification officer checks your evidence' },
    { id: 'decision', label: 'Decision', help: 'Verified badge, or a note on what to fix' },
  ];
  let current = 0;
  let tone = 'info';
  if (OPEN_STATES.has(vState)) {
    current = 1;
    if (vState === 'info_requested') tone = 'warn';
  } else if (vState === 'verified') {
    current = 3;
    tone = 'success';
  } else if (vState === 'rejected' || vState === 'restricted') {
    current = 2;
    tone = 'danger';
  }
  return `<ol class="snet-steps" aria-label="Verification progress">${steps
    .map((s, i) => {
      const done = i < current;
      const active = i === current;
      const cls = done ? 'is-done' : active ? `is-active is-${tone}` : '';
      return `<li class="snet-step ${cls}"><span class="snet-step-dot">${done ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>
        <div><div class="snet-step-label">${s.label}</div><div class="snet-step-help">${s.help}</div></div></li>`;
    })
    .join('')}</ol>`;
}

function verificationHtml(listing, verification) {
  const vState = verification?.state || 'unverified';
  const latest = verification?.latestCase || null;
  const kinds = lines(verification?.evidenceKinds).length ? verification.evidenceKinds : FALLBACK_KINDS;
  const open = OPEN_STATES.has(vState);
  const canRequest = listing.canEdit && !open && vState !== 'verified' && vState !== 'restricted';
  const evidenceForm = (idPrefix) => `
    <div class="snet-grid">
      <div class="form-group snet-field"><label for="${idPrefix}Kind">Type</label>
        <select id="${idPrefix}Kind">${kinds.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(titleCase(k))}</option>`).join('')}</select></div>
      ${field(`${idPrefix}Label`, 'Label', '', { placeholder: 'e.g. CIPC registration certificate' })}
      ${field(`${idPrefix}Url`, 'Public https link (optional)', '', { type: 'url', hint: 'Link to a document you host (Drive, Dropbox, your website).' })}
      ${field(`${idPrefix}Ref`, 'External reference (optional)', '', { placeholder: 'e.g. document number' })}
      <div class="form-group snet-field snet-field--wide"><label for="${idPrefix}File">Attach a file (PDF / PNG / JPEG / WebP, max 5 MB)</label>
        <input type="file" id="${idPrefix}File" accept="application/pdf,image/png,image/jpeg,image/webp" />
        <div class="form-hint">The file is stored securely for Ziricai verification officers only (never shown publicly). Its name, size and checksum are recorded on the case.</div></div>
    </div>`;

  const noteRow =
    latest?.decisionNote && ['info_requested', 'rejected', 'restricted'].includes(vState)
      ? `<div class="snet-alert snet-alert--${vState === 'info_requested' ? 'warn' : 'danger'}"><i class="fa-solid fa-comment-dots" aria-hidden="true"></i>
           <div><strong>Reviewer note</strong><div id="nvNote">${escapeHtml(latest.decisionNote)}</div></div></div>`
      : '';

  const checkedRow = verification?.checked?.length
    ? `<div class="snet-checked"><span class="snet-checked-label">What was checked</span>${verification.checked
        .map((c) => `<span class="snet-tag"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${escapeHtml(titleCase(c))}</span>`)
        .join('')}</div>`
    : '';

  const body = `
    <div class="snet-verify-head">${pill(verificationTone(vState), titleCase(vState))}<p>${escapeHtml(VERIFICATION_COPY[vState] || '')}</p></div>
    ${timelineHtml(vState)}
    ${noteRow}
    ${checkedRow}
    <h4 class="snet-subtitle">Evidence</h4>
    ${evidenceListHtml(latest?.evidence)}
    ${
      open && listing.canEdit
        ? `<div class="snet-subcard"><h4 class="snet-subtitle">Add evidence</h4>${evidenceForm('nvAdd')}
             <button class="btn btn-secondary btn-sm" type="button" id="nvAddBtn">Attach evidence</button></div>`
        : ''
    }
    ${
      canRequest
        ? `<div class="snet-subcard"><h4 class="snet-subtitle">Request verification</h4>
             <p class="form-hint">Requires your registered legal name and registration number above (save them first). You can attach one evidence item now and add more later.</p>
             ${evidenceForm('nvNew')}
             <button class="btn btn-primary btn-sm" type="button" id="nvSubmit">Request verification</button></div>`
        : ''
    }`;

  return sectionCard({
    icon: 'fa-shield-halved',
    title: 'Verification',
    hint: 'A verified badge tells customers a Ziricai officer checked your business.',
    body,
    tone: 'verify',
  });
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
    geo: v('nlLat') || v('nlLng') ? { lat: v('nlLat'), lng: v('nlLng') } : null,
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
  const companyName = state.company?.name || 'your business';

  container.innerHTML = `
    <div class="snet-page">
      ${pageHeader('Sarah Network', `How ${escapeHtml(companyName)} appears on Sarah Discover and who has verified it.`)}
      ${statusCardHtml(listing, verification, companyName)}
      ${formHtml(listing)}
      ${
        verificationRes.error
          ? `<div class="snet-alert snet-alert--warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div>Verification status unavailable: ${escapeHtml(verificationRes.error)}</div></div>`
          : verificationHtml(listing, verification)
      }
    </div>
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
