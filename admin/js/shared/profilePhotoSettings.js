import { escapeHtml } from '../admin/ui.js';
import { saveUserProfilePhoto, clearUserProfilePhoto } from './userProfilePhoto.js';

/**
 * @param {{ photoURL?: string, displayName?: string, email?: string, role?: string, extraRows?: { label: string, value: string }[] }} opts
 */
export function profilePhotoSettingsMarkup(opts = {}) {
  const name = opts.displayName || opts.email || 'User';
  const initial = name.charAt(0).toUpperCase();
  const photoURL = (opts.photoURL || '').trim();
  const hasPhoto = Boolean(photoURL);

  const extraRows = (opts.extraRows || [])
    .map(
      (row) =>
        `<div class="profile-photo-meta-row">
          <span class="profile-photo-meta-label">${escapeHtml(row.label)}</span>
          <span class="profile-photo-meta-value">${escapeHtml(row.value)}</span>
        </div>`
    )
    .join('');

  return `
    <div class="profile-photo-card" data-profile-photo-root>
      <div class="profile-photo-layout">
        <div class="profile-photo-visual">
          <div class="profile-photo-preview-stack">
            <div class="profile-photo-ring" aria-hidden="true"></div>
            <div class="profile-photo-preview${hasPhoto ? ' is-photo' : ''}" data-profile-photo-preview>
            <span class="profile-photo-initial" data-profile-photo-initial${hasPhoto ? ' hidden' : ''}>${escapeHtml(initial)}</span>
            <img
              class="profile-photo-img"
              data-profile-photo-img
              alt=""
              referrerpolicy="no-referrer"
              ${hasPhoto ? `src="${escapeAttr(photoURL)}"` : ' hidden'}
            />
            </div>
          </div>
          <p class="profile-photo-caption">Shown in the sidebar and top bar</p>
        </div>

        <div class="profile-photo-controls">
          <label class="profile-photo-dropzone" data-profile-photo-dropzone>
            <input
              type="file"
              class="profile-photo-file"
              data-profile-photo-file
              accept="image/jpeg,image/png,image/webp,image/gif"
            />
            <span class="profile-photo-dropzone-icon"><i class="fa-solid fa-cloud-arrow-up"></i></span>
            <span class="profile-photo-dropzone-title">Upload a photo</span>
            <span class="profile-photo-dropzone-hint">JPEG, PNG, WebP, or GIF · max 2 MB</span>
            <span class="profile-photo-dropzone-file" data-profile-photo-filename>${hasPhoto ? 'Photo saved' : 'No file chosen'}</span>
          </label>

          <div class="profile-photo-url-field">
            <label class="profile-photo-url-label" for="profilePhotoUrlField">Or paste image URL</label>
            <input
              type="url"
              class="profile-photo-url-input"
              data-profile-photo-url
              id="profilePhotoUrlField"
              value="${escapeHtml(photoURL)}"
              placeholder="https://..."
              autocomplete="off"
            />
          </div>

          <div class="profile-photo-actions">
            <button class="btn btn-primary" type="button" data-profile-photo-save>Save photo</button>
            <button class="btn btn-secondary" type="button" data-profile-photo-clear${hasPhoto ? '' : ' disabled'}>Remove</button>
          </div>
        </div>
      </div>
      ${extraRows ? `<div class="profile-photo-meta">${extraRows}</div>` : ''}
    </div>
  `;
}

/**
 * @param {ParentNode} scope
 * @param {{ onProfileUpdated: (profile: object) => void | Promise<void>, showToast?: (msg: string, type?: string) => void }} handlers
 */
export function bindProfilePhotoSettings(scope, handlers) {
  const root = scope.querySelector('[data-profile-photo-root]');
  if (!root) return;

  const preview = root.querySelector('[data-profile-photo-preview]');
  const initialEl = root.querySelector('[data-profile-photo-initial]');
  const imgEl = root.querySelector('[data-profile-photo-img]');
  const fileInput = root.querySelector('[data-profile-photo-file]');
  const urlInput = root.querySelector('[data-profile-photo-url]');
  const saveBtn = root.querySelector('[data-profile-photo-save]');
  const clearBtn = root.querySelector('[data-profile-photo-clear]');
  const filenameEl = root.querySelector('[data-profile-photo-filename]');
  const dropzone = root.querySelector('[data-profile-photo-dropzone]');
  const toast = handlers.showToast || (() => {});

  if (!preview || !imgEl || !initialEl) return;

  let objectUrl = '';

  const revokeObjectUrl = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
  };

  const setFilenameLabel = (text) => {
    if (filenameEl) filenameEl.textContent = text;
  };

  const syncClearButton = (hasVisual) => {
    if (clearBtn) clearBtn.disabled = !hasVisual;
  };

  const showPreviewUrl = (url, fallbackInitial) => {
    if (url) {
      imgEl.onerror = () => {
        toast('Could not load that image. Check the URL or try another file.', 'error');
        showPreviewUrl('', fallbackInitial || initialEl.textContent || '?');
      };
      imgEl.onload = () => {
        imgEl.hidden = false;
        initialEl.hidden = true;
        preview.classList.add('is-photo');
        syncClearButton(true);
      };
      imgEl.src = url;
    } else {
      imgEl.onerror = null;
      imgEl.onload = null;
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
      initialEl.textContent = fallbackInitial || '?';
      initialEl.hidden = false;
      preview.classList.remove('is-photo');
      syncClearButton(false);
    }
  };

  const applyFile = (file) => {
    if (!file) return;
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(file);
    setFilenameLabel(file.name);
    showPreviewUrl(objectUrl, initialEl.textContent || '?');
    dropzone?.classList.add('has-file');
  };

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) applyFile(file);
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      applyFile(file);
      if (fileInput) {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
        } catch (_) {
          /* Safari may not support DataTransfer on input */
        }
      }
    }
  });

  let urlPreviewTimer = 0;
  urlInput?.addEventListener('input', () => {
    clearTimeout(urlPreviewTimer);
    const raw = urlInput.value.trim();
    if (!raw || fileInput?.files?.length) return;
    urlPreviewTimer = window.setTimeout(() => {
      if (/^https?:\/\//i.test(raw)) showPreviewUrl(raw, initialEl.textContent || '?');
    }, 400);
  });

  saveBtn?.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const file = fileInput?.files?.[0] || null;
      const urlOverride = urlInput?.value?.trim() || '';
      const profile = await saveUserProfilePhoto(file, { photoUrlOverride: file ? '' : urlOverride });
      if (urlInput && profile.photoURL) urlInput.value = profile.photoURL;
      if (fileInput) fileInput.value = '';
      revokeObjectUrl();
      setFilenameLabel(profile.photoURL ? 'Photo saved' : 'No file chosen');
      dropzone?.classList.remove('has-file');
      const initial = (profile.fullName || profile.name || profile.email || '?').charAt(0).toUpperCase();
      showPreviewUrl(profile.photoURL || '', initial);
      await handlers.onProfileUpdated(profile);
      toast('Profile photo saved.', 'success');
    } catch (err) {
      toast(err?.message || 'Could not save profile photo.', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  clearBtn?.addEventListener('click', async () => {
    clearBtn.disabled = true;
    try {
      const profile = await clearUserProfilePhoto();
      if (urlInput) urlInput.value = '';
      if (fileInput) fileInput.value = '';
      revokeObjectUrl();
      setFilenameLabel('No file chosen');
      dropzone?.classList.remove('has-file');
      const initial = (profile.fullName || profile.name || profile.email || '?').charAt(0).toUpperCase();
      showPreviewUrl('', initial);
      await handlers.onProfileUpdated(profile);
      toast('Profile photo removed.', 'success');
    } catch (err) {
      toast(err?.message || 'Could not remove profile photo.', 'error');
    } finally {
      clearBtn.disabled = false;
    }
  });
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
