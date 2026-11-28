/**
 * ST-UX-03b — organisation lookup against Sarah Network directory.
 */

function escAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export async function searchTaskOrganisations(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return { matches: [] };
  if (window.SarahLive?.searchPersonalTaskOrganisations) {
    return window.SarahLive.searchPersonalTaskOrganisations(q);
  }
  if (window.SarahLive?.fetchDiscoverCompanies) {
    const res = await window.SarahLive.fetchDiscoverCompanies({ q, limit: 8 });
    if (res?.error) return { error: res.error, matches: [] };
    const companies = res.companies || res.data?.companies || [];
    return {
      matches: companies.map((c) => ({
        companyId: c.companyId || c.id,
        snId: c.snId,
        displayName: c.displayName || c.name,
        verified: Boolean(c.verified),
      })),
    };
  }
  return { matches: [] };
}

export function bindOrganisationNetworkLookup(root, { esc, onPick } = {}) {
  const fields = root.querySelectorAll('[data-st-org-input]');
  fields.forEach((input) => {
    const listId = input.getAttribute('aria-controls');
    const list = listId ? root.querySelector(`#${listId}`) : null;
    if (!list) return;
    let timer = null;
    let lastQ = '';
    const paint = (matches) => {
      if (!matches?.length) {
        list.innerHTML = '';
        list.hidden = true;
        return;
      }
      list.hidden = false;
      list.innerHTML = matches
        .map(
          (m) =>
            `<button type="button" class="st-org-match" data-company-id="${escAttr(m.companyId)}" data-sn-id="${escAttr(m.snId || '')}">
        <span class="st-org-match-name">${esc ? esc(m.displayName) : m.displayName}</span>
        ${m.verified ? '<span class="st-org-match-badge">Verified</span>' : ''}
      </button>`
        )
        .join('');
      list.querySelectorAll('.st-org-match').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.querySelector('.st-org-match-name')?.textContent || '';
          input.value = name;
          input.dataset.networkCompanyId = btn.getAttribute('data-company-id') || '';
          input.dataset.networkSnId = btn.getAttribute('data-sn-id') || '';
          list.hidden = true;
          onPick?.({ displayName: name, companyId: input.dataset.networkCompanyId, snId: input.dataset.networkSnId });
        });
      });
    };
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (q.length < 2) {
        list.hidden = true;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (q === lastQ) return;
        lastQ = q;
        void searchTaskOrganisations(q).then((res) => {
          if (res?.error) return;
          paint(res.matches || []);
        });
      }, 280);
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        list.hidden = true;
      }, 180);
    });
  });
}

export function orgMetaFromForm(formOrRoot) {
  const input = formOrRoot?.querySelector?.('[data-st-org-input]');
  if (!input) return {};
  const companyId = input.dataset.networkCompanyId;
  const snId = input.dataset.networkSnId;
  const organisation = String(input.value || '').trim();
  const meta = { organisation };
  if (companyId) meta.networkCompanyId = companyId;
  if (snId) meta.networkSnId = snId;
  return meta;
}