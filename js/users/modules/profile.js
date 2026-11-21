import { fetchKnowledgeSections, saveKnowledgeSection } from '../api.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function renderProfile(host) {
  host.innerHTML = `<div class="sarah-module"><h2>Profile</h2><p class="sarah-module-hint">Loading My Knowledge…</p></div>`;
  const res = await fetchKnowledgeSections();
  if (res.error) {
    host.innerHTML = `<div class="sarah-module"><h2>Profile</h2><p class="sarah-module-hint">${escapeHtml(res.error)}</p></div>`;
    return;
  }

  const sections = res.data?.sections || [];
  host.innerHTML = `
    <div class="sarah-module sarah-profile-module">
      <h2>Profile & My Knowledge</h2>
      <p class="sarah-module-hint">Sections you mark “Sarah may use” are included in My Sarah replies only — never shared with companies automatically.</p>
      <div class="sarah-knowledge-list">
        ${sections
          .map(
            (sec) => `
          <article class="sarah-knowledge-card" data-section="${escapeHtml(sec.sectionKey)}">
            <header>
              <strong>${escapeHtml(sec.label)}</strong>
              <span class="sarah-tag">${escapeHtml(sec.classification)}</span>
            </header>
            <label class="sarah-knowledge-toggle">
              <input type="checkbox" data-field="sarahMayUse" ${sec.sarahMayUse ? 'checked' : ''} />
              Sarah may use this section
            </label>
            <textarea data-field="content" rows="4" placeholder="Add details…">${escapeHtml(sec.content || '')}</textarea>
            <button type="button" class="btn btn-secondary btn-sm" data-save>Save section</button>
            <p class="sarah-knowledge-status" data-status></p>
          </article>`
          )
          .join('')}
      </div>
    </div>`;

  host.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-section]');
      const sectionKey = card?.dataset.section;
      if (!sectionKey) return;
      const content = card.querySelector('[data-field="content"]')?.value ?? '';
      const sarahMayUse = card.querySelector('[data-field="sarahMayUse"]')?.checked ?? false;
      const status = card.querySelector('[data-status]');
      if (status) status.textContent = 'Saving…';
      const save = await saveKnowledgeSection(sectionKey, { content, sarahMayUse });
      if (status) {
        status.textContent = save.error ? save.error : 'Saved';
      }
    });
  });
}
