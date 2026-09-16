import { requireCompanyId, state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, showToast, errorState } from '../../admin/ui.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import {
  fetchMarketplaceCatalog,
  fetchMarketplaceLifecycle,
  fetchPackUpdates,
  fetchPackDetail,
  fetchPackReviews,
  installMarketplacePack,
  submitPackReview,
  applyPackUpdate,
  invalidateHub,
  prefetchHub,
} from '../api.js';
import { withTimeout } from '../../admin/utils.js';
import { navigateTo } from '../router.js';
import { buildIndustryPackAccessMailto } from '../../shared/marketplaceSalesContact.js';
import { can } from '../permissions.js';

/** Lifecycle Firestore read can exceed default 4s on cold production paths (~5–6s observed). */
const MARKETPLACE_LIFECYCLE_TIMEOUT_MS = 10000;

let wizardState = {};
/** @type {Map<string, object>} */
let lifecycleByPackId = new Map();
/** @type {Map<string, object>} */
let updatesByPackId = new Map();

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

function indexLifecycle(items = [], updates = []) {
  lifecycleByPackId = new Map();
  for (const item of items) lifecycleByPackId.set(item.packId, item);
  updatesByPackId = new Map();
  for (const u of updates) updatesByPackId.set(u.packId, u);
}

/** Re-fetch lifecycle + updates after a proven apply success; no optimistic version state. */
async function refreshMarketplaceAuthoritativeState(companyId) {
  const [lifecycleRes, updatesRes] = await Promise.all([
    withTimeout(fetchMarketplaceLifecycle(companyId), MARKETPLACE_LIFECYCLE_TIMEOUT_MS),
    withTimeout(fetchPackUpdates(companyId)),
  ]);

  const lifecycleError = lifecycleRes.error || null;
  const updatesError = updatesRes.error || null;

  if (lifecycleError) {
    return { ok: false, lifecycleError, updatesError, lifecycleItems: null };
  }

  const lifecycleItems = lifecycleRes.data?.items || [];

  if (updatesError) {
    for (const item of lifecycleItems) lifecycleByPackId.set(item.packId, item);
    return { ok: false, lifecycleError: null, updatesError, lifecycleItems, partial: true };
  }

  const updates = updatesRes.data?.updates || [];
  indexLifecycle(lifecycleItems, updates);

  let hubError = null;
  try {
    invalidateHub();
    await prefetchHub(companyId, { force: true });
  } catch (err) {
    hubError = err?.message || String(err);
  }

  if (hubError) {
    return {
      ok: false,
      lifecycleError: null,
      updatesError: null,
      hubError,
      lifecycleItems,
      updates,
      dataRefreshed: true,
    };
  }

  return { ok: true, lifecycleItems, updates };
}

function syncInstalledDetailLifecycleMeta(modal, packId) {
  const record = lifecycleByPackId.get(packId);
  const meta = modal.querySelector('.mp-installed-meta');
  if (!record || !meta) return;
  meta.querySelectorAll('dt').forEach((dt) => {
    const label = dt.textContent?.trim();
    const dd = dt.nextElementSibling;
    if (!dd) return;
    if (label === 'Version') dd.textContent = `v${record.version || '1.0'}`;
    if (label === 'Last updated') dd.textContent = formatWhen(record.updatedAt);
  });
}

function patchMarketplaceLifecycleMount(container, lifecycleItems) {
  const mount = container.querySelector('#mpLifecycleMount');
  if (!mount || !Array.isArray(lifecycleItems)) return;
  const installing = lifecycleItems.filter((i) => i.status === 'installing');
  const failed = lifecycleItems.filter((i) => i.status === 'failed');
  const installed = lifecycleItems.filter((i) => i.status === 'installed');
  mount.innerHTML = renderLifecycleSections(installing, failed, installed);
}

function rebindLifecycleMountEvents(container, companyId) {
  const mount = container.querySelector('#mpLifecycleMount');
  if (!mount) return;
  mount.querySelectorAll('.installed-actions [data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });
  mount.querySelectorAll('.mp-retry-install').forEach((btn) => {
    btn.addEventListener('click', () => openWizardModal(container, companyId, btn.dataset.packId));
  });
  mount.querySelectorAll('.mp-installed-detail').forEach((btn) => {
    btn.addEventListener('click', () => openInstalledDetailModal(container, btn.dataset.packId));
  });
}

function resolveLifecycleForPack(pack) {
  return lifecycleByPackId.get(pack.id) || lifecycleByPackId.get(pack.canonicalId) || null;
}

function isPaymentRequiredResult(result) {
  return result?.status === 402 || result?.code === 'PAYMENT_REQUIRED';
}

function contactSalesHref(packId, packName, companyId) {
  return buildIndustryPackAccessMailto({ packId, packName, companyId });
}

function resolvePackApiId(packOrId) {
  if (typeof packOrId === 'string') return packOrId;
  return packOrId?.canonicalId || packOrId?.id || '';
}

/** Stars from API aggregate only — never demo constants. */
function renderStarsFromApi(rating = 0) {
  const n = Number(rating);
  const full = Number.isFinite(n) ? Math.min(5, Math.max(0, Math.round(n))) : 0;
  return `<span class="mp-stars" aria-hidden="true">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
}

function renderCatalogRatingSummary(pack) {
  const count = Math.max(0, Number(pack?.ratingCount) || 0);
  if (count === 0) {
    return `<span class="mp-reviews-empty-inline text-muted"><i class="fa-regular fa-comment"></i> No reviews yet</span>`;
  }
  const avg = Number(pack?.rating) || 0;
  return `<span class="mp-rating-summary">${renderStarsFromApi(avg)} <span class="mp-rating-count">(${count})</span></span>`;
}

/** Successful API with zero published reviews (4C-4A honest empty). */
function renderCustomerReviewsEmptyState() {
  return `<p class="mp-reviews-empty text-muted"><i class="fa-regular fa-comment"></i> No customer reviews yet</p>`;
}

function renderCustomerReviewsLoadError(packId) {
  return `<div class="mp-reviews-error" role="alert">
    <p><i class="fa-solid fa-circle-exclamation"></i> Reviews couldn't be loaded.</p>
    <button type="button" class="btn btn-secondary btn-sm mp-reviews-retry" data-pack-id="${escapeHtml(packId)}">Retry</button>
  </div>`;
}

function renderCustomerReviewsLoadingState() {
  return `<p class="mp-reviews-loading text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading reviews…</p>`;
}

const REVIEW_TITLE_MAX = 200;
const REVIEW_BODY_MAX = 4000;

function renderInstalledPackReviewRatingInput() {
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<button type="button" class="mp-rating-star" data-rating="${n}" aria-pressed="false" aria-label="${n} out of 5 stars">★</button>`
    )
    .join('');
  return `<fieldset class="mp-rating-input">
      <legend>Rating <span class="mp-required">(required)</span></legend>
      <div class="mp-rating-stars" role="group" aria-label="Star rating">${stars}</div>
      <p class="mp-review-field-error mp-rating-error hidden" role="alert"></p>
    </fieldset>`;
}

/** 4C-4C-2 — installed-pack context only; catalog detail stays read-only. */
function renderInstalledPackReviewFormBlock(packId) {
  return `<section class="mp-review-eligibility mp-review-form-wrap" data-pack-id="${escapeHtml(packId)}" aria-labelledby="mp-review-eligibility-title">
    <h4 id="mp-review-eligibility-title">Your review</h4>
    <div class="mp-review-contract">
      <p>One review per workspace per pack. Any signed-in team member may submit a review.</p>
      <p>Rating is required. Title and review text are optional.</p>
      <p>Reviews publish immediately and contribute to the marketplace rating.</p>
    </div>
    <form class="mp-review-form" novalidate>
      ${renderInstalledPackReviewRatingInput()}
      <label class="mp-review-field">
        <span>Title <span class="text-muted">(optional)</span></span>
        <input type="text" class="mp-review-title-input" maxlength="${REVIEW_TITLE_MAX}" autocomplete="off" />
      </label>
      <label class="mp-review-field">
        <span>Review text <span class="text-muted">(optional)</span></span>
        <textarea class="mp-review-body-input" rows="4" maxlength="${REVIEW_BODY_MAX}"></textarea>
      </label>
      <p class="mp-review-form-error hidden" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-sm mp-review-submit">Submit review</button>
    </form>
  </section>`;
}

function renderInstalledPackReviewSuccessBlock(review) {
  return `<section class="mp-review-eligibility mp-review-submitted" aria-live="polite">
    <h4>Review submitted</h4>
    <p class="mp-review-success-lede">Your review has been published and is now contributing to this pack's marketplace rating.</p>
    <div class="mp-review-your-card">${renderPublicReviewCard(review)}</div>
    <button type="button" class="btn btn-secondary btn-sm mp-review-view-catalog">View pack reviews</button>
  </section>`;
}

function renderInstalledPackReviewDuplicateBlock() {
  return `<section class="mp-review-eligibility mp-review-already-submitted" aria-live="polite">
    <h4>Review already submitted</h4>
    <p class="mp-review-duplicate-msg">Your workspace already reviewed this pack.</p>
    <button type="button" class="btn btn-secondary btn-sm mp-review-view-catalog">View pack reviews</button>
  </section>`;
}

function renderInstalledPackReviewIneligibleBlock(message) {
  return `<section class="mp-review-eligibility mp-review-ineligible" aria-live="polite">
    <h4>Review not available</h4>
    <p class="mp-review-ineligible-msg">${escapeHtml(message)}</p>
  </section>`;
}

function mapInstalledReviewSubmitError(res) {
  const { status, code, error } = res;
  if (status === 403 && code === 'REVIEW_NOT_ELIGIBLE') {
    return {
      terminal: true,
      html: renderInstalledPackReviewIneligibleBlock(
        error || 'This pack must be fully installed in your workspace before you can submit a review.'
      ),
    };
  }
  if (status === 409 && code === 'DUPLICATE_REVIEW') {
    return { terminal: true, html: renderInstalledPackReviewDuplicateBlock() };
  }
  if (status === 401) {
    return { message: error || 'Sign in again to submit a review.' };
  }
  if (status === 400) {
    return { message: error || 'Check your rating and review text, then try again.' };
  }
  if (status === 503 || code === 'REVIEW_PERSISTENCE_FAILED') {
    return { message: error || 'Reviews are temporarily unavailable. Your text was kept — try again shortly.' };
  }
  if (status >= 500) {
    return { message: error || 'Something went wrong. Your text was kept — try again shortly.' };
  }
  return { message: error || 'Could not submit review. Your text was kept — try again.' };
}

/** 4C-5C — installed-pack details only; catalog stays read-only. */
function renderInstalledPackUpdateReadOnlyBlock(record, upd) {
  const current = record.version || '1.0';
  return `<section class="mp-pack-update mp-pack-update-readonly" aria-labelledby="mp-pack-update-title">
    <h4 id="mp-pack-update-title">Update available</h4>
    <p>Version <strong>v${escapeHtml(current)}</strong> → <strong>v${escapeHtml(upd.latestVersion)}</strong></p>
    ${upd.changelog?.length ? `<ul class="mp-update-changelog">${upd.changelog.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}
    <p class="mp-pack-update-permission text-muted"><i class="fa-solid fa-lock"></i> Only workspace owners and managers can apply pack updates.</p>
  </section>`;
}

function renderInstalledPackUpdateApplyBlock(record, upd, packId) {
  const current = record.version || '1.0';
  const target = upd.latestVersion;
  return `<section class="mp-pack-update mp-pack-update-wrap" data-pack-id="${escapeHtml(packId)}" data-target-version="${escapeHtml(target)}" aria-labelledby="mp-pack-update-title">
    <h4 id="mp-pack-update-title">Update available</h4>
    <div class="mp-pack-update-preview">
      <p>Version <strong>v${escapeHtml(current)}</strong> → <strong>v${escapeHtml(target)}</strong></p>
      ${upd.changelog?.length ? `<ul class="mp-update-changelog">${upd.changelog.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}
      <p class="mp-pack-update-warning"><i class="fa-solid fa-triangle-exclamation"></i> Applying this update adds new knowledge and workflows to your workspace. Existing customizations are preserved.</p>
      <button type="button" class="btn btn-primary btn-sm mp-pack-update-start">Review and apply update</button>
    </div>
    <div class="mp-pack-update-confirm hidden" aria-live="polite">
      <p class="mp-pack-update-confirm-lede"><strong>Confirm pack update</strong></p>
      <dl class="mp-pack-update-confirm-meta">
        <dt>Current version</dt><dd>v${escapeHtml(current)}</dd>
        <dt>Target version</dt><dd>v${escapeHtml(target)}</dd>
      </dl>
      ${upd.changelog?.length ? `<div class="mp-pack-update-confirm-changelog"><strong>Changes</strong><ul class="mp-update-changelog">${upd.changelog.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul></div>` : ''}
      <p class="mp-pack-update-warning">This will modify your installed pack by merging additive content. You cannot undo from the Portal.</p>
      <div class="mp-pack-update-actions">
        <button type="button" class="btn btn-secondary btn-sm mp-pack-update-back">Back</button>
        <button type="button" class="btn btn-primary btn-sm mp-pack-update-apply">Confirm apply update</button>
      </div>
    </div>
    <p class="mp-pack-update-form-error hidden" role="alert"></p>
  </section>`;
}

function renderInstalledPackUpdateSection(record, upd, packId, canApply) {
  if (!upd) return '<p class="text-muted">This pack is up to date with published versions.</p>';
  return canApply
    ? renderInstalledPackUpdateApplyBlock(record, upd, packId)
    : renderInstalledPackUpdateReadOnlyBlock(record, upd);
}

function renderInstalledPackUpdateSuccessBlock(result, refreshOutcome = {}) {
  const merged = result.merged || {};
  const kb = Number(merged.knowledgeAdded) || 0;
  const wf = Number(merged.workflowsAdded) || 0;
  const delta =
    kb || wf
      ? `<p class="text-muted">Added ${kb} knowledge document${kb === 1 ? '' : 's'} and ${wf} workflow${wf === 1 ? '' : 's'}.</p>`
      : '';
  let refreshNote = '';
  if (refreshOutcome.attempted && !refreshOutcome.ok) {
    refreshNote = `<p class="mp-pack-update-refresh-warn" role="alert">Update succeeded on the server, but Marketplace could not refresh installed data. Reopen Marketplace or reload the page to see the latest version and update badges.</p>`;
    if (refreshOutcome.hubError) {
      refreshNote += `<p class="text-muted mp-pack-update-refresh-note">Workspace hub sync: ${escapeHtml(refreshOutcome.hubError)}</p>`;
    }
  }
  return `<section class="mp-pack-update mp-pack-update-success" aria-live="polite">
    <h4>Update applied</h4>
    <p class="mp-pack-update-success-lede">${escapeHtml(result.message || 'Pack update completed successfully.')}</p>
    <p class="text-muted">Installed version is now <strong>v${escapeHtml(result.newVersion || '')}</strong> (was v${escapeHtml(result.previousVersion || '')}).</p>
    ${delta}
    ${refreshNote}
  </section>`;
}

function renderInstalledPackUpdateRegistryConflictBlock(error, code) {
  return `<section class="mp-pack-update mp-pack-update-failed" role="alert">
    <h4>Update not completed</h4>
    <p class="mp-pack-update-registry-msg">${escapeHtml(error || 'The installed pack registry could not be updated.')}</p>
    <p class="text-muted">Do not assume this update succeeded. If content changed but the version still looks old, contact support.</p>
    ${code ? `<p class="text-muted mp-pack-update-error-code"><code>${escapeHtml(code)}</code></p>` : ''}
  </section>`;
}

function mapInstalledPackUpdateError(res) {
  const { status, code, error } = res;
  if (status === 403) {
    return { message: error || 'You do not have permission to apply pack updates.' };
  }
  if (
    status === 409 &&
    (code === 'MARKETPLACE_UPDATE_REGISTRY_COMMIT_FAILED' || code === 'MARKETPLACE_VERSION_CONFLICT')
  ) {
    return { terminal: true, html: renderInstalledPackUpdateRegistryConflictBlock(error, code) };
  }
  if (status === 409) {
    return { message: error || 'This update could not be applied due to a version conflict.' };
  }
  if (status === 401) {
    return { message: error || 'Sign in again to apply this update.' };
  }
  if (status === 400) {
    if (code === 'MARKETPLACE_UPDATE_RESOURCE_FAILED') {
      return { message: error || 'Could not apply update resources. Your installed version was not changed.' };
    }
    if (code === 'MARKETPLACE_UPDATE_VALIDATION_FAILED') {
      return { message: error || 'Update validation failed. Your installed version was not changed.' };
    }
    return { message: error || 'This update could not be applied. Your installed version was not changed.' };
  }
  if (status === 503) {
    return { message: error || 'Updates are temporarily unavailable. Try again shortly.' };
  }
  if (status >= 500) {
    return { message: error || 'Something went wrong. Your installed version was not changed.' };
  }
  return { message: error || 'Could not apply update.' };
}

function wireInstalledPackUpdateForm(container, modal, packId, record, upd, canApply) {
  const wrap = modal.querySelector('.mp-pack-update-wrap');
  if (!wrap || !upd || !canApply) return;

  const targetVersion = upd.latestVersion;
  let applying = false;

  const preview = wrap.querySelector('.mp-pack-update-preview');
  const confirm = wrap.querySelector('.mp-pack-update-confirm');
  const formError = wrap.querySelector('.mp-pack-update-form-error');
  const startBtn = wrap.querySelector('.mp-pack-update-start');
  const backBtn = wrap.querySelector('.mp-pack-update-back');
  const applyBtn = wrap.querySelector('.mp-pack-update-apply');

  const showFormError = (msg) => {
    if (!formError) return;
    if (msg) {
      formError.textContent = msg;
      formError.classList.remove('hidden');
    } else {
      formError.textContent = '';
      formError.classList.add('hidden');
    }
  };

  const setApplying = (on) => {
    applying = on;
    [startBtn, backBtn, applyBtn].forEach((btn) => {
      if (btn) {
        btn.disabled = on;
        btn.classList.toggle('mp-pack-update-applying', on && btn === applyBtn);
      }
    });
  };

  const mountTerminalState = (html) => {
    wrap.outerHTML = html;
  };

  startBtn?.addEventListener('click', () => {
    showFormError('');
    preview?.classList.add('hidden');
    confirm?.classList.remove('hidden');
  });

  backBtn?.addEventListener('click', () => {
    showFormError('');
    confirm?.classList.add('hidden');
    preview?.classList.remove('hidden');
  });

  applyBtn?.addEventListener('click', async () => {
    if (applying) return;
    showFormError('');

    let companyId;
    try {
      companyId = requireCompanyId();
    } catch {
      showFormError('Select a workspace before applying an update.');
      return;
    }

    setApplying(true);
    const res = await applyPackUpdate(companyId, packId, targetVersion);

    if (res.data?.success === true) {
      const refresh = await refreshMarketplaceAuthoritativeState(companyId);
      if (refresh.lifecycleItems) {
        patchMarketplaceLifecycleMount(container, refresh.lifecycleItems);
        rebindLifecycleMountEvents(container, companyId);
      }
      syncInstalledDetailLifecycleMeta(modal, packId);
      setApplying(false);
      mountTerminalState(
        renderInstalledPackUpdateSuccessBlock(res.data, {
          attempted: true,
          ok: refresh.ok,
          hubError: refresh.hubError,
          lifecycleError: refresh.lifecycleError,
          updatesError: refresh.updatesError,
        }),
      );
      return;
    }

    setApplying(false);

    const mapped = mapInstalledPackUpdateError(res);
    if (mapped.terminal && mapped.html) {
      mountTerminalState(mapped.html);
      return;
    }
    showFormError(mapped.message || 'Could not apply update.');
  });
}

function wireInstalledPackReviewForm(container, modal, packId) {
  const wrap = modal.querySelector('.mp-review-form-wrap');
  const form = wrap?.querySelector('.mp-review-form');
  if (!wrap || !form) return;

  let selectedRating = 0;
  let submitting = false;

  const ratingError = form.querySelector('.mp-rating-error');
  const formError = form.querySelector('.mp-review-form-error');
  const submitBtn = form.querySelector('.mp-review-submit');
  const titleInput = form.querySelector('.mp-review-title-input');
  const bodyInput = form.querySelector('.mp-review-body-input');

  const showFormError = (msg) => {
    if (!formError) return;
    if (msg) {
      formError.textContent = msg;
      formError.classList.remove('hidden');
    } else {
      formError.textContent = '';
      formError.classList.add('hidden');
    }
  };

  form.querySelectorAll('.mp-rating-star').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedRating = Number(btn.dataset.rating) || 0;
      form.querySelectorAll('.mp-rating-star').forEach((star) => {
        const n = Number(star.dataset.rating) || 0;
        const on = n > 0 && n <= selectedRating;
        star.classList.toggle('is-selected', on);
        star.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      ratingError?.classList.add('hidden');
      showFormError('');
    });
  });

  const mountTerminalState = (html) => {
    wrap.outerHTML = html;
    modal.querySelector('.mp-review-view-catalog')?.addEventListener('click', () => {
      closeModal(modal);
      openDetailModal(container, packId);
    });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;

    showFormError('');
    if (!selectedRating || selectedRating < 1 || selectedRating > 5) {
      if (ratingError) {
        ratingError.textContent = 'Select a rating from 1 to 5 stars.';
        ratingError.classList.remove('hidden');
      }
      return;
    }

    const title = (titleInput?.value || '').trim();
    const body = (bodyInput?.value || '').trim();
    if (title.length > REVIEW_TITLE_MAX || body.length > REVIEW_BODY_MAX) {
      showFormError('Title or review text is too long.');
      return;
    }

    let companyId;
    try {
      companyId = requireCompanyId();
    } catch {
      showFormError('Select a workspace before submitting a review.');
      return;
    }

    submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('mp-review-submitting');
    }

    const res = await submitPackReview(companyId, packId, {
      rating: selectedRating,
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
    });

    submitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('mp-review-submitting');
    }

    if (res.data?.review) {
      mountTerminalState(renderInstalledPackReviewSuccessBlock(res.data.review));
      return;
    }

    const mapped = mapInstalledReviewSubmitError(res);
    if (mapped.terminal && mapped.html) {
      mountTerminalState(mapped.html);
      return;
    }
    showFormError(mapped.message || 'Could not submit review.');
  });
}

/** Catalog detail — steer only; no write control (4C-4C-1). */
function renderCatalogReviewSubmitGuidance(lifecycleRecord) {
  if (lifecycleRecord?.status === 'installed') {
    return `<p class="mp-review-eligibility-note text-muted"><i class="fa-regular fa-comment-dots"></i> To submit a review, open <strong>Installed packs → Details</strong> for this pack.</p>`;
  }
  return `<p class="mp-review-eligibility-note text-muted"><i class="fa-regular fa-comment-dots"></i> Install this pack in your workspace to submit a review.</p>`;
}

function renderPublicReviewCard(review) {
  const stars = renderStarsFromApi(review.rating);
  const when = formatWhen(review.createdAt);
  return `<article class="mp-review">
    <div class="mp-review-head">
      ${stars}
      <strong>${escapeHtml(review.authorDisplayName || 'Customer')}</strong>
      ${when ? `<span class="text-muted mp-review-date">${escapeHtml(when)}</span>` : ''}
    </div>
    ${review.title ? `<h5 class="mp-review-title">${escapeHtml(review.title)}</h5>` : ''}
    ${review.body ? `<p class="mp-review-body">${escapeHtml(review.body)}</p>` : ''}
  </article>`;
}

async function loadPackReviewsIntoMount(mountEl, packId, { cursor = null, append = false } = {}) {
  if (!mountEl) return { ok: false };
  if (append) {
    mountEl.querySelector('.mp-reviews-load-more-wrap')?.remove();
  } else {
    mountEl.innerHTML = renderCustomerReviewsLoadingState();
  }
  const res = await fetchPackReviews(packId, { limit: 20, cursor });
  if (res.error || !res.data) {
    mountEl.innerHTML = renderCustomerReviewsLoadError(packId);
    mountEl.querySelector('.mp-reviews-retry')?.addEventListener('click', () => {
      loadPackReviewsIntoMount(mountEl, packId);
    });
    return { ok: false, error: res.error };
  }
  const reviews = res.data.reviews || [];
  const nextCursor = res.data.pagination?.nextCursor || null;
  if (!append) {
    if (!reviews.length) {
      mountEl.innerHTML = renderCustomerReviewsEmptyState();
    } else {
      mountEl.innerHTML = reviews.map((r) => renderPublicReviewCard(r)).join('');
    }
  } else if (reviews.length) {
    mountEl.insertAdjacentHTML('beforeend', reviews.map((r) => renderPublicReviewCard(r)).join(''));
  }
  const existingMore = mountEl.querySelector('.mp-reviews-load-more-wrap');
  if (existingMore) existingMore.remove();
  if (nextCursor) {
    mountEl.insertAdjacentHTML(
      'beforeend',
      `<div class="mp-reviews-load-more-wrap">
        <button type="button" class="btn btn-secondary btn-sm mp-reviews-load-more" data-cursor="${escapeHtml(nextCursor)}">Load more reviews</button>
      </div>`
    );
    mountEl.querySelector('.mp-reviews-load-more')?.addEventListener('click', (e) => {
      const c = e.currentTarget.dataset.cursor;
      e.currentTarget.disabled = true;
      loadPackReviewsIntoMount(mountEl, packId, { cursor: c, append: true }).finally(() => {
        e.currentTarget.disabled = false;
      });
    });
  }
  return { ok: true, reviews, nextCursor };
}

function renderContactSalesButton(packId, packName, companyId, { primary = true } = {}) {
  const href = contactSalesHref(packId, packName, companyId);
  const cls = primary ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  return `<a class="${cls} mp-contact-sales" href="${escapeHtml(href)}">
    <i class="fa-solid fa-envelope"></i> Contact Sales / Request Access
  </a>`;
}

function renderPaidPackNotice() {
  return `<div class="mp-paid-notice" role="note">
    <i class="fa-solid fa-lock"></i>
    <div>
      <strong>Paid Industry Pack</strong>
      <p>This is a paid Industry Pack. Contact Sales to request access before installation.</p>
    </div>
  </div>`;
}

function renderPaymentRequiredPanel(packId, packName, companyId) {
  const href = contactSalesHref(packId, packName, companyId);
  return `<div class="mp-payment-required-panel" role="alert">
    <i class="fa-solid fa-circle-exclamation"></i>
    <h3>Access required</h3>
    <p>Sales-approved access is required before this Industry Pack can be installed in your workspace.</p>
    <p class="mp-payment-pack-line"><strong>Pack:</strong> ${escapeHtml(packName || packId)}</p>
    <p class="text-muted">Status: ${escapeHtml('Paid')} · ${escapeHtml('Contact Sales to purchase access')}</p>
    <div class="mp-modal-actions mp-payment-actions">
      <a class="btn btn-primary" href="${escapeHtml(href)}">
        <i class="fa-solid fa-envelope"></i> Contact Sales / Request Access
      </a>
      <button type="button" class="btn btn-secondary" id="mpPaymentClose">Close</button>
    </div>
  </div>`;
}

export async function renderMarketplace(container) {
  container.innerHTML = loadingState('Loading Marketplace...');
  const companyId = requireCompanyId();

  const [catalogRes, lifecycleRes, updatesRes] = await Promise.all([
    withTimeout(fetchMarketplaceCatalog()),
    withTimeout(fetchMarketplaceLifecycle(companyId), MARKETPLACE_LIFECYCLE_TIMEOUT_MS),
    withTimeout(fetchPackUpdates(companyId)),
  ]);

  if (catalogRes.error) {
    container.innerHTML = `
      ${pageHeader('AI Marketplace', 'One-click install complete AI Employees — under 5 minutes.')}
      ${errorState(catalogRes.error)}
      <div style="text-align:center;margin-top:12px;">
        <button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>
      </div>`;
    return;
  }

  const catalog = catalogRes.data || { categories: [], packs: [] };
  const lifecycleItems = lifecycleRes.error ? [] : lifecycleRes.data?.items || [];
  const updates = updatesRes.error ? [] : updatesRes.data?.updates || [];
  indexLifecycle(lifecycleItems, updates);

  const installing = lifecycleItems.filter((i) => i.status === 'installing');
  const failed = lifecycleItems.filter((i) => i.status === 'failed');
  const installed = lifecycleItems.filter((i) => i.status === 'installed');

  const partialErrors = [lifecycleRes.error, updatesRes.error].filter(Boolean);

  container.innerHTML = `
    ${pageHeader(
      'AI Marketplace',
      'One-click install complete AI Employees — under 5 minutes.',
    )}

    ${partialErrors.length
      ? `<div class="portal-module-notice" style="margin-bottom:16px;padding:12px 16px;border-radius:8px;background:rgba(245,158,11,0.12);color:#92400e;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Some marketplace data could not be loaded. Lifecycle or update information may be incomplete.
        </div>`
      : ''}

    <div class="marketplace-toolbar">
      <div class="marketplace-search-wrap">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" id="mpSearch" placeholder="Search packs…" class="marketplace-search-input" />
      </div>
      <select id="mpCategory" class="marketplace-filter-select">
        <option value="">All categories</option>
        ${(catalog.categories || []).map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join('')}
      </select>
      <select id="mpPrice" class="marketplace-filter-select">
        <option value="">All prices</option>
        <option value="free">Free</option>
        <option value="paid">Paid</option>
      </select>
      <select id="mpSort" class="marketplace-filter-select">
        <option value="">Featured</option>
      </select>
    </div>

    <div id="mpLifecycleMount">
      ${renderLifecycleSections(installing, failed, installed)}
    </div>

    <div class="marketplace-pack-grid" id="mpPackGrid">
      ${renderPackCards(catalog.packs || [], companyId)}
    </div>

    <div id="mpDetailModal" class="mp-modal hidden" aria-hidden="true"></div>
    <div id="mpWizardModal" class="mp-modal hidden" aria-hidden="true"></div>
  `;

  bindMarketplaceEvents(container, companyId, catalog);
}

function renderLifecycleSections(installing, failed, installed) {
  let html = '';
  if (installing.length) {
    html += `
    <section class="marketplace-section">
      <h3 class="marketplace-section-title"><i class="fa-solid fa-spinner fa-spin"></i> Installation in progress</h3>
      <div class="marketplace-installed-list">
        ${installing.map((p) => `
          <div class="marketplace-installed-item mp-lifecycle-installing">
            <div>
              <strong>${escapeHtml(p.packName || p.packId)}</strong>
              <span class="text-muted">Started ${escapeHtml(formatWhen(p.updatedAt || p.installedAt))}</span>
              ${p.installingStale
                ? `<span class="mp-lifecycle-badge mp-lifecycle-stale"><i class="fa-solid fa-clock"></i> Stale — safe to retry install</span>`
                : `<span class="mp-lifecycle-badge"><i class="fa-solid fa-hourglass-half"></i> In progress</span>`}
            </div>
          </div>`).join('')}
      </div>
    </section>`;
  }
  if (failed.length) {
    html += `
    <section class="marketplace-section">
      <h3 class="marketplace-section-title"><i class="fa-solid fa-circle-xmark"></i> Installation failed</h3>
      <div class="marketplace-installed-list">
        ${failed.map((p) => `
          <div class="marketplace-installed-item mp-lifecycle-failed">
            <div>
              <strong>${escapeHtml(p.packName || p.packId)}</strong>
              <span class="text-muted">${p.failedAt ? `Failed ${escapeHtml(formatWhen(p.failedAt))}` : 'Failed'}</span>
              ${p.lastError ? `<p class="mp-lifecycle-error">${escapeHtml(p.lastError)}</p>` : ''}
              ${p.installAttemptId ? `<span class="text-muted mp-attempt-id">Attempt ${escapeHtml(String(p.installAttemptId).slice(0, 8))}…</span>` : ''}
            </div>
            <div class="installed-actions">
              <button type="button" class="btn btn-primary btn-sm mp-retry-install" data-pack-id="${escapeHtml(p.packId)}">
                <i class="fa-solid fa-rotate-right"></i> Retry install
              </button>
            </div>
          </div>`).join('')}
      </div>
    </section>`;
  }
  if (installed.length) {
    html += `
    <section class="marketplace-section">
      <h3 class="marketplace-section-title"><i class="fa-solid fa-circle-check"></i> Installed packs</h3>
      <div class="marketplace-installed-list">
        ${installed.map((p) => {
          const upd = updatesByPackId.get(p.packId);
          return `
          <div class="marketplace-installed-item">
            <div>
              <strong>${escapeHtml(p.packName || p.packId)}</strong>
              <span class="text-muted">v${escapeHtml(p.version || '1.0')} · Installed ${escapeHtml(formatWhen(p.installedCompletedAt || p.installedAt))}</span>
              ${upd
                ? `<span class="mp-update-badge"><i class="fa-solid fa-arrow-up"></i> Update to v${escapeHtml(upd.latestVersion)}</span>`
                : ''}
              ${upd?.changelog?.length
                ? `<ul class="mp-update-changelog">${upd.changelog.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
                : ''}
            </div>
            <div class="installed-actions">
              <button type="button" class="btn btn-secondary btn-sm mp-installed-detail" data-pack-id="${escapeHtml(p.packId)}">Details</button>
              <button type="button" class="btn btn-secondary btn-sm" data-nav="agents">Agents</button>
              <button type="button" class="btn btn-secondary btn-sm" data-nav="knowledge">Knowledge</button>
              <button type="button" class="btn btn-secondary btn-sm" data-nav="automation">Workflows</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  }
  return html;
}

function renderPackCards(packs, companyId) {
  const visible = packs.filter((p) => p.installable !== false && p.status !== 'coming_soon');
  if (!visible.length) return renderEmptyState({ message: 'No packs match your filters.' });

  return visible.map((pack) => {
    const lc = resolveLifecycleForPack(pack);
    const priceBadge = pack.isPaid
      ? `<span class="mp-price paid">Paid</span>`
      : `<span class="mp-price free">Free</span>`;

    const packLabel = pack.name || pack.id;
    let footerAction = `<button type="button" class="btn btn-primary btn-sm mp-install-btn" data-pack-id="${escapeHtml(pack.id)}">
                <i class="fa-solid fa-download"></i> Install
              </button>`;
    if (pack.isPaid && !lc?.status) {
      footerAction = `${renderContactSalesButton(pack.id, packLabel, companyId)}
        <button type="button" class="btn btn-secondary btn-sm mp-preview-btn" data-pack-id="${escapeHtml(pack.id)}">
          <i class="fa-solid fa-eye"></i> Preview
        </button>`;
    } else if (lc?.status === 'installed') {
      footerAction = `<span class="pack-status installed"><i class="fa-solid fa-circle-check"></i> Installed</span>`;
    } else if (lc?.status === 'installing') {
      footerAction = lc.installingStale
        ? `<span class="pack-status mp-lifecycle-stale"><i class="fa-solid fa-clock"></i> Stale — retry</span>
           <button type="button" class="btn btn-secondary btn-sm mp-install-btn" data-pack-id="${escapeHtml(pack.id)}">Retry</button>`
        : `<span class="pack-status"><i class="fa-solid fa-spinner fa-spin"></i> Installing…</span>`;
    } else if (lc?.status === 'failed') {
      footerAction = `<span class="pack-status mp-lifecycle-failed-text"><i class="fa-solid fa-circle-xmark"></i> Failed</span>
           <button type="button" class="btn btn-primary btn-sm mp-install-btn" data-pack-id="${escapeHtml(pack.id)}">Retry</button>`;
    }

    return `
      <article class="marketplace-pack-card" style="--pack-color:${pack.color || '#6366f1'}">
        <div class="pack-card-header">
          <span class="pack-icon">${pack.icon || '📦'}</span>
          <div>
            <h4>${escapeHtml(pack.name)}</h4>
            <div class="mp-card-meta">${renderCatalogRatingSummary(pack)} ${priceBadge}</div>
            <p class="pack-tagline">${escapeHtml(pack.tagline || pack.description || '')}</p>
          </div>
        </div>
        <ul class="pack-includes">
          ${(pack.includes || []).slice(0, 3).map((item) => `<li><i class="fa-solid fa-check"></i> ${escapeHtml(item)}</li>`).join('')}
        </ul>
        <div class="pack-card-footer">
          <button type="button" class="btn btn-secondary btn-sm mp-detail-btn" data-pack-id="${escapeHtml(pack.id)}">Details</button>
          ${footerAction}
        </div>
      </article>`;
  }).join('');
}

function bindMarketplaceEvents(container, companyId, catalog) {
  const reloadCatalog = async () => {
    const q = container.querySelector('#mpSearch')?.value || '';
    const category = container.querySelector('#mpCategory')?.value || '';
    const price = container.querySelector('#mpPrice')?.value || '';
    const sort = container.querySelector('#mpSort')?.value || '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (price) params.set('price', price);
    if (sort) params.set('sort', sort);

    const res = await fetchMarketplaceCatalog(params.toString());
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    const packs = res.data?.packs || catalog.packs;
    container.querySelector('#mpPackGrid').innerHTML = renderPackCards(packs, companyId);
    bindPackButtons(container, companyId);
  };

  container.querySelector('#mpSearch')?.addEventListener('input', debounce(reloadCatalog, 300));
  container.querySelector('#mpCategory')?.addEventListener('change', reloadCatalog);
  container.querySelector('#mpPrice')?.addEventListener('change', reloadCatalog);
  container.querySelector('#mpSort')?.addEventListener('change', reloadCatalog);

  container.querySelectorAll('.installed-actions [data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });

  container.querySelectorAll('.mp-retry-install').forEach((btn) => {
    btn.addEventListener('click', () => openWizardModal(container, companyId, btn.dataset.packId));
  });

  container.querySelectorAll('.mp-installed-detail').forEach((btn) => {
    btn.addEventListener('click', () => openInstalledDetailModal(container, btn.dataset.packId));
  });

  bindPackButtons(container, companyId);
}

function bindPackButtons(container, companyId) {
  container.querySelectorAll('.mp-detail-btn').forEach((btn) => {
    btn.addEventListener('click', () => openDetailModal(container, btn.dataset.packId));
  });
  container.querySelectorAll('.mp-install-btn').forEach((btn) => {
    btn.addEventListener('click', () => openWizardModal(container, companyId, btn.dataset.packId));
  });
  container.querySelectorAll('.mp-preview-btn').forEach((btn) => {
    btn.addEventListener('click', () => openWizardModal(container, companyId, btn.dataset.packId));
  });
}

function openInstalledDetailModal(container, packId) {
  const modal = container.querySelector('#mpDetailModal');
  const record = lifecycleByPackId.get(packId);
  const upd = updatesByPackId.get(packId);
  const canApplyUpdate = can(state.profile?.role, 'canManageStaff');
  if (!record) {
    showToast('Installed pack details are not available.', 'error');
    return;
  }
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="mp-modal-backdrop" data-close="1">
      <div class="mp-modal-panel" role="dialog">
        <button type="button" class="mp-modal-close" data-close="1"><i class="fa-solid fa-xmark"></i></button>
        <h3>${escapeHtml(record.packName || packId)}</h3>
        <p class="text-muted">Installed pack (read-only)</p>
        <dl class="mp-installed-meta">
          <dt>Version</dt><dd>v${escapeHtml(record.version || '1.0')}</dd>
          <dt>Status</dt><dd>${escapeHtml(record.status)}</dd>
          <dt>Installed</dt><dd>${escapeHtml(formatWhen(record.installedCompletedAt || record.installedAt))}</dd>
          <dt>Last updated</dt><dd>${escapeHtml(formatWhen(record.updatedAt))}</dd>
        </dl>
        ${renderInstalledPackReviewFormBlock(packId)}
        ${renderInstalledPackUpdateSection(record, upd, packId, canApplyUpdate)}
        <div class="mp-modal-actions">
          <button type="button" class="btn btn-secondary" data-close="1">Close</button>
        </div>
      </div>
    </div>`;
  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.close) closeModal(modal);
    });
  });
  wireInstalledPackReviewForm(container, modal, packId);
  wireInstalledPackUpdateForm(container, modal, packId, record, upd, canApplyUpdate);
}

async function openDetailModal(container, packId) {
  const modal = container.querySelector('#mpDetailModal');
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="mp-modal-backdrop"><div class="mp-modal-panel">${loadingState('Loading pack…')}</div></div>`;

  const res = await fetchPackDetail(packId);
  if (res.error) {
    modal.innerHTML = '';
    modal.classList.add('hidden');
    showToast(res.error, 'error');
    return;
  }

  const d = res.data;
  const lc = lifecycleByPackId.get(packId);
  const checklist = (d.contentsChecklist || []).map((c) => `
    <div class="mp-checklist-group">
      <strong>${escapeHtml(c.label)} (${c.count})</strong>
      <ul>${(c.items || []).slice(0, 4).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    </div>`).join('');

  const isPaid = d.pack?.isPaid === true;
  const paidNotice = isPaid && lc?.status !== 'installed' ? renderPaidPackNotice() : '';

  const lifecycleNote = lc?.status === 'failed'
    ? `<p class="mp-lifecycle-error"><i class="fa-solid fa-circle-xmark"></i> Last install failed: ${escapeHtml(lc.lastError || 'Unknown error')}</p>`
    : lc?.status === 'installing'
      ? `<p class="text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Installation in progress${lc.installingStale ? ' (stale — you may retry)' : ''}.</p>`
      : lc?.status === 'installed'
        ? `<p class="text-muted"><i class="fa-solid fa-circle-check"></i> Already installed at v${escapeHtml(lc.version || '1.0')}.</p>`
        : '';

  modal.innerHTML = `
    <div class="mp-modal-backdrop" data-close="1">
      <div class="mp-modal-panel" role="dialog">
        <button type="button" class="mp-modal-close" data-close="1"><i class="fa-solid fa-xmark"></i></button>
        <div class="mp-detail-header">
          <span class="pack-icon">${d.pack?.icon || '📦'}</span>
          <div>
            <h3>${escapeHtml(d.pack?.name || '')}</h3>
            <p>v${escapeHtml(d.pack?.version || '1.0')} · ${escapeHtml(d.pack?.priceLabel || 'Free')}</p>
            <div class="mp-detail-rating">${renderCatalogRatingSummary(d.pack || {})}</div>
            ${d.pack?.extends ? `<p class="text-muted"><i class="fa-solid fa-sitemap"></i> Extends ${escapeHtml(d.pack.extends)}</p>` : ''}
          </div>
        </div>
        ${paidNotice}
        ${lifecycleNote}
        <p>${escapeHtml(d.pack?.description || '')}</p>
        <h4>Pack Contents</h4>
        <div class="mp-checklist-grid">${checklist}</div>
        <h4>Customer reviews</h4>
        ${renderCatalogReviewSubmitGuidance(lc)}
        <div class="mp-reviews" id="mpDetailReviews" data-pack-id="${escapeHtml(resolvePackApiId(packId))}">${renderCustomerReviewsLoadingState()}</div>
        <div class="mp-modal-actions">
          ${lc?.status === 'installed'
            ? `<button type="button" class="btn btn-secondary mp-installed-detail" data-pack-id="${escapeHtml(packId)}">Installed details</button>`
            : isPaid
              ? `${renderContactSalesButton(packId, d.pack?.name || packId, requireCompanyId())}
                 <button type="button" class="btn btn-secondary mp-wizard-from-detail" data-pack-id="${escapeHtml(packId)}">
                   <i class="fa-solid fa-eye"></i> Preview pack
                 </button>`
              : `<button type="button" class="btn btn-primary mp-wizard-from-detail" data-pack-id="${escapeHtml(packId)}">
            <i class="fa-solid fa-download"></i> ${lc?.status === 'failed' || lc?.status === 'installing' ? 'Retry install' : 'Install Pack'}
          </button>`}
        </div>
      </div>
    </div>`;

  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.close) closeModal(modal);
    });
  });
  modal.querySelector('.mp-wizard-from-detail')?.addEventListener('click', (e) => {
    closeModal(modal);
    openWizardModal(container, requireCompanyId(), e.target.dataset.packId);
  });
  modal.querySelector('.mp-installed-detail')?.addEventListener('click', (e) => {
    openInstalledDetailModal(container, e.target.dataset.packId);
  });

  const reviewsMount = modal.querySelector('#mpDetailReviews');
  const apiPackId = resolvePackApiId(packId);
  if (reviewsMount && apiPackId) {
    loadPackReviewsIntoMount(reviewsMount, apiPackId);
  }
}

function openWizardModal(container, companyId, packId) {
  wizardState = { companyId, packId, step: 1, branding: {}, integrations: [] };
  const modal = container.querySelector('#mpWizardModal');
  modal.classList.remove('hidden');
  renderWizardStep(container, modal);
}

function installErrorMessage(result) {
  if (result.status === 409 && result.code === 'INSTALL_IN_PROGRESS') {
    return 'An installation is already in progress for this pack. Wait a few minutes, then try again if it does not complete.';
  }
  if (result.status === 402 || result.code === 'PAYMENT_REQUIRED') {
    return 'This Industry Pack requires payment before installation. Please contact sales to purchase access.';
  }
  return result.error || 'Installation failed.';
}

async function renderWizardStep(container, modal) {
  const { companyId, packId, step } = wizardState;
  const steps = ['Preview', 'Branding', 'Integrations', 'Install', 'Success'];
  modal.innerHTML = `
    <div class="mp-modal-backdrop">
      <div class="mp-modal-panel mp-wizard-panel" role="dialog">
        <button type="button" class="mp-modal-close" id="mpWizardClose"><i class="fa-solid fa-xmark"></i></button>
        <div class="mp-wizard-steps">
          ${steps.map((s, i) => `<span class="mp-wizard-step ${i + 1 <= step ? 'active' : ''}">${i + 1}. ${s}</span>`).join('')}
        </div>
        <div id="mpWizardBody">${loadingState('Loading…')}</div>
      </div>
    </div>`;

  modal.querySelector('#mpWizardClose')?.addEventListener('click', () => closeModal(modal));

  const body = modal.querySelector('#mpWizardBody');

  if (step === 1) {
    const res = await installMarketplacePack(companyId, packId, { step: 'preview' });
    const d = res.data;
    wizardState.packName = d?.pack?.name || packId;
    wizardState.isPaid = d?.pack?.isPaid === true;
    const paidBlock = wizardState.isPaid ? renderPaidPackNotice() : '';
    body.innerHTML = `
      ${paidBlock}
      <h3>${escapeHtml(d?.pack?.name || 'Pack Preview')}</h3>
      <p class="text-muted">${escapeHtml(d?.pack?.priceLabel || 'Free')} · Estimated install: ${d?.estimatedMinutes || 4} minutes</p>
      <div class="mp-detail-rating mp-wizard-rating">${renderCatalogRatingSummary(d?.pack || {})}</div>
      <div class="mp-checklist-grid">
        ${(d?.contentsChecklist || []).map((c) => `
          <div class="mp-checklist-group">
            <strong><i class="fa-solid fa-check"></i> ${escapeHtml(c.label)} (${c.count})</strong>
          </div>`).join('')}
      </div>
      <div class="mp-modal-actions">
        ${wizardState.isPaid
          ? `${renderContactSalesButton(packId, wizardState.packName, companyId)}
             <button type="button" class="btn btn-secondary" id="mpNext1">Continue preview</button>`
          : '<button type="button" class="btn btn-primary" id="mpNext1">Next: Branding</button>'}
      </div>`;
    body.querySelector('#mpNext1')?.addEventListener('click', () => { wizardState.step = 2; renderWizardStep(container, modal); });
  } else if (step === 2) {
    body.innerHTML = `
      <h3>Customize Branding (optional)</h3>
      <label class="mp-field"><span>Agent display name</span>
        <input type="text" id="mpAgentName" placeholder="e.g. Emma (AI)" /></label>
      <label class="mp-field"><span>Custom greeting</span>
        <textarea id="mpGreeting" rows="3" placeholder="Hello! How can I help?"></textarea></label>
      <div class="mp-modal-actions">
        <button type="button" class="btn btn-secondary" id="mpBack2">Back</button>
        <button type="button" class="btn btn-primary" id="mpNext2">Next: Integrations</button>
      </div>`;
    body.querySelector('#mpBack2')?.addEventListener('click', () => { wizardState.step = 1; renderWizardStep(container, modal); });
    body.querySelector('#mpNext2')?.addEventListener('click', () => {
      wizardState.branding = {
        agentName: body.querySelector('#mpAgentName')?.value || null,
        greetingMessage: body.querySelector('#mpGreeting')?.value || null,
      };
      wizardState.step = 3;
      renderWizardStep(container, modal);
    });
  } else if (step === 3) {
    const preview = await installMarketplacePack(companyId, packId, { step: 'preview' });
    const available = preview.data?.contents?.integrations || ['whatsapp', 'email'];
    wizardState.integrations = [...available];
    body.innerHTML = `
      <h3>Select Integrations</h3>
      <div class="mp-integration-list">
        ${available.map((id) => `
          <label class="mp-integration-item">
            <input type="checkbox" checked data-int="${escapeHtml(id)}" /> ${escapeHtml(id)}
          </label>`).join('')}
      </div>
      <div class="mp-modal-actions">
        <button type="button" class="btn btn-secondary" id="mpBack3">Back</button>
        <button type="button" class="btn btn-primary" id="mpNext3">Next: Install</button>
      </div>`;
    body.querySelector('#mpBack3')?.addEventListener('click', () => { wizardState.step = 2; renderWizardStep(container, modal); });
    body.querySelector('#mpNext3')?.addEventListener('click', () => {
      wizardState.integrations = [...body.querySelectorAll('[data-int]:checked')].map((el) => el.dataset.int);
      wizardState.step = 4;
      renderWizardStep(container, modal);
    });
  } else if (step === 4) {
    body.innerHTML = loadingState('Installing pack…');
    const result = await installMarketplacePack(companyId, packId, {
      step: 'install',
      branding: wizardState.branding,
      integrations: wizardState.integrations,
    });
    if (result.error) {
      if (isPaymentRequiredResult(result)) {
        body.innerHTML = renderPaymentRequiredPanel(packId, wizardState.packName || packId, companyId);
        body.querySelector('#mpPaymentClose')?.addEventListener('click', () => closeModal(modal));
        return;
      }
      const message = installErrorMessage(result);
      body.innerHTML = `<p class="mp-error">${escapeHtml(message)}</p>
        <button type="button" class="btn btn-secondary" id="mpBack4">Back</button>`;
      body.querySelector('#mpBack4')?.addEventListener('click', () => { wizardState.step = 3; renderWizardStep(container, modal); });
      return;
    }
    wizardState.result = result.data;
    wizardState.step = 5;
    renderWizardStep(container, modal);
  } else if (step === 5) {
    const r = wizardState.result || {};
    const verified = r.validation?.verified || {};
    const summary = r.verifiedSummary || r.validation?.summary || '';
    body.innerHTML = `
      <div class="mp-success">
        <i class="fa-solid fa-circle-check"></i>
        <h3>Installation Complete!</h3>
        <p>${escapeHtml(r.message || 'Your AI Employee pack is ready.')}</p>
        ${summary ? `<p class="mp-verified-summary"><i class="fa-solid fa-shield-check"></i> ${escapeHtml(summary)}</p>` : ''}
        ${verified.agentNames?.length || verified.knowledgeDocs != null ? `
        <ul class="mp-verified-list">
          ${(verified.agentNames || []).map((n) => `<li><i class="fa-solid fa-robot"></i> ${escapeHtml(n)}</li>`).join('')}
          ${verified.knowledgeDocs != null ? `<li><i class="fa-solid fa-book"></i> ${verified.knowledgeDocs} knowledge doc${verified.knowledgeDocs === 1 ? '' : 's'}</li>` : ''}
          ${verified.workflows != null ? `<li><i class="fa-solid fa-diagram-project"></i> ${verified.workflows} workflow${verified.workflows === 1 ? '' : 's'}</li>` : ''}
        </ul>` : ''}
        <div class="mp-success-links">
          <button type="button" class="btn btn-secondary btn-sm" data-nav="agents">AI Employees</button>
          <button type="button" class="btn btn-secondary btn-sm" data-nav="knowledge">Knowledge</button>
          <button type="button" class="btn btn-secondary btn-sm" data-nav="automation">Automation</button>
          <button type="button" class="btn btn-secondary btn-sm" data-nav="analytics">Analytics</button>
        </div>
      </div>
      <div class="mp-modal-actions">
        <button type="button" class="btn btn-primary" id="mpDone">Done</button>
      </div>`;
    body.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => { closeModal(modal); navigateTo(btn.dataset.nav); });
    });
    body.querySelector('#mpDone')?.addEventListener('click', () => {
      closeModal(modal);
      renderMarketplace(container);
    });
  }
}

function closeModal(modal) {
  modal.classList.add('hidden');
  modal.innerHTML = '';
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
