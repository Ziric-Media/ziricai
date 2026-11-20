/**
 * SN-NEWS — Sarah News UI (live RSS via API when signed in).
 */
(function initSarahNews(global) {
  const STORAGE_KEY = 'sarah.news.profile.v1';
  let activeEdition = null;
  let activeProfile = null;
  let digestScrollTop = 0;

  const REGIONS = [
    { id: 'za', label: 'South Africa' },
    { id: 'zw', label: 'Zimbabwe' },
    { id: 'africa', label: 'Africa' },
    { id: 'world', label: 'World' },
  ];

  const INTERESTS = [
    { id: 'shorts', label: 'Shorts & trending' },
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
      interests: ['shorts', 'business', 'tech', 'sports', 'politics'],
      briefings: { morning: true, lunch: true, evening: true },
      breaking: false,
      language: 'en',
    };
  }

  async function syncProfileToCloud(profile) {
    if (!isLive() || !profile?.regions?.length) return profile;
    const saved = await global.SarahLive.saveSarahNewsProfile(profile);
    if (saved.profile?.regions?.length) return saved.profile;
    if (saved.error) global.showProtoToast?.(saved.error);
    return profile;
  }

  async function resolveProfile() {
    const local = loadLocalProfile();
    if (!isLive()) return local;
    const res = await global.SarahLive.fetchSarahNewsProfile();
    if (res.profile?.regions?.length) {
      saveLocalProfile(res.profile);
      return res.profile;
    }
    if (local?.regions?.length) return syncProfileToCloud(local);
    return null;
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
          <p class="snews-setup-lead">Pick regions and topics. Sarah pulls from many media houses — SA, Zimbabwe, Africa, world, tech, sports, shorts — and writes everything in-app.</p>
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

  function localArticleBody(story) {
    const summary = String(story.summary || story.headline || '').trim();
    return [
      `Here's what I'm seeing: ${summary}`,
      'Sarah is summarising verified reporting for you inside the app.',
    ].join('\n\n');
  }

  function articleParagraphs(story) {
    const raw = story.articleBody || localArticleBody(story);
    return String(raw)
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  function storyCard(s, { featured = false } = {}) {
    const meta = [s.region ? REGIONS.find((r) => r.id === s.region)?.label : null, s.publisher]
      .filter(Boolean)
      .join(' · ');
    const hasImg = Boolean(s.imageUrl);
    const banner = hasImg
      ? `<div class="snews-story-banner${featured ? ' snews-story-banner--featured' : ''}"><img class="snews-story-banner-img" src="${escapeHtml(s.imageUrl)}" alt="" loading="lazy" decoding="async" width="640" height="360"/></div>`
      : `<div class="snews-story-banner snews-story-banner--placeholder${featured ? ' snews-story-banner--featured' : ''}" aria-hidden="true"></div>`;
    return `
      <article class="snews-story-card snews-story-card--banner${featured ? ' snews-story-card--featured' : ''}" data-news-story="${escapeHtml(s.storyId)}" role="button" tabindex="0">
        ${banner}
        <div class="snews-story-card-inner">
          <div class="snews-story-card-top">
            ${s.breaking ? '<span class="snews-badge snews-badge--breaking">Breaking</span>' : ''}
            ${meta ? `<span class="snews-story-meta">${escapeHtml(meta)}</span>` : ''}
          </div>
          <h4 class="snews-story-head">${escapeHtml(s.headline)}</h4>
          <p class="snews-story-sum">${escapeHtml(s.summary)}</p>
          <span class="snews-story-more">Read in Sarah News →</span>
        </div>
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
    activeProfile = profile;
    host.classList.remove('snews-host--article');
    const storiesById = edition.storiesById || {};
    const top = edition.topStories || [];
    const headlines = edition.headlines || [];
    const disclaimer =
      edition.disclaimer || 'Headlines from your selected media houses. Tap for the in-app article.';
    const pubs = Array.isArray(edition.publishers) ? edition.publishers.filter(Boolean).slice(0, 8) : [];
    const pubLine = pubs.length
      ? `<p class="snews-publishers">Today from ${escapeHtml(pubs.join(' · '))}${pubs.length < (edition.publishers?.length || 0) ? ' · …' : ''}</p>`
      : '';

    host.innerHTML = `
      <header class="snews-hero-card">
        <p class="snews-greet">${escapeHtml(greetingForSlot(edition.slot))}!</p>
        <h2 class="snews-hero-title">Your Sarah News briefing</h2>
        <p class="snews-edition">${escapeHtml(editionMeta(edition))}</p>
        <p class="snews-regions">${escapeHtml(regionSummary(profile))}</p>
        <p class="snews-disclaimer">${escapeHtml(disclaimer)}</p>
        ${pubLine}
      </header>
      ${top.length ? `<section class="snews-block"><h3 class="snews-block-title">Top stories</h3><div class="snews-story-list">${top.map((s) => storyCard(s, { featured: true })).join('')}</div></section>` : ''}
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
    const host = document.getElementById('snewsHost');
    if (!host || !activeEdition) return;
    digestScrollTop = host.parentElement?.scrollTop ?? host.scrollTop;
    host.classList.add('snews-host--article');
    host.scrollTop = 0;
    if (host.parentElement) host.parentElement.scrollTop = 0;

    const hero = story.imageUrl
      ? `<div class="snews-article-hero"><img src="${escapeHtml(story.imageUrl)}" alt="" loading="lazy"/></div>`
      : '<div class="snews-article-hero snews-article-hero--placeholder" aria-hidden="true"></div>';
    const paras = articleParagraphs(story)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('');
    const foot =
      story.sourceNote ||
      (story.publisher ? `Story taken from ${story.publisher}.` : 'Story compiled by Sarah from verified publisher feeds.');

    host.innerHTML = `
      <article class="snews-article-page">
        <button type="button" class="snews-article-back" id="snewsArticleBack" aria-label="Back to briefing">← Back to briefing</button>
        ${hero}
        <div class="snews-article-main">
          <span class="snews-story-meta">${escapeHtml(story.publisher || 'News')}</span>
          <h1 class="snews-article-title">${escapeHtml(story.headline)}</h1>
          <p class="snews-article-byline">Written for you by Sarah</p>
          <div class="snews-article-body">${paras}</div>
          <footer class="snews-article-foot">${escapeHtml(foot)}</footer>
          <section class="snews-opinion-card" aria-labelledby="snewsOpinionHeading">
            <h3 id="snewsOpinionHeading">Sarah's take</h3>
            <p class="snews-opinion-lead">Ask Sarah for her opinion on this story — she answers here, without sending you to another site.</p>
            <button type="button" class="btn btn-primary" id="snewsAskOpinion">Ask Sarah for her opinion</button>
            <div class="snews-opinion-reply hidden" id="snewsOpinionReply" role="status"></div>
          </section>
        </div>
      </article>`;

    host.querySelector('#snewsArticleBack')?.addEventListener('click', () => {
      renderDigest(host, activeProfile, activeEdition);
      const scroller = host.parentElement || host;
      requestAnimationFrame(() => {
        scroller.scrollTop = digestScrollTop;
      });
    });

    host.querySelector('#snewsAskOpinion')?.addEventListener('click', async () => {
      const replyEl = host.querySelector('#snewsOpinionReply');
      const btn = host.querySelector('#snewsAskOpinion');
      if (!replyEl || !btn) return;
      if (!global.SarahLive?.sendPersonalMessage && !global.deliverPersonalSarahMessage) {
        global.showProtoToast?.('Sign in to ask Sarah');
        return;
      }
      btn.disabled = true;
      replyEl.classList.remove('hidden');
      replyEl.textContent = '';
      replyEl.classList.add('snews-opinion-loading');
      replyEl.textContent = 'Sarah is thinking…';
      const prompt = [
        'Give a clear, balanced personal opinion on this news story for a Sarah News reader.',
        'Stay factual, note uncertainty, and avoid telling them to open external websites.',
        `Headline: ${story.headline}`,
        `Publisher feed: ${story.publisher || 'unknown'}`,
        `Article: ${articleParagraphs(story).join(' ')}`,
      ].join('\n\n');
      try {
        let reply = '';
        if (global.SarahLive?.sendPersonalMessage) {
          const res = await global.SarahLive.sendPersonalMessage(prompt);
          if (res.error) {
            replyEl.textContent = res.error;
            btn.disabled = false;
            return;
          }
          reply = res.reply || '';
        } else {
          await global.deliverPersonalSarahMessage(prompt);
          reply = 'I added this to your My Sarah chat — open My Sarah to continue the thread.';
        }
        replyEl.classList.remove('snews-opinion-loading');
        replyEl.textContent = reply;
      } catch (err) {
        replyEl.classList.remove('snews-opinion-loading');
        replyEl.textContent = err?.message || 'Could not reach Sarah right now.';
        btn.disabled = false;
      }
    });
  }

  function bindStoryOverlayOnce() {
    /* legacy overlay unused — in-app article reader (SN-02) */
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
        const needsSetup =
          res.code === 'NEWS_PROFILE_MISSING' ||
          /setup first/i.test(String(res.error || ''));
        if (needsSetup) {
          const synced = await syncProfileToCloud(profile);
          if (synced?.regions?.length) {
            const retry = await global.SarahLive.fetchSarahNewsEdition();
            if (retry.edition) {
              renderDigest(host, synced, retry.edition);
              return;
            }
          }
          renderSetup(host, profile || defaultProfile(), (next) => loadDigest(host, next));
          global.showProtoToast?.('Set up Sarah News, then tap Save & open briefing.');
          return;
        }
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