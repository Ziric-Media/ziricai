import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, errorState } from '../../admin/ui.js';
import { renderLoadingSkeleton } from '../core/widgets/loadingSkeleton.js';
import { can } from '../permissions.js';
import { createDentalSaleApi, fetchDentalPatients, fetchDentalSales, invalidateHub, saveDentalPatientApi, sendDentalReceiptApi } from '../api.js';
import { SA_MEDICAL_SCHEMES, digitsPhone, practiceDate } from '../dental/smilemorePractice.js';
import { isSmilemoreDentalCommandCentreTenant, smilemorePracticeRibbon } from '../dental/smilemoreDentalGate.js';
import { navigateTo } from '../router.js';
import { POS_CATEGORIES, POS_METHOD_LABELS, POS_TREATMENTS } from '../dental/posCatalog.js';

const ICONS = {
  'fa-laugh': 'fa-face-grin',
  'fa-sparkles': 'fa-wand-magic-sparkles',
  'fa-braces': 'fa-teeth',
  'fa-flask': 'fa-syringe',
  'fa-smile': 'fa-face-smile',
};

function icon(name) {
  return `fa-solid ${ICONS[name] || name || 'fa-tooth'}`;
}

function zar(amount) {
  const value = Number(amount) || 0;
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function cents(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 100);
}

function saleWhen(value) {
  return practiceDate(value);
}

function names(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || 'Client', lastName: parts.join(' ') };
}

function initials(patient) {
  const first = patient.firstName?.[0] || '';
  const last = patient.lastName?.[0] || patient.firstName?.[1] || '';
  return `${first}${last}`.toUpperCase() || '?';
}

export async function renderDentalPos(container) {
  if (!isSmilemoreDentalCommandCentreTenant(state.companyId)) {
    container.innerHTML = errorState('The till is not available for this workspace.');
    return;
  }
  if (!can(state.profile?.role, 'canViewFinance')) {
    container.innerHTML = errorState('You do not have permission to open the till.');
    return;
  }

  container.innerHTML = renderLoadingSkeleton({ label: 'Loading the till…', cards: 2, rows: 4 });
  const companyId = state.companyId;
  const [patientRes, salesRes] = await Promise.all([
    fetchDentalPatients(companyId),
    fetchDentalSales(companyId),
  ]);
  if (state.companyId !== companyId) return;
  if (patientRes.error) {
    container.innerHTML = `${pageHeader('Point of Sale', 'SmileMore Dentists till.')}${errorState(patientRes.error)}`;
    return;
  }

  const canEdit = can(state.profile?.role, 'canCreateFinance');
  const patients = (patientRes.data?.items || []).map((patient) => toTillPatient(patient, salesRes.data?.items || []));
  const sales = salesRes.error ? [] : (salesRes.data?.items || []);
  const presetPatient = sessionStorage.getItem(`smilemore-pos-patient-${companyId}`) || '';
  if (presetPatient) sessionStorage.removeItem(`smilemore-pos-patient-${companyId}`);
  const session = {
    view: 'pos',
    cart: [],
    patientId: patients.some((patient) => patient.id === presetPatient) ? presetPatient : '',
    category: 'all',
    discount: '',
    method: '',
    paymentRequestId: '',
    receipt: null,
    editing: '',
  };
  const servedBy = state.profile?.fullName || state.profile?.name || state.user?.email || 'Practice desk';
  const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  container.innerHTML = `
    <div class="dental-pos">
      ${pageHeader('Point of Sale', 'SmileMore Dentists · Shop 04, City Square Mall, Rustenburg · 014 592 9220')}
      <div class="dental-pos__meta">
        <span><i class="fa-solid fa-location-dot"></i> Family practice, City Square Mall</span>
        <span><i class="fa-solid fa-calendar-day"></i> ${escapeHtml(today)}</span>
        <span><i class="fa-solid fa-user"></i> ${escapeHtml(servedBy)}</span>
      </div>
      ${smilemorePracticeRibbon()}
      <div class="dental-command-note"><i class="fa-solid fa-circle-info"></i><span>Prices are the practice till list. A medical-aid payment on a receipt does not submit a claim and does not say what the scheme will pay. Sarah does not quote these fees.</span></div>
      ${salesRes.error ? `<p class="form-hint" role="alert">Sales history could not be loaded: ${escapeHtml(salesRes.error)}</p>` : ''}
      <div class="dental-pos__tabs" role="tablist">
        <button type="button" class="dental-pos__tab is-active" data-view="pos"><i class="fa-solid fa-cash-register"></i> New sale</button>
        <button type="button" class="dental-pos__tab" data-view="history"><i class="fa-solid fa-clock-rotate-left"></i> History <span id="posHistBadge">${sales.length}</span></button>
        <button type="button" class="dental-pos__tab" data-view="patients"><i class="fa-solid fa-users"></i> Patients <span id="posPatBadge">${patients.length}</span></button>
      </div>
      <div id="posView"></div>
      <div id="posHistory" hidden></div>
      <div id="posPatients" hidden></div>
      <div class="dental-pos-modal" id="posPayModal" hidden></div>
      <div class="dental-pos-modal" id="posReceiptModal" hidden></div>
      <div class="dental-pos-modal" id="posPatientModal" hidden></div>
      <div class="dental-pos-toast" id="posToast" hidden></div>
    </div>`;

  const root = container.querySelector('.dental-pos');
  const posView = root.querySelector('#posView');
  const historyView = root.querySelector('#posHistory');
  const patientsView = root.querySelector('#posPatients');

  function currentPatient() {
    return patients.find((patient) => patient.id === session.patientId) || null;
  }

  function bill() {
    const subtotalCents = session.cart.reduce((sum, item) => sum + cents(item.price) * item.qty, 0);
    const discountPercent = Math.min(100, Math.max(0, Math.round(Number(session.discount) || 0)));
    const discountCents = Math.round(subtotalCents * discountPercent / 100);
    return {
      subtotalCents,
      discountPercent,
      discountCents,
      totalCents: Math.max(0, subtotalCents - discountCents),
    };
  }

  function toast(message) {
    const node = root.querySelector('#posToast');
    node.hidden = false;
    node.textContent = message;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 2200);
  }

  function switchView(view) {
    session.view = view;
    root.querySelectorAll('.dental-pos__tab').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.view === view);
    });
    posView.hidden = view !== 'pos';
    historyView.hidden = view !== 'history';
    patientsView.hidden = view !== 'patients';
    if (view === 'history') paintHistory();
    if (view === 'patients') paintPatients();
  }

  function openPatientRecord(page) {
    const patient = currentPatient();
    const phone = patient?.phone || patient?.id || '';
    if (page === 'dentalPos') sessionStorage.setItem(`smilemore-pos-patient-${state.companyId}`, phone);
    else if (phone) sessionStorage.setItem(`smilemore-client-${state.companyId}`, phone);
    navigateTo(page);
  }

  function paintTill() {
    const patient = currentPatient();
    const active = patient
      ? `<div class="dental-pos__patient is-active">
          <div class="dental-pos__avatar ${patient.gender === 'female' ? 'is-f' : 'is-m'}">${escapeHtml(initials(patient))}</div>
          <div>
            <strong>${escapeHtml(`${patient.firstName} ${patient.lastName}`.trim())}</strong>
            <span>${escapeHtml(patient.phone)}</span>
          </div>
          <button type="button" id="posClearPatient" aria-label="Clear patient">✕</button>
          <div class="dental-booking__actions">
            <button type="button" id="posOpenFile">Client file</button>
            <button type="button" id="posOpenBook">Bookings</button>
            <button type="button" id="posOpenAid">Medical aid</button>
          </div>
          <dl>
            <div><dt>Phone</dt><dd>${escapeHtml(patient.phone)}</dd></div>
            <div><dt>Email</dt><dd>${escapeHtml(patient.email || '—')}</dd></div>
            <div><dt>Last visit</dt><dd>${escapeHtml(patient.lastVisit || 'None on the till')}</dd></div>
            <div><dt>Till visits</dt><dd>${patient.visits}</dd></div>
          </dl>
        </div>`
      : `<div class="dental-pos__patient"><i class="fa-solid fa-user-circle"></i><p>Search for a patient before adding a treatment.</p></div>`;
    posView.innerHTML = `
      <div class="dental-pos__layout">
        <section>
          <label class="dental-pos__search">Patient
            <input id="posSearch" type="search" placeholder="Type a name or phone" autocomplete="off" value="${patient ? escapeHtml(`${patient.firstName} ${patient.lastName}`.trim()) : ''}" />
          </label>
          <div class="dental-pos__dropdown" id="posDropdown" hidden></div>
          <div class="dental-pos__cats" id="posCats">
            ${POS_CATEGORIES.map((cat) => `<button type="button" class="dental-pos__cat${cat.id === session.category ? ' is-active' : ''}" data-cat="${cat.id}">${cat.label}</button>`).join('')}
          </div>
          <div class="dental-pos__grid" id="posGrid"></div>
        </section>
        <aside>
          ${active}
          <section class="card dental-pos__bill">
            <div class="card-body">
              <h3><i class="fa-solid fa-receipt"></i> Bill <span id="posCartBadge">0</span></h3>
              <div id="posCart"></div>
              <label>Discount % <input id="posDiscount" type="number" min="0" max="100" step="1" value="${escapeHtml(session.discount)}" /></label>
              <button type="button" class="btn btn-primary" id="posPay" ${canEdit ? '' : 'disabled'}>Process payment</button>
              <button type="button" class="btn btn-secondary" id="posClearCart">Clear all</button>
              ${canEdit ? '' : '<p class="form-hint">You can view the till. Taking payment needs reply permission.</p>'}
            </div>
          </section>
        </aside>
      </div>`;
    paintTreatments();
    paintCart();
    bindTill();
  }

  function paintTreatments() {
    const grid = posView.querySelector('#posGrid');
    const rows = session.category === 'all' ? POS_TREATMENTS : POS_TREATMENTS.filter((item) => item.cat === session.category);
    grid.innerHTML = rows.map((item) => {
      const selected = session.cart.some((line) => line.id === item.id);
      return `<article class="dental-pos__treat${selected ? ' is-selected' : ''}">
        <i class="${icon(item.icon)}"></i>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${zar(item.price)}</span>
        <small>${escapeHtml(item.dur)}</small>
        <button type="button" class="dental-pos__select${selected ? ' is-active' : ''}" data-treat="${item.id}">${selected ? 'Selected' : 'Select'}</button>
      </article>`;
    }).join('');
  }

  function paintCart() {
    const host = posView.querySelector('#posCart');
    const badge = posView.querySelector('#posCartBadge');
    const pay = posView.querySelector('#posPay');
    if (!host) return;
    badge.textContent = String(session.cart.length);
    if (!session.cart.length) {
      host.innerHTML = '<p class="dental-pos__empty">Select treatments</p>';
      if (pay) pay.disabled = true;
      return;
    }
    const totals = bill();
    host.innerHTML = `
      ${session.cart.map((item) => `<div class="dental-pos__line">
        <i class="${icon(item.icon)}"></i>
        <div><strong>${escapeHtml(item.name)}</strong><span>${zar(item.price)} × ${item.qty}</span></div>
        <b>${zar(item.price * item.qty)}</b>
        <button type="button" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)}"><i class="fa-solid fa-circle-xmark"></i></button>
      </div>`).join('')}
      <dl class="dental-pos__totals">
        <div><dt>Subtotal</dt><dd>${zar(totals.subtotalCents / 100)}</dd></div>
        <div><dt>Discount</dt><dd>${totals.discountCents ? `− ${zar(totals.discountCents / 100)}` : '− R 0'}</dd></div>
        <div><dt>Total</dt><dd>${zar(totals.totalCents / 100)}</dd></div>
      </dl>`;
    if (pay) pay.disabled = !canEdit || !currentPatient();
  }

  function bindTill() {
    const search = posView.querySelector('#posSearch');
    const dropdown = posView.querySelector('#posDropdown');
    search.addEventListener('input', () => showMatches(search.value));
    search.addEventListener('focus', () => showMatches(search.value));
    posView.querySelector('#posCats').addEventListener('click', (event) => {
      const button = event.target.closest('[data-cat]');
      if (!button) return;
      session.category = button.dataset.cat;
      posView.querySelectorAll('.dental-pos__cat').forEach((tab) => tab.classList.toggle('is-active', tab === button));
      paintTreatments();
    });
    posView.querySelector('#posGrid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-treat]');
      if (!button) return;
      addTreatment(button.dataset.treat);
    });
    posView.querySelector('#posCart').addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove]');
      if (!button) return;
      session.cart = session.cart.filter((item) => item.id !== button.dataset.remove);
      paintTreatments();
      paintCart();
    });
    posView.querySelector('#posDiscount').addEventListener('input', (event) => {
      session.discount = event.target.value;
      paintCart();
    });
    posView.querySelector('#posClearCart').addEventListener('click', () => {
      if (!session.cart.length) return;
      session.cart = [];
      session.discount = '';
      const input = posView.querySelector('#posDiscount');
      if (input) input.value = '';
      paintTreatments();
      paintCart();
      toast('Cart cleared');
    });
    posView.querySelector('#posPay').addEventListener('click', openPay);
    posView.querySelector('#posClearPatient')?.addEventListener('click', () => {
      session.patientId = '';
      session.cart = [];
      session.discount = '';
      paintTill();
    });
    posView.querySelector('#posOpenFile')?.addEventListener('click', () => openPatientRecord('dentalPatients'));
    posView.querySelector('#posOpenBook')?.addEventListener('click', () => openPatientRecord('appointments'));
    posView.querySelector('#posOpenAid')?.addEventListener('click', () => openPatientRecord('dentalMedicalAid'));

    function showMatches(raw) {
      const query = raw.trim().toLowerCase();
      const matches = patients.filter((patient) => {
        const hay = `${patient.firstName} ${patient.lastName} ${patient.phone} ${patient.id}`.toLowerCase();
        return !query || hay.includes(query);
      });
      dropdown.hidden = false;
      dropdown.innerHTML = matches.length
        ? matches.map((patient) => `<button type="button" data-pick="${escapeHtml(patient.id)}">
            <span class="dental-pos__avatar ${patient.gender === 'female' ? 'is-f' : 'is-m'}">${escapeHtml(initials(patient))}</span>
            <span><strong>${escapeHtml(`${patient.firstName} ${patient.lastName}`.trim())}</strong><small>${escapeHtml(patient.phone)} · ${patient.visits} till visits</small></span>
          </button>`).join('')
        : '<p>No patients found. Add one from the Patients tab.</p>';
    }

    dropdown.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pick]');
      if (!button) return;
      session.patientId = button.dataset.pick;
      dropdown.hidden = true;
      const patient = currentPatient();
      toast(`Patient: ${patient.firstName} ${patient.lastName}`.trim());
      paintTill();
    });
  }

  root.addEventListener('click', (event) => {
    const dropdown = posView.querySelector('#posDropdown');
    if (!dropdown || dropdown.hidden) return;
    if (!event.target.closest('.dental-pos__search') && !event.target.closest('#posDropdown')) dropdown.hidden = true;
  });

  function addTreatment(id) {
    if (!currentPatient()) {
      toast('Please select a patient first');
      posView.querySelector('#posSearch')?.focus();
      return;
    }
    const treatment = POS_TREATMENTS.find((item) => item.id === id);
    if (!treatment) return;
    const existing = session.cart.find((item) => item.id === id);
    if (existing) {
      if (existing.qty >= 20) {
        toast('Quantity cannot be more than 20');
        return;
      }
      existing.qty += 1;
    } else session.cart.push({ ...treatment, qty: 1 });
    paintTreatments();
    paintCart();
    toast(`Added: ${treatment.name}`);
  }

  function openPay() {
    const patient = currentPatient();
    if (!patient || !session.cart.length || !canEdit) return;
    session.method = '';
    session.paymentRequestId = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const totals = bill();
    const aid = patient.medicalAid || {};
    const modal = root.querySelector('#posPayModal');
    modal.hidden = false;
    modal.innerHTML = `
      <div class="dental-pos-modal__box" role="dialog" aria-modal="true" aria-labelledby="posPayTitle">
        <header><h3 id="posPayTitle">Process payment</h3><button type="button" data-close aria-label="Close">×</button></header>
        <div class="dental-pos-modal__body">
          <p class="dental-pos__due"><span>Total amount due</span><strong>${zar(totals.totalCents / 100)}</strong></p>
          <div class="dental-pos__methods">
            ${['cash', 'card', 'medical_aid', 'eft', 'mobile', 'split'].map((method) => `<button type="button" data-method="${method}"><i class="fa-solid ${methodIcon(method)}"></i><span>${method === 'mobile' ? 'Mobile' : POS_METHOD_LABELS[method]}</span></button>`).join('')}
          </div>
          <div class="dental-pos__detail" data-detail="cash" hidden><label>Amount received (R)<input id="posCash" type="number" min="0" step="0.01" /></label><p id="posChange" hidden></p></div>
          <div class="dental-pos__detail" data-detail="card" hidden><label>Card reference<input id="posCard" type="text" maxlength="8" placeholder="Last 4 digits" /></label></div>
          <div class="dental-pos__detail" data-detail="medical_aid" hidden>
            <label>Medical aid scheme<input id="posScheme" type="text" maxlength="80" value="${escapeHtml(aid.scheme || '')}" placeholder="For example, Discovery Health" /></label>
            <label>Membership number<input id="posMember" type="text" maxlength="40" value="${escapeHtml(aid.membershipNumber || '')}" /></label>
            <p class="form-hint">Filled from the client file when those details are already there. This receipt does not submit the claim.</p>
          </div>
          <div class="dental-pos__detail" data-detail="eft" hidden><label>EFT reference<input id="posEft" type="text" maxlength="40" /></label></div>
          <div class="dental-pos__detail" data-detail="mobile" hidden><label>Transaction ID<input id="posMobile" type="text" maxlength="40" /></label></div>
          <div class="dental-pos__detail" data-detail="split" hidden>
            <label>Cash (R)<input id="posSplitCash" type="number" min="0" step="0.01" /></label>
            <label>Card (R)<input id="posSplitCard" type="number" min="0" step="0.01" /></label>
            <label>Medical aid (R)<input id="posSplitMed" type="number" min="0" step="0.01" /></label>
            <p id="posSplitMsg"></p>
          </div>
          <p id="posPayError" class="form-hint" role="alert" hidden></p>
        </div>
        <footer>
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="button" class="btn btn-primary" id="posComplete">Complete</button>
        </footer>
      </div>`;
    modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => { modal.hidden = true; }));
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.hidden = true; });
    modal.querySelector('.dental-pos__methods').addEventListener('click', (event) => {
      const button = event.target.closest('[data-method]');
      if (!button) return;
      session.method = button.dataset.method;
      modal.querySelectorAll('[data-method]').forEach((item) => item.classList.toggle('is-selected', item === button));
      modal.querySelectorAll('[data-detail]').forEach((detail) => { detail.hidden = detail.dataset.detail !== session.method; });
      if (session.method === 'split') paintSplit();
    });
    modal.querySelector('#posCash').addEventListener('input', () => {
      const received = Number(modal.querySelector('#posCash').value) || 0;
      const change = received - totals.totalCents / 100;
      const box = modal.querySelector('#posChange');
      box.hidden = !(received > 0 && change >= 0);
      box.textContent = `Change: ${zar(change)}`;
    });
    ['#posSplitCash', '#posSplitCard', '#posSplitMed'].forEach((selector) => {
      modal.querySelector(selector).addEventListener('input', paintSplit);
    });
    modal.querySelector('#posComplete').addEventListener('click', () => completePay(modal, totals));
  }

  function paintSplit() {
    const modal = root.querySelector('#posPayModal');
    const total = bill().totalCents / 100;
    const cash = Number(modal.querySelector('#posSplitCash').value) || 0;
    const card = Number(modal.querySelector('#posSplitCard').value) || 0;
    const medical = Number(modal.querySelector('#posSplitMed').value) || 0;
    const remaining = total - (cash + card + medical);
    const message = modal.querySelector('#posSplitMsg');
    message.textContent = `Remaining: ${zar(remaining)}`;
    message.classList.toggle('is-short', remaining > 0);
  }

  async function completePay(modal, totals) {
    const error = modal.querySelector('#posPayError');
    error.hidden = true;
    if (!session.method) {
      error.hidden = false;
      error.textContent = 'Please select a payment method.';
      return;
    }
    const payload = {
      phone: currentPatient().phone,
      items: session.cart.map((item) => ({ id: item.id, qty: item.qty })),
      discountPercent: totals.discountPercent,
      method: session.method,
      servedBy,
      idempotencyKey: session.paymentRequestId,
    };
    if (session.method === 'cash') {
      payload.cashReceived = Number(modal.querySelector('#posCash').value) || 0;
      if (cents(payload.cashReceived) < totals.totalCents) {
        error.hidden = false;
        error.textContent = `Insufficient amount. Still need ${zar((totals.totalCents - cents(payload.cashReceived)) / 100)}`;
        return;
      }
    }
    if (session.method === 'split') {
      payload.split = {
        cash: Number(modal.querySelector('#posSplitCash').value) || 0,
        card: Number(modal.querySelector('#posSplitCard').value) || 0,
        medical: Number(modal.querySelector('#posSplitMed').value) || 0,
      };
      if (cents(payload.split.cash) + cents(payload.split.card) + cents(payload.split.medical) < totals.totalCents) {
        error.hidden = false;
        error.textContent = 'Split payments must cover the full amount.';
        return;
      }
    }
    if (session.method === 'card') payload.cardReference = modal.querySelector('#posCard').value;
    if (session.method === 'medical_aid') {
      payload.medicalScheme = modal.querySelector('#posScheme').value;
      payload.membershipNumber = modal.querySelector('#posMember').value;
    }
    if (session.method === 'eft') payload.eftReference = modal.querySelector('#posEft').value;
    if (session.method === 'mobile') payload.mobileReference = modal.querySelector('#posMobile').value;

    const button = modal.querySelector('#posComplete');
    button.disabled = true;
    const result = await createDentalSaleApi(companyId, payload);
    button.disabled = false;
    if (result.error) {
      error.hidden = false;
      error.textContent = result.error;
      return;
    }
    const sale = result.data?.sale;
    if (sale) sales.unshift(sale);
    const patient = currentPatient();
    if (patient && sale) {
      patient.visits += 1;
      patient.lastVisit = (saleWhen(sale.createdAt) || new Date()).toISOString().slice(0, 10);
    }
    root.querySelector('#posHistBadge').textContent = String(sales.length);
    void invalidateHub(companyId);
    modal.hidden = true;
    session.cart = [];
    session.discount = '';
    session.paymentRequestId = '';
    showReceipt(sale, true);
    paintTill();
  }

  function showReceipt(sale, fresh) {
    if (!sale) return;
    session.receipt = sale;
    const when = saleWhen(sale.createdAt) || new Date();
    const date = when.toLocaleDateString('en-ZA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    const time = when.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    const modal = root.querySelector('#posReceiptModal');
    modal.hidden = false;
    modal.innerHTML = `
      <div class="dental-pos-modal__box" role="dialog" aria-modal="true">
        <header><h3>${fresh ? 'Payment successful' : 'Receipt'}</h3><button type="button" data-close aria-label="Close">×</button></header>
        <div class="dental-pos-modal__body">
          <article class="dental-pos-receipt" id="posReceipt">
            <h4>SmileMore Dentists</h4>
            <p>Shop 04, City Square Mall, Rustenburg</p>
            <p>Tel: 014 592 9220</p>
            <p><span>Receipt</span><strong>${escapeHtml(sale.receiptNo || '')}</strong></p>
            <p><span>Date</span><span>${escapeHtml(`${date} ${time}`)}</span></p>
            <p><span>Patient</span><span>${escapeHtml(sale.patientName || '')} (${escapeHtml(sale.phone || '')})</span></p>
            ${(sale.items || []).map((item) => `<p><span>${escapeHtml(item.name)} × ${item.qty}</span><span>${zar(item.lineTotal ?? item.price * item.qty)}</span></p>`).join('')}
            <p><span>Subtotal</span><span>${zar(sale.subtotal)}</span></p>
            ${sale.discountPercent > 0 ? `<p><span>Discount (${sale.discountPercent}%)</span><span>− ${zar(sale.discountAmount)}</span></p>` : ''}
            <p class="is-total"><span>Total</span><strong>${zar(sale.total)}</strong></p>
            <p><span>Payment</span><span>${escapeHtml(POS_METHOD_LABELS[sale.method] || sale.method || '')}</span></p>
            ${sale.method === 'cash' ? `<p><span>Received</span><span>${zar(sale.cashReceived)}</span></p><p><span>Change</span><span>${zar(sale.change)}</span></p>` : ''}
            ${sale.method === 'split' && sale.split ? `<p><span>Cash</span><span>${zar(sale.split.cash)}</span></p><p><span>Card</span><span>${zar(sale.split.card)}</span></p><p><span>Medical aid</span><span>${zar(sale.split.medical)}</span></p>` : ''}
            ${sale.method === 'medical_aid' ? `<p><span>Scheme</span><span>${escapeHtml(sale.medicalScheme || '—')}</span></p><p><span>Membership</span><span>${escapeHtml(sale.membershipNumber || '—')}</span></p>` : ''}
            <p class="dental-pos-receipt__thanks">Thank you. Served by ${escapeHtml(sale.servedBy || servedBy)}.</p>
          </article>
        </div>
        <footer class="dental-pos-modal__send">
          <button type="button" class="btn btn-secondary" id="posPrint"><i class="fa-solid fa-print"></i> Print</button>
          <button type="button" class="btn btn-secondary" id="posSendWhatsapp"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
          <label>Email<input id="posReceiptEmail" type="email" value="${escapeHtml(emailFor(sale))}" placeholder="client@email.com" /></label>
          <button type="button" class="btn btn-secondary" id="posSendEmail"><i class="fa-solid fa-envelope"></i> Email</button>
          <button type="button" class="btn btn-primary" id="posNewSale">New sale</button>
          <p id="posSendStatus" class="form-hint" hidden></p>
        </footer>
      </div>`;
    modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => { modal.hidden = true; }));
    modal.querySelector('#posPrint').addEventListener('click', () => {
      document.body.classList.add('dental-pos-printing');
      window.print();
      document.body.classList.remove('dental-pos-printing');
    });
    modal.querySelector('#posSendWhatsapp').addEventListener('click', () => shareReceipt(sale, 'whatsapp', modal));
    modal.querySelector('#posSendEmail').addEventListener('click', () => shareReceipt(sale, 'email', modal));
    modal.querySelector('#posNewSale').addEventListener('click', () => {
      modal.hidden = true;
      session.patientId = '';
      session.cart = [];
      session.discount = '';
      switchView('pos');
      paintTill();
      toast('Ready for a new transaction');
    });
  }

  function emailFor(sale) {
    return patients.find((patient) => patient.id === digitsPhone(sale.phone))?.email || '';
  }

  async function shareReceipt(sale, channel, modal) {
    const status = modal.querySelector('#posSendStatus');
    status.hidden = false;
    status.textContent = channel === 'whatsapp' ? 'Sending on WhatsApp…' : 'Preparing the email…';
    const payload = { channel };
    if (channel === 'email') {
      payload.email = modal.querySelector('#posReceiptEmail')?.value.trim() || '';
      if (!payload.email) {
        status.textContent = 'Add an email address for this client.';
        return;
      }
      const patient = patients.find((item) => item.id === digitsPhone(sale.phone));
      if (patient && patient.email !== payload.email) {
        await saveDentalPatientApi(companyId, patient.id, { fullName: patient.raw?.fullName || `${patient.firstName} ${patient.lastName}`.trim(), email: payload.email });
        patient.email = payload.email;
      }
    }
    const result = await sendDentalReceiptApi(companyId, sale.id, payload);
    if (result.error && !result.data?.waUrl) {
      status.textContent = result.error;
      return;
    }
    const data = result.data || {};
    if (data.waUrl) {
      window.open(data.waUrl, '_blank', 'noopener');
      status.textContent = 'WhatsApp did not send from the practice number. A chat with the receipt is open so you can send it.';
      return;
    }
    if (data.mailto) {
      window.open(data.mailto, '_blank');
      status.textContent = 'Your email is open with the receipt ready to send.';
      return;
    }
    status.textContent = 'Receipt sent on WhatsApp.';
  }

  function paintHistory() {
    const labels = { cash: 'Cash', card: 'Card', medical_aid: 'Medical aid', eft: 'EFT', mobile: 'Mobile', split: 'Split' };
    historyView.innerHTML = `
      <section class="card"><div class="card-body">
        <h3>Transactions</h3>
        <div class="dental-pos__table-wrap"><table class="dental-pos__table">
          <thead><tr><th>Receipt</th><th>Time</th><th>Patient</th><th>Items</th><th>Total</th><th>Payment</th><th></th></tr></thead>
          <tbody>${sales.length ? sales.map((sale) => {
            const when = saleWhen(sale.createdAt);
            const items = (sale.items || []).map((item) => item.name).join(', ');
            return `<tr>
              <td><strong>${escapeHtml(sale.receiptNo || '')}</strong></td>
              <td>${when ? escapeHtml(when.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })) : '—'}</td>
              <td>${escapeHtml(sale.patientName || '')}</td>
              <td>${escapeHtml(items.slice(0, 35))}</td>
              <td><strong>${zar(sale.total)}</strong></td>
              <td>${escapeHtml(labels[sale.method] || sale.method || '')}</td>
              <td><button type="button" class="btn btn-secondary btn-sm" data-reprint="${escapeHtml(sale.receiptNo || '')}"><i class="fa-solid fa-print"></i></button></td>
            </tr>`;
          }).join('') : '<tr><td colspan="7">No transactions yet</td></tr>'}</tbody>
        </table></div>
      </div></section>`;
    historyView.querySelector('tbody').addEventListener('click', (event) => {
      const button = event.target.closest('[data-reprint]');
      if (!button) return;
      const sale = sales.find((item) => item.receiptNo === button.dataset.reprint);
      if (sale) showReceipt(sale, false);
    });
  }

  function paintPatients() {
    const query = patientsView.querySelector('#posPatientSearch')?.value || session.patientQuery || '';
    session.patientQuery = query;
    const filtered = patients.filter((patient) => {
      const hay = `${patient.firstName} ${patient.lastName} ${patient.phone}`.toLowerCase();
      return !query.trim() || hay.includes(query.trim().toLowerCase());
    });
    patientsView.innerHTML = `
      <section class="card"><div class="card-body">
        <div class="dental-pos__patient-head">
          <h3>Patient library</h3>
          <label>Search<input id="posPatientSearch" type="search" value="${escapeHtml(query)}" /></label>
          <button type="button" class="btn btn-primary" id="posAddPatient" ${canEdit ? '' : 'disabled'}><i class="fa-solid fa-plus"></i> Add patient</button>
        </div>
        <div class="dental-pos__table-wrap"><table class="dental-pos__table">
          <thead><tr><th>Patient</th><th>Phone</th><th>Gender</th><th>Email</th><th>Last till visit</th><th>Till visits</th><th></th></tr></thead>
          <tbody>${filtered.length ? filtered.map((patient) => `<tr>
            <td><strong>${escapeHtml(`${patient.firstName} ${patient.lastName}`.trim())}</strong></td>
            <td>${escapeHtml(patient.phone)}</td>
            <td>${escapeHtml(patient.gender || '—')}</td>
            <td>${escapeHtml(patient.email || '—')}</td>
            <td>${escapeHtml(patient.lastVisit || '—')}</td>
            <td>${patient.visits}</td>
            <td>
              <button type="button" class="btn btn-secondary btn-sm" data-use="${escapeHtml(patient.id)}">Use on till</button>
              <button type="button" class="btn btn-secondary btn-sm" data-edit="${escapeHtml(patient.id)}" ${canEdit ? '' : 'disabled'}>Edit</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="7">No patients found. Add a client here, or save them in the client database.</td></tr>'}</tbody>
        </table></div>
        <p class="form-hint">Showing ${filtered.length} of ${patients.length}. Visits count receipts on this till. The client file still holds the booking diary.</p>
      </div></section>`;
    patientsView.querySelector('#posPatientSearch').addEventListener('input', (event) => {
      session.patientQuery = event.target.value;
      paintPatients();
      patientsView.querySelector('#posPatientSearch')?.focus();
    });
    patientsView.querySelector('#posAddPatient')?.addEventListener('click', () => openPatientForm(null));
    patientsView.querySelector('tbody').addEventListener('click', (event) => {
      const use = event.target.closest('[data-use]');
      const edit = event.target.closest('[data-edit]');
      if (use) {
        session.patientId = use.dataset.use;
        switchView('pos');
        paintTill();
        const patient = currentPatient();
        if (patient) toast(`Selected: ${patient.firstName} ${patient.lastName}`.trim());
      }
      if (edit && canEdit) openPatientForm(patients.find((patient) => patient.id === edit.dataset.edit));
    });
  }

  function openPatientForm(patient) {
    const modal = root.querySelector('#posPatientModal');
    const person = patient ? names(patient.raw?.fullName || `${patient.firstName} ${patient.lastName}`) : { firstName: '', lastName: '' };
    modal.hidden = false;
    modal.innerHTML = `
      <div class="dental-pos-modal__box" role="dialog" aria-modal="true">
        <header><h3>${patient ? 'Edit patient' : 'Add new patient'}</h3><button type="button" data-close aria-label="Close">×</button></header>
        <form class="dental-pos-modal__body" id="posPatientForm">
          <label>First name<input name="firstName" required value="${escapeHtml(person.firstName === 'Client' && !patient ? '' : person.firstName)}" /></label>
          <label>Last name<input name="lastName" required value="${escapeHtml(person.lastName)}" /></label>
          <label>Gender<select name="gender" required>
            <option value="">Select</option>
            <option value="male" ${patient?.gender === 'male' ? 'selected' : ''}>Male</option>
            <option value="female" ${patient?.gender === 'female' ? 'selected' : ''}>Female</option>
          </select></label>
          <label>Address<input name="address" required value="${escapeHtml(patient?.address || patient?.raw?.address || '')}" /></label>
          <label>Phone number<input name="phone" required value="${escapeHtml(patient?.phone || '')}" ${patient ? 'readonly' : ''} /></label>
          <label>Email<input name="email" type="email" value="${escapeHtml(patient?.email || '')}" /></label>
          <fieldset class="dental-pos__paypref">
            <legend>Paying with</legend>
            <label><input type="radio" name="paymentPreference" value="cash" ${(patient?.paymentPreference || 'cash') !== 'medical_aid' ? 'checked' : ''} /> Cash</label>
            <label><input type="radio" name="paymentPreference" value="medical_aid" ${patient?.paymentPreference === 'medical_aid' ? 'checked' : ''} /> Medical aid</label>
          </fieldset>
          <div id="posAidFields" ${patient?.paymentPreference === 'medical_aid' ? '' : 'hidden'}>
            <label>Medical scheme<select name="scheme">${schemeOptions(patient?.medicalAid?.scheme)}</select></label>
            <label>Option<input name="option" value="${escapeHtml(patient?.medicalAid?.option || '')}" /></label>
            <label>Membership number<input name="membershipNumber" value="${escapeHtml(patient?.medicalAid?.membershipNumber || '')}" /></label>
            <label>Dependant code<input name="dependantCode" value="${escapeHtml(patient?.medicalAid?.dependantCode || '')}" /></label>
            <label>Principal member<input name="principalMemberName" value="${escapeHtml(patient?.medicalAid?.principalMemberName || '')}" /></label>
            <label>Relationship<select name="relationship">
              <option value="">Select</option>
              <option value="principal" ${patient?.medicalAid?.relationship === 'principal' ? 'selected' : ''}>Principal member</option>
              <option value="dependant" ${patient?.medicalAid?.relationship === 'dependant' ? 'selected' : ''}>Dependant</option>
            </select></label>
          </div>
          <p class="form-hint">Saving here adds the person to the client database and CRM. The phone number is the file.</p>
          <p id="posPatientError" class="form-hint" role="alert" hidden></p>
        </form>
        <footer>
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="button" class="btn btn-primary" id="posSavePatient">Save patient</button>
        </footer>
      </div>`;
    modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => { modal.hidden = true; }));
    modal.querySelectorAll('[name="paymentPreference"]').forEach((input) => {
      input.addEventListener('change', () => {
        const aid = modal.querySelector('#posAidFields');
        if (aid) aid.hidden = modal.querySelector('[name="paymentPreference"]:checked')?.value !== 'medical_aid';
      });
    });
    modal.querySelector('#posSavePatient').addEventListener('click', () => savePatient(modal, patient));
  }

  async function savePatient(modal, existing) {
    const form = modal.querySelector('#posPatientForm');
    const data = new FormData(form);
    const firstName = String(data.get('firstName') || '').trim();
    const lastName = String(data.get('lastName') || '').trim();
    const phone = String(data.get('phone') || '').trim();
    const paymentPreference = String(data.get('paymentPreference') || '');
    const error = modal.querySelector('#posPatientError');
    if (!firstName || !lastName || !phone || !String(data.get('address') || '').trim() || !String(data.get('gender') || '')) {
      error.hidden = false;
      error.textContent = 'Please fill in first name, last name, gender, address, and phone number.';
      return;
    }
    const medicalAid = paymentPreference === 'medical_aid'
      ? {
          scheme: String(data.get('scheme') || ''),
          option: String(data.get('option') || ''),
          membershipNumber: String(data.get('membershipNumber') || ''),
          dependantCode: String(data.get('dependantCode') || ''),
          principalMemberName: String(data.get('principalMemberName') || ''),
          relationship: String(data.get('relationship') || ''),
        }
      : undefined;
    const button = modal.querySelector('#posSavePatient');
    button.disabled = true;
    const result = await saveDentalPatientApi(companyId, digitsPhone(phone) || phone, {
      fullName: `${firstName} ${lastName}`.trim(),
      phone,
      email: String(data.get('email') || '').trim(),
      gender: String(data.get('gender') || ''),
      address: String(data.get('address') || '').trim(),
      paymentPreference,
      ...(medicalAid ? { medicalAid } : {}),
    });
    button.disabled = false;
    if (result.error) {
      error.hidden = false;
      error.textContent = result.error;
      return;
    }
    const saved = toTillPatient(result.data?.patient || {}, sales);
    const index = patients.findIndex((patient) => patient.id === saved.id);
    if (index >= 0) patients[index] = { ...patients[index], ...saved, visits: patients[index].visits, lastVisit: patients[index].lastVisit };
    else patients.push(saved);
    patients.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    root.querySelector('#posPatBadge').textContent = String(patients.length);
    modal.hidden = true;
    paintPatients();
    toast(existing ? `Patient ${firstName} ${lastName} updated` : `Patient ${firstName} ${lastName} added`);
  }

  root.querySelector('.dental-pos__tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-view]');
    if (tab) switchView(tab.dataset.view);
  });
  paintTill();
}

function toTillPatient(patient, sales) {
  const phone = patient.phone || patient.id || '';
  const id = digitsPhone(phone) || phone;
  const person = names(patient.fullName);
  const mine = sales
    .filter((sale) => digitsPhone(sale.phone) === id)
    .sort((a, b) => String(saleWhen(b.createdAt)?.toISOString() || '').localeCompare(String(saleWhen(a.createdAt)?.toISOString() || '')));
  const latest = mine[0] ? saleWhen(mine[0].createdAt) : null;
  return {
    id,
    firstName: person.firstName,
    lastName: person.lastName,
    gender: patient.gender || '',
    phone,
    email: patient.email || '',
    address: patient.address || '',
    paymentPreference: patient.paymentPreference || '',
    lastVisit: latest ? latest.toISOString().slice(0, 10) : '',
    visits: mine.length,
    medicalAid: patient.medicalAid || {},
    raw: patient,
  };
}

function schemeOptions(selected) {
  const schemes = SA_MEDICAL_SCHEMES.filter((scheme) => scheme !== 'Private / cash');
  return `<option value="">Select scheme</option>${schemes.map((scheme) => `<option value="${escapeHtml(scheme)}"${scheme === selected ? ' selected' : ''}>${escapeHtml(scheme)}</option>`).join('')}`;
}

function methodIcon(method) {
  return {
    cash: 'fa-money-bill-wave',
    card: 'fa-credit-card',
    medical_aid: 'fa-hospital',
    eft: 'fa-building-columns',
    mobile: 'fa-mobile-screen',
    split: 'fa-divide',
  }[method] || 'fa-wallet';
}
