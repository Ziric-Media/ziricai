/**
 * Shared image URL + device upload control with live preview (Discover, Status, …).
 */
import { escapeHtml } from '../../admin/ui.js';
import { uploadNetworkListingMediaFile } from '../api.js';
import { resolveDiscoverProductDisplayUrl, resolveListingMediaDisplayUrl } from '../../shared/listingMediaUrl.js';

function displaySrc(url) {
  return resolveDiscoverProductDisplayUrl(url) || resolveListingMediaDisplayUrl(url);
}

function setPreviewImage(preview, url) {
  if (!preview) return;
  preview.innerHTML = '';
  if (!url) {
    preview.hidden = true;
    preview.setAttribute('hidden', '');
    preview.classList.add('is-empty');
    return;
  }
  preview.classList.remove('is-empty');
  preview.hidden = false;
  preview.removeAttribute('hidden');
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.src = displaySrc(url);
  img.addEventListener('error', () => {
    preview.classList.add('is-error');
    if (!preview.querySelector('[data-img-preview-fallback]')) {
      const note = document.createElement('span');
      note.dataset.imgPreviewFallback = '1';
      note.className = 'snet-img-upload-preview-fallback';
      note.textContent = 'Preview could not load — save and publish, then check Sarah Discover.';
      preview.appendChild(note);
    }
  });
  preview.appendChild(img);
}

/**
 * @param {string} urlValue
 * @param {{ disabled?: boolean, id?: string, variant?: 'logo'|'cover'|'tile'|'compact', showUrl?: boolean }} [opts]
 */
export function imageUploadControlHtml(urlValue = '', opts = {}) {
  const { disabled = false, id = '', variant = 'tile', showUrl = true } = opts;
  const url = String(urlValue || '').trim();
  const hasUrl = Boolean(url);
  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
  const src = hasUrl ? displaySrc(url) : '';

  return `
    <div class="snet-img-upload snet-img-upload--${variant}" data-img-upload>
      <div class="snet-img-upload-preview${hasUrl ? '' : ' is-empty'}" data-img-preview ${hasUrl ? '' : 'hidden'}>
        ${hasUrl ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''}
      </div>
      ${
        showUrl
          ? `<div class="snet-img-upload-row">
        <input type="text"${idAttr} class="snet-img-upload-url" data-img-url value="${escapeHtml(url)}" placeholder="https://… or upload a file" ${disabled ? 'disabled' : ''} inputmode="url" autocomplete="off" />
        ${
          disabled
            ? ''
            : `<label class="btn btn-secondary btn-sm snet-img-upload-btn" data-img-upload-trigger>
          <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i> Upload
          <input type="file" data-img-file accept="image/jpeg,image/png,image/webp" hidden />
        </label>`
        }
      </div>`
          : disabled
            ? ''
            : `<label class="btn btn-secondary btn-sm snet-img-upload-btn snet-img-upload-btn--solo" data-img-upload-trigger>
        <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i> Upload image
        <input type="file" data-img-file accept="image/jpeg,image/png,image/webp" hidden />
      </label>`
      }
      <div class="snet-img-upload-status" data-img-status hidden></div>
    </div>`;
}

export function syncImageUploadPreview(wrapper) {
  if (!wrapper) return;
  const urlInput = wrapper.querySelector('[data-img-url]');
  const hidden = wrapper.querySelector('[data-img-url-hidden]');
  const preview = wrapper.querySelector('[data-img-preview]');
  const status = wrapper.querySelector('[data-img-status]');
  const url = (urlInput?.value || hidden?.value || '').trim();
  if (!preview) return;
  if (!url) {
    preview.hidden = true;
    preview.setAttribute('hidden', '');
    preview.classList.add('is-empty');
    preview.classList.remove('is-error');
    preview.innerHTML = '';
    if (status) {
      status.hidden = true;
      status.textContent = '';
    }
    return;
  }
  preview.classList.remove('is-error');
  setPreviewImage(preview, url);
}

/**
 * @param {HTMLElement} root
 * @param {string} companyId
 * @param {{ onUploaded?: (wrapper: HTMLElement) => void }} [opts]
 */
export function bindImageUploads(root, companyId, opts = {}) {
  if (!root || !companyId) return;
  root.querySelectorAll('[data-img-upload]').forEach((wrapper) => {
    if (wrapper.dataset.imgBound === '1') return;
    wrapper.dataset.imgBound = '1';

    const urlInput = wrapper.querySelector('[data-img-url]');
    const fileInput = wrapper.querySelector('[data-img-file]');
    const trigger = wrapper.querySelector('[data-img-upload-trigger]');
    const status = wrapper.querySelector('[data-img-status]');

    urlInput?.addEventListener('input', () => syncImageUploadPreview(wrapper));

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        if (status) {
          status.hidden = false;
          status.textContent = 'Image must be 5 MB or smaller.';
        }
        return;
      }
      let blobUrl = '';
      try {
        blobUrl = URL.createObjectURL(file);
        const preview = wrapper.querySelector('[data-img-preview]');
        if (preview) {
          preview.classList.remove('is-empty', 'is-error');
          preview.hidden = false;
          preview.removeAttribute('hidden');
          preview.innerHTML = '';
          const img = document.createElement('img');
          img.src = blobUrl;
          img.alt = '';
          preview.appendChild(img);
        }
      } catch {
        /* ignore */
      }
      if (trigger) trigger.classList.add('is-loading');
      if (status) {
        status.hidden = false;
        status.textContent = 'Uploading…';
      }
      const res = await uploadNetworkListingMediaFile(companyId, file);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (trigger) trigger.classList.remove('is-loading');
      if (res.error) {
        const msg = typeof res.error === "string" ? res.error : res.error?.message || "Upload failed.";
        if (status) status.textContent = msg;
        opts.onUploadError?.(msg, wrapper);
        syncImageUploadPreview(wrapper);
        return;
      }
      const publicUrl = res.data?.publicUrl;
      if (urlInput && publicUrl) urlInput.value = publicUrl;
      else if (!urlInput && publicUrl) {
        let hidden = wrapper.querySelector('[data-img-url-hidden]');
        if (!hidden) {
          hidden = document.createElement('input');
          hidden.type = 'hidden';
          hidden.dataset.imgUrlHidden = '1';
          wrapper.appendChild(hidden);
        }
        hidden.value = publicUrl;
      }
      syncImageUploadPreview(wrapper);
      if (status) {
        status.hidden = false;
        status.textContent = file.name ? `Uploaded ${file.name}` : 'Uploaded';
      }
      opts.onUploaded?.(wrapper);
    });

    syncImageUploadPreview(wrapper);
  });
}

/** Logo/cover/gallery values accepted by listing profile validation. */
export function isAcceptedListingMediaUrl(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (/^https:\/\//i.test(v)) return true;
  if (/^\/api\/network\/v1\/listing-media\//i.test(v)) return true;
  if (/^assets\//i.test(v)) return true;
  return false;
}

/** Read image URL from an upload control (url input or hidden after solo upload). */
export function readImageUploadUrl(wrapper) {
  if (!wrapper) return '';
  const urlInput = wrapper.querySelector('[data-img-url]');
  if (urlInput) return urlInput.value.trim();
  return wrapper.querySelector('[data-img-url-hidden]')?.value?.trim() || '';
}
