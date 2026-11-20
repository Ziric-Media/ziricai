/**
 * SN-NEWS — Sarah News UI (live RSS via API when signed in).
 */
(function initSarahNews(global) {
  const STORAGE_KEY = 'sarah.news.profile.v1';
  let activeEdition = null;

  const REGIONS = [
    { id: 'za', label: 'South Africa' },
    { id: 'zw', label: 'Zimbabwe' },
    { id: 'africa', label: 'Africa' },
    { id: 'world', label: 'World' },
  ];

  const INTERESTS = [
    { id: 'politics', label: 'Politics' },
    { id: 'business', label: 'Business & finance' },
    { id: 'tech', label: 'Technology & AI' },
    { id: 'sports', label: 'Sports' },
    { id: 'entertainment', label: 'Entertainment' },
    { id: 'health', label: 'Health & science' },
    { id: 'mining', label: 'Mining & resources' },
    { id: 'education', label: 'Education' },
    { id: 'auto', label: 'Automotive' },
    { id: 'religion', label: 'Religion' },
    { id: 'fashion', label: 'Fashion & lifestyle' },
  ];

  const BRIEFINGS = [
    { id: 'morning', label: 'Morning briefing' },
    { id: 'lunch', label: 'Lunchtime briefing' },
    { id: 'evening', label: 'Evening briefing' },
  ];

  function isLive() {
    return Boolean(global.SarahLive?.isLiveEnabled?.() && global.SarahLive?.fetchSarahNewsEdition);
  }

  function loadLocalProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveLocalProfile(profile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }));
    } catch {
      /* ignore */
    }
  }

  function defaultProfile() {
    return {
      regions: ['za', 'zw', 'world'],
      interests: ['business', 'tech', 'sports', 'politics'],
      briefings: { morning: true, lunch: true, evening: true },
      breaking: false,
      language: 'en',
    };
  }

  async function resolveProfile() {
    if (isLive()) {
      const res = await global.SarahLive.fetchSarahNewsProfile();
      if (res.profile?.regions?.length) return res.profile;
    }
    return loadLocalProfile();
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function greetingForSlot(slot) {
    if (slot === 'lunch') return 'Good afternoon';
    if (slot === 'evening') return 'Good evening';
    return 'Good morning';
  }

  function editionMeta(edition) {
    const d = new Date(edition?.compiledAt || Date.now());
    const day = d.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase();
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const slot = String(edition?.slot || 'morning');
    const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
    return `${day} · ${slotLabel} · ${time}`;
  }

  function regionSummary(profile) {
    return (profile?.regions || [])
      .map((id) => REGIONS.find((r) => r.id === id)?.label)
      .filter(Boolean)
      .join(' · ');
  }

  function chipGroup(title, field, options, selected, { briefingKey } = {}) {
    const items = options
      .map((opt) => {
        const checked = briefingKey
          ? Boolean(selected?.briefings?.[opt.id])
          : (selected || []).includes(opt.id);
        const inputAttr = briefingKey
          ? `data-briefing="${opt.id}"`
          : `value="${opt.id}"`;
        return `<label class="snews-pill ${checked ? 'is-on' : ''}">
          <input type="checkbox" ${inputAttr} ${checked ? 'checked' : ''} class="snews-pill-input"/>
          <span class="snews-pill-label">${escapeHtml(opt.label)}</span>
        </label>`;
      })
      .join('');
    return `
      <section class="snews-setup-card">
        <h3 class="snews-setup-card-title">${escapeHtml(title)}</h3>
        <div class="snews-pill-grid" data-news-field="${field}">${items}</div>
      </section>`;
  }

  function bindPillToggles(root) {
    root?.querySelectorAll('.snews-pill').forEach((label) => {
      const input = label.querySelector('input');
      input?.addEventListener('change', () => {
        label.classList.toggle('is-on', input.checked);
      });
    });
  }

  function renderSetup(host, profile, onDone) {
    const p = profile || defaultProfile();
    host.innerHTML = `
      <div class="snews-setup-shell">
        <div class="snews-setup-hero">
          <p class="snews-setup-eyebrow">Sarah News</p>
          <h2 class="snews-setup-heading">Your briefing, your world</h2>
          <p class="snews-setup-lead">Choose regions and topics. Sarah compiles headlines from trusted publisher feeds — you tap through for the full story.</p>
        </div>
        ${chipGroup('Where should Sarah look?', 'regions', REGIONS, p.regions || [])}
        ${chipGroup('What interests you?', 'interests', INTERESTS, p.interests || [])}
        ${chipGroup('When should Sarah brief you?', 'briefings', BRIEFINGS, p, { briefingKey: true })}
        <section class="snews-setup-card snews-setup-card--toggle">
          <label class="snews-toggle-row">
            <input type="checkbox" id="snewsBreaking" ${p.breaking ? 'checked' : ''}/>
            <span><strong>Breaking news alerts</strong><small>Coming soon — breaking pipeline (SN-04)</small></span>
          </label>
        </section>
        <button type="button" class="btn btn-primary snews-primary-cta" id="snewsSaveSetup">Save &amp; open briefing</button>
        ${isLive() ? '' : '<p class="snews-foot">Sign in to sync preferences across devices.</p>'}
      </div>`;
    bindPillToggles(host);

    host.querySelector('#snewsSaveSetup')?.addEventListener('click', async () => {
      const regions = [...host.querySelectorAll('[data-news-field="regions"] input:checked')].map((el) => el.value);
      const interests = [...host.querySelectorAll('[data-news-field="interests"] input:checked')].map((el) => el.value);
      const briefings = {};
      BRIEFINGS.forEach((b) => {
        briefings[b.id] = Boolean(host.querySelector(`[data-briefing="${b.id}"]`)?.checked);
      });
      const next = {
        regions,
        interests,
        briefings,
        breaking: Boolean(host.querySelector('#snewsBreaking')?.checked),
        language: 'en',
      };
      if (!regions.length) {
        global.showProtoToast?.('Pick at least one region');
        return;
      }
      saveLocalProfile(next);
      if (isLive()) {
        const saved = await global.SarahLive.saveSarahNewsProfile(next);
        if (saved.error) {
          global.showProtoToast?.(saved.error);
          return;
        }
      }
      onDone(next);
    });
  }

  function storyCard(s) {
    const meta = [s.region ? REGIONS.find((r) => r.id === s.region)?.label : null, s.publisher]
      .filter(Boolean)
      .join(' · ');
    return `
      <article class="snews-story-card" data-news-story="${escapeHtml(s.storyId)}" role="button" tabindex="0">
        <div class="snews-story-card-top">
          ${s.breaking ? '<span class="snews-badge snews-badge--breaking">Breaking</span>' : ''}
          ${meta ? `<span class="snews-story-meta">${escapeHtml(meta)}</span>` : ''}
        </div>
        <h4 class="snews-story-head">${escapeHtml(s.headline)}</h4>
        <p class="snews-story-sum">${escapeHtml(s.summary)}</p>
        <span class="snews-story-more">Read story →</span>
      </article>`;
  }

  function bindStoryCards(host, storiesById) {
    host.querySelectorAll('[data-news-story]').forEach((card) => {
      const open = () => openStory(card.getAttribute('data-news-story'), storiesById);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  function bindAskButtons(host) {
    host.querySelectorAll('[data-news-ask]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-news-ask') || '';
        if (typeof global.deliverPersonalSarahMessage === 'function') {
          void global.deliverPersonalSarahMessage(q, { fromHomeCompose: false });
          global.setRoute?.('home');
        } else {
          global.showProtoToast?.('Sign in to chat with Personal Sarah');
        }
      });
    });
  }

  function renderDigest(host, profile, edition) {
    activeEdition = edition;
    const storiesById = edition.storiesById || {};
    const top = edition.topStories || [];
    const headlines = edition.headlines || [];
    const disclaimer =
      edition.disclaimer || 'Headlines from publisher RSS feeds. Tap for source article.';

    host.innerHTML = `
      <header class="snews-hero-card">
        <p class="snews-greet">${escapeHtml(greetingForSlot(edition.slot))}!</p>
        <h2 class="snews-hero-title">Your Sarah News briefing</h2>
        <p class="snews-edition">${escapeHtml(editionMeta(edition))}</p>
        <p class="snews-regions">${escapeHtml(regionSummary(profile))}</p>
        <p class="snews-disclaimer">${escapeHtml(disclaimer)}</p>
      </header>
      ${top.length ? `<section class="snews-block"><h3 class="snews-block-title">Top stories</h3><div class="snews-story-list">${top.map(storyCard).join('')}</div></section>` : ''}
      <section class="snews-block">
        <h3 class="snews-block-title">Headlines</h3>
        <div class="snews-story-list">${headlines.length ? headlines.map(storyCard).join('') : '<p class="snews-empty">No headlines matched your filters right now. Try adding World or more interests.</p>'}</div>
      </section>
      <section class="snews-ask-card">
        <h3 class="snews-block-title">Ask Sarah about the news</h3>
        <div class="snews-quick">
          <button type="button" class="snews-quick-btn" data-news-ask="Explain the top headline in simple terms for South Africa">Explain the top story</button>
          <button type="button" class="snews-quick-btn" data-news-ask="Summarise Zimbabwe-related headlines today">More Zimbabwe news</button>
          <button type="button" class="snews-quick-btn" data-news-ask="Business and economy headlines today">Business headlines</button>
          <button type="button" class="snews-quick-btn" data-news-ask="What is trending in technology news?">What's trending?</button>
        </div>
      </section>
      <div class="snews-actions">
        <button type="button" class="btn btn-secondary" id="snewsRefreshEdition">Refresh briefing</button>
        <button type="button" class="btn btn-ghost" id="snewsEditSetup">Edit preferences</button>
      </div>`;

    bindStoryCards(host, storiesById);
    bindAskButtons(host);

    host.querySelector('#snewsEditSetup')?.addEventListener('click', () => {
      renderSetup(host, profile, (next) => loadDigest(host, next));
    });
    host.querySelector('#snewsRefreshEdition')?.addEventListener('click', () => {
      loadDigest(host, profile);
    });
  }

  function openStory(storyId, storiesById) {
    const map = storiesById || activeEdition?.storiesById || {};
    const story = map[storyId];
    if (!story) return;
    const overlay = document.getElementById('snewsStoryOverlay');
    const body = document.getElementById('snewsStoryBody');
    if (!overlay || !body) return;
    const link = story.link
      ? `<a class="snews-source-link" href="${escapeHtml(story.link)}" target="_blank" rel="noopener noreferrer">Open article at ${escapeHtml(story.publisher || 'publisher')}</a>`
      : '';
    body.innerHTML = `
      <p class="snews-story-meta">${escapeHtml(story.publisher || 'Source')}</p>
      <h3 class="snews-room-title">${escapeHtml(story.headline)}</h3>
      <p class="snews-confidence">Source status: ${escapeHtml(story.confidence || 'confirmed')}</p>
      <p class="snews-room-body">${escapeHtml(story.summary)}</p>
      ${link}
      <div class="snews-quick snews-quick--room">
        <button type="button" class="snews-quick-btn" data-story-ask="How does this affect ordinary people in South Africa?">How does this affect people?</button>
        <button type="button" class="snews-quick-btn" data-story-ask="Give me more background on this headline">More background</button>
      </div>`;
    body.querySelectorAll('[data-story-ask]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = `${btn.getAttribute('data-story-ask')} Headline: ${story.headline}`;
        closeStory();
        if (typeof global.deliverPersonalSarahMessage === 'function') {
          void global.deliverPersonalSarahMessage(q);
          global.setRoute?.('home');
        }
      });
    });
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeStory() {
    const overlay = document.getElementById('snewsStoryOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function bindStoryOverlayOnce() {
    if (global.__snewsOverlayBound) return;
    global.__snewsOverlayBound = true;
    document.getElementById('snewsStoryOverlay')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-snews-story-close]')) closeStory();
    });
  }

  function renderLoading(host, message) {
    host.innerHTML = `
      <div class="snews-loading">
        <div class="snews-loading-shimmer" aria-hidden="true"></div>
        <p>${escapeHtml(message || 'Sarah is compiling your briefing…')}</p>
      </div>`;
  }

  async function loadDigest(host, profile) {
    renderLoading(host, 'Sarah is reading publisher feeds…');
    if (isLive()) {
      const res = await global.SarahLive.fetchSarahNewsEdition();
      if (res.edition) {
        renderDigest(host, profile, res.edition);
        return;
      }
      if (res.error) {
        host.innerHTML = `<p class="snews-error">${escapeHtml(res.error)}</p><button type="button" class="btn btn-secondary" id="snewsRetry">Try again</button>`;
        host.querySelector('#snewsRetry')?.addEventListener('click', () => loadDigest(host, profile));
        return;
      }
    }
    renderDigest(host, profile, {
      slot: 'morning',
      compiledAt: new Date().toISOString(),
      disclaimer: 'Sign in for live headlines. Showing empty preview.',
      topStories: [],
      headlines: [],
      storiesById: {},
    });
  }

  async function renderNewsPanel() {
    const host = document.getElementById('snewsHost');
    if (!host) return;
    bindStoryOverlayOnce();
    renderLoading(host);
    const profile = await resolveProfile();
    if (!profile?.regions?.length) {
      renderSetup(host, profile, (next) => loadDigest(host, next));
      return;
    }
    await loadDigest(host, profile);
  }

  global.SarahNews = {
    renderNewsPanel,
    loadLocalProfile,
    saveLocalProfile,
    defaultProfile,
  };
})(window);