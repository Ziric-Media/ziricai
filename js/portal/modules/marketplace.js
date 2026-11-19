/**
 * Company Portal — Discover product catalog (tenant inventory for Sarah Discover).
 * Replaces legacy AI Employee marketplace packs with listing profile products.
 */
import { requireCompanyId, state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, showToast, errorState } from '../../admin/ui.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { fetchNetworkListing, saveNetworkListingDraft, publishNetworkListing } from '../api.js';
import { can } from '../permissions.js';
import { navigateTo } from '../router.js';
import { imageUploadControlHtml, bindImageUploads, readImageUploadUrl } from './portalImageUpload.js';

function industryProductCopy(industry = '') {
  const i = String(industry || '').toLowerCase();
  if (i.includes('auto') || i.includes('motor')) {
    return {
      title: 'Vehicle showroom',
      subtitle: 'List vehicles, prices, and promotions — they appear on your Sarah Discover profile.',
      addLabel: 'Add vehicle',
      namePlaceholder: 'e.g. GWM Haval Jolion 1.5T',
      pricePlaceholder: 'e.g. R 459 900',
      descPlaceholder: 'Trim, mileage, features, stock code…',
      promoPlaceholder: 'e.g. 0% deposit · Trade-in welcome',
    };
  }
  if (i.includes('edu') || i.includes('school')) {
    return {
      title: 'Programs & fees',
      subtitle: 'Showcase offerings parents see on Discover — tuition, aftercare, uniforms, and promos.',
      addLabel: 'Add offering',
      namePlaceholder: 'e.g. Grade R enrollment 2026',
      pricePlaceholder: 'e.g. R 2 450 / month',
      descPlaceholder: 'Age range, campus, what is included…',
      promoPlaceholder: 'e.g. Sibling discount · Early bird',
    };
  }
  return {
    title: 'Product catalog',
    subtitle: 'Upload products with photos, prices, and promotions for your Sarah Discover storefront.',
    addLabel: 'Add product',
    namePlaceholder: 'Product name',
    pricePlaceholder: 'e.g. R 199',
    descPlaceholder: 'Short description customers see on Discover',
    promoPlaceholder: 'e.g. Limited offer',
  };
}

function newProductId() {
  return `prd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatPrice(price) {
  const p = String(price || '').trim();
  if (!p) return '';
  if (/^r\s/i.test(p) || p.startsWith('R')) return p;
  return `R ${p}`;
}

function productCardHtml(product, { canEdit }) {
  const promo = product.promotion ? `<span class="disco-product-promo">${escapeHtml(product.promotion)}</span>` : '';
  const media = product.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy" />`
    : '<div class="disco-product-card-placeholder" aria-hidden="true"><i class="fa-solid fa-image"></i></div>';
  const price = product.price ? `<p class="disco-product-card-price">${escapeHtml(formatPrice(product.price))}</p>` : '';
  const desc = product.description
    ? `<p class="disco-product-card-desc">${escapeHtml(product.description)}</p>`
  : '';

  return `
    <article class="disco-product-card" data-product-id="${escapeHtml(product.id)}">
      <div class="disco-product-card-media">${promo}${media}</div>
      <div class="disco-product-card-body">
        <h3 class="disco-product-card-title">${escapeHtml(product.name)}</h3>
        ${desc}
        ${price}
        ${
          canEdit
            ? `<div class="disco-product-card-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-product-edit="${escapeHtml(product.id)}">Edit</button>
              <button type="button" class="btn btn-secondary btn-sm" data-product-delete="${escapeHtml(product.id)}">Delete</button>
            </div>`
            : ''
        }
      </div>
    </article>`;
}

function drawerHtml(copy, product = null) {
  const p = product || { id: '', name: '', price: '', description: '', promotion: '', imageUrl: '' };
  return `
    <div class="disco-product-drawer" id="discoProductDrawer" hidden>
      <div class="disco-product-drawer-backdrop" id="discoProductBackdrop" aria-hidden="true"></div>
      <div class="disco-product-drawer-panel" role="dialog" aria-labelledby="discoProductDrawerTitle">
        <h2 id="discoProductDrawerTitle">${product?.id ? 'Edit' : 'Add'} ${escapeHtml(copy.addLabel.replace('Add ', ''))}</h2>
        <div class="disco-product-form-grid">
          <label class="rec-field">
            <span>Name</span>
            <input type="text" id="dpName" value="${escapeHtml(p.name)}" placeholder="${escapeHtml(copy.namePlaceholder)}" />
          </label>
          <label class="rec-field">
            <span>Price</span>
            <input type="text" id="dpPrice" value="${escapeHtml(p.price || '')}" placeholder="${escapeHtml(copy.pricePlaceholder)}" />
          </label>
          <label class="rec-field">
            <span>Promotion (optional)</span>
            <input type="text" id="dpPromo" value="${escapeHtml(p.promotion || '')}" placeholder="${escapeHtml(copy.promoPlaceholder)}" />
          </label>
          <label class="rec-field">
            <span>Description</span>
            <textarea id="dpDesc" rows="3" placeholder="${escapeHtml(copy.descPlaceholder)}">${escapeHtml(p.description || '')}</textarea>
          </label>
          <div class="rec-field">
            <span>Photo</span>
            ${imageUploadControlHtml(p.imageUrl || '', { id: 'dpImage', variant: 'cover' })}
          </div>
        </div>
        <div class="form-actions" style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
          <button type="button" class="btn btn-secondary" id="dpCancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="dpSave">Save product</button>
        </div>
      </div>
    </div>`;
}

export async function renderMarketplace(container) {
  const companyId = requireCompanyId();
  const canEdit = can(state.profile?.role, 'canManageStaff');
  const industry = state.hubData?.industry || state.company?.industry || '';
  const copy = industryProductCopy(industry);

  container.innerHTML = `${pageHeader(copy.title, copy.subtitle)}
    ${loadingState('Loading your Discover catalog…')}`;

  const listingRes = await fetchNetworkListing(companyId);
  if (listingRes.error) {
    container.innerHTML = `${pageHeader(copy.title, copy.subtitle)}${errorState(listingRes.error)}`;
    return;
  }

  let products = [...(listingRes.data?.profile?.products || [])];
  const published = Boolean(listingRes.data?.published);
  let editingId = null;

  function persistProducts(nextProducts) {
    products = nextProducts;
  }

  async function saveProducts(nextProducts, { toast = 'Catalog saved' } = {}) {
    if (!canEdit) {
      showToast('You do not have permission to edit products.', 'error');
      return false;
    }
    const res = await saveNetworkListingDraft(companyId, { profile: { products: nextProducts } });
    if (res.error) {
      showToast(res.error, 'error');
      return false;
    }
    persistProducts(nextProducts);
    showToast(toast, 'success');
    return true;
  }

  function readDrawerForm() {
    const root = container.querySelector('#discoProductDrawer');
    if (!root) return null;
    const name = root.querySelector('#dpName')?.value?.trim() || '';
    if (!name) {
      showToast('Product name is required.', 'warning');
      return null;
    }
    return {
      id: editingId || newProductId(),
      name,
      price: root.querySelector('#dpPrice')?.value?.trim() || '',
      promotion: root.querySelector('#dpPromo')?.value?.trim() || '',
      description: root.querySelector('#dpDesc')?.value?.trim() || '',
      imageUrl: readImageUploadUrl(root.querySelector('[data-img-upload]')) || '',
    };
  }

  function closeDrawer() {
    editingId = null;
    const drawer = container.querySelector('#discoProductDrawer');
    if (drawer) drawer.hidden = true;
  }

  function openDrawer(product = null) {
    editingId = product?.id || null;
    const host = container.querySelector('#discoProductDrawerHost');
    if (host) host.innerHTML = drawerHtml(copy, product);
    bindImageUploads(container);
    const drawer = container.querySelector('#discoProductDrawer');
    drawer.hidden = false;
    container.querySelector('#discoProductBackdrop')?.addEventListener('click', closeDrawer);
    container.querySelector('#dpCancel')?.addEventListener('click', closeDrawer);
    container.querySelector('#dpSave')?.addEventListener('click', async () => {
      const row = readDrawerForm();
      if (!row) return;
      const next = editingId
        ? products.map((p) => (p.id === editingId ? { ...p, ...row, id: editingId } : p))
        : [...products, row];
      const ok = await saveProducts(next);
      if (ok) {
        closeDrawer();
        paint();
      }
    });
  }

  function paint() {
    const grid =
      products.length > 0
        ? `<div class="disco-product-grid">${products.map((p) => productCardHtml(p, { canEdit })).join('')}</div>`
        : renderEmptyState({
            message: 'No products yet — add your first item for Sarah Discover.',
            actionHtml: canEdit
              ? `<button type="button" class="btn btn-primary btn-sm" id="discoProductAddEmpty">${escapeHtml(copy.addLabel)}</button>`
              : '',
          });

    container.innerHTML = `
      <div class="disco-products-page">
        ${pageHeader(copy.title, copy.subtitle)}
        <div class="disco-products-toolbar">
          <p class="disco-products-hint">
            ${
              published
                ? 'Live on Sarah Discover — publish again after big updates.'
                : 'Draft only until you publish your Discover profile.'
            }
            <button type="button" class="btn btn-link btn-sm" data-nav="discoverProfile">Open Discover profile</button>
          </p>
          ${
            canEdit
              ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">
              <button type="button" class="btn btn-primary" id="discoProductAdd">${escapeHtml(copy.addLabel)}</button>
              ${
                published
                  ? '<button type="button" class="btn btn-secondary" id="discoProductPublish">Publish catalog changes</button>'
                  : '<button type="button" class="btn btn-secondary" id="discoProductPublishFirst">Publish to Discover</button>'
              }
            </div>`
              : '<span class="ops-tag">View only</span>'
          }
        </div>
        ${grid}
        <p class="form-hint"><i class="fa-solid fa-store"></i> Shoppers see this grid on your company page in the Sarah App — styled like a modern product storefront.</p>
        <div id="discoProductDrawerHost"></div>
      </div>`;

    container.querySelector('[data-nav="discoverProfile"]')?.addEventListener('click', () => navigateTo('discoverProfile'));
    container.querySelector('#discoProductAdd')?.addEventListener('click', () => openDrawer());
    container.querySelector('#discoProductAddEmpty')?.addEventListener('click', () => openDrawer());

    container.querySelectorAll('[data-product-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-product-edit');
        const product = products.find((p) => p.id === id);
        if (product) openDrawer(product);
      });
    });

    container.querySelectorAll('[data-product-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-product-delete');
        if (!window.confirm('Remove this product from your Discover catalog?')) return;
        const next = products.filter((p) => p.id !== id);
        const ok = await saveProducts(next, { toast: 'Product removed' });
        if (ok) paint();
      });
    });

    const publish = async () => {
      const res = await publishNetworkListing(companyId);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Discover profile published.', 'success');
        paint();
      }
    };
    container.querySelector('#discoProductPublish')?.addEventListener('click', publish);
    container.querySelector('#discoProductPublishFirst')?.addEventListener('click', publish);
  }

  paint();
}