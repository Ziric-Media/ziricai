const {
  SARAH_AVATAR_SRC,
  MOCK_USER,
  MOCK_CHATS,
  MOCK_THREAD,
  MOCK_MY_KNOWLEDGE,
  MOCK_MY_SARAH_REMINDER,
  MOCK_SARAH_BILLING_TIERS,
  MOCK_MY_SARAH_HISTORY,
  MOCK_MY_SARAH_PERSONAL_THREADS,
  MOCK_MY_SARAH_QUICK,
  MOCK_FEED,
  MOCK_FEED_TABS,
  MOCK_DISCOVER_CATEGORIES,
  MOCK_DISCOVER_COMPANIES,
  MOCK_MY_ORGANISATIONS_SUGGESTED_IDS,
  MOCK_MY_WALLET,
  MOCK_SARAH_PAY,
  MOCK_PROFILE,
  MOCK_BUSINESS_PROFILE,
  MOCK_BUSINESS_PROFILE_POSTS,
  MOCK_BUSINESS_PROFILE_ACTIVITY,
  MOCK_BUSINESS_PROFILE_ACCOUNT_SECTIONS,
  MOCK_PROFILE_POSTS,
  MOCK_PROFILE_PHOTOS,
  MOCK_PROFILE_VIDEOS,
  MOCK_PROFILE_ACTIVITY,
  MOCK_PROFILE_SAVED,
  MOCK_PROFILE_ACCOUNT_SECTIONS,
  MOCK_NOTIFICATIONS,
  COMPANY_AVATARS,
} = window.SARAH_PROTOTYPE;

const verifiedBadge = (window.SARAH_ICONS && window.SARAH_ICONS.verifiedBadge) || '';
const SARAH_ICONS = window.SARAH_ICONS || {};

/** Resolve relative asset paths from the folder that contains js/app.js (file:// safe). */
let prototypeAssetBase = null;
function prototypeAsset(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (prototypeAssetBase === null) {
    const script = [...document.scripts].reverse().find((s) => /\/js\/app\.js(\?|$)/.test(s.src));
    prototypeAssetBase = script?.src ? script.src.replace(/js\/app\.js(\?.*)?$/, '') : '';
  }
  const rel = String(path).replace(/^\.\//, '');
  return prototypeAssetBase ? prototypeAssetBase + rel : rel;
}

function resolveItemAvatar(item) {
  if (!item) return MOCK_USER.avatar;
  if (item.avatar) return item.avatar;
  const map = COMPANY_AVATARS || {};
  if (item.avatarKey && map[item.avatarKey]) return map[item.avatarKey];
  return MOCK_USER.avatar;
}

function getFeedEngagement() {
  const rt = getSarahRuntime();
  if (!rt.feedEngagement) {
    rt.feedEngagement = { liked: {}, saved: {}, commentExtra: {} };
  }
  return rt.feedEngagement;
}

function feedEngagementCounts(item) {
  const eng = getFeedEngagement();
  const id = item.id || '';
  return {
    likes: (item.likes ?? 0) + (eng.liked[id] ? 1 : 0),
    comments: (item.comments ?? 0) + (eng.commentExtra[id] || 0),
    liked: Boolean(eng.liked[id]),
    saved: Boolean(eng.saved[id]),
  };
}

function feedEngageButton(iconKey, label, postId, kind, active) {
  const icon = SARAH_ICONS[iconKey] || '';
  const activeClass = active ? ' is-active' : '';
  return `<button type="button" class="feed-engage-btn${activeClass}" data-feed-engage="${escapeHtml(kind)}" data-post-id="${escapeHtml(postId)}"><span class="feed-engage-icon" aria-hidden="true">${icon}</span><span class="feed-engage-label">${escapeHtml(label)}</span></button>`;
}

function showProtoToast(message) {
  const el = document.getElementById('protoToast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(showProtoToast._t);
  showProtoToast._t = setTimeout(() => el.classList.add('hidden'), 2200);
}

function handleFeedEngageClick(btn) {
  const kind = btn.dataset.feedEngage;
  const postId = btn.dataset.postId;
  if (!kind || !postId) return;
  const eng = getFeedEngagement();
  if (kind === 'like') {
    eng.liked[postId] = !eng.liked[postId];
    showProtoToast(eng.liked[postId] ? 'Added to your likes' : 'Like removed');
  } else if (kind === 'comment') {
    eng.commentExtra[postId] = (eng.commentExtra[postId] || 0) + 1;
    showProtoToast('Comment added (prototype)');
  } else if (kind === 'share') {
    showProtoToast('Link copied — ready to share');
  } else if (kind === 'save') {
    eng.saved[postId] = !eng.saved[postId];
    showProtoToast(eng.saved[postId] ? 'Saved to your list' : 'Removed from saved');
  }
  const { route } = parseLocationHash();
  if (route === 'status') renderHome();
  if (route === 'profile' && activeProfileSocialTab === 'posts') renderProfileSocialTab();
}

function profileImgOnError(fallback) {
  const safe = escapeHtml(prototypeAsset(fallback || ''));
  return `onerror="if(this.dataset.fb)return;this.dataset.fb=1;this.src='${safe}'"`;
}

function formatFeedStatCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

const FEED_STATS_HEART =
  '<svg class="feed-stats-heart" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14s-4.5-3-6-5.5C.5 6.5 1.5 4 4 3c1.2-.5 2.5 0 3.5 1 1-1 2.3-1.5 3.5-1 2.5 1 3.5 3.5 2 5.5C12.5 11 8 14 8 14z"/></svg>';

function feedCommentAvatarUrl(author) {
  const seed = encodeURIComponent(String(author || 'user').replace(/\s+/g, ''));
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
}

function renderFeedCommentLine(c) {
  const author = c.author || 'Someone';
  const avatar = escapeHtml(feedCommentAvatarUrl(author));
  return `<div class="feed-comment">
    <img class="avatar avatar-xs feed-comment-avatar" src="${avatar}" alt="" width="32" height="32" loading="lazy" />
    <div class="feed-comment-bubble">
      <div class="feed-comment-bubble-inner">
        <span class="feed-comment-author text-comment-user">${escapeHtml(author)}</span>
        <span class="feed-comment-text text-comment">${escapeHtml(c.text || '')}</span>
      </div>
    </div>
  </div>`;
}

function renderFeedStatsRow(counts) {
  if (!counts.likes && !counts.comments) return '';
  const reactions = counts.likes
    ? `<span class="feed-stats-reactions"><span class="feed-stats-icons" aria-hidden="true"><span class="feed-stats-icon">${FEED_STATS_HEART}</span></span><span>${formatFeedStatCount(counts.likes)}</span></span>`
    : '<span class="feed-stats-reactions"></span>';
  const commentSide =
    counts.comments > 0
      ? `<span class="feed-stats-counts text-desc">${formatFeedStatCount(counts.comments)} comments</span>`
      : '<span class="feed-stats-counts"></span>';
  return `<div class="feed-stats">${reactions}${commentSide}</div>`;
}

function renderFeedCommentCompose(postId) {
  const avatarSrc = escapeHtml(prototypeAsset(MOCK_USER.avatar));
  return `<div class="feed-comment-compose">
    <img class="avatar avatar-xs feed-comment-compose-avatar" src="${avatarSrc}" alt="" width="32" height="32" ${profileImgOnError(MOCK_PROFILE.avatarFallback || '')} />
    <button type="button" class="feed-comment-compose-field" data-feed-engage="comment" data-post-id="${escapeHtml(postId)}">Write a comment…</button>
  </div>`;
}

function renderFeedCommentsSection(item, totalComments, postId) {
  const previews = Array.isArray(item.previewComments) ? item.previewComments : [];
  const hasComments = previews.length > 0 || totalComments > 0;
  if (!hasComments) {
    return `<div class="feed-comments">${renderFeedCommentCompose(postId)}</div>`;
  }
  const lines = previews.slice(0, 2).map((c) => renderFeedCommentLine(c)).join('');
  let viewMore = '';
  if (totalComments > previews.length) {
    const label =
      totalComments <= previews.length + 2
        ? 'View more comments'
        : `View all ${totalComments} comments`;
    viewMore = `<button type="button" class="feed-view-comments text-desc">${label}</button>`;
  }
  const previewBlock = lines || viewMore ? `<div class="feed-comments-preview">${lines}${viewMore}</div>` : '';
  return `<div class="feed-comments">${previewBlock}${renderFeedCommentCompose(postId)}</div>`;
}

/** Same card markup as Status timeline (`#feedList`). */
function renderFeedCard(item) {
  const sponsored = item.sponsored ? '<span class="feed-sponsored">Sponsored</span>' : '';
  const verified = item.verified ? verifiedBadge : '';
  const avatarFallback =
    (item.avatarKey && COMPANY_AVATARS?.[item.avatarKey]) ||
    MOCK_PROFILE.avatarFallback ||
    'assets/discover/green-haven-fallback.svg';
  const avatarSrc = escapeHtml(prototypeAsset(resolveItemAvatar(item)));
  const counts = feedEngagementCounts(item);
  const postId = item.id || `post-${escapeHtml(item.author)}-${escapeHtml(item.time)}`;
  const img = item.image
    ? `<div class="feed-media"><img src="${escapeHtml(prototypeAsset(item.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" ${profileImgOnError(item.imageFallback || '')} /></div>`
    : '';
  const likeLabel = counts.liked ? 'Liked' : 'Like';
  return `
      <article class="feed-card" data-feed-post-id="${escapeHtml(postId)}">
        <header class="feed-card-head">
          <img class="avatar avatar-sm feed-card-avatar" src="${avatarSrc}" alt="" width="40" height="40" ${profileImgOnError(avatarFallback)} />
          <div class="feed-card-meta">
            <div class="feed-card-author text-username">${escapeHtml(item.author)} ${verified} ${sponsored}</div>
            <div class="feed-card-time text-timestamp">${escapeHtml(item.time)}${item.authorType ? ` · ${escapeHtml(item.authorType)}` : ''}</div>
          </div>
          <button type="button" class="feed-card-more" aria-label="More options">⋯</button>
        </header>
        <p class="feed-card-body text-post">${escapeHtml(item.body)}</p>
        ${img}
        ${renderFeedStatsRow(counts)}
        <footer class="feed-engage text-action">
          ${feedEngageButton('iconHeart', likeLabel, postId, 'like', counts.liked)}
          ${feedEngageButton('iconComment', 'Comment', postId, 'comment', false)}
          ${feedEngageButton('iconShare', 'Share', postId, 'share', false)}
        </footer>
        ${renderFeedCommentsSection(item, counts.comments, postId)}
      </article>`;
}

function feedMatchesQuery(item, query) {
  if (!query) return true;
  const hay = `${item.author || ''} ${item.body || ''}`.toLowerCase();
  return hay.includes(query);
}

let activeSearchMode = 'chats';
let statusFeedQuery = '';

function unlockProtoSearchInput(input) {
  if (!input || input.dataset.searchUnlocked === '1') return;
  input.dataset.searchUnlocked = '1';
  input.readOnly = false;
  input.removeAttribute('readonly');
}

function openProtoSearchSheet(mode) {
  activeSearchMode = mode === 'feed' ? 'feed' : 'chats';
  const sheet = document.getElementById('protoSearchSheet');
  const title = document.getElementById('protoSearchTitle');
  const input = document.getElementById('protoSearchInput');
  if (title) title.textContent = activeSearchMode === 'feed' ? 'Search Status' : 'Search chats';
  if (input) {
    input.value = activeSearchMode === 'feed' ? statusFeedQuery : '';
    input.placeholder = activeSearchMode === 'feed' ? 'Posts, people, companies…' : 'Chats and Company Sarah…';
    input.readOnly = true;
    input.setAttribute('readonly', 'readonly');
    input.dataset.searchUnlocked = '0';
    input.blur();
    if (!input.dataset.searchTapBound) {
      input.dataset.searchTapBound = '1';
      input.addEventListener('pointerdown', () => unlockProtoSearchInput(input), { passive: true });
    }
  }
  sheet?.classList.remove('hidden');
  sheet?.setAttribute('aria-hidden', 'false');
  renderProtoSearchResults(input?.value.trim().toLowerCase() || '');
}

function closeProtoSearchSheet() {
  const sheet = document.getElementById('protoSearchSheet');
  sheet?.classList.add('hidden');
  sheet?.setAttribute('aria-hidden', 'true');
  if (activeSearchMode === 'feed') {
    statusFeedQuery = '';
    if (parseLocationHash().route === 'status') renderHome();
  }
}

function renderProtoSearchResults(query) {
  const host = document.getElementById('protoSearchResults');
  if (!host) return;
  const q = (query || '').trim().toLowerCase();

  if (activeSearchMode === 'feed') {
    statusFeedQuery = q;
    const userOnTab = getUserCreatedPosts().filter((p) => userPostVisibleOnFeedTab(p, activeFeedTab));
    const mockItems = MOCK_FEED.filter((p) => {
      if (activeFeedTab === 'for-you') return p.tab === 'for-you';
      if (activeFeedTab === 'following') return p.tab === 'following';
      if (activeFeedTab === 'companies') return p.authorType === 'company';
      if (activeFeedTab === 'creators') return p.authorType === 'creator';
      if (activeFeedTab === 'videos') return Boolean(p.image);
      return true;
    });
    const display = mockItems.length ? mockItems : MOCK_FEED.filter((p) => p.tab === 'for-you');
    const all = [...userOnTab, ...display].filter((p) => feedMatchesQuery(p, q));
    if (!q) {
      host.innerHTML = '<p class="proto-search-hint">Type to filter your Status timeline.</p>';
      if (parseLocationHash().route === 'status') renderHome();
      return;
    }
    host.innerHTML = all.length
      ? `<p class="proto-search-meta">${all.length} result${all.length === 1 ? '' : 's'}</p><div class="feed-list proto-search-feed">${all.map((p) => renderFeedCard(p)).join('')}</div>`
      : '<p class="proto-search-empty">No posts match that search.</p>';
    if (parseLocationHash().route === 'status') renderHome();
    return;
  }

  const chats = getAllChats().filter((c) => {
    if (!q) return true;
    const hay = `${c.name} ${c.preview}`.toLowerCase();
    return hay.includes(q);
  });
  host.innerHTML = chats.length
    ? chats
        .map(
          (c) => `
      <button type="button" class="proto-search-chat" data-open-thread="${escapeHtml(c.id)}">
        <img class="avatar avatar-sm" src="${escapeHtml(prototypeAsset(resolveItemAvatar(c)))}" alt="" width="40" height="40" ${profileImgOnError((c.avatarKey && COMPANY_AVATARS?.[c.avatarKey]) || MOCK_PROFILE.avatarFallback)} />
        <span class="proto-search-chat-meta">
          <span class="proto-search-chat-name">${escapeHtml(c.name)}${c.company ? ` ${verifiedBadge}` : ''}</span>
          <span class="proto-search-chat-preview">${escapeHtml(c.preview)}</span>
        </span>
      </button>`
        )
        .join('')
    : `<p class="proto-search-empty">${q ? 'No chats match that search.' : 'Start typing to find a chat.'}</p>`;

  host.querySelectorAll('[data-open-thread]').forEach((btn) => {
    btn.addEventListener('click', () => {
      getSarahRuntime().activeThreadId = btn.dataset.openThread || 'smilemore-demo';
      closeProtoSearchSheet();
      setRoute('chat-thread');
    });
  });
}

function unreadNotificationCount() {
  const dismissed = getSarahRuntime().notifDismissed || {};
  return (MOCK_NOTIFICATIONS || []).filter((n) => n.unread && !dismissed[n.id]).length;
}

function syncNotificationBadge() {
  const count = unreadNotificationCount();
  const badge = document.getElementById('statusNotifBadge');
  if (!badge) return;
  badge.textContent = String(count);
  badge.hidden = count <= 0;
}

function openProtoNotifSheet() {
  const sheet = document.getElementById('protoNotifSheet');
  sheet?.classList.remove('hidden');
  sheet?.setAttribute('aria-hidden', 'false');
  renderProtoNotifications();
}

function closeProtoNotifSheet() {
  document.getElementById('protoNotifSheet')?.classList.add('hidden');
  document.getElementById('protoNotifSheet')?.setAttribute('aria-hidden', 'true');
}

function renderProtoNotifications() {
  const host = document.getElementById('protoNotifList');
  if (!host) return;
  const rt = getSarahRuntime();
  if (!rt.notifDismissed) rt.notifDismissed = {};
  host.innerHTML = (MOCK_NOTIFICATIONS || [])
    .map(
      (n) => `
    <button type="button" class="proto-notif-item ${n.unread && !rt.notifDismissed[n.id] ? 'is-unread' : ''}" data-notif-id="${escapeHtml(n.id)}">
      <span class="proto-notif-title">${escapeHtml(n.title)}</span>
      <span class="proto-notif-body">${escapeHtml(n.body)}</span>
      <span class="proto-notif-time">${escapeHtml(n.time)}</span>
    </button>`
    )
    .join('');

  host.querySelectorAll('[data-notif-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.notifId;
      if (id) rt.notifDismissed[id] = true;
      btn.classList.remove('is-unread');
      syncNotificationBadge();
      if (id === 'n1') {
        closeProtoNotifSheet();
        getSarahRuntime().activeThreadId = 'smilemore-demo';
        setRoute('chat-thread');
      } else if (id === 'n2') {
        closeProtoNotifSheet();
        getSarahRuntime().activeThreadId = 'central-motors';
        setRoute('chat-thread');
      } else {
        showProtoToast('Notification opened (prototype)');
      }
    });
  });
}

function bindProtoSearchAndNotif() {
  if (window.__protoSearchNotifBound) return;
  window.__protoSearchNotifBound = true;

  document.getElementById('homeChatSearchBtn')?.addEventListener('click', () => openProtoSearchSheet('chats'));
  document.getElementById('statusSearchBtn')?.addEventListener('click', () => openProtoSearchSheet('feed'));
  document.getElementById('statusNotifBtn')?.addEventListener('click', openProtoNotifSheet);

  document.getElementById('protoSearchInput')?.addEventListener('input', (e) => {
    renderProtoSearchResults(e.target.value.trim().toLowerCase());
  });

  document.getElementById('chatsTabSearchInput')?.addEventListener('input', () => renderChatsList());

  document.querySelectorAll('[data-proto-sheet-close]').forEach((el) => {
    el.addEventListener('click', () => {
      const which = el.getAttribute('data-proto-sheet-close');
      if (which === 'search') closeProtoSearchSheet();
      if (which === 'notif') closeProtoNotifSheet();
    });
  });

  document.addEventListener('click', (e) => {
    const engage = e.target.closest('[data-feed-engage]');
    if (engage) {
      e.preventDefault();
      handleFeedEngageClick(engage);
    }
  });
}

let activeFeedTab = 'for-you';
let activeDiscoverCategory = 'all';
let activeProfileSocialTab = 'posts';
/** BP-01: 'posts' | 'about' for Business Profile public tab */
let activeProfileBusinessSocialTab = 'posts';
let activeProfilePanel = 'public';
/** BP-01A: persona vs business profile environment */
let activeProfileKind = 'persona';
const PROFILE_KIND_STORAGE_KEY = 'sarah.prototype.profile.activeKind.v1';

const VIEWS = [
  'welcome',
  'auth',
  'home',
  'status',
  'discover',
  'discover-company',
  'chats',
  'chat-thread',
  'profile',
];
const NAV_ROUTES = ['home', 'status', 'discover', 'chats', 'profile'];
const MY_SARAH_PANELS = ['home', 'tasks', 'knowledge', 'organisations', 'wallet', 'pay', 'billing'];

const MW01_DEMO_STORAGE_KEY = 'sarah.prototype.myWallet.demo.v1';
const SYP01_DEMO_STORAGE_KEY = 'sarah.prototype.sarahPay.demo.v1';

function loadSyp01DemoState() {
  try {
    const raw = localStorage.getItem(SYP01_DEMO_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveSyp01DemoState(next) {
  try {
    localStorage.setItem(SYP01_DEMO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function loadMw01DemoState() {
  try {
    const raw = localStorage.getItem(MW01_DEMO_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveMw01DemoState(next) {
  try {
    localStorage.setItem(MW01_DEMO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
const SUB01_SUBSCRIBERS_V1_KEY = 'sarah.prototype.myOrganisations.subscribers.v1';
/** @deprecated Migrated into SUB01_SUBSCRIBERS_V1_KEY — remove after all clients upgraded */
const SUB01_SUBSCRIBED_ORGS_STORAGE_KEY = 'sarah.prototype.myOrganisations.subscribedIds.v1';

function loadSub01SubscribersMap() {
  try {
    let raw = localStorage.getItem(SUB01_SUBSCRIBERS_V1_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(SUB01_SUBSCRIBED_ORGS_STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) {
          const map = {};
          const now = new Date().toISOString();
          parsed.forEach((id) => {
            if (typeof id !== 'string' || !id.trim()) return;
            map[id] = {
              companyId: id,
              hasExistingAccount: true,
              reference: '',
              prefs: { notifications: true, announcements: true, reminders: true },
              verificationStatus: 'verified',
              registeredAt: now,
            };
          });
          localStorage.setItem(SUB01_SUBSCRIBERS_V1_KEY, JSON.stringify(map));
          localStorage.removeItem(SUB01_SUBSCRIBED_ORGS_STORAGE_KEY);
          return map;
        }
      }
      return {};
    }
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function saveSub01SubscribersMap(map) {
  try {
    localStorage.setItem(SUB01_SUBSCRIBERS_V1_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function getSub01Record(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  const map = loadSub01SubscribersMap();
  const rec = map[id];
  return rec && typeof rec === 'object' ? rec : null;
}

function setSub01Record(companyId, record) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const map = loadSub01SubscribersMap();
  map[id] = { ...record, companyId: id };
  saveSub01SubscribersMap(map);
}

function removeSub01Record(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const map = loadSub01SubscribersMap();
  delete map[id];
  saveSub01SubscribersMap(map);
}

function isOrgSubscribedSub01(companyId) {
  return Boolean(getSub01Record(companyId));
}

/** Legacy helper — subscribed id list for suggestions */
function loadSub01SubscribedIds() {
  return Object.keys(loadSub01SubscribersMap());
}

function sub01RefreshSurfaces() {
  const { route, msPanel } = parseLocationHash();
  if (route === 'discover') renderDiscover();
  const companyId = route === 'discover-company' ? parseLocationHash().companyId : null;
  if (route === 'discover-company' && companyId) renderCompanyDetail(companyId);
  if (route === 'home' && msPanel === 'organisations') renderMyOrganisationsPanel();
  if (route === 'home' && msPanel === 'wallet') renderMyWalletPanel();
  if (route === 'home' && msPanel === 'pay') renderSarahPayPanel();
}

function bindSub01RegisterModalOnce() {
  if (window.__sub01RegisterBound) return;
  window.__sub01RegisterBound = true;

  const close = () => {
    const modal = document.getElementById('sub01RegisterModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  };

  document.getElementById('sub01RegisterModal')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-sub01-register-close]')) {
      e.preventDefault();
      close();
    }
  });

  document.getElementById('sub01RegisterSubmit')?.addEventListener('click', () => {
    const idEl = document.getElementById('sub01RegisterCompanyId');
    const companyId = idEl && 'value' in idEl ? String(idEl.value || '').trim() : '';
    if (!companyId) return;
    const hasExisting = Boolean(document.getElementById('sub01AccountYes')?.checked);
    const refEl = document.getElementById('sub01Reference');
    const reference = refEl && 'value' in refEl ? String(refEl.value || '').trim() : '';
    const prefs = {
      notifications: Boolean(document.getElementById('sub01PrefNotify')?.checked),
      announcements: Boolean(document.getElementById('sub01PrefAnnounce')?.checked),
      reminders: Boolean(document.getElementById('sub01PrefRemind')?.checked),
    };
    const prev = getSub01Record(companyId);
    const verificationStatus = !hasExisting ? 'pending' : reference ? 'verified' : 'pending';
    setSub01Record(companyId, {
      hasExistingAccount: Boolean(hasExisting),
      reference,
      prefs,
      verificationStatus,
      registeredAt: prev?.registeredAt || new Date().toISOString(),
    });
    close();
    showProtoToast('Subscription saved (prototype — verification simulated)');
    sub01RefreshSurfaces();
  });

  document.getElementById('sub01RegisterRemove')?.addEventListener('click', () => {
    const idEl = document.getElementById('sub01RegisterCompanyId');
    const companyId = idEl && 'value' in idEl ? String(idEl.value || '').trim() : '';
    if (!companyId) return;
    removeSub01Record(companyId);
    close();
    showProtoToast('Subscription removed');
    sub01RefreshSurfaces();
  });
}

function openSub01RegisterModal(companyId, opts) {
  bindSub01RegisterModalOnce();
  const id = String(companyId || '').trim();
  const company = (MOCK_DISCOVER_COMPANIES || []).find((c) => c.id === id);
  const modal = document.getElementById('sub01RegisterModal');
  if (!modal || !company) {
    showProtoToast('Organisation not found');
    return;
  }

  const titleEl = document.getElementById('sub01RegisterTitle');
  const nameEl = document.getElementById('sub01RegisterOrgName');
  const idInput = document.getElementById('sub01RegisterCompanyId');
  if (idInput) idInput.value = id;
  if (nameEl) nameEl.textContent = company.name;
  const isEdit = Boolean(opts?.edit) || isOrgSubscribedSub01(id);
  if (titleEl) titleEl.textContent = isEdit ? 'Manage subscription' : 'Subscribe to organisation';

  const rec = getSub01Record(id);
  const yes = document.getElementById('sub01AccountYes');
  const no = document.getElementById('sub01AccountNo');
  if (rec) {
    if (yes) yes.checked = rec.hasExistingAccount !== false;
    if (no) no.checked = rec.hasExistingAccount === false;
  } else {
    if (yes) yes.checked = true;
    if (no) no.checked = false;
  }
  const ref = document.getElementById('sub01Reference');
  if (ref) ref.value = rec?.reference || '';
  document.getElementById('sub01PrefNotify').checked = rec?.prefs?.notifications !== false;
  document.getElementById('sub01PrefAnnounce').checked = rec?.prefs?.announcements !== false;
  document.getElementById('sub01PrefRemind').checked = rec?.prefs?.reminders !== false;

  document.getElementById('sub01RegisterRemove')?.classList.toggle('hidden', !rec);

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  ref?.focus();
}

function sub01OpenSubscribeFlow(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return;
  openSub01RegisterModal(id, { edit: isOrgSubscribedSub01(id) });
}

function parseHomeSubRoute(raw) {
  const legacy = raw.replace(/^my-sarah/, 'home');
  if (legacy === 'knowledge' || legacy === 'home/knowledge') {
    return { route: 'home', msPanel: 'knowledge', knowledgeCategory: null };
  }
  if (legacy === 'home/tasks' || legacy === 'home/work' || legacy === 'my-sarah/tasks' || legacy === 'my-sarah/work') {
    return { route: 'home', msPanel: 'tasks' };
  }
  if (legacy === 'home' || legacy.startsWith('home/') || legacy === 'my-sarah' || legacy.startsWith('my-sarah/')) {
    const parts = legacy.split('/').filter(Boolean);
    const sub = parts[1] || 'home';
    const msPanel = MY_SARAH_PANELS.includes(sub) ? sub : 'home';
    let knowledgeCategory = null;
    if (sub === 'knowledge' && parts[2]) {
      knowledgeCategory = decodeURIComponent(parts[2]).trim() || null;
    }
    return { route: 'home', msPanel, companyId: null, knowledgeCategory };
  }
  return null;
}

function parseLocationHash() {
  const raw = (location.hash || '#welcome').replace(/^#/, '') || 'welcome';
  const homeRoute = parseHomeSubRoute(raw);
  if (homeRoute) return homeRoute;
  if (raw === 'knowledge') {
    return { route: 'home', msPanel: 'knowledge', knowledgeCategory: null };
  }
  if (raw.startsWith('discover/')) {
    const companyId = raw.slice('discover/'.length);
    if (companyId) {
      return { route: 'discover-company', msPanel: 'home', companyId };
    }
  }
  if (raw === 'profile/account') {
    return { route: 'profile', msPanel: 'home', companyId: null, profileKind: 'persona', profilePanel: 'account' };
  }
  if (raw === 'profile/business/account') {
    return { route: 'profile', msPanel: 'home', companyId: null, profileKind: 'business', profilePanel: 'account' };
  }
  if (raw === 'profile/business' || raw.startsWith('profile/business/')) {
    const rest = raw.slice('profile/business'.length);
    const sub = rest.startsWith('/') ? rest.slice(1) : rest;
    const profilePanel = sub === 'account' ? 'account' : 'public';
    return { route: 'profile', msPanel: 'home', companyId: null, profileKind: 'business', profilePanel };
  }
  if (raw === 'profile') {
    return { route: 'profile', msPanel: 'home', companyId: null, profileKind: loadStoredProfileKind(), profilePanel: 'public' };
  }
  if (raw.startsWith('profile/') && !raw.startsWith('profile/business')) {
    return { route: 'profile', msPanel: 'home', companyId: null, profileKind: 'persona', profilePanel: 'public' };
  }
  if (raw.startsWith('chat-thread/')) {
    const personalThreadId = decodeURIComponent(raw.slice('chat-thread/'.length)).trim();
    return {
      route: 'chat-thread',
      msPanel: 'home',
      companyId: null,
      profilePanel: 'public',
      profileKind: 'persona',
      personalThreadId: personalThreadId || null,
    };
  }
  const route = VIEWS.includes(raw) ? raw : 'welcome';
  return {
    route,
    msPanel: 'home',
    companyId: null,
    profileKind: 'persona',
    profilePanel: 'public',
    personalThreadId: null,
    knowledgeCategory: null,
  };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderThreadMessageMarkup(message, isPersonal) {
  const fmt = window.SARAH_THREAD_FORMAT;
  if (message.thinking) {
    return `<article class="thread-turn thread-turn--assistant thread-turn--thinking" aria-live="polite">
      <div class="thread-msg thread-msg--assistant">
        <div class="thread-typing" aria-hidden="true">
          <span class="thread-typing-dot"></span>
          <span class="thread-typing-dot"></span>
          <span class="thread-typing-dot"></span>
        </div>
      </div>
    </article>`;
  }
  if (message.role === 'user') {
    const userHtml = fmt ? fmt.formatUserPlain(message.content) : escapeHtml(message.content || '');
    return `<article class="thread-turn thread-turn--user">
      <div class="thread-msg thread-msg--user">${userHtml}</div>
    </article>`;
  }
  const proseKind = isPersonal ? 'thread-prose--personal' : 'thread-prose--company';
  const body = fmt ? fmt.renderAssistantContent(message) : escapeHtml(message.content || message.markdown || '');
  let retry = '';
  if (message.retryable && message.retryText) {
    retry = `<button type="button" class="thread-retry-btn" data-retry-send="${escapeHtml(message.retryText)}">Retry</button>`;
  }
  return `<article class="thread-turn thread-turn--assistant">
    <div class="thread-msg thread-msg--assistant">
      <div class="thread-prose thread-prose--rich ${proseKind}">${body}</div>
      ${retry}
    </div>
  </article>`;
}

function setRoute(route) {
  if (route === 'knowledge') {
    setMySarahPanel('knowledge');
    return;
  }
  if (!VIEWS.includes(route)) route = 'welcome';
  let hash = route;
  if (route === 'chat-thread') {
    const rt = getSarahRuntime();
    const tid = rt.activeThreadId;
    const thread = tid ? rt.threads[tid] : null;
    if (thread?.kind === 'personal' && thread?.api && tid) {
      hash = `chat-thread/${encodeURIComponent(tid)}`;
    }
  }
  if (location.hash.replace(/^#/, '') !== hash) {
    location.hash = hash;
  }
  activateView();
}

function clearLivePersonalSarahState() {
  const rt = getSarahRuntime();
  const keep = {};
  Object.entries(rt.threads || {}).forEach(([id, thread]) => {
    if (!thread?.api) keep[id] = thread;
  });
  rt.threads = keep;
  rt.personalThreadOrder = (rt.personalThreadOrder || []).filter((id) => keep[id]);
  rt.personalThreadsSeeded = false;
  try {
    localStorage.removeItem('sarah.app.personalSarah.sessionId');
    localStorage.removeItem('sarah.prototype.personalSarah.sessionId');
  } catch {
    /* ignore */
  }
}

function mySarahHashForPanel(panel, opts = {}) {
  if (panel === 'home') return 'home';
  if (panel === 'tasks') return 'home/work';
  if (panel === 'knowledge') {
    const cat = String(opts.knowledgeCategory || '').trim();
    return cat ? `home/knowledge/${encodeURIComponent(cat)}` : 'home/knowledge';
  }
  if (panel === 'organisations') return 'home/organisations';
  if (panel === 'wallet') return 'home/wallet';
  if (panel === 'pay') return 'home/pay';
  return `home/${panel}`;
}

function msModeForPanel(panel) {
  return panel === 'tasks' ? 'work' : 'chat';
}

function openMsDrawer() {
  const root = document.querySelector('.my-sarah-view');
  root?.classList.add('is-drawer-open');
  document.getElementById('msDrawer')?.classList.remove('hidden');
  document.getElementById('msDrawerBackdrop')?.classList.remove('hidden');
  document.getElementById('msDrawer')?.setAttribute('aria-hidden', 'false');
  document.getElementById('msDrawerOpen')?.setAttribute('aria-expanded', 'true');
  renderMsDrawerRecents();
  syncUserAvatars();
}

function closeMsDrawer() {
  const root = document.querySelector('.my-sarah-view');
  root?.classList.remove('is-drawer-open');
  document.getElementById('msDrawer')?.classList.add('hidden');
  document.getElementById('msDrawerBackdrop')?.classList.add('hidden');
  document.getElementById('msDrawer')?.setAttribute('aria-hidden', 'true');
  document.getElementById('msDrawerOpen')?.setAttribute('aria-expanded', 'false');
}

function syncMsSegment(panel) {
  const mode = msModeForPanel(panel);
  document.querySelector('.my-sarah-view')?.setAttribute('data-ms-mode', mode);
  document.querySelectorAll('.ms-segment-btn[data-ms-mode]').forEach((btn) => {
    const active = btn.dataset.msMode === mode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function setMySarahPanel(panel, prompt) {
  const p = MY_SARAH_PANELS.includes(panel) ? panel : 'home';
  const { knowledgeCategory } = parseLocationHash();
  const hash = mySarahHashForPanel(p, { knowledgeCategory: p === 'knowledge' ? knowledgeCategory : null });
  const current = location.hash.replace(/^#/, '');
  if (current !== hash) {
    location.hash = hash;
  }
  applyMySarahPanel(p, prompt);
}

function openMyKnowledgeCategory(categoryKey) {
  const key = String(categoryKey || '').trim();
  if (!key) return;
  const hash = `home/knowledge/${encodeURIComponent(key)}`;
  if (location.hash.replace(/^#/, '') !== hash) {
    location.hash = hash;
  } else {
    activateView();
  }
}

function closeMyKnowledgeCategory() {
  if (location.hash.replace(/^#/, '') !== 'home/knowledge') {
    location.hash = 'home/knowledge';
  } else {
    renderKnowledge(null);
  }
}

const MS_SUBMODULE_PANELS = new Set(['knowledge', 'wallet', 'pay', 'organisations', 'tasks', 'billing']);
const MS_PANEL_DISPLAY_TITLES = {
  knowledge: 'Knowledge',
  wallet: 'Wallet',
  pay: 'Pay',
  organisations: 'Organisations',
  tasks: 'Work',
  billing: 'Billing',
};

function applyMySarahPanel(panel, prompt) {
  const root = document.querySelector('.my-sarah-view');
  if (root) root.dataset.msPanel = panel;
  const isSubmodule = MS_SUBMODULE_PANELS.has(panel);
  root?.classList.toggle('is-submodule', isSubmodule);
  const titleEl = document.getElementById('msSubmoduleTitle');
  if (titleEl) titleEl.textContent = isSubmodule ? MS_PANEL_DISPLAY_TITLES[panel] || panel : '';
  closeMsDrawer();
  syncMsSegment(panel);

  document.querySelectorAll('.ms-panel[data-ms-panel]').forEach((el) => {
    const active = el.dataset.msPanel === panel;
    el.classList.toggle('is-active', active);
    el.hidden = !active;
  });

  const compose = document.getElementById('personalChatForm');
  const composeInput = document.getElementById('personalChatInput');
  const showCompose =
    panel === 'home' || panel === 'tasks' || panel === 'organisations' || panel === 'wallet' || panel === 'pay';
  compose?.classList.toggle('hidden', !showCompose);
  if (composeInput) {
    if (panel === 'tasks') composeInput.placeholder = 'Tell Sarah what to do…';
    else if (panel === 'organisations') composeInput.placeholder = 'Ask Sarah about your organisations…';
    else if (panel === 'wallet')
      composeInput.placeholder = 'Ask Sarah about your budget, payments, or savings…';
    else if (panel === 'pay')
      composeInput.placeholder = 'Ask Sarah about paying a bill, your outing cap, or Scan & Pay…';
    else composeInput.placeholder = 'Ask Sarah anything…';
  }

  if (panel === 'knowledge') {
    const { knowledgeCategory } = parseLocationHash();
    renderKnowledge(knowledgeCategory || null);
  }
  if (panel === 'organisations') renderMyOrganisationsPanel();
  if (panel === 'wallet') renderMyWalletPanel();
  if (panel === 'pay') renderSarahPayPanel();
  if (panel === 'billing') renderMySarahBilling();
  if (panel === 'home' || panel === 'tasks') renderMsDrawerRecents();

  if (prompt && composeInput) {
    composeInput.value = prompt;
    requestAnimationFrame(() => composeInput.focus({ preventScroll: true }));
  } else {
    composeInput?.blur();
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae.closest('.ms-panel[hidden]')) {
      ae.blur();
    }
  }
}

function getRoute() {
  return parseLocationHash().route;
}

function goToMySarahHome(prompt) {
  setMySarahPanel('home', prompt || '');
}

function goToMySarahWork(prompt) {
  setMySarahPanel('tasks', prompt || '');
}

function showNav(show) {
  document.querySelector('.bottom-nav')?.classList.toggle('hidden', !show);
}

function getSarahRuntime() {
  if (!window.SARAH_RUNTIME) {
    window.SARAH_RUNTIME = {
      activeThreadId: 'smilemore-demo',
      extraChats: [],
      threads: {},
      personalThreadOrder: [],
      personalThreadsSeeded: false,
      followed: {},
      galleryMeta: {},
      productLikes: {},
      userPosts: [],
    };
  }
  if (!window.SARAH_RUNTIME.userPosts) window.SARAH_RUNTIME.userPosts = [];
  return window.SARAH_RUNTIME;
}

function getUserCreatedPosts() {
  return getSarahRuntime().userPosts;
}

function buildUserFeedPost(body) {
  return {
    id: `user-${Date.now()}`,
    tab: 'for-you',
    author: MOCK_USER.name,
    authorType: 'creator',
    verified: MOCK_PROFILE?.verified,
    avatar: MOCK_USER.avatar,
    time: 'Just now',
    body,
    image: null,
    likes: 0,
    comments: 0,
    sponsored: false,
  };
}

function userPostVisibleOnFeedTab(post, tabId) {
  if (tabId === 'for-you' || tabId === 'following') return true;
  if (tabId === 'creators') return post.authorType === 'creator';
  if (tabId === 'companies') return false;
  if (tabId === 'videos') return Boolean(post.image);
  return true;
}

function openCreatePostSheet() {
  const sheet = document.getElementById('createPostSheet');
  if (!sheet) return;
  syncUserAvatars();
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-create-post-open');
  const input = document.getElementById('createPostInput');
  const submit = document.getElementById('createPostSubmit');
  if (input) {
    input.value = '';
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }
  if (submit) submit.disabled = true;
}

function closeCreatePostSheet() {
  const sheet = document.getElementById('createPostSheet');
  if (!sheet || sheet.classList.contains('hidden')) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-create-post-open');
}

function submitCreatePost() {
  const input = document.getElementById('createPostInput');
  const text = input?.value.trim();
  if (!text) return;
  getUserCreatedPosts().unshift(buildUserFeedPost(text));
  closeCreatePostSheet();
  const { route } = parseLocationHash();
  if (route === 'status') renderHome();
  if (route === 'profile') renderProfile(activeProfilePanel, activeProfileKind);
}

function bindCreatePostUi() {
  if (window.__createPostBound) return;
  window.__createPostBound = true;

  document.querySelectorAll('[data-create-post-open]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openCreatePostSheet();
    });
  });

  document.getElementById('createPostSubmit')?.addEventListener('click', submitCreatePost);
  document.getElementById('createPostInput')?.addEventListener('input', (e) => {
    const submit = document.getElementById('createPostSubmit');
    if (submit) submit.disabled = !e.target.value.trim();
  });
  document.getElementById('createPostInput')?.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submitCreatePost();
    }
  });

  document.querySelectorAll('[data-create-post-close]').forEach((el) => {
    el.addEventListener('click', closeCreatePostSheet);
  });
}

const SARAH_CHAT_GREETING = `**Hi, I'm Sarah.** How can I assist you today?`;

const SARAH_WORK_GREETING = `**Work mode.** Tell me what to get done — I'll queue steps and follow up when automation lands in Phase 3.`;

const PERSONAL_SARAH_IDENTITY_REPLIES = [
  {
    test: (t) => /\bwho\s+are\s+you\b/.test(t) || /\bwhat\s+are\s+you\b/.test(t),
    markdown:
      "I'm **Sarah**, an AI assistant developed by **ZiricAI**. I'm designed to help individuals and businesses with information, tasks, organisation and intelligent assistance.",
  },
  {
    test: (t) => /\bwho\s+created\s+you\b/.test(t) || /\bwho\s+made\s+you\b/.test(t),
    markdown:
      'I was created by **Spencer Gore**, the founder of **ZiricAI**. He envisioned building an intelligent AI ecosystem that helps people and businesses accomplish more through artificial intelligence.',
  },
  {
    test: (t) => /\bfounder\b/.test(t) && (/\btell\b/.test(t) || /\babout\b/.test(t) || /\bwho\b/.test(t)),
    markdown:
      'My founder is **Spencer Gore**, an entrepreneur born and raised in **Zimbabwe**. He is passionate about technology, innovation and entrepreneurship. His entrepreneurial journey began in 2001, and he established **Ziric Media** at the age of 17. He later founded **ZiricAI**, with a vision of making artificial intelligence a practical part of everyday life and business.',
  },
  {
    test: (t) => /\bwhat\s+is\s+ziricai\b/.test(t) || (/\bziricai\b/.test(t) && /\bwhat\b/.test(t)),
    markdown:
      '**ZiricAI** is the technology company behind me. It is developing an AI ecosystem that includes intelligent AI employees, business operating systems and personal AI experiences. Its goal is to help people and organisations work smarter through artificial intelligence.',
  },
];

const PERSONAL_SARAH_REPLY = `**Prototype mode** — live Personal Sarah replies connect in Phase 3.

What works in this preview:

- **Bold** emphasis and structured lists
- Cards, dividers, and inline images
- Full-width replies that are easy to scan`;

const PERSONAL_SARAH_WORK_REPLY = `**Queued in Work mode** (prototype).

:::card
## Next steps

[[badge:Work item]]

1. **Confirm** the details you care about
2. **Run** the task when Phase 3 automation ships
3. **Notify** you when it's done

---

Reply with deadlines or priority anytime.
:::`;

function truncatePersonalTitle(text) {
  const t = String(text || '').trim();
  if (t.length <= 44) return t;
  return `${t.slice(0, 41)}…`;
}

function isGenericPersonalSessionTitle(title) {
  const s = String(title || '')
    .trim()
    .toLowerCase();
  return !s || s === 'my sarah' || s === 'new chat' || s === 'new work item';
}

function headlineFromPreview(preview) {
  const t = String(preview || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  return truncatePersonalTitle(t);
}

/**
 * Saved session title from the server, or a preview-derived headline for list UI.
 */
function getPersonalThreadHeadline(thread) {
  if (!thread) return 'Chat';
  const saved = String(thread.title || thread.name || '').trim();
  if (!isGenericPersonalSessionTitle(saved)) return saved;
  const previewHint = thread.lastMessagePreview;
  if (previewHint) return headlineFromPreview(previewHint);
  const fromMsgs = getPersonalThreadPreview(thread);
  if (fromMsgs && !/^start a conversation/i.test(fromMsgs)) return headlineFromPreview(fromMsgs);
  return saved || 'New chat';
}

function personalThreadFromMock(mock) {
  return {
    kind: 'personal',
    title: mock.title,
    timeLabel: mock.time,
    name: mock.title,
    avatar: SARAH_AVATAR_SRC,
    verified: false,
    messages: mock.messages.map((m) => ({ ...m })),
  };
}

function personalSarahUsesMockThreads() {
  return !window.SarahLive?.isLiveEnabled?.() || !window.SarahLive?.isSignedIn?.();
}

function ensurePersonalThreadsSeeded() {
  if (!personalSarahUsesMockThreads()) return;
  const rt = getSarahRuntime();
  if (rt.personalThreadsSeeded) return;
  rt.personalThreadsSeeded = true;
  rt.personalThreadOrder = MOCK_MY_SARAH_PERSONAL_THREADS.map((t) => t.id);
  MOCK_MY_SARAH_PERSONAL_THREADS.forEach((t) => {
    rt.threads[t.id] = personalThreadFromMock(t);
  });
}

function formatPersonalThreadTime(ts) {
  if (!ts) return '';
  const n = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!Number.isFinite(n)) return '';
  const diff = Date.now() - n;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(n).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function mapApiMessagesToThread(messages) {
  return (messages || []).map((m) =>
    m.role === 'assistant' ? { role: 'assistant', markdown: m.content } : { role: 'user', content: m.content }
  );
}

function upsertPersonalThreadFromSession(session, { partial = false } = {}) {
  if (!session?.id) return null;
  const rt = getSarahRuntime();
  const existing = rt.threads[session.id];
  const messages = partial
    ? existing?.messages || []
    : mapApiMessagesToThread(session.messages);
  if (!messages.length && !partial && personalSarahUsesMockThreads()) {
    messages.push({ role: 'assistant', markdown: SARAH_CHAT_GREETING });
  }
  rt.threads[session.id] = {
    kind: 'personal',
    work: false,
    api: true,
    messagesLoaded: !partial,
    title: session.title || 'My Sarah',
    lastMessagePreview: session.lastMessagePreview || existing?.lastMessagePreview || '',
    timeLabel: formatPersonalThreadTime(session.lastMessageAt || session.updatedAt),
    name: session.title || 'My Sarah',
    avatar: SARAH_AVATAR_SRC,
    verified: false,
    lastMessageAt: session.lastMessageAt || session.updatedAt || Date.now(),
    messages,
  };
  const order = rt.personalThreadOrder || [];
  rt.personalThreadOrder = [session.id, ...order.filter((x) => x !== session.id)];
  return session.id;
}

function getPersonalThreadPreview(thread) {
  const msgs = thread?.messages || [];
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m.role === 'assistant' || m.role === 'user') return m.content || m.markdown || '';
  }
  return 'Start a conversation with Personal Sarah';
}

function listPersonalThreads() {
  if (personalSarahUsesMockThreads()) ensurePersonalThreadsSeeded();
  const rt = getSarahRuntime();
  const ids = personalSarahUsesMockThreads()
    ? rt.personalThreadOrder || []
    : (rt.personalThreadOrder || []).filter((id) => rt.threads[id]?.api);
  const rows = ids
    .map((id) => {
      const thread = rt.threads[id];
      if (!thread || thread.kind !== 'personal') return null;
      return {
        id,
        title: getPersonalThreadHeadline(thread),
        time: thread.timeLabel || formatPersonalThreadTime(thread.lastMessageAt) || '',
        preview: getPersonalThreadPreview(thread),
        lastMessageAt: thread.lastMessageAt || 0,
      };
    })
    .filter(Boolean);
  if (personalSarahUsesMockThreads()) {
    return rows.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  }
  return rows;
}

function prototypePersonalSarahReply(userText, work) {
  if (work) return PERSONAL_SARAH_WORK_REPLY;
  const lower = String(userText || '')
    .toLowerCase()
    .replace(/[?!.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (lower) {
    const match = PERSONAL_SARAH_IDENTITY_REPLIES.find((r) => r.test(lower));
    if (match) {
      return `${match.markdown}\n\n---\n\n_Prototype mode — live Personal Sarah uses the same approved identity on the server._`;
    }
  }
  return PERSONAL_SARAH_REPLY;
}

function assistantReplyForThread(work, userText) {
  return prototypePersonalSarahReply(userText, work);
}

let personalSarahSending = false;
let personalSarahSessionsLoading = false;
let msLiveStatusDismissTimer = null;

function clearMsLiveStatusDismissTimer() {
  if (msLiveStatusDismissTimer) {
    clearTimeout(msLiveStatusDismissTimer);
    msLiveStatusDismissTimer = null;
  }
}

function personalSarahLiveActive() {
  return Boolean(window.SarahLive?.isLiveEnabled?.() && window.SarahLive?.isSignedIn?.());
}

function updatePersonalSarahLiveUi() {
  const el = document.getElementById('msLiveStatus');
  if (!el) return;
  clearMsLiveStatusDismissTimer();
  el.classList.remove('is-dismissing');
  const live = window.SarahLive?.isLiveEnabled?.();
  if (!live) {
    el.classList.remove('hidden');
    el.className = 'ms-live-status ms-live-status--mock';
    el.innerHTML =
      location.protocol === 'file:'
        ? 'Personal Sarah is offline — open via http://localhost (see README) for live API.'
        : 'Personal Sarah is in mock mode (live bridge disabled).';
    return;
  }
  const state = window.SarahLive?.getConnectionState?.() || 'connecting';
  const map = {
    connecting: {
      className: 'ms-live-status ms-live-status--connecting',
      text: 'Connecting to Personal Sarah…',
    },
    connected: {
      className: 'ms-live-status ms-live-status--live',
      text: 'Personal Sarah is connected.',
    },
    offline: {
      className: 'ms-live-status ms-live-status--offline',
      text: 'Personal Sarah is offline. Check your connection and try again.',
    },
    auth_required: {
      className: 'ms-live-status ms-live-status--auth',
      text: 'Sign in to use Personal Sarah with your saved conversations.',
    },
    error: {
      className: 'ms-live-status ms-live-status--error',
      text: 'Personal Sarah could not reach the server. Try again.',
    },
  };
  if (state === 'connected') {
    el.className = 'ms-live-status hidden';
    el.innerHTML = '';
    return;
  }

  const row = map[state] || map.connecting;
  el.classList.remove('hidden');
  el.className = row.className;
  const showRetry = state === 'offline' || state === 'error';
  const showSignIn = state === 'auth_required';
  el.innerHTML = showRetry
    ? `${escapeHtml(row.text)} <button type="button" class="ms-live-retry" id="msLiveRetry">Retry</button>`
    : showSignIn
      ? `${escapeHtml(row.text)} <button type="button" class="ms-live-retry" id="msLiveSignIn">Sign in</button>`
      : escapeHtml(row.text);
  document.getElementById('msLiveSignIn')?.addEventListener('click', () => setRoute('auth'));
  document.getElementById('msLiveRetry')?.addEventListener('click', () => {
    window.SarahLive?.checkApiHealth?.().then(() => {
      updatePersonalSarahLiveUi();
      if (personalSarahLiveActive()) syncPersonalSarahSessionsFromServer();
    });
  });
}

function setPersonalSarahComposeBusy(busy) {
  personalSarahSending = busy;
  document.getElementById('threadComposeForm')?.classList.toggle('is-sending', busy);
  document.getElementById('personalChatForm')?.classList.toggle('is-sending', busy);
  const ti = document.getElementById('threadComposeInput');
  const pi = document.getElementById('personalChatInput');
  if (ti) ti.disabled = busy;
  if (pi) pi.disabled = busy;
}

function applyConsumerProfileToUi(profile) {
  if (!profile) return;
  const name = profile.preferredName || profile.firstName || MOCK_USER.name;
  MOCK_USER.name = name;
  if (profile.email) MOCK_USER.email = profile.email;
  syncUserAvatars();
  document.querySelectorAll('[data-profile-name][data-profile-kind="persona"], [data-profile-name]:not([data-profile-kind])').forEach((el) => {
    el.textContent = name;
  });
}

async function syncPersonalSarahSessionsFromServer() {
  if (!personalSarahLiveActive()) return;
  personalSarahSessionsLoading = true;
  renderMsDrawerRecents();
  const res = await window.SarahLive.fetchPersonalSessions();
  personalSarahSessionsLoading = false;
  if (res.error) {
    showProtoToast(res.error);
    renderMsDrawerRecents();
    return;
  }
  const rt = getSarahRuntime();
  rt.personalThreadOrder = [];
  (res.sessions || []).forEach((summary) => {
    upsertPersonalThreadFromSession(
      {
        id: summary.id,
        title: summary.title,
        lastMessagePreview: summary.lastMessagePreview || '',
        lastMessageAt: summary.lastMessageAt,
        updatedAt: summary.updatedAt,
        messages: summary.lastMessagePreview
          ? [{ role: 'assistant', content: summary.lastMessagePreview }]
          : [],
      },
      { partial: true }
    );
  });
  rt.personalThreadOrder = (res.sessions || []).map((s) => s.id).filter(Boolean);
  renderMsDrawerRecents();
  renderMySarahHistoryFromThreads();
}

async function loadPersonalThreadFromServer(threadId) {
  if (!personalSarahLiveActive()) return true;
  const rt = getSarahRuntime();
  const thread = rt.threads[threadId];
  if (thread?.messagesLoaded) return true;
  const res = await window.SarahLive.fetchPersonalSession(threadId);
  if (res.error) {
    showProtoToast(res.error);
    return false;
  }
  upsertPersonalThreadFromSession(res.session, { partial: false });
  return true;
}

function pushPersonalUserMessage(threadId, text) {
  const rt = getSarahRuntime();
  const thread = rt.threads[threadId];
  if (!thread || thread.kind !== 'personal') return false;
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  thread.messages.push({ role: 'user', content: trimmed });
  if (!thread.title || thread.title === 'New chat' || thread.title === 'New work item') {
    thread.title = truncatePersonalTitle(trimmed);
    thread.name = thread.title;
  }
  thread.timeLabel = 'Just now';
  rt.personalThreadOrder = [threadId, ...rt.personalThreadOrder.filter((x) => x !== threadId)];
  return true;
}

function pushPersonalAssistantReply(threadId, markdown) {
  const rt = getSarahRuntime();
  const thread = rt.threads[threadId];
  if (!thread) return;
  thread.messages.push({ role: 'assistant', markdown: String(markdown || '…') });
}

function removeThinkingBubble(threadId) {
  const rt = getSarahRuntime();
  const thread = rt.threads[threadId];
  if (!thread?.messages?.length) return;
  const last = thread.messages[thread.messages.length - 1];
  if (last?.thinking) thread.messages.pop();
}

async function deliverPersonalSarahMessage(text, opts) {
  const trimmed = String(text || '').trim();
  if (!trimmed || personalSarahSending) return null;
  const work = Boolean(opts && opts.work);
  const isRetry = Boolean(opts && opts.retry);
  const fromHomeCompose = Boolean(opts && opts.fromHomeCompose);
  let threadId = opts?.threadId || null;

  if (window.SarahLive?.isLiveEnabled?.()) {
    if (!window.SarahLive.isSignedIn()) {
      showProtoToast('Sign in to connect Personal Sarah.');
      setRoute('auth');
      return null;
    }
    const conn = window.SarahLive.getConnectionState?.();
    if (conn === 'offline' || conn === 'error') {
      await window.SarahLive.checkApiHealth?.();
      updatePersonalSarahLiveUi();
      if (window.SarahLive.getConnectionState?.() === 'offline' || window.SarahLive.getConnectionState?.() === 'error') {
        showProtoToast('Personal Sarah is offline. Use Retry when your connection is back.');
        return threadId;
      }
    }
    if (!threadId) {
      const created = await startNewPersonalChat({ open: false, work });
      threadId = created;
    }
    if (!threadId) return null;
    if (!isRetry) pushPersonalUserMessage(threadId, trimmed);
    getSarahRuntime().threads[threadId]?.messages.push({ thinking: true });
    if (fromHomeCompose) {
      await openPersonalSarahThread(threadId, { skipServerLoad: true });
    } else {
      renderThread();
    }
    setPersonalSarahComposeBusy(true);
    const res = await window.SarahLive.sendPersonalMessage(trimmed, { work, sessionId: threadId });
    setPersonalSarahComposeBusy(false);
    removeThinkingBubble(threadId);
    if (res.error) {
      const rt = getSarahRuntime();
      const thread = rt.threads[threadId];
      if (thread && isRetry) {
        const msgs = thread.messages;
        if (msgs.length && msgs[msgs.length - 1]?.role === 'user') msgs.pop();
      }
      if (res.code === 'CHAT_QUOTA_EXCEEDED') {
        const limit = res.quota?.limit ?? 'your plan';
        const usage = res.quota?.usage ?? '';
        thread?.messages.push({
          role: 'assistant',
          markdown: `**Daily chat limit reached** — ${usage ? `${usage}/` : ''}${limit} Personal Sarah chats today. Try again tomorrow.`,
        });
        showProtoToast('Daily Personal Sarah chat limit reached.');
      } else {
        thread?.messages.push({
          role: 'assistant',
          markdown: `**Could not reach Sarah** — ${res.error}`,
          retryable: true,
          retryText: trimmed,
        });
        showProtoToast(res.error);
      }
    } else {
      pushPersonalAssistantReply(threadId, res.reply);
      const rt = getSarahRuntime();
      const thread = rt.threads[threadId];
      if (thread) thread.lastMessageAt = Date.now();
    }
    renderThread();
    renderMsDrawerRecents();
    renderMySarahHistoryFromThreads();
    updatePersonalSarahLiveUi();
    return threadId;
  }

  if (threadId) {
    appendPersonalThreadMessage(threadId, trimmed);
    renderThread();
    return threadId;
  }
  return createPersonalThread(trimmed, { work });
}

function createPersonalThread(firstMessage, opts) {
  ensurePersonalThreadsSeeded();
  const rt = getSarahRuntime();
  const work = Boolean(opts && opts.work);
  const id = `ps-${Date.now()}`;
  const greeting = work ? SARAH_WORK_GREETING : SARAH_CHAT_GREETING;
  const messages = [{ role: 'assistant', markdown: greeting }];
  let title = work ? 'New work item' : 'New chat';
  const text = String(firstMessage || '').trim();
  if (text) {
    messages.push({ role: 'user', content: text });
    if (!opts?.deferAssistant) {
      messages.push({ role: 'assistant', markdown: assistantReplyForThread(work, text) });
    }
    title = truncatePersonalTitle(text);
  }
  rt.threads[id] = {
    kind: 'personal',
    work,
    title,
    timeLabel: 'Just now',
    name: title,
    avatar: SARAH_AVATAR_SRC,
    verified: false,
    messages,
  };
  rt.personalThreadOrder = [id, ...rt.personalThreadOrder.filter((x) => x !== id)];
  return id;
}

function appendPersonalThreadMessage(threadId, text) {
  const rt = getSarahRuntime();
  const thread = rt.threads[threadId];
  if (!thread || thread.kind !== 'personal') return;
  const trimmed = String(text || '').trim();
  if (!trimmed) return;
  thread.messages.push({ role: 'user', content: trimmed });
  thread.messages.push({
    role: 'assistant',
    markdown: assistantReplyForThread(thread.work, trimmed),
  });
  if (!thread.title || thread.title === 'New chat') {
    thread.title = truncatePersonalTitle(trimmed);
    thread.name = thread.title;
  }
  thread.timeLabel = 'Just now';
  rt.personalThreadOrder = [threadId, ...rt.personalThreadOrder.filter((x) => x !== threadId)];
}

function persistPersonalSarahSessionId(threadId) {
  if (window.SarahLive?.getSessionId) {
    try {
      localStorage.setItem('sarah.app.personalSarah.sessionId', threadId);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Open a personal thread. Use skipServerLoad when local messages are already correct (e.g. first send from Home).
 */
async function openPersonalSarahThread(threadId, { skipServerLoad = false } = {}) {
  if (personalSarahUsesMockThreads()) ensurePersonalThreadsSeeded();
  const rt = getSarahRuntime();
  if (!rt.threads[threadId] && personalSarahLiveActive()) {
    upsertPersonalThreadFromSession({ id: threadId, title: 'My Sarah', messages: [] }, { partial: true });
  }
  if (!rt.threads[threadId]) return;
  if (personalSarahLiveActive() && !skipServerLoad) {
    const ok = await loadPersonalThreadFromServer(threadId);
    if (!ok) return;
  }
  rt.activeThreadId = threadId;
  persistPersonalSarahSessionId(threadId);
  setRoute('chat-thread');
}

async function startNewPersonalChat(options = {}) {
  const work = Boolean(options.work);
  if (work) goToMySarahWork('');
  else goToMySarahHome('');

  if (personalSarahLiveActive() && !work) {
    const res = await window.SarahLive.createPersonalSession({ title: 'New chat' });
    if (res.error) {
      showProtoToast(res.error);
      return null;
    }
    const id = upsertPersonalThreadFromSession(res.session, { partial: false });
    if (options.open !== false) await openPersonalSarahThread(id);
    return id;
  }

  const id = createPersonalThread('', { work });
  if (options.open !== false) openPersonalSarahThread(id);
  return id;
}

function startNewWorkThread() {
  goToMySarahWork('');
  const id = createPersonalThread('', { work: true });
  openPersonalSarahThread(id);
}

const GALLERY_SIZE = 6;

function getCompanyGallery(company) {
  let items = company.gallery && company.gallery.length ? [...company.gallery] : [];
  if (!items.length && company.image) items = [company.image];
  if (items.length) {
    while (items.length < GALLERY_SIZE) {
      items.push(items[items.length % items.length]);
    }
  }
  return items.slice(0, GALLERY_SIZE);
}

function getCompanyProducts(company) {
  if (company.products && company.products.length) return company.products;
  return [
    {
      id: `${company.id}-sample`,
      name: 'Featured offer',
      price: 199,
      image: company.image,
      description: 'Ask Company Sarah for details and availability.',
    },
  ];
}

function discoverImgAttrs(src, company) {
  const fallback = company.imageFallback || company.image || 'assets/discover/green-haven-fallback.svg';
  const safeFb = escapeHtml(fallback);
  const safeSrc = escapeHtml(src);
  return `src="${safeSrc}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="if(this.dataset.fb)return;this.dataset.fb=1;this.src='${safeFb}'"`;
}

function isProductLiked(companyId, productId) {
  return Boolean(getSarahRuntime().productLikes[`${companyId}:${productId}`]);
}

function toggleProductLike(companyId, productId) {
  const rt = getSarahRuntime();
  const key = `${companyId}:${productId}`;
  rt.productLikes[key] = !rt.productLikes[key];
  return rt.productLikes[key];
}

function getGalleryMetaKey(companyId, index) {
  return `${companyId}:${index}`;
}

function getGalleryLikeState(companyId, index) {
  const rt = getSarahRuntime();
  const key = getGalleryMetaKey(companyId, index);
  if (!rt.galleryMeta[key]) {
    rt.galleryMeta[key] = { liked: false, count: 24 + ((index + 1) * 17) % 90 };
  }
  return rt.galleryMeta[key];
}

function getAllChats() {
  const rt = getSarahRuntime();
  const byId = new Map();
  MOCK_CHATS.forEach((c) => byId.set(c.id, c));
  rt.extraChats.forEach((c) => byId.set(c.id, c));
  return Array.from(byId.values());
}

function upsertRuntimeChat(entry) {
  const rt = getSarahRuntime();
  const idx = rt.extraChats.findIndex((c) => c.id === entry.id);
  if (idx >= 0) rt.extraChats[idx] = entry;
  else rt.extraChats.unshift(entry);
}

function companyAvatarUrl(company) {
  return resolveItemAvatar(company) || company.image || '';
}

function isCompanyFollowed(companyId) {
  return Boolean(getSarahRuntime().followed[companyId]);
}

function toggleCompanyFollow(companyId) {
  const rt = getSarahRuntime();
  rt.followed[companyId] = !rt.followed[companyId];
  return rt.followed[companyId];
}

function getActiveThreadContext() {
  const rt = getSarahRuntime();
  const id = rt.activeThreadId;
  if (rt.threads[id]) {
    const row = rt.threads[id];
    return {
      id,
      ...row,
      name: row.name || row.title || 'Sarah',
      avatar: row.avatar || SARAH_AVATAR_SRC,
    };
  }
  if (id === 'smilemore-demo') {
    return {
      id,
      kind: 'company',
      name: MOCK_THREAD.name,
      avatar: MOCK_THREAD.avatar,
      verified: MOCK_THREAD.verified,
      messages: MOCK_THREAD.messages,
    };
  }
  const chat = getAllChats().find((c) => c.id === id);
  const discoverCo = MOCK_DISCOVER_COMPANIES.find((c) => c.id === id);
  if (discoverCo) {
    const greeting = `Hi ${MOCK_USER.name}, I'm Sarah from ${discoverCo.name}, how can I help you today?`;
    return {
      id,
      kind: 'company',
      name: discoverCo.name,
      avatar: companyAvatarUrl(discoverCo),
      verified: discoverCo.verified,
      messages: [
        {
          role: 'assistant',
          markdown: `**Hi ${MOCK_USER.name}** — I'm Sarah from **${discoverCo.name}**. How can I help you today?`,
        },
      ],
    };
  }
  if (chat) {
    return {
      id,
      kind: 'company',
      name: chat.name,
      avatar: chat.avatar,
      verified: chat.company,
      messages: [
        {
          role: 'assistant',
          markdown: `**Hi ${MOCK_USER.name}** — how can I help you today?`,
        },
      ],
    };
  }
  return {
    id: 'smilemore-demo',
    kind: 'company',
    name: MOCK_THREAD.name,
    avatar: MOCK_THREAD.avatar,
    verified: true,
    messages: MOCK_THREAD.messages,
  };
}

function openCompanySarahChat(companyId) {
  const company = MOCK_DISCOVER_COMPANIES.find((c) => c.id === companyId);
  if (!company) return;
  const rt = getSarahRuntime();
  const threadId = company.id;
  rt.threads[threadId] = {
    kind: 'company',
    name: company.name,
    avatar: companyAvatarUrl(company),
    verified: company.verified,
    companyId: company.id,
    messages: [{ role: 'assistant', markdown: `**Hi ${MOCK_USER.name}** — I'm Sarah from **${company.name}**. How can I help you today?` }],
  };
  rt.activeThreadId = threadId;
  upsertRuntimeChat({
    id: threadId,
    name: company.name,
    preview: `Hi ${MOCK_USER.name}, I'm Sarah from ${company.name}…`,
    time: 'Now',
    online: true,
    avatar: companyAvatarUrl(company),
    company: true,
  });
  setRoute('chat-thread');
}

let galleryViewer = { companyId: null, index: 0, images: [] };

function openGalleryViewer(companyId, startIndex) {
  const company = MOCK_DISCOVER_COMPANIES.find((c) => c.id === companyId);
  if (!company) return;
  const images = getCompanyGallery(company);
  galleryViewer = {
    companyId,
    index: Math.max(0, Math.min(startIndex, images.length - 1)),
    images,
  };
  updateGalleryLightbox();
  const lb = document.getElementById('galleryLightbox');
  lb?.classList.remove('hidden');
  lb?.setAttribute('aria-hidden', 'false');
}

function closeGalleryViewer() {
  document.getElementById('galleryLightbox')?.classList.add('hidden');
  document.getElementById('galleryLightbox')?.setAttribute('aria-hidden', 'true');
}

function stepGallery(delta) {
  if (!galleryViewer.images.length) return;
  const n = galleryViewer.images.length;
  galleryViewer.index = (galleryViewer.index + delta + n) % n;
  updateGalleryLightbox();
}

function updateGalleryLightbox() {
  const img = document.getElementById('galleryLightboxImg');
  const counter = document.getElementById('galleryLightboxCounter');
  const likeBtn = document.getElementById('galleryLightboxLike');
  const likeCount = document.getElementById('galleryLikeCount');
  if (!img || !galleryViewer.images.length) return;
  img.src = galleryViewer.images[galleryViewer.index];
  if (counter) {
    counter.textContent = `${galleryViewer.index + 1} / ${galleryViewer.images.length}`;
  }
  const meta = getGalleryLikeState(galleryViewer.companyId, galleryViewer.index);
  likeBtn?.classList.toggle('is-active', meta.liked);
  if (likeCount) likeCount.textContent = String(meta.count);
}

function bindGalleryLightbox() {
  if (window.__galleryBound) return;
  window.__galleryBound = true;

  document.querySelectorAll('[data-gallery-close]').forEach((el) => {
    el.addEventListener('click', closeGalleryViewer);
  });
  document.getElementById('galleryPrev')?.addEventListener('click', () => stepGallery(-1));
  document.getElementById('galleryNext')?.addEventListener('click', () => stepGallery(1));
  document.getElementById('galleryLightboxLike')?.addEventListener('click', () => {
    if (!galleryViewer.companyId) return;
    const meta = getGalleryLikeState(galleryViewer.companyId, galleryViewer.index);
    meta.liked = !meta.liked;
    meta.count += meta.liked ? 1 : -1;
    updateGalleryLightbox();
  });

  const stage = document.getElementById('galleryStage');
  let touchStartX = 0;
  stage?.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.changedTouches[0]?.clientX || 0;
    },
    { passive: true }
  );
  stage?.addEventListener(
    'touchend',
    (e) => {
      const dx = (e.changedTouches[0]?.clientX || 0) - touchStartX;
      if (Math.abs(dx) < 40) return;
      stepGallery(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );

  document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('galleryLightbox');
    if (lb?.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeGalleryViewer();
    if (e.key === 'ArrowLeft') stepGallery(-1);
    if (e.key === 'ArrowRight') stepGallery(1);
  });
}

function renderChatsList() {
  const host = document.getElementById('chatsList');
  if (!host) return;
  const q = (document.getElementById('chatsTabSearchInput')?.value || '').trim().toLowerCase();
  const chats = getAllChats().filter((c) => {
    if (!q) return true;
    return `${c.name} ${c.preview}`.toLowerCase().includes(q);
  });
  host.innerHTML = chats
    .map(
    (c) => `
    <div class="chat-row" data-open-thread="${escapeHtml(c.id)}" role="button" tabindex="0">
      <img class="avatar avatar-sm chat-row-avatar" src="${escapeHtml(prototypeAsset(resolveItemAvatar(c)))}" alt="" width="44" height="44" ${profileImgOnError((c.avatarKey && COMPANY_AVATARS?.[c.avatarKey]) || MOCK_PROFILE.avatarFallback)} />
      <div class="meta">
        <div class="name">${escapeHtml(c.name)}${c.company ? ` ${verifiedBadge}` : ''}</div>
        <div class="preview">${escapeHtml(c.preview)}</div>
      </div>
      <div class="time">${escapeHtml(c.time)}</div>
    </div>`
  ).join('');

  host.querySelectorAll('[data-open-thread]').forEach((row) => {
    const open = () => {
      getSarahRuntime().activeThreadId = row.dataset.openThread || 'smilemore-demo';
      setRoute('chat-thread');
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function mkClassificationShort(classification) {
  const c = String(classification || '');
  if (c === 'Sensitive' || c === 'Private') return 'Sensitive';
  return 'Personal';
}

function mkConfidenceLabel(code) {
  const map = {
    confirmed: 'Confirmed',
    needs_confirmation: 'Needs confirmation',
    possibly_outdated: 'Possibly outdated',
  };
  return map[code] || 'Needs confirmation';
}

const MK_IDENTITY_STORAGE_KEY = 'sarah.prototype.myKnowledge.personalIdentity.v1';
const MK_FAMILY_STORAGE_KEY = 'sarah.prototype.myKnowledge.familyRelationships.v1';
const MK_GOALS_STORAGE_KEY = 'sarah.prototype.myKnowledge.goalsAmbitions.v1';
const MK_WORK_STORAGE_KEY = 'sarah.prototype.myKnowledge.workProfessional.v1';
const MK_BUSINESS_STORAGE_KEY = 'sarah.prototype.myKnowledge.businessEntrepreneurship.v1';
const MK_EDUCATION_STORAGE_KEY = 'sarah.prototype.myKnowledge.educationLearning.v1';
const MK_HEALTH_STORAGE_KEY = 'sarah.prototype.myKnowledge.healthWellbeing.v1';
const MK_FINANCIAL_STORAGE_KEY = 'sarah.prototype.myKnowledge.financialLife.v1';
const MK_LIFESTYLE_STORAGE_KEY = 'sarah.prototype.myKnowledge.lifestylePreferences.v1';
const MK_DATES_STORAGE_KEY = 'sarah.prototype.myKnowledge.importantDatesEvents.v1';
const MK_DOCUMENTS_STORAGE_KEY = 'sarah.prototype.myKnowledge.documentsRecords.v1';
const MK_ROUTINES_STORAGE_KEY = 'sarah.prototype.myKnowledge.routinesDailyLife.v1';
const MK_PROPERTY_STORAGE_KEY = 'sarah.prototype.myKnowledge.propertyAssets.v1';
const MK_TRAVEL_STORAGE_KEY = 'sarah.prototype.myKnowledge.travelPlaces.v1';
const MK_VALUES_STORAGE_KEY = 'sarah.prototype.myKnowledge.valuesPrinciples.v1';
const MK_UPLOAD_STORAGE_KEY = 'sarah.prototype.myKnowledge.uploadedFiles.v1';
const MK_SARAH_UNDERSTANDING_STORAGE_KEY = 'sarah.prototype.myKnowledge.sarahUnderstanding.v1';

const MK_FAMILY_RELATIONSHIP_OPTIONS = [
  { value: 'spouse_partner', label: 'Spouse or partner' },
  { value: 'children', label: 'Children' },
  { value: 'parents', label: 'Parents' },
  { value: 'siblings', label: 'Siblings' },
  { value: 'extended_family', label: 'Extended family' },
  { value: 'close_friends', label: 'Close friends' },
  { value: 'important_contacts', label: 'Important personal contacts' },
  { value: 'dependants_caregiving', label: 'Dependants & caregiving' },
  { value: 'other', label: 'Other' },
];

const MK_GOAL_KIND_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'career', label: 'Career' },
  { value: 'business', label: 'Business' },
  { value: 'financial', label: 'Financial' },
  { value: 'education', label: 'Education' },
  { value: 'family', label: 'Family' },
  { value: 'health_fitness', label: 'Health & fitness' },
  { value: 'travel', label: 'Travel' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'long_term_dreams', label: 'Long-term dreams' },
  { value: 'short_term_targets', label: 'Short-term targets' },
];

const MK_GOAL_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const MK_GOAL_STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'cancelled', label: 'Cancelled' },
];

const MK_WORK_SLOT_OPTIONS = [
  { value: 'current', label: 'Current employment' },
  { value: 'previous', label: 'Previous employment' },
];

const MK_BUSINESS_CONFIDENTIALITY_OPTIONS = [
  { value: 'internal', label: 'Internal only' },
  { value: 'confidential', label: 'Confidential' },
  { value: 'restricted', label: 'Highly restricted' },
];

const MK_EDU_FORMAL_STATUS_OPTIONS = [
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'completed', label: 'Completed' },
  { value: 'paused', label: 'Paused' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const MK_DATE_EVENT_KIND_OPTIONS = [
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'travel', label: 'Travel' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'other', label: 'Other' },
];

const MK_DOC_KIND_OPTIONS = [
  { value: 'identity', label: 'Identity' },
  { value: 'financial', label: 'Financial' },
  { value: 'health_medical', label: 'Health & medical' },
  { value: 'legal', label: 'Legal' },
  { value: 'education', label: 'Education' },
  { value: 'employment', label: 'Employment' },
  { value: 'property', label: 'Property & vehicle' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'tax', label: 'Tax' },
  { value: 'travel', label: 'Travel & visa' },
  { value: 'other', label: 'Other' },
];

const MK_DOC_SENSITIVITY_OPTIONS = [
  { value: 'standard', label: 'Standard personal' },
  { value: 'confidential', label: 'Confidential' },
  { value: 'restricted', label: 'Highly restricted' },
];

const MK_PROPERTY_ASSET_KIND_OPTIONS = [
  { value: 'home', label: 'Home' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'rental', label: 'Rental (as tenant)' },
  { value: 'equipment', label: 'Equipment / gear' },
  { value: 'land', label: 'Land' },
  { value: 'watercraft', label: 'Boat / watercraft' },
  { value: 'other', label: 'Other' },
];

const MK_PROPERTY_STATUS_OPTIONS = [
  { value: 'owned', label: 'Owned' },
  { value: 'financed', label: 'Financed / bonded' },
  { value: 'leased', label: 'Leased' },
  { value: 'rented', label: 'Rented' },
  { value: 'shared', label: 'Shared / family' },
  { value: 'sold', label: 'Sold / disposed' },
  { value: 'other', label: 'Other' },
];

const MK_TRAVEL_TRIP_KIND_OPTIONS = [
  { value: 'leisure', label: 'Leisure' },
  { value: 'business', label: 'Business' },
  { value: 'family', label: 'Family' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'other', label: 'Other' },
];

const MK_TRAVEL_TRIP_STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'booked', label: 'Booked' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'other', label: 'Other' },
];

function getDefaultPersonalIdentity() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  return { ...(mk?.personalIdentity || {}) };
}

function loadPersonalIdentity() {
  const base = getDefaultPersonalIdentity();
  try {
    const raw = localStorage.getItem(MK_IDENTITY_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { ...base, ...parsed };
  } catch {
    /* ignore */
  }
  return base;
}

function savePersonalIdentity(partial) {
  const next = { ...loadPersonalIdentity(), ...partial };
  try {
    localStorage.setItem(MK_IDENTITY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

function discardPersonalIdentityEdits() {
  try {
    localStorage.removeItem(MK_IDENTITY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function getDefaultFamilyRelationships() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.familyRelationships;
  const people = Array.isArray(raw?.people) ? raw.people.map((p) => ({ ...p })) : [];
  return { people };
}

function loadFamilyRelationships() {
  const base = getDefaultFamilyRelationships();
  try {
    const raw = localStorage.getItem(MK_FAMILY_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.people)) {
      return { people: parsed.people.map((p) => ({ ...p })) };
    }
  } catch {
    /* ignore */
  }
  return base;
}

function saveFamilyRelationships(data) {
  try {
    localStorage.setItem(MK_FAMILY_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardFamilyRelationshipsEdits() {
  try {
    localStorage.removeItem(MK_FAMILY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function mkNewFamilyPersonId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `fam-${crypto.randomUUID()}`;
  return `fam-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mkRelationshipSelectHtml(selected) {
  const sel = String(selected || 'other');
  return MK_FAMILY_RELATIONSHIP_OPTIONS.map((o) => {
    const isSel = o.value === sel ? ' selected' : '';
    return `<option value="${escapeHtml(o.value)}"${isSel}>${escapeHtml(o.label)}</option>`;
  }).join('');
}

function renderMkFamilyForm(data) {
  const { people } = data || { people: [] };
  const list = (people || []).length
    ? people
        .map((p) => {
          const id = escapeHtml(p.id);
          return `
        <article class="ms-knowledge-family-card" data-mk-family-person="${id}">
          <header class="ms-knowledge-family-card-head">
            <h4 class="ms-knowledge-family-card-title">Person</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-family-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="fam_name_${id}">Name</label>
              <input class="ms-knowledge-input" id="fam_name_${id}" data-fam-field="name" type="text" value="${escapeHtml(p.name || '')}" autocomplete="name" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="fam_rel_${id}">Relationship</label>
              <select class="ms-knowledge-input" id="fam_rel_${id}" data-fam-field="relationship">${mkRelationshipSelectHtml(p.relationship)}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="fam_bday_${id}">Birthday <span class="ms-knowledge-optional">(optional)</span></label>
            <input class="ms-knowledge-input" id="fam_bday_${id}" data-fam-field="birthday" type="date" value="${escapeHtml(p.birthday || '')}" />
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="fam_det_${id}">Important details</label>
            <textarea class="ms-knowledge-textarea" id="fam_det_${id}" data-fam-field="details" rows="2" placeholder="Notes you are happy for Sarah to use when relevant…">${escapeHtml(p.details || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="fam_rem_${id}">Reminders <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="fam_rem_${id}" data-fam-field="reminders" rows="2" placeholder="Dates or follow-ups you want to remember…">${escapeHtml(p.reminders || '')}</textarea>
          </div>
          <p class="ms-knowledge-family-privacy">Private to your account in the prototype — Sarah will not infer others’ details without you adding them here (MK‑06: fine-grained sharing).</p>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-family-empty">No people yet — tap <strong>Add person</strong> for someone important to you.</p>';

  return `
    <form id="mkFamilyForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Sarah does not assume relationships or invent facts about other people — only what you enter here. Saved in this browser until the My Knowledge API ships.
      </p>
      <div class="ms-knowledge-family-actions-top">
        <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" id="mkFamilyAdd" data-mk-family-add>Add person</button>
      </div>
      <div class="ms-knowledge-family-list" id="mkFamilyList">${list}</div>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkFamilyReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkFamilySave">Save</button>
      </div>
    </form>`;
}

function collectFamilyPeopleFromDom() {
  const root = document.getElementById('mkFamilyList');
  if (!root) return [];
  const cards = root.querySelectorAll('[data-mk-family-person]');
  const people = [];
  cards.forEach((card) => {
    const id = card.getAttribute('data-mk-family-person');
    if (!id) return;
    const row = { id, name: '', relationship: 'other', birthday: '', details: '', reminders: '' };
    card.querySelectorAll('[data-fam-field]').forEach((el) => {
      const field = el.getAttribute('data-fam-field');
      if (!field) return;
      row[field] = 'value' in el ? String(el.value || '') : '';
    });
    people.push(row);
  });
  return people;
}

function getDefaultGoalsAmbitions() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.goalsAmbitions;
  const goals = Array.isArray(raw?.goals) ? raw.goals.map((g) => ({ ...g })) : [];
  return { goals };
}

function loadGoalsAmbitions() {
  const base = getDefaultGoalsAmbitions();
  try {
    const raw = localStorage.getItem(MK_GOALS_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.goals)) {
      return { goals: parsed.goals.map((g) => ({ ...g })) };
    }
  } catch {
    /* ignore */
  }
  return base;
}

function saveGoalsAmbitions(data) {
  try {
    localStorage.setItem(MK_GOALS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardGoalsAmbitionsEdits() {
  try {
    localStorage.removeItem(MK_GOALS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function mkNewGoalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `goal-${crypto.randomUUID()}`;
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mkGoalSelectOptions(options, selected) {
  const sel = String(selected || '');
  return options.map((o) => {
    const isSel = o.value === sel ? ' selected' : '';
    return `<option value="${escapeHtml(o.value)}"${isSel}>${escapeHtml(o.label)}</option>`;
  }).join('');
}

function renderMkGoalsForm(data) {
  const { goals } = data || { goals: [] };
  const list = (goals || []).length
    ? goals
        .map((g) => {
          const id = escapeHtml(g.id);
          return `
        <article class="ms-knowledge-goal-card" data-mk-goal="${id}">
          <header class="ms-knowledge-goal-card-head">
            <h4 class="ms-knowledge-goal-card-title">Goal</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-goal-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="goal_kind_${id}">Goal type</label>
              <select class="ms-knowledge-input" id="goal_kind_${id}" data-goal-field="goalKind">${mkGoalSelectOptions(MK_GOAL_KIND_OPTIONS, g.goalKind)}</select>
            </div>
            <div>
              <label class="ms-knowledge-label" for="goal_status_${id}">Status</label>
              <select class="ms-knowledge-input" id="goal_status_${id}" data-goal-field="status">${mkGoalSelectOptions(MK_GOAL_STATUS_OPTIONS, g.status)}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_title_${id}">Title</label>
            <input class="ms-knowledge-input" id="goal_title_${id}" data-goal-field="title" type="text" value="${escapeHtml(g.title || '')}" />
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_desc_${id}">Description</label>
            <textarea class="ms-knowledge-textarea" id="goal_desc_${id}" data-goal-field="description" rows="2">${escapeHtml(g.description || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_why_${id}">Why it matters</label>
            <textarea class="ms-knowledge-textarea" id="goal_why_${id}" data-goal-field="whyItMatters" rows="2">${escapeHtml(g.whyItMatters || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="goal_target_${id}">Target date <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="goal_target_${id}" data-goal-field="targetDate" type="date" value="${escapeHtml(g.targetDate || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="goal_pri_${id}">Priority</label>
              <select class="ms-knowledge-input" id="goal_pri_${id}" data-goal-field="priority">${mkGoalSelectOptions(MK_GOAL_PRIORITY_OPTIONS, g.priority)}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_prog_${id}">Current progress</label>
            <textarea class="ms-knowledge-textarea" id="goal_prog_${id}" data-goal-field="progress" rows="2">${escapeHtml(g.progress || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_mile_${id}">Milestones <span class="ms-knowledge-optional">(one per line)</span></label>
            <textarea class="ms-knowledge-textarea" id="goal_mile_${id}" data-goal-field="milestones" rows="3">${escapeHtml(g.milestones || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_chal_${id}">Challenges</label>
            <textarea class="ms-knowledge-textarea" id="goal_chal_${id}" data-goal-field="challenges" rows="2">${escapeHtml(g.challenges || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_res_${id}">Required resources</label>
            <textarea class="ms-knowledge-textarea" id="goal_res_${id}" data-goal-field="resources" rows="2">${escapeHtml(g.resources || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_rel_${id}">Related assignments <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="goal_rel_${id}" data-goal-field="relatedAssignments" rows="2">${escapeHtml(g.relatedAssignments || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-goal-empty">No goals yet — tap <strong>Add goal</strong> to track something important.</p>';

  return `
    <form id="mkGoalsForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Goals you save here can inform planning and follow-ups when permissions allow. Stored in this browser until the My Knowledge API ships.
      </p>
      <div class="ms-knowledge-goal-actions-top">
        <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" id="mkGoalsAdd" data-mk-goal-add>Add goal</button>
      </div>
      <div class="ms-knowledge-goal-list" id="mkGoalsList">${list}</div>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkGoalsReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkGoalsSave">Save</button>
      </div>
    </form>`;
}

function collectGoalsFromDom() {
  const root = document.getElementById('mkGoalsList');
  if (!root) return [];
  const cards = root.querySelectorAll('[data-mk-goal]');
  const goals = [];
  cards.forEach((card) => {
    const id = card.getAttribute('data-mk-goal');
    if (!id) return;
    const row = {
      id,
      title: '',
      description: '',
      whyItMatters: '',
      targetDate: '',
      priority: 'medium',
      progress: '',
      milestones: '',
      challenges: '',
      resources: '',
      relatedAssignments: '',
      status: 'planned',
      goalKind: 'personal',
    };
    card.querySelectorAll('[data-goal-field]').forEach((el) => {
      const field = el.getAttribute('data-goal-field');
      if (!field) return;
      row[field] = 'value' in el ? String(el.value || '') : '';
    });
    goals.push(row);
  });
  return goals;
}

function getDefaultWorkProfessional() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.workProfessional;
  const roles = Array.isArray(raw?.roles) ? raw.roles.map((r) => ({ ...r })) : [];
  return { roles };
}

function loadWorkProfessional() {
  const base = getDefaultWorkProfessional();
  try {
    const raw = localStorage.getItem(MK_WORK_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.roles)) {
      return { roles: parsed.roles.map((r) => ({ ...r })) };
    }
  } catch {
    /* ignore */
  }
  return base;
}

function saveWorkProfessional(data) {
  try {
    localStorage.setItem(MK_WORK_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardWorkProfessionalEdits() {
  try {
    localStorage.removeItem(MK_WORK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function mkNewWorkRoleId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `wrk-${crypto.randomUUID()}`;
  return `wrk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function renderMkWorkForm(data) {
  const { roles } = data || { roles: [] };
  const list = (roles || []).length
    ? roles
        .map((r) => {
          const id = escapeHtml(r.id);
          return `
        <article class="ms-knowledge-work-card" data-mk-work-role="${id}">
          <header class="ms-knowledge-work-card-head">
            <h4 class="ms-knowledge-work-card-title">Role</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-work-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="work_slot_${id}">Current or previous</label>
              <select class="ms-knowledge-input" id="work_slot_${id}" data-work-field="slot">${mkGoalSelectOptions(MK_WORK_SLOT_OPTIONS, r.slot)}</select>
            </div>
            <div>
              <label class="ms-knowledge-label" for="work_title_${id}">Job title</label>
              <input class="ms-knowledge-input" id="work_title_${id}" data-work-field="jobTitle" type="text" value="${escapeHtml(r.jobTitle || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_emp_${id}">Employer / organisation</label>
            <input class="ms-knowledge-input" id="work_emp_${id}" data-work-field="employer" type="text" value="${escapeHtml(r.employer || '')}" />
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="work_start_${id}">Start date</label>
              <input class="ms-knowledge-input" id="work_start_${id}" data-work-field="startDate" type="date" value="${escapeHtml(r.startDate || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="work_end_${id}">End date <span class="ms-knowledge-optional">(leave empty if current)</span></label>
              <input class="ms-knowledge-input" id="work_end_${id}" data-work-field="endDate" type="date" value="${escapeHtml(r.endDate || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_resp_${id}">Role &amp; responsibilities</label>
            <textarea class="ms-knowledge-textarea" id="work_resp_${id}" data-work-field="responsibilities" rows="3">${escapeHtml(r.responsibilities || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_qual_${id}">Professional qualifications <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_qual_${id}" data-work-field="qualifications" rows="2">${escapeHtml(r.qualifications || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_skills_${id}">Skills &amp; expertise</label>
            <textarea class="ms-knowledge-textarea" id="work_skills_${id}" data-work-field="skillsExpertise" rows="2">${escapeHtml(r.skillsExpertise || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_proj_${id}">Projects &amp; assignments <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_proj_${id}" data-work-field="projectsAssignments" rows="2">${escapeHtml(r.projectsAssignments || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_hours_${id}">Working hours &amp; routines <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_hours_${id}" data-work-field="workingHoursRoutines" rows="2">${escapeHtml(r.workingHoursRoutines || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_pref_${id}">Workplace preferences <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_pref_${id}" data-work-field="workplacePreferences" rows="2">${escapeHtml(r.workplacePreferences || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_contacts_${id}">Professional contacts <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_contacts_${id}" data-work-field="professionalContacts" rows="2">${escapeHtml(r.professionalContacts || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_exp_${id}">Work experience highlights</label>
            <textarea class="ms-knowledge-textarea" id="work_exp_${id}" data-work-field="experienceHighlights" rows="2">${escapeHtml(r.experienceHighlights || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_career_${id}">Career ambitions <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_career_${id}" data-work-field="careerAmbitions" rows="2">${escapeHtml(r.careerAmbitions || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_docs_${id}">Professional documents / CV notes <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_docs_${id}" data-work-field="documentsNotes" rows="2" placeholder="Where files live or what to upload in MK‑04…">${escapeHtml(r.documentsNotes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-work-empty">No roles yet — tap <strong>Add role</strong> for current or past employment.</p>';

  return `
    <form id="mkWorkForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Keep current and previous roles separate so Sarah does not merge employers. Saved in this browser until the My Knowledge API ships.
      </p>
      <div class="ms-knowledge-work-actions-top">
        <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" id="mkWorkAdd" data-mk-work-add>Add role</button>
      </div>
      <div class="ms-knowledge-work-list" id="mkWorkList">${list}</div>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkWorkReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkWorkSave">Save</button>
      </div>
    </form>`;
}

function collectWorkRolesFromDom() {
  const root = document.getElementById('mkWorkList');
  if (!root) return [];
  const cards = root.querySelectorAll('[data-mk-work-role]');
  const roles = [];
  cards.forEach((card) => {
    const id = card.getAttribute('data-mk-work-role');
    if (!id) return;
    const row = {
      id,
      slot: 'current',
      jobTitle: '',
      employer: '',
      startDate: '',
      endDate: '',
      responsibilities: '',
      qualifications: '',
      skillsExpertise: '',
      projectsAssignments: '',
      workingHoursRoutines: '',
      workplacePreferences: '',
      professionalContacts: '',
      experienceHighlights: '',
      careerAmbitions: '',
      documentsNotes: '',
    };
    card.querySelectorAll('[data-work-field]').forEach((el) => {
      const field = el.getAttribute('data-work-field');
      if (!field) return;
      row[field] = 'value' in el ? String(el.value || '') : '';
    });
    roles.push(row);
  });
  return roles;
}

function getDefaultBusinessEntrepreneurship() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.businessEntrepreneurship;
  const ventures = Array.isArray(raw?.ventures) ? raw.ventures.map((v) => ({ ...v })) : [];
  return { ventures };
}

function loadBusinessEntrepreneurship() {
  const base = getDefaultBusinessEntrepreneurship();
  try {
    const raw = localStorage.getItem(MK_BUSINESS_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ventures)) {
      return { ventures: parsed.ventures.map((v) => ({ ...v })) };
    }
  } catch {
    /* ignore */
  }
  return base;
}

function saveBusinessEntrepreneurship(data) {
  try {
    localStorage.setItem(MK_BUSINESS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardBusinessEntrepreneurshipEdits() {
  try {
    localStorage.removeItem(MK_BUSINESS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function mkNewVentureId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `biz-${crypto.randomUUID()}`;
  return `biz-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function renderMkBusinessForm(data) {
  const { ventures } = data || { ventures: [] };
  const list = (ventures || []).length
    ? ventures
        .map((v) => {
          const id = escapeHtml(v.id);
          const confOpts = mkGoalSelectOptions(MK_BUSINESS_CONFIDENTIALITY_OPTIONS, v.confidentialityLevel);
          return `
        <article class="ms-knowledge-biz-card" data-mk-biz="${id}">
          <header class="ms-knowledge-biz-card-head">
            <h4 class="ms-knowledge-biz-card-title">Business</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-biz-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="biz_name_${id}">Business name</label>
              <input class="ms-knowledge-input" id="biz_name_${id}" data-biz-field="businessName" type="text" value="${escapeHtml(v.businessName || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="biz_ind_${id}">Industry</label>
              <input class="ms-knowledge-input" id="biz_ind_${id}" data-biz-field="industry" type="text" value="${escapeHtml(v.industry || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="biz_role_${id}">Your role</label>
              <input class="ms-knowledge-input" id="biz_role_${id}" data-biz-field="userRole" type="text" value="${escapeHtml(v.userRole || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="biz_conf_${id}">Confidentiality level</label>
              <select class="ms-knowledge-input" id="biz_conf_${id}" data-biz-field="confidentialityLevel">${confOpts}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_desc_${id}">Description</label>
            <textarea class="ms-knowledge-textarea" id="biz_desc_${id}" data-biz-field="description" rows="3">${escapeHtml(v.description || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_prod_${id}">Products &amp; services</label>
            <textarea class="ms-knowledge-textarea" id="biz_prod_${id}" data-biz-field="productsServices" rows="2">${escapeHtml(v.productsServices || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_stage_${id}">Current stage</label>
            <textarea class="ms-knowledge-textarea" id="biz_stage_${id}" data-biz-field="currentStage" rows="2">${escapeHtml(v.currentStage || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_obj_${id}">Objectives</label>
            <textarea class="ms-knowledge-textarea" id="biz_obj_${id}" data-biz-field="objectives" rows="2">${escapeHtml(v.objectives || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_contacts_${id}">Key contacts</label>
            <textarea class="ms-knowledge-textarea" id="biz_contacts_${id}" data-biz-field="keyContacts" rows="2" placeholder="People Sarah might reference when helping with this business…">${escapeHtml(v.keyContacts || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_docs_${id}">Related documents <span class="ms-knowledge-optional">(paths or notes until MK‑04)</span></label>
            <textarea class="ms-knowledge-textarea" id="biz_docs_${id}" data-biz-field="relatedDocuments" rows="2">${escapeHtml(v.relatedDocuments || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_proj_${id}">Current projects</label>
            <textarea class="ms-knowledge-textarea" id="biz_proj_${id}" data-biz-field="currentProjects" rows="2">${escapeHtml(v.currentProjects || '')}</textarea>
          </div>
          <p class="ms-knowledge-biz-footnote">Sarah keeps each venture separate — nothing is merged with your employer profile unless you connect it (MK‑06).</p>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-biz-empty">No businesses yet — tap <strong>Add business</strong> for a venture, startup, or idea.</p>';

  return `
    <form id="mkBusinessForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Add one profile per business so goals, documents, and contacts stay scoped correctly. Stored in this browser until the My Knowledge API ships.
      </p>
      <div class="ms-knowledge-biz-actions-top">
        <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" id="mkBusinessAdd" data-mk-biz-add>Add business</button>
      </div>
      <div class="ms-knowledge-biz-list" id="mkBusinessList">${list}</div>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkBusinessReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkBusinessSave">Save</button>
      </div>
    </form>`;
}

function collectBusinessVenturesFromDom() {
  const root = document.getElementById('mkBusinessList');
  if (!root) return [];
  const cards = root.querySelectorAll('[data-mk-biz]');
  const ventures = [];
  cards.forEach((card) => {
    const id = card.getAttribute('data-mk-biz');
    if (!id) return;
    const row = {
      id,
      businessName: '',
      industry: '',
      userRole: '',
      description: '',
      productsServices: '',
      currentStage: '',
      objectives: '',
      keyContacts: '',
      relatedDocuments: '',
      currentProjects: '',
      confidentialityLevel: 'internal',
    };
    card.querySelectorAll('[data-biz-field]').forEach((el) => {
      const field = el.getAttribute('data-biz-field');
      if (!field) return;
      row[field] = 'value' in el ? String(el.value || '') : '';
    });
    ventures.push(row);
  });
  return ventures;
}

function getDefaultEducationLearning() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.educationLearning;
  const formalPrograms = Array.isArray(raw?.formalPrograms) ? raw.formalPrograms.map((x) => ({ ...x })) : [];
  const coursesAndCerts = Array.isArray(raw?.coursesAndCerts) ? raw.coursesAndCerts.map((x) => ({ ...x })) : [];
  const lc = raw?.learningContext && typeof raw.learningContext === 'object' ? { ...raw.learningContext } : {};
  return { formalPrograms, coursesAndCerts, learningContext: lc };
}

function loadEducationLearning() {
  const base = getDefaultEducationLearning();
  try {
    const raw = localStorage.getItem(MK_EDUCATION_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    const formalPrograms = Array.isArray(parsed.formalPrograms)
      ? parsed.formalPrograms.map((x) => ({ ...x }))
      : base.formalPrograms;
    const coursesAndCerts = Array.isArray(parsed.coursesAndCerts)
      ? parsed.coursesAndCerts.map((x) => ({ ...x }))
      : base.coursesAndCerts;
    const learningContext = { ...base.learningContext, ...(parsed.learningContext && typeof parsed.learningContext === 'object' ? parsed.learningContext : {}) };
    return { formalPrograms, coursesAndCerts, learningContext };
  } catch {
    /* ignore */
  }
  return base;
}

function saveEducationLearning(data) {
  try {
    localStorage.setItem(MK_EDUCATION_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardEducationLearningEdits() {
  try {
    localStorage.removeItem(MK_EDUCATION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function mkNewEduFormalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `edu-f-${crypto.randomUUID()}`;
  return `edu-f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mkNewEduCourseId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `edu-c-${crypto.randomUUID()}`;
  return `edu-c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function renderMkEducationForm(data) {
  const formalPrograms = data?.formalPrograms || [];
  const coursesAndCerts = data?.coursesAndCerts || [];
  const lc = data?.learningContext || {};

  const formalList = formalPrograms.length
    ? formalPrograms
        .map((p) => {
          const id = escapeHtml(p.id);
          const statusOpts = mkGoalSelectOptions(MK_EDU_FORMAL_STATUS_OPTIONS, p.status);
          return `
        <article class="ms-knowledge-edu-card ms-knowledge-edu-card--formal" data-mk-edu-formal="${id}">
          <header class="ms-knowledge-edu-card-head">
            <h4 class="ms-knowledge-edu-card-title">Formal program</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-edu-formal-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="edu_sch_${id}">School / institution</label>
            <input class="ms-knowledge-input" id="edu_sch_${id}" data-edu-formal-field="institution" type="text" value="${escapeHtml(p.institution || '')}" />
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="edu_qual_${id}">Qualification</label>
              <input class="ms-knowledge-input" id="edu_qual_${id}" data-edu-formal-field="qualification" type="text" value="${escapeHtml(p.qualification || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="edu_area_${id}">Study area</label>
              <input class="ms-knowledge-input" id="edu_area_${id}" data-edu-formal-field="studyArea" type="text" value="${escapeHtml(p.studyArea || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="edu_s_${id}">Start</label>
              <input class="ms-knowledge-input" id="edu_s_${id}" data-edu-formal-field="startDate" type="month" value="${escapeHtml(p.startDate || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="edu_e_${id}">End <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="edu_e_${id}" data-edu-formal-field="endDate" type="month" value="${escapeHtml(p.endDate || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="edu_st_${id}">Status</label>
            <select class="ms-knowledge-input" id="edu_st_${id}" data-edu-formal-field="status">${statusOpts}</select>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="edu_hi_${id}">Highlights</label>
            <textarea class="ms-knowledge-textarea" id="edu_hi_${id}" data-edu-formal-field="highlights" rows="2">${escapeHtml(p.highlights || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="edu_doc_${id}">Documents <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
            <textarea class="ms-knowledge-textarea" id="edu_doc_${id}" data-edu-formal-field="documentsNote" rows="2">${escapeHtml(p.documentsNote || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-edu-empty">No formal programs — tap <strong>Add program</strong> for school, university, or major qualification.</p>';

  const courseList = coursesAndCerts.length
    ? coursesAndCerts
        .map((c) => {
          const id = escapeHtml(c.id);
          return `
        <article class="ms-knowledge-edu-card ms-knowledge-edu-card--course" data-mk-edu-course="${id}">
          <header class="ms-knowledge-edu-card-head">
            <h4 class="ms-knowledge-edu-card-title">Course / certification</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-edu-course-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="ec_name_${id}">Name</label>
              <input class="ms-knowledge-input" id="ec_name_${id}" data-edu-course-field="name" type="text" value="${escapeHtml(c.name || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="ec_prov_${id}">Provider</label>
              <input class="ms-knowledge-input" id="ec_prov_${id}" data-edu-course-field="provider" type="text" value="${escapeHtml(c.provider || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="ec_done_${id}">Completed <span class="ms-knowledge-optional">(month)</span></label>
              <input class="ms-knowledge-input" id="ec_done_${id}" data-edu-course-field="completedDate" type="month" value="${escapeHtml(c.completedDate || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="ec_cred_${id}">Credential</label>
              <input class="ms-knowledge-input" id="ec_cred_${id}" data-edu-course-field="credential" type="text" value="${escapeHtml(c.credential || '')}" placeholder="e.g. Certificate, badge…" />
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="ec_link_${id}">Link <span class="ms-knowledge-optional">(optional)</span></label>
            <input class="ms-knowledge-input" id="ec_link_${id}" data-edu-course-field="link" type="url" value="${escapeHtml(c.link || '')}" placeholder="https://…" />
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="ec_notes_${id}">Notes</label>
            <textarea class="ms-knowledge-textarea" id="ec_notes_${id}" data-edu-course-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-edu-empty">No courses yet — tap <strong>Add course</strong>.</p>';

  return `
    <form id="mkEducationForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Helps Sarah tune explanations to your level and remember what you are studying. Saved in this browser until the My Knowledge API ships.
      </p>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Formal education</legend>
        <div class="ms-knowledge-edu-actions">
          <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" data-mk-edu-formal-add>Add program</button>
        </div>
        <div class="ms-knowledge-edu-list" id="mkEduFormalList">${formalList}</div>
      </fieldset>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Courses &amp; certifications</legend>
        <div class="ms-knowledge-edu-actions">
          <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" data-mk-edu-course-add>Add course</button>
        </div>
        <div class="ms-knowledge-edu-list" id="mkEduCourseList">${courseList}</div>
      </fieldset>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Learning now &amp; interests</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_currentStudies">Current studies</label>
          <textarea class="ms-knowledge-textarea" id="lc_currentStudies" name="lc_currentStudies" rows="2">${escapeHtml(lc.currentStudies || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_subjectsOfInterest">Subjects of interest</label>
          <textarea class="ms-knowledge-textarea" id="lc_subjectsOfInterest" name="lc_subjectsOfInterest" rows="2">${escapeHtml(lc.subjectsOfInterest || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_learningGoals">Learning goals</label>
          <textarea class="ms-knowledge-textarea" id="lc_learningGoals" name="lc_learningGoals" rows="2">${escapeHtml(lc.learningGoals || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_skillsDeveloping">Skills being developed</label>
          <textarea class="ms-knowledge-textarea" id="lc_skillsDeveloping" name="lc_skillsDeveloping" rows="2">${escapeHtml(lc.skillsDeveloping || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_studySchedule">Study schedule</label>
          <textarea class="ms-knowledge-textarea" id="lc_studySchedule" name="lc_studySchedule" rows="2">${escapeHtml(lc.studySchedule || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_learningPreferences">Learning preferences</label>
          <textarea class="ms-knowledge-textarea" id="lc_learningPreferences" name="lc_learningPreferences" rows="2">${escapeHtml(lc.learningPreferences || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_researchTopics">Research topics</label>
          <textarea class="ms-knowledge-textarea" id="lc_researchTopics" name="lc_researchTopics" rows="2">${escapeHtml(lc.researchTopics || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_readingList">Reading list</label>
          <textarea class="ms-knowledge-textarea" id="lc_readingList" name="lc_readingList" rows="2">${escapeHtml(lc.readingList || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_educationalDocumentsNote">Educational documents <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
          <textarea class="ms-knowledge-textarea" id="lc_educationalDocumentsNote" name="lc_educationalDocumentsNote" rows="2">${escapeHtml(lc.educationalDocumentsNote || '')}</textarea>
        </div>
      </fieldset>

      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkEducationReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkEducationSave">Save</button>
      </div>
    </form>`;
}

function collectEducationLearningFromForm(form) {
  const formalRoot = document.getElementById('mkEduFormalList');
  const courseRoot = document.getElementById('mkEduCourseList');
  const formalPrograms = [];
  if (formalRoot) {
    formalRoot.querySelectorAll('[data-mk-edu-formal]').forEach((card) => {
      const id = card.getAttribute('data-mk-edu-formal');
      if (!id) return;
      const row = {
        id,
        institution: '',
        qualification: '',
        studyArea: '',
        startDate: '',
        endDate: '',
        status: 'enrolled',
        highlights: '',
        documentsNote: '',
      };
      card.querySelectorAll('[data-edu-formal-field]').forEach((el) => {
        const field = el.getAttribute('data-edu-formal-field');
        if (!field) return;
        row[field] = 'value' in el ? String(el.value || '') : '';
      });
      formalPrograms.push(row);
    });
  }
  const coursesAndCerts = [];
  if (courseRoot) {
    courseRoot.querySelectorAll('[data-mk-edu-course]').forEach((card) => {
      const id = card.getAttribute('data-mk-edu-course');
      if (!id) return;
      const row = {
        id,
        name: '',
        provider: '',
        completedDate: '',
        credential: '',
        link: '',
        notes: '',
      };
      card.querySelectorAll('[data-edu-course-field]').forEach((el) => {
        const field = el.getAttribute('data-edu-course-field');
        if (!field) return;
        row[field] = 'value' in el ? String(el.value || '') : '';
      });
      coursesAndCerts.push(row);
    });
  }
  const fd = new FormData(form);
  const learningContext = {
    currentStudies: String(fd.get('lc_currentStudies') || ''),
    subjectsOfInterest: String(fd.get('lc_subjectsOfInterest') || ''),
    learningGoals: String(fd.get('lc_learningGoals') || ''),
    skillsDeveloping: String(fd.get('lc_skillsDeveloping') || ''),
    studySchedule: String(fd.get('lc_studySchedule') || ''),
    learningPreferences: String(fd.get('lc_learningPreferences') || ''),
    researchTopics: String(fd.get('lc_researchTopics') || ''),
    readingList: String(fd.get('lc_readingList') || ''),
    educationalDocumentsNote: String(fd.get('lc_educationalDocumentsNote') || ''),
  };
  return { formalPrograms, coursesAndCerts, learningContext };
}

function getDefaultHealthWellbeing() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.healthWellbeing;
  return raw && typeof raw === 'object' ? { ...raw } : {};
}

function loadHealthWellbeing() {
  const base = getDefaultHealthWellbeing();
  try {
    const raw = localStorage.getItem(MK_HEALTH_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { ...base, ...parsed };
  } catch {
    /* ignore */
  }
  return base;
}

function saveHealthWellbeing(data) {
  try {
    localStorage.setItem(MK_HEALTH_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardHealthWellbeingEdits() {
  try {
    localStorage.removeItem(MK_HEALTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function renderMkHealthForm(data) {
  const h = data || {};
  return `
    <form id="mkHealthForm" class="ms-knowledge-form">
      <div class="ms-knowledge-health-callout" role="note">
        <strong>Prototype only — not medical advice.</strong> Sarah does not diagnose or change medications. This category stays off for “Sarah may use” and “learn from chat” until you opt in in MK‑06.
        Sharing health details with Company Sarah requires separate consent. Stored only in this browser until the API ships.
      </div>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">General &amp; clinical notes</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_generalNotes">General health notes</label>
          <textarea class="ms-knowledge-textarea" id="hl_generalNotes" name="generalNotes" rows="2">${escapeHtml(h.generalNotes || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_conditions">Medical conditions &amp; diagnoses <span class="ms-knowledge-optional">(optional)</span></label>
          <textarea class="ms-knowledge-textarea" id="hl_conditions" name="conditionsDiagnoses" rows="2">${escapeHtml(h.conditionsDiagnoses || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="hl_allergies">Allergies</label>
            <textarea class="ms-knowledge-textarea" id="hl_allergies" name="allergies" rows="2">${escapeHtml(h.allergies || '')}</textarea>
          </div>
          <div>
            <label class="ms-knowledge-label" for="hl_meds">Medications</label>
            <textarea class="ms-knowledge-textarea" id="hl_meds" name="medications" rows="2" placeholder="List what you take — Sarah will not suggest dose changes">${escapeHtml(h.medications || '')}</textarea>
          </div>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_history">Medical history</label>
          <textarea class="ms-knowledge-textarea" id="hl_history" name="medicalHistory" rows="2">${escapeHtml(h.medicalHistory || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_providers">Healthcare providers</label>
          <textarea class="ms-knowledge-textarea" id="hl_providers" name="healthcareProviders" rows="2">${escapeHtml(h.healthcareProviders || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_appts">Appointments</label>
          <textarea class="ms-knowledge-textarea" id="hl_appts" name="appointments" rows="2">${escapeHtml(h.appointments || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_tests">Test results &amp; medical documents <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
          <textarea class="ms-knowledge-textarea" id="hl_tests" name="testResultsDocuments" rows="2">${escapeHtml(h.testResultsDocuments || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Fitness, nutrition &amp; sleep</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_fitnessGoals">Fitness goals</label>
          <textarea class="ms-knowledge-textarea" id="hl_fitnessGoals" name="fitnessGoals" rows="2">${escapeHtml(h.fitnessGoals || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_exercise">Exercise routines</label>
          <textarea class="ms-knowledge-textarea" id="hl_exercise" name="exerciseRoutines" rows="2">${escapeHtml(h.exerciseRoutines || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_nutrition">Nutrition preferences</label>
          <textarea class="ms-knowledge-textarea" id="hl_nutrition" name="nutritionPreferences" rows="2">${escapeHtml(h.nutritionPreferences || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_sleep">Sleep routines</label>
          <textarea class="ms-knowledge-textarea" id="hl_sleep" name="sleepRoutines" rows="2">${escapeHtml(h.sleepRoutines || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_wellbeing">Wellbeing goals</label>
          <textarea class="ms-knowledge-textarea" id="hl_wellbeing" name="wellbeingGoals" rows="2">${escapeHtml(h.wellbeingGoals || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Reminders</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_reminders">Health-related reminders</label>
          <textarea class="ms-knowledge-textarea" id="hl_reminders" name="healthReminders" rows="2">${escapeHtml(h.healthReminders || '')}</textarea>
        </div>
      </fieldset>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkHealthReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkHealthSave">Save</button>
      </div>
    </form>`;
}

function collectHealthWellbeingFromForm(form) {
  const fd = new FormData(form);
  const keys = [
    'generalNotes',
    'conditionsDiagnoses',
    'allergies',
    'medications',
    'medicalHistory',
    'healthcareProviders',
    'appointments',
    'testResultsDocuments',
    'fitnessGoals',
    'exerciseRoutines',
    'nutritionPreferences',
    'sleepRoutines',
    'wellbeingGoals',
    'healthReminders',
  ];
  const out = {};
  keys.forEach((k) => {
    out[k] = String(fd.get(k) || '');
  });
  return out;
}

function getDefaultFinancialLife() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.financialLife;
  return raw && typeof raw === 'object' ? { ...raw } : {};
}

function loadFinancialLife() {
  const base = getDefaultFinancialLife();
  try {
    const raw = localStorage.getItem(MK_FINANCIAL_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { ...base, ...parsed };
  } catch {
    /* ignore */
  }
  return base;
}

function saveFinancialLife(data) {
  try {
    localStorage.setItem(MK_FINANCIAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardFinancialLifeEdits() {
  try {
    localStorage.removeItem(MK_FINANCIAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function renderMkFinancialForm(data) {
  const f = data || {};
  return `
    <form id="mkFinancialForm" class="ms-knowledge-form">
      <div class="ms-knowledge-financial-callout" role="note">
        <strong>Prototype only — not regulated financial advice.</strong> Do not store card numbers, CVVs, PINs, passwords, or full account numbers. This category stays off for “Sarah may use” and “learn from chat” until you opt in in MK‑06. Sharing with Company Sarah needs separate consent. Stored only in this browser until the API ships.
      </div>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Overview</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_generalNotes">General financial notes</label>
          <textarea class="ms-knowledge-textarea" id="fn_generalNotes" name="generalNotes" rows="2" placeholder="High-level picture — currencies, life stage, what you want Sarah to remember…">${escapeHtml(f.generalNotes || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_income">Income sources <span class="ms-knowledge-optional">(descriptions only)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_income" name="incomeSources" rows="2">${escapeHtml(f.incomeSources || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_budget">Budget &amp; cashflow overview</label>
          <textarea class="ms-knowledge-textarea" id="fn_budget" name="monthlyBudgetOverview" rows="2">${escapeHtml(f.monthlyBudgetOverview || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_expenses">Recurring expenses &amp; subscriptions</label>
          <textarea class="ms-knowledge-textarea" id="fn_expenses" name="expensesRecurring" rows="2">${escapeHtml(f.expensesRecurring || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Debts, savings &amp; goals</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_debts">Debts &amp; loans <span class="ms-knowledge-optional">(no account numbers)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_debts" name="debtsLoans" rows="2">${escapeHtml(f.debtsLoans || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_savings">Savings &amp; investments <span class="ms-knowledge-optional">(types &amp; goals, not login details)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_savings" name="savingsInvestments" rows="2">${escapeHtml(f.savingsInvestments || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_fingoals">Financial goals &amp; milestones</label>
          <textarea class="ms-knowledge-textarea" id="fn_fingoals" name="financialGoals" rows="2">${escapeHtml(f.financialGoals || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Insurance &amp; tax</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_insurance">Insurance policies <span class="ms-knowledge-optional">(provider &amp; type)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_insurance" name="insurancePolicies" rows="2">${escapeHtml(f.insurancePolicies || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_tax">Tax &amp; compliance notes</label>
          <textarea class="ms-knowledge-textarea" id="fn_tax" name="taxesCompliance" rows="2">${escapeHtml(f.taxesCompliance || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Institutions &amp; documents</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_accounts">Banks &amp; institutions <span class="ms-knowledge-optional">(names only — never passwords)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_accounts" name="accountsInstitutionsNote" rows="2">${escapeHtml(f.accountsInstitutionsNote || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_docs">Statements &amp; records <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_docs" name="documentsRecordsNote" rows="2">${escapeHtml(f.documentsRecordsNote || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Reminders</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_reminders">Money-related reminders</label>
          <textarea class="ms-knowledge-textarea" id="fn_reminders" name="financialReminders" rows="2">${escapeHtml(f.financialReminders || '')}</textarea>
        </div>
      </fieldset>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkFinancialReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkFinancialSave">Save</button>
      </div>
    </form>`;
}

function collectFinancialLifeFromForm(form) {
  const fd = new FormData(form);
  const keys = [
    'generalNotes',
    'incomeSources',
    'monthlyBudgetOverview',
    'expensesRecurring',
    'debtsLoans',
    'savingsInvestments',
    'insurancePolicies',
    'taxesCompliance',
    'financialGoals',
    'accountsInstitutionsNote',
    'documentsRecordsNote',
    'financialReminders',
  ];
  const out = {};
  keys.forEach((k) => {
    out[k] = String(fd.get(k) || '');
  });
  return out;
}

function getDefaultLifestylePreferences() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.lifestylePreferences;
  return raw && typeof raw === 'object' ? { ...raw } : {};
}

function loadLifestylePreferences() {
  const base = getDefaultLifestylePreferences();
  try {
    const raw = localStorage.getItem(MK_LIFESTYLE_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { ...base, ...parsed };
  } catch {
    /* ignore */
  }
  return base;
}

function saveLifestylePreferences(data) {
  try {
    localStorage.setItem(MK_LIFESTYLE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardLifestylePreferencesEdits() {
  try {
    localStorage.removeItem(MK_LIFESTYLE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function renderMkLifestyleForm(data) {
  const x = data || {};
  return `
    <form id="mkLifestyleForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        How you like day-to-day life, food, travel style, and downtime — distinct from health or money detail. Stored in this browser until the My Knowledge API ships.
      </p>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Overview &amp; rhythm</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_general">General lifestyle notes</label>
          <textarea class="ms-knowledge-textarea" id="ls_general" name="generalNotes" rows="2" placeholder="One-liner on how you like to live — edit or clear…">${escapeHtml(x.generalNotes || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_rhythm">Daily &amp; weekly rhythm</label>
          <textarea class="ms-knowledge-textarea" id="ls_rhythm" name="dailyWeeklyRhythm" rows="2" placeholder="Early bird or night owl, weekday vs weekend shape…">${escapeHtml(x.dailyWeeklyRhythm || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_home">Home &amp; environment</label>
          <textarea class="ms-knowledge-textarea" id="ls_home" name="homeEnvironment" rows="2" placeholder="Quiet vs social home, clutter tolerance, indoor/outdoor…">${escapeHtml(x.homeEnvironment || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Food, travel &amp; leisure</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_food">Food &amp; dining preferences</label>
          <textarea class="ms-knowledge-textarea" id="ls_food" name="foodDiningPreferences" rows="2" placeholder="Cuisines, dietary approach for lifestyle (not clinical — use Health if needed)…">${escapeHtml(x.foodDiningPreferences || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_travel">Travel style</label>
          <textarea class="ms-knowledge-textarea" id="ls_travel" name="travelStyle" rows="2" placeholder="Pace, budget band, solo vs group, favourite trip types…">${escapeHtml(x.travelStyle || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_leisure">Leisure &amp; weekends</label>
          <textarea class="ms-knowledge-textarea" id="ls_leisure" name="leisureWeekends" rows="2" placeholder="How you recharge — outings, sports, projects…">${escapeHtml(x.leisureWeekends || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Media, social &amp; shopping</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_media">Entertainment &amp; media</label>
          <textarea class="ms-knowledge-textarea" id="ls_media" name="entertainmentMedia" rows="2" placeholder="Books, podcasts, games, genres…">${escapeHtml(x.entertainmentMedia || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_social">Social life</label>
          <textarea class="ms-knowledge-textarea" id="ls_social" name="socialLife" rows="2" placeholder="How often you like to meet people, small groups vs crowds…">${escapeHtml(x.socialLife || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_shop">Shopping &amp; brands <span class="ms-knowledge-optional">(optional)</span></label>
          <textarea class="ms-knowledge-textarea" id="ls_shop" name="shoppingPreferences" rows="2" placeholder="Eco/local, minimalism, quality-over-quantity…">${escapeHtml(x.shoppingPreferences || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Pets &amp; reminders</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_pets">Pets, hobbies &amp; extras</label>
          <textarea class="ms-knowledge-textarea" id="ls_pets" name="petsHobbies" rows="2" placeholder="Pets to mention, side hobbies, collections…">${escapeHtml(x.petsHobbies || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_rem">Lifestyle reminders</label>
          <textarea class="ms-knowledge-textarea" id="ls_rem" name="lifestyleReminders" rows="2" placeholder="Seasonal habits, recurring joys…">${escapeHtml(x.lifestyleReminders || '')}</textarea>
        </div>
      </fieldset>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkLifestyleReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkLifestyleSave">Save</button>
      </div>
    </form>`;
}

function collectLifestylePreferencesFromForm(form) {
  const fd = new FormData(form);
  const keys = [
    'generalNotes',
    'dailyWeeklyRhythm',
    'homeEnvironment',
    'foodDiningPreferences',
    'travelStyle',
    'leisureWeekends',
    'entertainmentMedia',
    'socialLife',
    'shoppingPreferences',
    'petsHobbies',
    'lifestyleReminders',
  ];
  const out = {};
  keys.forEach((k) => {
    out[k] = String(fd.get(k) || '');
  });
  return out;
}

function mkNewImportantDateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `date-${crypto.randomUUID()}`;
  return `date-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDefaultImportantDatesEvents() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.importantDatesEvents;
  const events = Array.isArray(raw?.events) ? raw.events.map((ev) => ({ ...ev })) : [];
  const generalNotes = typeof raw?.generalNotes === 'string' ? raw.generalNotes : '';
  return { events, generalNotes };
}

function loadImportantDatesEvents() {
  const base = getDefaultImportantDatesEvents();
  try {
    const raw = localStorage.getItem(MK_DATES_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const events = Array.isArray(parsed.events) ? parsed.events.map((ev) => ({ ...ev })) : base.events;
      const generalNotes =
        typeof parsed.generalNotes === 'string' ? parsed.generalNotes : base.generalNotes;
      return { events, generalNotes };
    }
  } catch {
    /* ignore */
  }
  return base;
}

function saveImportantDatesEvents(data) {
  try {
    localStorage.setItem(MK_DATES_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardImportantDatesEventsEdits() {
  try {
    localStorage.removeItem(MK_DATES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function renderMkImportantDatesForm(data) {
  const { events, generalNotes } = data || { events: [], generalNotes: '' };
  const list = (events || []).length
    ? events
        .map((ev) => {
          const id = escapeHtml(ev.id);
          const kindOpts = mkGoalSelectOptions(MK_DATE_EVENT_KIND_OPTIONS, ev.kind);
          return `
        <article class="ms-knowledge-date-card" data-mk-important-date="${id}">
          <header class="ms-knowledge-date-card-head">
            <h4 class="ms-knowledge-date-card-title">Date or event</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-date-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="date_title_${id}">Title</label>
              <input class="ms-knowledge-input" id="date_title_${id}" data-date-field="title" type="text" value="${escapeHtml(ev.title || '')}" placeholder="e.g. Mum’s birthday" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="date_kind_${id}">Kind</label>
              <select class="ms-knowledge-input" id="date_kind_${id}" data-date-field="kind">${kindOpts}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="date_primary_${id}">Primary date <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="date_primary_${id}" data-date-field="primaryDate" type="date" value="${escapeHtml(ev.primaryDate || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="date_end_${id}">End date <span class="ms-knowledge-optional">(trips, multi-day)</span></label>
              <input class="ms-knowledge-input" id="date_end_${id}" data-date-field="endDate" type="date" value="${escapeHtml(ev.endDate || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="date_recur_${id}">Recurrence</label>
            <textarea class="ms-knowledge-textarea" id="date_recur_${id}" data-date-field="recurrenceNote" rows="2" placeholder="e.g. every year on 12 June; first Monday monthly…">${escapeHtml(ev.recurrenceNote || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="date_remind_${id}">Reminder preference</label>
            <textarea class="ms-knowledge-textarea" id="date_remind_${id}" data-date-field="remindPreference" rows="2" placeholder="How far ahead to nudge; channel when we wire notifications…">${escapeHtml(ev.remindPreference || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="date_people_${id}">Related people <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="date_people_${id}" data-date-field="relatedPeople" rows="2" placeholder="Names only — no need for full contact detail…">${escapeHtml(ev.relatedPeople || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="date_notes_${id}">Notes</label>
            <textarea class="ms-knowledge-textarea" id="date_notes_${id}" data-date-field="notes" rows="2">${escapeHtml(ev.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-date-empty">No dates yet — tap <strong>Add date</strong> for a birthday, renewal, trip, or deadline.</p>';

  return `
    <form id="mkDatesForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Birthdays, renewals, travel, deadlines — one entry each so Sarah can keep them straight. Stored in this browser until the My Knowledge API ships.
      </p>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Catch-all notes</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="dates_generalNotes">Notes across dates</label>
          <textarea class="ms-knowledge-textarea" id="dates_generalNotes" name="datesGeneralNotes" rows="2" placeholder="Anything that applies to several events…">${escapeHtml(generalNotes || '')}</textarea>
        </div>
      </fieldset>
      <div class="ms-knowledge-date-actions-top">
        <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" id="mkDatesAdd" data-mk-date-add>Add date</button>
      </div>
      <div class="ms-knowledge-date-list" id="mkDatesList">${list}</div>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkDatesReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkDatesSave">Save</button>
      </div>
    </form>`;
}

function collectImportantDatesFromDom(form) {
  const generalNotes = String(new FormData(form).get('datesGeneralNotes') || '');
  const root = document.getElementById('mkDatesList');
  if (!root) return { events: [], generalNotes };
  const cards = root.querySelectorAll('[data-mk-important-date]');
  const events = [];
  cards.forEach((card) => {
    const id = card.getAttribute('data-mk-important-date');
    if (!id) return;
    const row = {
      id,
      title: '',
      kind: 'other',
      primaryDate: '',
      endDate: '',
      recurrenceNote: '',
      remindPreference: '',
      relatedPeople: '',
      notes: '',
    };
    card.querySelectorAll('[data-date-field]').forEach((el) => {
      const field = el.getAttribute('data-date-field');
      if (!field) return;
      row[field] = 'value' in el ? String(el.value || '') : '';
    });
    events.push(row);
  });
  return { events, generalNotes };
}

function mkNewDocumentRecordId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `doc-${crypto.randomUUID()}`;
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDefaultDocumentsRecords() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.documentsRecords;
  const records = Array.isArray(raw?.records) ? raw.records.map((r) => ({ ...r })) : [];
  const generalNotes = typeof raw?.generalNotes === 'string' ? raw.generalNotes : '';
  return { records, generalNotes };
}

function loadDocumentsRecords() {
  const base = getDefaultDocumentsRecords();
  try {
    const raw = localStorage.getItem(MK_DOCUMENTS_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const records = Array.isArray(parsed.records) ? parsed.records.map((r) => ({ ...r })) : base.records;
      const generalNotes =
        typeof parsed.generalNotes === 'string' ? parsed.generalNotes : base.generalNotes;
      return { records, generalNotes };
    }
  } catch {
    /* ignore */
  }
  return base;
}

function saveDocumentsRecords(data) {
  try {
    localStorage.setItem(MK_DOCUMENTS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardDocumentsRecordsEdits() {
  try {
    localStorage.removeItem(MK_DOCUMENTS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function renderMkDocumentsForm(data) {
  const { records, generalNotes } = data || { records: [], generalNotes: '' };
  const list = (records || []).length
    ? records
        .map((rec) => {
          const id = escapeHtml(rec.id);
          const kindOpts = mkGoalSelectOptions(MK_DOC_KIND_OPTIONS, rec.kind);
          const sensOpts = mkGoalSelectOptions(MK_DOC_SENSITIVITY_OPTIONS, rec.sensitivity);
          return `
        <article class="ms-knowledge-doc-card" data-mk-document="${id}">
          <header class="ms-knowledge-doc-card-head">
            <h4 class="ms-knowledge-doc-card-title">Document</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-doc-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="doc_title_${id}">Title or name</label>
              <input class="ms-knowledge-input" id="doc_title_${id}" data-doc-field="title" type="text" value="${escapeHtml(rec.title || '')}" placeholder="e.g. Passport copy" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="doc_kind_${id}">Kind</label>
              <select class="ms-knowledge-input" id="doc_kind_${id}" data-doc-field="kind">${kindOpts}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="doc_storage_${id}">Where it lives</label>
            <textarea class="ms-knowledge-textarea" id="doc_storage_${id}" data-doc-field="storageLocation" rows="2" placeholder="Folder path, cloud vault, safe — not full file upload in prototype (MK‑04)">${escapeHtml(rec.storageLocation || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="doc_issue_${id}">Issue or created <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="doc_issue_${id}" data-doc-field="issueDate" type="date" value="${escapeHtml(rec.issueDate || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="doc_exp_${id}">Expiry or review <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="doc_exp_${id}" data-doc-field="expiryOrReviewDate" type="date" value="${escapeHtml(rec.expiryOrReviewDate || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="doc_related_${id}">Related My Knowledge category <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="doc_related_${id}" data-doc-field="relatedCategory" type="text" value="${escapeHtml(rec.relatedCategory || '')}" placeholder="e.g. identity, travel" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="doc_sens_${id}">Sensitivity</label>
              <select class="ms-knowledge-input" id="doc_sens_${id}" data-doc-field="sensitivity">${sensOpts}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="doc_notes_${id}">Notes</label>
            <textarea class="ms-knowledge-textarea" id="doc_notes_${id}" data-doc-field="notes" rows="2">${escapeHtml(rec.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-doc-empty">No documents listed yet — tap <strong>Add document</strong> for files you want Sarah to know about (metadata only until MK‑04).</p>';

  return `
    <form id="mkDocumentsForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Record what you have and where it lives — distinct from approved memories or chat attachments. Sarah does not scan files in the prototype. Stored in this browser until the My Knowledge API ships.
      </p>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Across your records</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="documents_generalNotes">General notes</label>
          <textarea class="ms-knowledge-textarea" id="documents_generalNotes" name="documentsGeneralNotes" rows="2" placeholder="Naming patterns, backup strategy, what not to duplicate…">${escapeHtml(generalNotes || '')}</textarea>
        </div>
      </fieldset>
      <div class="ms-knowledge-doc-actions-top">
        <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" id="mkDocumentsAdd" data-mk-doc-add>Add document</button>
      </div>
      <div class="ms-knowledge-doc-list" id="mkDocumentsList">${list}</div>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkDocumentsReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkDocumentsSave">Save</button>
      </div>
    </form>`;
}

function collectDocumentsRecordsFromDom(form) {
  const generalNotes = String(new FormData(form).get('documentsGeneralNotes') || '');
  const root = document.getElementById('mkDocumentsList');
  if (!root) return { records: [], generalNotes };
  const cards = root.querySelectorAll('[data-mk-document]');
  const records = [];
  cards.forEach((card) => {
    const id = card.getAttribute('data-mk-document');
    if (!id) return;
    const row = {
      id,
      title: '',
      kind: 'other',
      storageLocation: '',
      issueDate: '',
      expiryOrReviewDate: '',
      relatedCategory: '',
      sensitivity: 'standard',
      notes: '',
    };
    card.querySelectorAll('[data-doc-field]').forEach((el) => {
      const field = el.getAttribute('data-doc-field');
      if (!field) return;
      row[field] = 'value' in el ? String(el.value || '') : '';
    });
    records.push(row);
  });
  return { records, generalNotes };
}

function getDefaultRoutinesDailyLife() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.routinesDailyLife;
  return raw && typeof raw === 'object' ? { ...raw } : {};
}

function loadRoutinesDailyLife() {
  const base = getDefaultRoutinesDailyLife();
  try {
    const raw = localStorage.getItem(MK_ROUTINES_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { ...base, ...parsed };
  } catch {
    /* ignore */
  }
  return base;
}

function saveRoutinesDailyLife(data) {
  try {
    localStorage.setItem(MK_ROUTINES_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardRoutinesDailyLifeEdits() {
  try {
    localStorage.removeItem(MK_ROUTINES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function renderMkRoutinesForm(data) {
  const r = data || {};
  return `
    <form id="mkRoutinesForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Schedules, habits, and commitments — separate from health treatment detail (use Health when clinical). Stored in this browser until the My Knowledge API ships.
      </p>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Overview</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_generalNotes">General notes</label>
          <textarea class="ms-knowledge-textarea" id="rt_generalNotes" name="generalNotes" rows="2" placeholder="How you like days to flow — edit or clear…">${escapeHtml(r.generalNotes || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Typical days</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_weekday">Typical weekday</label>
          <textarea class="ms-knowledge-textarea" id="rt_weekday" name="typicalWeekday" rows="3" placeholder="Wake, focus blocks, commute, meals…">${escapeHtml(r.typicalWeekday || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_weekend">Typical weekend</label>
          <textarea class="ms-knowledge-textarea" id="rt_weekend" name="typicalWeekend" rows="3">${escapeHtml(r.typicalWeekend || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_morning">Morning routine</label>
          <textarea class="ms-knowledge-textarea" id="rt_morning" name="morningRoutine" rows="2">${escapeHtml(r.morningRoutine || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_evening">Evening &amp; wind-down</label>
          <textarea class="ms-knowledge-textarea" id="rt_evening" name="eveningWindDown" rows="2">${escapeHtml(r.eveningWindDown || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Commitments &amp; upkeep</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_recurring">Recurring commitments</label>
          <textarea class="ms-knowledge-textarea" id="rt_recurring" name="recurringCommitments" rows="3" placeholder="Standing meetings, school runs, club nights…">${escapeHtml(r.recurringCommitments || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_chores">Household &amp; errands</label>
          <textarea class="ms-knowledge-textarea" id="rt_chores" name="householdErrands" rows="2">${escapeHtml(r.householdErrands || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Habits &amp; constraints</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_habits">Habits you track</label>
          <textarea class="ms-knowledge-textarea" id="rt_habits" name="habitsTracking" rows="2" placeholder="Exercise streaks, journaling, inbox zero…">${escapeHtml(r.habitsTracking || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_interrupt">Interruptions &amp; constraints</label>
          <textarea class="ms-knowledge-textarea" id="rt_interrupt" name="interruptionsConstraints" rows="2" placeholder="Care duties, travel, noise sensitivity…">${escapeHtml(r.interruptionsConstraints || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Reminders</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_reminders">Routine reminders</label>
          <textarea class="ms-knowledge-textarea" id="rt_reminders" name="routineReminders" rows="2">${escapeHtml(r.routineReminders || '')}</textarea>
        </div>
      </fieldset>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkRoutinesReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkRoutinesSave">Save</button>
      </div>
    </form>`;
}

function collectRoutinesDailyLifeFromForm(form) {
  const fd = new FormData(form);
  const keys = [
    'generalNotes',
    'typicalWeekday',
    'typicalWeekend',
    'morningRoutine',
    'eveningWindDown',
    'recurringCommitments',
    'householdErrands',
    'habitsTracking',
    'interruptionsConstraints',
    'routineReminders',
  ];
  const out = {};
  keys.forEach((k) => {
    out[k] = String(fd.get(k) || '');
  });
  return out;
}

function mkNewPropertyAssetId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `prop-${crypto.randomUUID()}`;
  return `prop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDefaultPropertyAssets() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.propertyAssets;
  const items = Array.isArray(raw?.items) ? raw.items.map((x) => ({ ...x })) : [];
  const generalNotes = typeof raw?.generalNotes === 'string' ? raw.generalNotes : '';
  return { items, generalNotes };
}

function loadPropertyAssets() {
  const base = getDefaultPropertyAssets();
  try {
    const raw = localStorage.getItem(MK_PROPERTY_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const items = Array.isArray(parsed.items) ? parsed.items.map((x) => ({ ...x })) : base.items;
      const generalNotes =
        typeof parsed.generalNotes === 'string' ? parsed.generalNotes : base.generalNotes;
      return { items, generalNotes };
    }
  } catch {
    /* ignore */
  }
  return base;
}

function savePropertyAssets(data) {
  try {
    localStorage.setItem(MK_PROPERTY_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardPropertyAssetsEdits() {
  try {
    localStorage.removeItem(MK_PROPERTY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function renderMkPropertyForm(data) {
  const { items, generalNotes } = data || { items: [], generalNotes: '' };
  const list = (items || []).length
    ? items
        .map((it) => {
          const id = escapeHtml(it.id);
          const kindOpts = mkGoalSelectOptions(MK_PROPERTY_ASSET_KIND_OPTIONS, it.kind);
          const statusOpts = mkGoalSelectOptions(MK_PROPERTY_STATUS_OPTIONS, it.status);
          return `
        <article class="ms-knowledge-prop-card" data-mk-property="${id}">
          <header class="ms-knowledge-prop-card-head">
            <h4 class="ms-knowledge-prop-card-title">Asset</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-property-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="prop_label_${id}">Label / nickname</label>
              <input class="ms-knowledge-input" id="prop_label_${id}" data-prop-field="label" type="text" value="${escapeHtml(it.label || '')}" placeholder="e.g. City flat, daily driver" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="prop_kind_${id}">Kind</label>
              <select class="ms-knowledge-input" id="prop_kind_${id}" data-prop-field="kind">${kindOpts}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="prop_desc_${id}">Description <span class="ms-knowledge-optional">(make/model, size)</span></label>
            <textarea class="ms-knowledge-textarea" id="prop_desc_${id}" data-prop-field="description" rows="2">${escapeHtml(it.description || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="prop_loc_${id}">Location <span class="ms-knowledge-optional">(area)</span></label>
              <input class="ms-knowledge-input" id="prop_loc_${id}" data-prop-field="location" type="text" value="${escapeHtml(it.location || '')}" placeholder="Suburb, parking spot — not full street unless you want" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="prop_status_${id}">Status</label>
              <select class="ms-knowledge-input" id="prop_status_${id}" data-prop-field="status">${statusOpts}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="prop_renew_${id}">Renewals &amp; service <span class="ms-knowledge-optional">(licence, insurance, MOT)</span></label>
            <textarea class="ms-knowledge-textarea" id="prop_renew_${id}" data-prop-field="renewalsServices" rows="2">${escapeHtml(it.renewalsServices || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="prop_docs_${id}">Records &amp; documents <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
            <textarea class="ms-knowledge-textarea" id="prop_docs_${id}" data-prop-field="documentsNote" rows="2" placeholder="Link Documents & records or describe where files live">${escapeHtml(it.documentsNote || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="prop_notes_${id}">Notes</label>
            <textarea class="ms-knowledge-textarea" id="prop_notes_${id}" data-prop-field="notes" rows="2">${escapeHtml(it.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-prop-empty">No assets yet — tap <strong>Add asset</strong> for a home, vehicle, or other item.</p>';

  return `
    <form id="mkPropertyForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Homes, vehicles, equipment — one card each. Do not store full policy numbers or banking detail here (use Financial or Documents metadata). Stored in this browser until the My Knowledge API ships.
      </p>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Across your property</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="property_generalNotes">General notes</label>
          <textarea class="ms-knowledge-textarea" id="property_generalNotes" name="propertyGeneralNotes" rows="2" placeholder="How you organise warranties, spare keys, shared ownership…">${escapeHtml(generalNotes || '')}</textarea>
        </div>
      </fieldset>
      <div class="ms-knowledge-prop-actions-top">
        <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" id="mkPropertyAdd" data-mk-property-add>Add asset</button>
      </div>
      <div class="ms-knowledge-prop-list" id="mkPropertyList">${list}</div>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkPropertyReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkPropertySave">Save</button>
      </div>
    </form>`;
}

function collectPropertyAssetsFromDom(form) {
  const generalNotes = String(new FormData(form).get('propertyGeneralNotes') || '');
  const root = document.getElementById('mkPropertyList');
  if (!root) return { items: [], generalNotes };
  const cards = root.querySelectorAll('[data-mk-property]');
  const items = [];
  cards.forEach((card) => {
    const id = card.getAttribute('data-mk-property');
    if (!id) return;
    const row = {
      id,
      label: '',
      kind: 'other',
      description: '',
      location: '',
      status: 'owned',
      renewalsServices: '',
      documentsNote: '',
      notes: '',
    };
    card.querySelectorAll('[data-prop-field]').forEach((el) => {
      const field = el.getAttribute('data-prop-field');
      if (!field) return;
      row[field] = 'value' in el ? String(el.value || '') : '';
    });
    items.push(row);
  });
  return { items, generalNotes };
}

function mkNewTravelTripId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `trip-${crypto.randomUUID()}`;
  return `trip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDefaultTravelPlaces() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.travelPlaces;
  const trips = Array.isArray(raw?.trips) ? raw.trips.map((t) => ({ ...t })) : [];
  const generalNotes = typeof raw?.generalNotes === 'string' ? raw.generalNotes : '';
  const favoritePlaces = typeof raw?.favoritePlaces === 'string' ? raw.favoritePlaces : '';
  return { trips, generalNotes, favoritePlaces };
}

function loadTravelPlaces() {
  const base = getDefaultTravelPlaces();
  try {
    const raw = localStorage.getItem(MK_TRAVEL_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const trips = Array.isArray(parsed.trips) ? parsed.trips.map((t) => ({ ...t })) : base.trips;
      const generalNotes =
        typeof parsed.generalNotes === 'string' ? parsed.generalNotes : base.generalNotes;
      const favoritePlaces =
        typeof parsed.favoritePlaces === 'string' ? parsed.favoritePlaces : base.favoritePlaces;
      return { trips, generalNotes, favoritePlaces };
    }
  } catch {
    /* ignore */
  }
  return base;
}

function saveTravelPlaces(data) {
  try {
    localStorage.setItem(MK_TRAVEL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardTravelPlacesEdits() {
  try {
    localStorage.removeItem(MK_TRAVEL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function renderMkTravelForm(data) {
  const { trips, generalNotes, favoritePlaces } = data || {
    trips: [],
    generalNotes: '',
    favoritePlaces: '',
  };
  const list = (trips || []).length
    ? trips
        .map((trip) => {
          const id = escapeHtml(trip.id);
          const kindOpts = mkGoalSelectOptions(MK_TRAVEL_TRIP_KIND_OPTIONS, trip.kind);
          const statusOpts = mkGoalSelectOptions(MK_TRAVEL_TRIP_STATUS_OPTIONS, trip.status);
          return `
        <article class="ms-knowledge-travel-card" data-mk-travel-trip="${id}">
          <header class="ms-knowledge-travel-card-head">
            <h4 class="ms-knowledge-travel-card-title">Trip or visit</h4>
            <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-travel-remove="${id}">Remove</button>
          </header>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="tv_title_${id}">Title</label>
              <input class="ms-knowledge-input" id="tv_title_${id}" data-travel-field="title" type="text" value="${escapeHtml(trip.title || '')}" placeholder="e.g. Coastal long weekend" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="tv_kind_${id}">Kind</label>
              <select class="ms-knowledge-input" id="tv_kind_${id}" data-travel-field="kind">${kindOpts}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="tv_dest_${id}">Destination / region</label>
            <textarea class="ms-knowledge-textarea" id="tv_dest_${id}" data-travel-field="destination" rows="2" placeholder="City, country, or broad region">${escapeHtml(trip.destination || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="tv_start_${id}">Start <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="tv_start_${id}" data-travel-field="startDate" type="date" value="${escapeHtml(trip.startDate || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="tv_end_${id}">End <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="tv_end_${id}" data-travel-field="endDate" type="date" value="${escapeHtml(trip.endDate || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="tv_status_${id}">Status</label>
              <select class="ms-knowledge-input" id="tv_status_${id}" data-travel-field="status">${statusOpts}</select>
            </div>
            <div>
              <label class="ms-knowledge-label" for="tv_companions_${id}">Travel companions <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="tv_companions_${id}" data-travel-field="companions" type="text" value="${escapeHtml(trip.companions || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="tv_docs_${id}">Passport, visa &amp; documents <span class="ms-knowledge-optional">(notes)</span></label>
            <textarea class="ms-knowledge-textarea" id="tv_docs_${id}" data-travel-field="passportVisaNote" rows="2" placeholder="Expiry hints, visa type — details live in Documents when you add them">${escapeHtml(trip.passportVisaNote || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="tv_notes_${id}">Notes</label>
            <textarea class="ms-knowledge-textarea" id="tv_notes_${id}" data-travel-field="notes" rows="2">${escapeHtml(trip.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-travel-empty">No trips yet — tap <strong>Add trip</strong> for something planned or past.</p>';

  return `
    <form id="mkTravelForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Trips, destinations, and travel logistics notes — passports and scans stay in Documents until MK‑04. Stored in this browser until the My Knowledge API ships.
      </p>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Overview</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="travel_generalNotes">General travel notes</label>
          <textarea class="ms-knowledge-textarea" id="travel_generalNotes" name="travelGeneralNotes" rows="2" placeholder="Passport country, usual home airport, travel priorities…">${escapeHtml(generalNotes || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="travel_favorites">Favourite places &amp; return wish-list</label>
          <textarea class="ms-knowledge-textarea" id="travel_favorites" name="favoritePlaces" rows="2" placeholder="Cities or regions you love or want to revisit">${escapeHtml(favoritePlaces || '')}</textarea>
        </div>
      </fieldset>
      <div class="ms-knowledge-travel-actions-top">
        <button type="button" class="ms-knowledge-pill ms-knowledge-pill--secondary" id="mkTravelAdd" data-mk-travel-add>Add trip</button>
      </div>
      <div class="ms-knowledge-travel-list" id="mkTravelList">${list}</div>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkTravelReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkTravelSave">Save</button>
      </div>
    </form>`;
}

function collectTravelPlacesFromDom(form) {
  const fd = new FormData(form);
  const generalNotes = String(fd.get('travelGeneralNotes') || '');
  const favoritePlaces = String(fd.get('favoritePlaces') || '');
  const root = document.getElementById('mkTravelList');
  if (!root) return { trips: [], generalNotes, favoritePlaces };
  const cards = root.querySelectorAll('[data-mk-travel-trip]');
  const trips = [];
  cards.forEach((card) => {
    const id = card.getAttribute('data-mk-travel-trip');
    if (!id) return;
    const row = {
      id,
      title: '',
      kind: 'other',
      destination: '',
      startDate: '',
      endDate: '',
      status: 'planned',
      companions: '',
      passportVisaNote: '',
      notes: '',
    };
    card.querySelectorAll('[data-travel-field]').forEach((el) => {
      const field = el.getAttribute('data-travel-field');
      if (!field) return;
      row[field] = 'value' in el ? String(el.value || '') : '';
    });
    trips.push(row);
  });
  return { trips, generalNotes, favoritePlaces };
}

function getDefaultValuesPrinciples() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const raw = mk?.valuesPrinciples;
  return raw && typeof raw === 'object' ? { ...raw } : {};
}

function loadValuesPrinciples() {
  const base = getDefaultValuesPrinciples();
  try {
    const raw = localStorage.getItem(MK_VALUES_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { ...base, ...parsed };
  } catch {
    /* ignore */
  }
  return base;
}

function saveValuesPrinciples(data) {
  try {
    localStorage.setItem(MK_VALUES_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function discardValuesPrinciplesEdits() {
  try {
    localStorage.removeItem(MK_VALUES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function renderMkValuesForm(data) {
  const v = data || {};
  return `
    <form id="mkValuesForm" class="ms-knowledge-form">
      <div class="ms-knowledge-values-callout" role="note">
        <strong>Private by default in the prototype.</strong> “Sarah may use” and “learn from chat” stay off until you opt in in MK‑06. Sarah does not debate your worldview or pressure you to disclose more than you choose. Stored only in this browser until the API ships.
      </div>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">What matters to you</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="val_core">Core values &amp; principles</label>
          <textarea class="ms-knowledge-textarea" id="val_core" name="coreValuesPrinciples" rows="3" placeholder="Non‑negotiables, virtues you try to live by…">${escapeHtml(v.coreValuesPrinciples || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="val_ethical">Ethical &amp; professional boundaries</label>
          <textarea class="ms-knowledge-textarea" id="val_ethical" name="ethicalBoundaries" rows="2" placeholder="What you won’t do or facilitate; consent lines…">${escapeHtml(v.ethicalBoundaries || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Worldview &amp; civic life <span class="ms-knowledge-optional">(optional)</span></legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="val_faith">Faith, spirituality, or philosophy</label>
          <textarea class="ms-knowledge-textarea" id="val_faith" name="faithPhilosophy" rows="2" placeholder="Only what you want Sarah to weigh — or leave blank">${escapeHtml(v.faithPhilosophy || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="val_causes">Causes &amp; communities you care about</label>
          <textarea class="ms-knowledge-textarea" id="val_causes" name="causesCommunities" rows="2">${escapeHtml(v.causesCommunities || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="val_civic">Political or civic stance <span class="ms-knowledge-optional">(high level)</span></label>
          <textarea class="ms-knowledge-textarea" id="val_civic" name="politicalCivicNote" rows="2" placeholder="How Sarah should respect civic topics — not detailed manifestos unless you want">${escapeHtml(v.politicalCivicNote || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Boundaries for Sarah</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="val_rel">Relationship &amp; consent boundaries</label>
          <textarea class="ms-knowledge-textarea" id="val_rel" name="relationshipConsentBoundaries" rows="2" placeholder="Topics to tread lightly on, confidentiality expectations…">${escapeHtml(v.relationshipConsentBoundaries || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="val_avoid">Topics to avoid or minimise</label>
          <textarea class="ms-knowledge-textarea" id="val_avoid" name="topicsToAvoid" rows="2">${escapeHtml(v.topicsToAvoid || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="val_how">How Sarah should use this when advising</label>
          <textarea class="ms-knowledge-textarea" id="val_how" name="howSarahShouldWeigh" rows="2" placeholder="e.g. flag conflicts with values; never moralise; ask before quoting this in summaries">${escapeHtml(v.howSarahShouldWeigh || '')}</textarea>
        </div>
      </fieldset>
      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkValuesReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkValuesSave">Save</button>
      </div>
    </form>`;
}

function collectValuesPrinciplesFromForm(form) {
  const fd = new FormData(form);
  const keys = [
    'coreValuesPrinciples',
    'ethicalBoundaries',
    'faithPhilosophy',
    'causesCommunities',
    'politicalCivicNote',
    'relationshipConsentBoundaries',
    'topicsToAvoid',
    'howSarahShouldWeigh',
  ];
  const out = {};
  keys.forEach((k) => {
    out[k] = String(fd.get(k) || '');
  });
  return out;
}

function setMkKnowledgeViewMode(mode) {
  const home = document.getElementById('mkHomeRoot');
  const detail = document.getElementById('mkCategoryRoot');
  if (home) home.classList.toggle('hidden', mode === 'detail');
  if (detail) detail.classList.toggle('hidden', mode !== 'detail');
}

const MK_RESPONSE_STYLE_OPTIONS = [
  { value: 'short', label: 'Short answers' },
  { value: 'detailed', label: 'Detailed answers' },
  { value: 'formal', label: 'Formal tone' },
  { value: 'casual', label: 'Casual tone' },
  { value: 'step_by_step', label: 'Step-by-step' },
];

function renderMkPersonalIdentityForm(data) {
  const d = data || {};
  const opts = MK_RESPONSE_STYLE_OPTIONS.map((o) => {
    const sel = (d.responseStyle || 'detailed') === o.value ? ' selected' : '';
    return `<option value="${escapeHtml(o.value)}"${sel}>${escapeHtml(o.label)}</option>`;
  }).join('');
  return `
    <form id="mkIdentityForm" class="ms-knowledge-form" autocomplete="on">
      <p class="ms-knowledge-detail-note">Edits save in this browser for the prototype. Sync to your account arrives with the My Knowledge API.</p>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Identity & location</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_fullName">Full name</label>
          <input class="ms-knowledge-input" id="mk_fullName" name="fullName" type="text" value="${escapeHtml(d.fullName || '')}" />
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_preferredName">Preferred name</label>
          <input class="ms-knowledge-input" id="mk_preferredName" name="preferredName" type="text" value="${escapeHtml(d.preferredName || '')}" />
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="mk_dateOfBirth">Date of birth</label>
            <input class="ms-knowledge-input" id="mk_dateOfBirth" name="dateOfBirth" type="date" value="${escapeHtml(d.dateOfBirth || '')}" />
          </div>
          <div>
            <label class="ms-knowledge-label" for="mk_preferredLanguage">Preferred language</label>
            <input class="ms-knowledge-input" id="mk_preferredLanguage" name="preferredLanguage" type="text" value="${escapeHtml(d.preferredLanguage || '')}" />
          </div>
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="mk_country">Country</label>
            <input class="ms-knowledge-input" id="mk_country" name="country" type="text" value="${escapeHtml(d.country || '')}" />
          </div>
          <div>
            <label class="ms-knowledge-label" for="mk_city">City / area</label>
            <input class="ms-knowledge-input" id="mk_city" name="city" type="text" value="${escapeHtml(d.city || '')}" />
          </div>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_locationNote">Location note <span class="ms-knowledge-optional">(optional)</span></label>
          <input class="ms-knowledge-input" id="mk_locationNote" name="locationNote" type="text" placeholder="Region, neighbourhood, timezone…" value="${escapeHtml(d.locationNote || '')}" />
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_nationalityBackground">Nationality or background <span class="ms-knowledge-optional">(optional)</span></label>
          <textarea class="ms-knowledge-textarea" id="mk_nationalityBackground" name="nationalityBackground" rows="2">${escapeHtml(d.nationalityBackground || '')}</textarea>
        </div>
      </fieldset>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Story & expertise</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_educationQualifications">Education & qualifications</label>
          <textarea class="ms-knowledge-textarea" id="mk_educationQualifications" name="educationQualifications" rows="3">${escapeHtml(d.educationQualifications || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_personalBiography">Personal biography</label>
          <textarea class="ms-knowledge-textarea" id="mk_personalBiography" name="personalBiography" rows="4">${escapeHtml(d.personalBiography || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_importantLifeExperiences">Important life experiences</label>
          <textarea class="ms-knowledge-textarea" id="mk_importantLifeExperiences" name="importantLifeExperiences" rows="3">${escapeHtml(d.importantLifeExperiences || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_skillsExpertise">Skills, talents & areas of expertise</label>
          <textarea class="ms-knowledge-textarea" id="mk_skillsExpertise" name="skillsExpertise" rows="3">${escapeHtml(d.skillsExpertise || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_interestsHobbies">Interests & hobbies</label>
          <textarea class="ms-knowledge-textarea" id="mk_interestsHobbies" name="interestsHobbies" rows="2">${escapeHtml(d.interestsHobbies || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_enjoysDislikes">Things you enjoy & dislike</label>
          <textarea class="ms-knowledge-textarea" id="mk_enjoysDislikes" name="enjoysDislikes" rows="3">${escapeHtml(d.enjoysDislikes || '')}</textarea>
        </div>
      </fieldset>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">How Sarah should respond</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_communicationPreferences">Communication preferences</label>
          <textarea class="ms-knowledge-textarea" id="mk_communicationPreferences" name="communicationPreferences" rows="3">${escapeHtml(d.communicationPreferences || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_responseStyle">Preferred response style</label>
          <select class="ms-knowledge-input" id="mk_responseStyle" name="responseStyle">${opts}</select>
        </div>
      </fieldset>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Values & growth</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_personalValues">Important values & principles</label>
          <textarea class="ms-knowledge-textarea" id="mk_personalValues" name="personalValues" rows="3">${escapeHtml(d.personalValues || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_strengthsImprove">Strengths & areas to improve</label>
          <textarea class="ms-knowledge-textarea" id="mk_strengthsImprove" name="strengthsImprove" rows="3">${escapeHtml(d.strengthsImprove || '')}</textarea>
        </div>
      </fieldset>

      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkIdentityReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkIdentitySave">Save</button>
      </div>
    </form>`;
}

function renderMkCategoryPlaceholder(cat) {
  return `
    <p class="ms-knowledge-detail-lead">${escapeHtml(cat.blurb)}</p>
    <section class="ms-knowledge-placeholder-card">
      <h4 class="ms-knowledge-placeholder-title">MK‑02 category editors</h4>
      <p class="ms-knowledge-placeholder-body">
        All baseline My Knowledge categories have structured add/edit flows in this prototype (local persistence per category). Upload queue metadata (MK‑04) and memory review (MK‑05) are wired here; category permission toggles remain MK‑06.
      </p>
      <button type="button" class="ms-knowledge-chip-btn" data-mk-placeholder="notify">Notify me</button>
    </section>`;
}

function renderMkCategoryDetail(categoryKey) {
  const key = String(categoryKey || '').trim();
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const cat = mk?.categories?.find((c) => c.key === key);
  const host = document.getElementById('mkCategoryRoot');
  if (!host) return;

  setMkKnowledgeViewMode('detail');

  if (!cat) {
    host.innerHTML = `
      <div class="ms-knowledge-detail-inner">
        <button type="button" class="ms-knowledge-back" id="mkCategoryBack">Back</button>
        <p class="ms-knowledge-detail-lead">Category not found.</p>
      </div>`;
    return;
  }

  const badgeClass = mkClassificationShort(cat.classification) === 'Sensitive' ? 'sensitive' : 'personal';
  let body = '';
  if (key === 'identity') {
    body = renderMkPersonalIdentityForm(loadPersonalIdentity());
  } else if (key === 'family') {
    body = renderMkFamilyForm(loadFamilyRelationships());
  } else if (key === 'goals') {
    body = renderMkGoalsForm(loadGoalsAmbitions());
  } else if (key === 'work') {
    body = renderMkWorkForm(loadWorkProfessional());
  } else if (key === 'business') {
    body = renderMkBusinessForm(loadBusinessEntrepreneurship());
  } else if (key === 'education') {
    body = renderMkEducationForm(loadEducationLearning());
  } else if (key === 'health') {
    body = renderMkHealthForm(loadHealthWellbeing());
  } else if (key === 'financial') {
    body = renderMkFinancialForm(loadFinancialLife());
  } else if (key === 'lifestyle') {
    body = renderMkLifestyleForm(loadLifestylePreferences());
  } else if (key === 'dates') {
    body = renderMkImportantDatesForm(loadImportantDatesEvents());
  } else if (key === 'documents') {
    body = renderMkDocumentsForm(loadDocumentsRecords());
  } else if (key === 'routines') {
    body = renderMkRoutinesForm(loadRoutinesDailyLife());
  } else if (key === 'property') {
    body = renderMkPropertyForm(loadPropertyAssets());
  } else if (key === 'travel') {
    body = renderMkTravelForm(loadTravelPlaces());
  } else if (key === 'values') {
    body = renderMkValuesForm(loadValuesPrinciples());
  } else {
    body = renderMkCategoryPlaceholder(cat);
  }

  host.innerHTML = `
    <div class="ms-knowledge-detail-inner">
      <button type="button" class="ms-knowledge-back" id="mkCategoryBack" aria-label="Back to My Knowledge">
        <svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
        Back
      </button>
      <header class="ms-knowledge-detail-head">
        <div>
          <p class="ms-knowledge-detail-eyebrow">${escapeHtml(cat.subtitle || cat.area)}</p>
          <h3 class="ms-knowledge-detail-title">${escapeHtml(cat.label)}</h3>
        </div>
        <span class="ms-knowledge-badge ms-knowledge-badge--${badgeClass}">${escapeHtml(mkClassificationShort(cat.classification))}</span>
      </header>
      <dl class="ms-knowledge-detail-perms">
        <div><dt>Sarah may use</dt><dd>${cat.sarahMayUse ? 'On' : 'Off'} <span class="ms-knowledge-hint">(MK‑06)</span></div>
        <div><dt>Learn from chat</dt><dd>${cat.learnFromConversations ? 'On' : 'Off'} <span class="ms-knowledge-hint">(MK‑06)</span></div>
      </dl>
      ${body}
    </div>`;
}

let __mkCategoryDetailBound = false;

function bindMkCategoryDetailOnce() {
  if (__mkCategoryDetailBound) return;
  __mkCategoryDetailBound = true;
  const root = document.getElementById('mkCategoryRoot');
  if (!root) return;

  root.addEventListener('click', (e) => {
    const back = e.target.closest('#mkCategoryBack');
    if (back) {
      e.preventDefault();
      closeMyKnowledgeCategory();
      return;
    }
    const resetIdentity = e.target.closest('#mkIdentityReset');
    if (resetIdentity) {
      discardPersonalIdentityEdits();
      showProtoToast('Reset to prototype defaults');
      renderMkCategoryDetail('identity');
      return;
    }
    const resetFamily = e.target.closest('#mkFamilyReset');
    if (resetFamily) {
      discardFamilyRelationshipsEdits();
      showProtoToast('Family list reset to prototype defaults');
      renderMkCategoryDetail('family');
      return;
    }
    const resetGoals = e.target.closest('#mkGoalsReset');
    if (resetGoals) {
      discardGoalsAmbitionsEdits();
      showProtoToast('Goals reset to prototype defaults');
      renderMkCategoryDetail('goals');
      return;
    }
    const resetWork = e.target.closest('#mkWorkReset');
    if (resetWork) {
      discardWorkProfessionalEdits();
      showProtoToast('Work profile reset to prototype defaults');
      renderMkCategoryDetail('work');
      return;
    }
    const resetBusiness = e.target.closest('#mkBusinessReset');
    if (resetBusiness) {
      discardBusinessEntrepreneurshipEdits();
      showProtoToast('Business profiles reset to prototype defaults');
      renderMkCategoryDetail('business');
      return;
    }
    const resetEducation = e.target.closest('#mkEducationReset');
    if (resetEducation) {
      discardEducationLearningEdits();
      showProtoToast('Education reset to prototype defaults');
      renderMkCategoryDetail('education');
      return;
    }
    const resetHealth = e.target.closest('#mkHealthReset');
    if (resetHealth) {
      discardHealthWellbeingEdits();
      showProtoToast('Health notes reset to prototype defaults');
      renderMkCategoryDetail('health');
      return;
    }
    const resetFinancial = e.target.closest('#mkFinancialReset');
    if (resetFinancial) {
      discardFinancialLifeEdits();
      showProtoToast('Financial notes reset to prototype defaults');
      renderMkCategoryDetail('financial');
      return;
    }
    const resetLifestyle = e.target.closest('#mkLifestyleReset');
    if (resetLifestyle) {
      discardLifestylePreferencesEdits();
      showProtoToast('Lifestyle preferences reset to prototype defaults');
      renderMkCategoryDetail('lifestyle');
      return;
    }
    const resetDates = e.target.closest('#mkDatesReset');
    if (resetDates) {
      discardImportantDatesEventsEdits();
      showProtoToast('Dates & events reset to prototype defaults');
      renderMkCategoryDetail('dates');
      return;
    }
    const resetDocuments = e.target.closest('#mkDocumentsReset');
    if (resetDocuments) {
      discardDocumentsRecordsEdits();
      showProtoToast('Documents list reset to prototype defaults');
      renderMkCategoryDetail('documents');
      return;
    }
    const resetRoutines = e.target.closest('#mkRoutinesReset');
    if (resetRoutines) {
      discardRoutinesDailyLifeEdits();
      showProtoToast('Routines reset to prototype defaults');
      renderMkCategoryDetail('routines');
      return;
    }
    const resetProperty = e.target.closest('#mkPropertyReset');
    if (resetProperty) {
      discardPropertyAssetsEdits();
      showProtoToast('Property & assets reset to prototype defaults');
      renderMkCategoryDetail('property');
      return;
    }
    const resetTravel = e.target.closest('#mkTravelReset');
    if (resetTravel) {
      discardTravelPlacesEdits();
      showProtoToast('Travel reset to prototype defaults');
      renderMkCategoryDetail('travel');
      return;
    }
    const resetValues = e.target.closest('#mkValuesReset');
    if (resetValues) {
      discardValuesPrinciplesEdits();
      showProtoToast('Values & principles reset to prototype defaults');
      renderMkCategoryDetail('values');
      return;
    }
    const addFamily = e.target.closest('[data-mk-family-add]');
    if (addFamily) {
      const data = loadFamilyRelationships();
      data.people.push({
        id: mkNewFamilyPersonId(),
        name: '',
        relationship: 'close_friends',
        birthday: '',
        details: '',
        reminders: '',
      });
      saveFamilyRelationships(data);
      renderMkCategoryDetail('family');
      showProtoToast('Person added — fill in and save');
      return;
    }
    const rm = e.target.closest('[data-mk-family-remove]');
    if (rm) {
      const pid = rm.getAttribute('data-mk-family-remove');
      const data = loadFamilyRelationships();
      data.people = (data.people || []).filter((p) => p.id !== pid);
      saveFamilyRelationships(data);
      renderMkCategoryDetail('family');
      showProtoToast('Person removed');
      return;
    }
    const addGoal = e.target.closest('[data-mk-goal-add]');
    if (addGoal) {
      const data = loadGoalsAmbitions();
      data.goals.push({
        id: mkNewGoalId(),
        title: '',
        description: '',
        whyItMatters: '',
        targetDate: '',
        priority: 'medium',
        progress: '',
        milestones: '',
        challenges: '',
        resources: '',
        relatedAssignments: '',
        status: 'planned',
        goalKind: 'personal',
      });
      saveGoalsAmbitions(data);
      renderMkCategoryDetail('goals');
      showProtoToast('Goal added — fill in and save');
      return;
    }
    const rmGoal = e.target.closest('[data-mk-goal-remove]');
    if (rmGoal) {
      const gid = rmGoal.getAttribute('data-mk-goal-remove');
      const data = loadGoalsAmbitions();
      data.goals = (data.goals || []).filter((g) => g.id !== gid);
      saveGoalsAmbitions(data);
      renderMkCategoryDetail('goals');
      showProtoToast('Goal removed');
      return;
    }
    const addWork = e.target.closest('[data-mk-work-add]');
    if (addWork) {
      const data = loadWorkProfessional();
      data.roles.push({
        id: mkNewWorkRoleId(),
        slot: 'current',
        jobTitle: '',
        employer: '',
        startDate: '',
        endDate: '',
        responsibilities: '',
        qualifications: '',
        skillsExpertise: '',
        projectsAssignments: '',
        workingHoursRoutines: '',
        workplacePreferences: '',
        professionalContacts: '',
        experienceHighlights: '',
        careerAmbitions: '',
        documentsNotes: '',
      });
      saveWorkProfessional(data);
      renderMkCategoryDetail('work');
      showProtoToast('Role added — fill in and save');
      return;
    }
    const rmWork = e.target.closest('[data-mk-work-remove]');
    if (rmWork) {
      const wid = rmWork.getAttribute('data-mk-work-remove');
      const data = loadWorkProfessional();
      data.roles = (data.roles || []).filter((r) => r.id !== wid);
      saveWorkProfessional(data);
      renderMkCategoryDetail('work');
      showProtoToast('Role removed');
      return;
    }
    const addBiz = e.target.closest('[data-mk-biz-add]');
    if (addBiz) {
      const data = loadBusinessEntrepreneurship();
      data.ventures.push({
        id: mkNewVentureId(),
        businessName: '',
        industry: '',
        userRole: '',
        description: '',
        productsServices: '',
        currentStage: '',
        objectives: '',
        keyContacts: '',
        relatedDocuments: '',
        currentProjects: '',
        confidentialityLevel: 'internal',
      });
      saveBusinessEntrepreneurship(data);
      renderMkCategoryDetail('business');
      showProtoToast('Business added — fill in and save');
      return;
    }
    const rmBiz = e.target.closest('[data-mk-biz-remove]');
    if (rmBiz) {
      const bid = rmBiz.getAttribute('data-mk-biz-remove');
      const data = loadBusinessEntrepreneurship();
      data.ventures = (data.ventures || []).filter((v) => v.id !== bid);
      saveBusinessEntrepreneurship(data);
      renderMkCategoryDetail('business');
      showProtoToast('Business removed');
      return;
    }
    const addEduFormal = e.target.closest('[data-mk-edu-formal-add]');
    if (addEduFormal) {
      const data = loadEducationLearning();
      data.formalPrograms.push({
        id: mkNewEduFormalId(),
        institution: '',
        qualification: '',
        studyArea: '',
        startDate: '',
        endDate: '',
        status: 'enrolled',
        highlights: '',
        documentsNote: '',
      });
      saveEducationLearning(data);
      renderMkCategoryDetail('education');
      showProtoToast('Program added — fill in and save');
      return;
    }
    const rmEduFormal = e.target.closest('[data-mk-edu-formal-remove]');
    if (rmEduFormal) {
      const rid = rmEduFormal.getAttribute('data-mk-edu-formal-remove');
      const data = loadEducationLearning();
      data.formalPrograms = (data.formalPrograms || []).filter((p) => p.id !== rid);
      saveEducationLearning(data);
      renderMkCategoryDetail('education');
      showProtoToast('Program removed');
      return;
    }
    const addEduCourse = e.target.closest('[data-mk-edu-course-add]');
    if (addEduCourse) {
      const data = loadEducationLearning();
      data.coursesAndCerts.push({
        id: mkNewEduCourseId(),
        name: '',
        provider: '',
        completedDate: '',
        credential: '',
        link: '',
        notes: '',
      });
      saveEducationLearning(data);
      renderMkCategoryDetail('education');
      showProtoToast('Course added — fill in and save');
      return;
    }
    const rmEduCourse = e.target.closest('[data-mk-edu-course-remove]');
    if (rmEduCourse) {
      const cid = rmEduCourse.getAttribute('data-mk-edu-course-remove');
      const data = loadEducationLearning();
      data.coursesAndCerts = (data.coursesAndCerts || []).filter((c) => c.id !== cid);
      saveEducationLearning(data);
      renderMkCategoryDetail('education');
      showProtoToast('Course removed');
      return;
    }
    const addDate = e.target.closest('[data-mk-date-add]');
    if (addDate) {
      const data = loadImportantDatesEvents();
      data.events.push({
        id: mkNewImportantDateId(),
        title: '',
        kind: 'other',
        primaryDate: '',
        endDate: '',
        recurrenceNote: '',
        remindPreference: '',
        relatedPeople: '',
        notes: '',
      });
      saveImportantDatesEvents(data);
      renderMkCategoryDetail('dates');
      showProtoToast('Date added — fill in and save');
      return;
    }
    const rmDate = e.target.closest('[data-mk-date-remove]');
    if (rmDate) {
      const did = rmDate.getAttribute('data-mk-date-remove');
      const data = loadImportantDatesEvents();
      data.events = (data.events || []).filter((ev) => ev.id !== did);
      saveImportantDatesEvents(data);
      renderMkCategoryDetail('dates');
      showProtoToast('Date removed');
      return;
    }
    const addDoc = e.target.closest('[data-mk-doc-add]');
    if (addDoc) {
      const data = loadDocumentsRecords();
      data.records.push({
        id: mkNewDocumentRecordId(),
        title: '',
        kind: 'other',
        storageLocation: '',
        issueDate: '',
        expiryOrReviewDate: '',
        relatedCategory: '',
        sensitivity: 'standard',
        notes: '',
      });
      saveDocumentsRecords(data);
      renderMkCategoryDetail('documents');
      showProtoToast('Document added — fill in and save');
      return;
    }
    const rmDoc = e.target.closest('[data-mk-doc-remove]');
    if (rmDoc) {
      const rid = rmDoc.getAttribute('data-mk-doc-remove');
      const data = loadDocumentsRecords();
      data.records = (data.records || []).filter((r) => r.id !== rid);
      saveDocumentsRecords(data);
      renderMkCategoryDetail('documents');
      showProtoToast('Document removed');
      return;
    }
    const addProperty = e.target.closest('[data-mk-property-add]');
    if (addProperty) {
      const data = loadPropertyAssets();
      data.items.push({
        id: mkNewPropertyAssetId(),
        label: '',
        kind: 'other',
        description: '',
        location: '',
        status: 'owned',
        renewalsServices: '',
        documentsNote: '',
        notes: '',
      });
      savePropertyAssets(data);
      renderMkCategoryDetail('property');
      showProtoToast('Asset added — fill in and save');
      return;
    }
    const rmProperty = e.target.closest('[data-mk-property-remove]');
    if (rmProperty) {
      const pid = rmProperty.getAttribute('data-mk-property-remove');
      const data = loadPropertyAssets();
      data.items = (data.items || []).filter((x) => x.id !== pid);
      savePropertyAssets(data);
      renderMkCategoryDetail('property');
      showProtoToast('Asset removed');
      return;
    }
    const addTravel = e.target.closest('[data-mk-travel-add]');
    if (addTravel) {
      const data = loadTravelPlaces();
      data.trips.push({
        id: mkNewTravelTripId(),
        title: '',
        kind: 'other',
        destination: '',
        startDate: '',
        endDate: '',
        status: 'planned',
        companions: '',
        passportVisaNote: '',
        notes: '',
      });
      saveTravelPlaces(data);
      renderMkCategoryDetail('travel');
      showProtoToast('Trip added — fill in and save');
      return;
    }
    const rmTravel = e.target.closest('[data-mk-travel-remove]');
    if (rmTravel) {
      const tid = rmTravel.getAttribute('data-mk-travel-remove');
      const data = loadTravelPlaces();
      data.trips = (data.trips || []).filter((t) => t.id !== tid);
      saveTravelPlaces(data);
      renderMkCategoryDetail('travel');
      showProtoToast('Trip removed');
      return;
    }
    if (e.target.closest('[data-mk-placeholder="notify"]')) {
      showProtoToast('We will use this for product updates in a later build');
    }
  });

  root.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    e.preventDefault();
    if (form.id === 'mkIdentityForm') {
      const fd = new FormData(form);
      const partial = {};
      fd.forEach((val, key) => {
        partial[key] = typeof val === 'string' ? val : String(val || '');
      });
      savePersonalIdentity(partial);
      showProtoToast('Personal identity saved (this device)');
      return;
    }
    if (form.id === 'mkFamilyForm') {
      const people = collectFamilyPeopleFromDom();
      saveFamilyRelationships({ people });
      showProtoToast('Family & relationships saved (this device)');
      return;
    }
    if (form.id === 'mkGoalsForm') {
      const goals = collectGoalsFromDom();
      saveGoalsAmbitions({ goals });
      showProtoToast('Goals saved (this device)');
      return;
    }
    if (form.id === 'mkWorkForm') {
      const roles = collectWorkRolesFromDom();
      saveWorkProfessional({ roles });
      showProtoToast('Work profile saved (this device)');
      return;
    }
    if (form.id === 'mkBusinessForm') {
      const ventures = collectBusinessVenturesFromDom();
      saveBusinessEntrepreneurship({ ventures });
      showProtoToast('Business profiles saved (this device)');
      return;
    }
    if (form.id === 'mkEducationForm') {
      const snapshot = collectEducationLearningFromForm(form);
      saveEducationLearning(snapshot);
      showProtoToast('Education saved (this device)');
      return;
    }
    if (form.id === 'mkHealthForm') {
      saveHealthWellbeing(collectHealthWellbeingFromForm(form));
      showProtoToast('Health notes saved (this device)');
      return;
    }
    if (form.id === 'mkFinancialForm') {
      saveFinancialLife(collectFinancialLifeFromForm(form));
      showProtoToast('Financial notes saved (this device)');
      return;
    }
    if (form.id === 'mkLifestyleForm') {
      saveLifestylePreferences(collectLifestylePreferencesFromForm(form));
      showProtoToast('Lifestyle preferences saved (this device)');
      return;
    }
    if (form.id === 'mkDatesForm') {
      saveImportantDatesEvents(collectImportantDatesFromDom(form));
      showProtoToast('Dates & events saved (this device)');
      return;
    }
    if (form.id === 'mkDocumentsForm') {
      saveDocumentsRecords(collectDocumentsRecordsFromDom(form));
      showProtoToast('Documents & records saved (this device)');
      return;
    }
    if (form.id === 'mkRoutinesForm') {
      saveRoutinesDailyLife(collectRoutinesDailyLifeFromForm(form));
      showProtoToast('Routines saved (this device)');
      return;
    }
    if (form.id === 'mkPropertyForm') {
      savePropertyAssets(collectPropertyAssetsFromDom(form));
      showProtoToast('Property & assets saved (this device)');
      return;
    }
    if (form.id === 'mkTravelForm') {
      saveTravelPlaces(collectTravelPlacesFromDom(form));
      showProtoToast('Travel saved (this device)');
      return;
    }
    if (form.id === 'mkValuesForm') {
      saveValuesPrinciples(collectValuesPrinciplesFromForm(form));
      showProtoToast('Values & principles saved (this device)');
    }
  });
}

function mkFilterCategories(categories, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return categories;
  return categories.filter((cat) => {
    const hay = [cat.label, cat.subtitle, cat.blurb, cat.key, cat.area].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderMkKnowledgeAreas(areas) {
  const nav = document.getElementById('mkAreasNav');
  if (!nav) return;
  nav.innerHTML = (areas || [])
    .map(
      (a) => `
    <button type="button" class="ms-knowledge-area-pill" data-mk-area-jump="${escapeHtml(a.key)}" title="${escapeHtml(a.description)}">
      <span class="ms-knowledge-area-label">${escapeHtml(a.label)}</span>
      <span class="ms-knowledge-area-desc">${escapeHtml(a.description)}</span>
    </button>`
    )
    .join('');
}

function loadMkSarahUnderstandingState() {
  try {
    const raw = localStorage.getItem(MK_SARAH_UNDERSTANDING_STORAGE_KEY);
    if (!raw) return { memories: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { memories: {} };
    const memories = parsed.memories && typeof parsed.memories === 'object' && !Array.isArray(parsed.memories) ? parsed.memories : {};
    return { memories };
  } catch {
    /* ignore */
  }
  return { memories: {} };
}

function saveMkSarahUnderstandingState(state) {
  try {
    const next = state && typeof state === 'object' ? { memories: state.memories && typeof state.memories === 'object' ? state.memories : {} } : { memories: {} };
    localStorage.setItem(MK_SARAH_UNDERSTANDING_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function getBaselineMkSarahUnderstanding() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const base = mk?.sarahUnderstanding;
  if (!base || typeof base !== 'object') return { summary: '', memories: [] };
  return {
    summary: typeof base.summary === 'string' ? base.summary : '',
    memories: Array.isArray(base.memories) ? base.memories.map((m) => ({ ...m })) : [],
  };
}

function mergeMkUnderstandingWithState(baseline, state) {
  const memoryMap = new Map();
  (baseline.memories || []).forEach((m) => {
    if (m && typeof m.id === 'string') memoryMap.set(m.id, { ...m });
  });
  const patches = (state && state.memories) || {};
  Object.keys(patches).forEach((id) => {
    const p = patches[id];
    if (!p || typeof p !== 'object') return;
    if (p.removed) {
      memoryMap.delete(id);
      return;
    }
    const prev = memoryMap.get(id) || { id };
    memoryMap.set(id, {
      ...prev,
      type: typeof p.type === 'string' ? p.type : prev.type,
      title: typeof p.title === 'string' ? p.title : prev.title,
      snippet: typeof p.snippet === 'string' ? p.snippet : prev.snippet,
      source: typeof p.source === 'string' ? p.source : prev.source,
      confidence: typeof p.confidence === 'string' ? p.confidence : prev.confidence,
    });
  });
  const order = (baseline.memories || []).map((m) => m.id);
  const extra = [...memoryMap.keys()].filter((id) => !order.includes(id));
  const memories = [...order, ...extra]
    .map((id) => memoryMap.get(id))
    .filter(Boolean);
  return {
    summary: typeof baseline.summary === 'string' ? baseline.summary : '',
    memories,
  };
}

function mkCountMemoriesByConfidence(memories) {
  const list = Array.isArray(memories) ? memories : [];
  let confirmed = 0;
  let needs = 0;
  let outdated = 0;
  list.forEach((m) => {
    const c = m && typeof m.confidence === 'string' ? m.confidence : 'needs_confirmation';
    if (c === 'confirmed') confirmed += 1;
    else if (c === 'possibly_outdated') outdated += 1;
    else needs += 1;
  });
  return { confirmed, needs, outdated, total: list.length };
}

function mkBuildUnderstandingSummaryLine(memories) {
  const { confirmed, needs, total } = mkCountMemoriesByConfidence(memories);
  const parts = [`${total} memor${total === 1 ? 'y' : 'ies'} in view`];
  if (confirmed) parts.push(`${confirmed} confirmed`);
  if (needs) parts.push(`${needs} need${needs === 1 ? 's' : ''} confirmation`);
  return parts.join(' · ');
}

function getMergedMkSarahUnderstanding() {
  const baseline = getBaselineMkSarahUnderstanding();
  const state = loadMkSarahUnderstandingState();
  const merged = mergeMkUnderstandingWithState(baseline, state);
  merged.summary = mkBuildUnderstandingSummaryLine(merged.memories);
  return merged;
}

function mkPickPendingMemory(memories) {
  const list = Array.isArray(memories) ? memories : [];
  return list.find((m) => m && m.confidence === 'needs_confirmation') || null;
}

function getEffectiveMkActivity() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const baseAct = mk?.activity;
  const merged = getMergedMkSarahUnderstanding();
  const memories = merged.memories || [];
  const pending = mkPickPendingMemory(memories);

  const recentFrom = memories.filter((m) => m && m.confidence === 'confirmed').slice(-1)[0] || memories[0];
  const a =
    recentFrom && typeof recentFrom === 'object'
      ? {
          label: 'Recently learned',
          title: recentFrom.title || '—',
          meta: [recentFrom.type, recentFrom.confidence === 'confirmed' ? 'Confirmed' : mkConfidenceLabel(recentFrom.confidence)]
            .filter(Boolean)
            .join(' · '),
        }
      : baseAct?.recentLearned || { label: 'Recently learned', title: '—', meta: '' };

  const b = pending
    ? {
        label: 'Needs your approval',
        title: pending.title || '—',
        meta: [pending.type, pending.source || 'Suggested by Sarah'].filter(Boolean).join(' · '),
        memoryId: pending.id,
      }
    : {
        label: 'Needs your approval',
        title: 'All caught up',
        meta: 'No suggestions awaiting review',
        memoryId: '',
      };

  return {
    recentLearned: a,
    pendingApproval: b,
  };
}

function refreshMkUnderstandingAndActivity() {
  const u = getMergedMkSarahUnderstanding();
  renderMkUnderstanding(u);
  renderMkActivity(getEffectiveMkActivity());
}

function renderMkUnderstanding(data) {
  const host = document.getElementById('mkUnderstanding');
  if (!host || !data) return;
  const memories = (data.memories || []).filter((m) => m && typeof m === 'object');
  if (!memories.length) {
    host.innerHTML =
      '<p class="ms-knowledge-upload-empty">No memories in view — approve suggestions from Activity or restore mock data by clearing site storage for this prototype.</p>';
    return;
  }
  host.innerHTML = `
    <div class="ms-knowledge-understanding-meta">${escapeHtml(data.summary || '')}</div>
    <ul class="ms-knowledge-memory-list">
      ${memories
        .map(
          (m) => `
        <li class="ms-knowledge-memory">
          <div class="ms-knowledge-memory-top">
            <span class="ms-knowledge-memory-type">${escapeHtml(m.type)}</span>
            <span class="ms-knowledge-memory-confidence mk-conf--${escapeHtml(m.confidence || 'needs_confirmation')}">${escapeHtml(
            mkConfidenceLabel(m.confidence)
          )}</span>
          </div>
          <strong class="ms-knowledge-memory-title">${escapeHtml(m.title)}</strong>
          <p class="ms-knowledge-memory-snippet">${escapeHtml(m.snippet)}</p>
          <p class="ms-knowledge-memory-source">${escapeHtml(m.source)}</p>
          <div class="ms-knowledge-memory-actions">
            <button type="button" class="ms-knowledge-chip-btn" data-mk-mock="memory-edit" data-id="${escapeHtml(m.id)}">Edit</button>
            <button type="button" class="ms-knowledge-chip-btn" data-mk-mock="memory-remove" data-id="${escapeHtml(m.id)}">Remove</button>
          </div>
        </li>`
        )
        .join('')}
    </ul>`;
}

function renderMkActivity(activity) {
  const host = document.getElementById('mkActivity');
  if (!host || !activity) return;
  const a = activity.recentLearned;
  const b = activity.pendingApproval;
  const pendingId = b && typeof b.memoryId === 'string' ? b.memoryId : '';
  const reviewBtn = pendingId
    ? `<button type="button" class="ms-knowledge-pill" data-mk-mock="approve-suggestion" data-id="${escapeHtml(pendingId)}">Review</button>`
    : '';
  host.innerHTML = `
    <div class="ms-knowledge-activity-grid">
      <article class="ms-knowledge-activity-card">
        <span class="ms-knowledge-activity-label">${escapeHtml(a.label)}</span>
        <strong class="ms-knowledge-activity-title">${escapeHtml(a.title)}</strong>
        <span class="ms-knowledge-activity-meta">${escapeHtml(a.meta)}</span>
      </article>
      <article class="ms-knowledge-activity-card ms-knowledge-activity-card--pending">
        <span class="ms-knowledge-activity-label">${escapeHtml(b.label)}</span>
        <strong class="ms-knowledge-activity-title">${escapeHtml(b.title)}</strong>
        <span class="ms-knowledge-activity-meta">${escapeHtml(b.meta)}</span>
        ${reviewBtn}
      </article>
    </div>`;
}

function getMkMemoryById(memoryId) {
  const id = String(memoryId || '').trim();
  if (!id) return null;
  const merged = getMergedMkSarahUnderstanding();
  return (merged.memories || []).find((m) => m && m.id === id) || null;
}

function openMkSuggestionModal(mode, memoryId) {
  bindMkSuggestionModalOnce();
  const modal = document.getElementById('mkSuggestionModal');
  if (!modal) return;
  const mem = getMkMemoryById(memoryId);
  if (!mem) {
    showProtoToast(mode === 'edit' ? 'Memory not found' : 'Nothing to review right now');
    return;
  }
  const idInput = document.getElementById('mkSuggestionMemoryId');
  const titleEl = document.getElementById('mkSuggestionModalTitle');
  const leadEl = document.getElementById('mkSuggestionModalLead');
  const typeInput = document.getElementById('mkSuggestionType');
  const titleInput = document.getElementById('mkSuggestionTitle');
  const snippetInput = document.getElementById('mkSuggestionSnippet');
  const sourceInput = document.getElementById('mkSuggestionSource');
  const approveBtn = document.getElementById('mkSuggestionApprove');
  const saveEditBtn = document.getElementById('mkSuggestionSaveEdit');
  const removeBtn = document.getElementById('mkSuggestionRemove');
  const notNowBtn = document.getElementById('mkSuggestionNotNow');
  if (idInput) idInput.value = mem.id;
  if (typeInput) typeInput.value = mem.type || '';
  if (titleInput) titleInput.value = mem.title || '';
  if (snippetInput) snippetInput.value = mem.snippet || '';
  if (sourceInput) sourceInput.value = mem.source || '';

  const isReview = mode === 'review' || mem.confidence === 'needs_confirmation';
  if (titleEl) titleEl.textContent = isReview ? 'Review suggestion' : 'Edit memory';
  if (leadEl) {
    leadEl.textContent = isReview
      ? 'Approve as-is, tweak the text, or remove it from Sarah\'s Understanding.'
      : 'Update what Sarah keeps — changes stay on this device until the API syncs.';
  }
  if (approveBtn) approveBtn.hidden = !isReview;
  if (notNowBtn) notNowBtn.hidden = !isReview;
  if (saveEditBtn) saveEditBtn.hidden = isReview;
  if (removeBtn) removeBtn.textContent = isReview ? 'Reject' : 'Remove';

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  (isReview ? approveBtn : titleInput)?.focus();
}

function closeMkSuggestionModal() {
  const modal = document.getElementById('mkSuggestionModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function collectMkSuggestionPatchFromForm() {
  const idInput = document.getElementById('mkSuggestionMemoryId');
  const id = idInput && 'value' in idInput ? String(idInput.value || '').trim() : '';
  const typeInput = document.getElementById('mkSuggestionType');
  const titleInput = document.getElementById('mkSuggestionTitle');
  const snippetInput = document.getElementById('mkSuggestionSnippet');
  const sourceInput = document.getElementById('mkSuggestionSource');
  return {
    id,
    type: typeInput && 'value' in typeInput ? String(typeInput.value || '').trim() : '',
    title: titleInput && 'value' in titleInput ? String(titleInput.value || '').trim() : '',
    snippet: snippetInput && 'value' in snippetInput ? String(snippetInput.value || '').trim() : '',
    source: sourceInput && 'value' in sourceInput ? String(sourceInput.value || '').trim() : '',
  };
}

function applyMkMemoryPatch(patch, opts) {
  const { confirmApproved } = opts || {};
  const id = patch && typeof patch.id === 'string' ? patch.id.trim() : '';
  if (!id) return;
  const baseline = getBaselineMkSarahUnderstanding();
  const baseMem = (baseline.memories || []).find((m) => m && m.id === id);
  if (!baseMem) return;
  const state = loadMkSarahUnderstandingState();
  const prev = (state.memories && state.memories[id]) || {};
  const nextPatch = {
    ...prev,
    type: patch.type !== undefined ? patch.type : prev.type !== undefined ? prev.type : baseMem.type,
    title: patch.title !== undefined ? patch.title : prev.title !== undefined ? prev.title : baseMem.title,
    snippet: patch.snippet !== undefined ? patch.snippet : prev.snippet !== undefined ? prev.snippet : baseMem.snippet,
    source: patch.source !== undefined ? patch.source : prev.source !== undefined ? prev.source : baseMem.source,
    confidence:
      patch.confidence !== undefined
        ? patch.confidence
        : prev.confidence !== undefined
          ? prev.confidence
          : baseMem.confidence,
  };
  if (confirmApproved) {
    nextPatch.confidence = 'confirmed';
    const src = String(nextPatch.source || baseMem.source || '');
    nextPatch.source = src.includes('approved') ? src : `${src}${src ? ' · ' : ''}You approved · ${new Date().toLocaleDateString()}`;
  }
  delete nextPatch.removed;
  state.memories[id] = nextPatch;
  saveMkSarahUnderstandingState(state);
}

function removeMkMemory(id) {
  const sid = String(id || '').trim();
  if (!sid) return;
  const state = loadMkSarahUnderstandingState();
  state.memories[sid] = { removed: true };
  saveMkSarahUnderstandingState(state);
}

function bindMkSuggestionModalOnce() {
  if (window.__mkSuggestionModalBound) return;
  window.__mkSuggestionModalBound = true;

  document.getElementById('mkSuggestionModal')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-mk-suggestion-close]')) {
      e.preventDefault();
      closeMkSuggestionModal();
    }
  });

  document.getElementById('mkSuggestionApprove')?.addEventListener('click', () => {
    const p = collectMkSuggestionPatchFromForm();
    if (!p.id) return;
    applyMkMemoryPatch(
      {
        id: p.id,
        type: p.type,
        title: p.title,
        snippet: p.snippet,
        source: p.source,
      },
      { confirmApproved: true }
    );
    closeMkSuggestionModal();
    refreshMkUnderstandingAndActivity();
    showProtoToast('Suggestion approved (this device)');
  });

  document.getElementById('mkSuggestionSaveEdit')?.addEventListener('click', () => {
    const p = collectMkSuggestionPatchFromForm();
    if (!p.id) return;
    applyMkMemoryPatch({
      id: p.id,
      type: p.type,
      title: p.title,
      snippet: p.snippet,
      source: p.source,
    });
    closeMkSuggestionModal();
    refreshMkUnderstandingAndActivity();
    showProtoToast('Memory updated (this device)');
  });

  document.getElementById('mkSuggestionRemove')?.addEventListener('click', () => {
    const p = collectMkSuggestionPatchFromForm();
    if (!p.id) return;
    const approveEl = document.getElementById('mkSuggestionApprove');
    const isReviewFlow = approveEl && !approveEl.hidden;
    removeMkMemory(p.id);
    closeMkSuggestionModal();
    refreshMkUnderstandingAndActivity();
    showProtoToast(isReviewFlow ? 'Rejected (this device)' : 'Removed from list (this device)');
  });

  document.getElementById('mkSuggestionNotNow')?.addEventListener('click', () => {
    closeMkSuggestionModal();
  });
}

function mkNewUploadId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `upl-${crypto.randomUUID()}`;
  return `upl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatMkFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function loadMkUploadedFiles() {
  try {
    const raw = localStorage.getItem(MK_UPLOAD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string')
        .map((x) => ({ ...x }));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveMkUploadedFiles(list) {
  try {
    localStorage.setItem(MK_UPLOAD_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

function renderMkUploadedFilesList() {
  const host = document.getElementById('mkUploadList');
  if (!host) return;
  const items = loadMkUploadedFiles();
  if (!items.length) {
    host.innerHTML =
      '<p class="ms-knowledge-upload-empty">No files yet — use <strong>Upload</strong> to add reference documents (metadata only in this prototype).</p>';
    return;
  }
  host.innerHTML = `
    <ul class="ms-knowledge-upload-list-inner" role="list">
      ${items
        .map((f) => {
          const id = escapeHtml(f.id);
          const catKey = f.linkedCategoryKey ? escapeHtml(f.linkedCategoryKey) : '';
          const catLabel = f.linkedCategoryLabel ? escapeHtml(f.linkedCategoryLabel) : '';
          const cat =
            catKey && catLabel
              ? `<span class="ms-knowledge-upload-meta">${catLabel} <span class="ms-knowledge-upload-key">(${catKey})</span></span>`
              : '';
          return `
        <li class="ms-knowledge-upload-item" data-mk-upload-id="${id}">
          <div class="ms-knowledge-upload-item-main">
            <strong class="ms-knowledge-upload-name">${escapeHtml(f.name || 'Untitled')}</strong>
            <span class="ms-knowledge-upload-meta">${escapeHtml(formatMkFileSize(f.size))} · ${escapeHtml(f.type || 'unknown type')}</span>
            ${cat}
          </div>
          <button type="button" class="ms-knowledge-chip-btn ms-knowledge-chip-btn--danger" data-mk-upload-remove="${id}">Remove</button>
        </li>`;
        })
        .join('')}
    </ul>`;
}

function mkUploadCategoryOptionsHtml(selectedKey) {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const cats = mk?.categories || [];
  const sel = String(selectedKey || '');
  const opts = cats.map((c) => {
    const key = escapeHtml(c.key);
    const isSel = c.key === sel ? ' selected' : '';
    return `<option value="${key}"${isSel}>${escapeHtml(c.label)} (${key})</option>`;
  });
  return `<option value="">No category link</option>${opts.join('')}`;
}

function openMkUploadModal() {
  const modal = document.getElementById('mkUploadModal');
  if (!modal) return;
  const select = document.getElementById('mkUploadCategory');
  if (select) select.innerHTML = mkUploadCategoryOptionsHtml('');
  const note = document.getElementById('mkUploadNote');
  if (note) note.value = '';
  const input = document.getElementById('mkUploadInput');
  if (input) input.value = '';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('mkUploadCategory')?.focus();
}

function closeMkUploadModal() {
  const modal = document.getElementById('mkUploadModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function bindMkUploadUiOnce() {
  if (window.__mkUploadBound) return;
  window.__mkUploadBound = true;

  document.getElementById('mkUploadModal')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-mk-upload-close]')) {
      e.preventDefault();
      closeMkUploadModal();
    }
  });

  document.getElementById('mkUploadPick')?.addEventListener('click', () => {
    document.getElementById('mkUploadInput')?.click();
  });

  document.getElementById('mkUploadInput')?.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    const select = document.getElementById('mkUploadCategory');
    const noteEl = document.getElementById('mkUploadNote');
    const rawKey = select && 'value' in select ? String(select.value || '').trim() : '';
    const note = noteEl && 'value' in noteEl ? String(noteEl.value || '').trim() : '';
    const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
    const cat = rawKey ? (mk?.categories || []).find((c) => c.key === rawKey) : null;
    const list = loadMkUploadedFiles();
    const added = [];
    Array.from(input.files).forEach((file) => {
      list.push({
        id: mkNewUploadId(),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        lastModified: file.lastModified || Date.now(),
        addedAt: new Date().toISOString(),
        linkedCategoryKey: rawKey || '',
        linkedCategoryLabel: cat ? cat.label : '',
        note,
      });
      added.push(file.name);
    });
    saveMkUploadedFiles(list);
    renderMkUploadedFilesList();
    closeMkUploadModal();
    showProtoToast(added.length === 1 ? `Saved “${added[0]}” (metadata only)` : `Saved ${added.length} files (metadata only)`);
  });
}

function renderMkCategoryGrid(categories, query) {
  const grid = document.getElementById('mkCategoryGrid');
  const empty = document.getElementById('mkSearchEmpty');
  if (!grid) return;
  const filtered = mkFilterCategories(categories, query);
  if (empty) empty.hidden = filtered.length > 0;
  if (!filtered.length) {
    grid.innerHTML = '';
    return;
  }
  grid.innerHTML = filtered
    .map(
      (cat) => `
    <article class="ms-knowledge-cat ${cat.sarahMayUse ? '' : 'ms-knowledge-cat--locked'}" data-mk-cat-key="${escapeHtml(cat.key)}" data-mk-area="${escapeHtml(cat.area)}">
      <div class="ms-knowledge-cat-head">
        <h4 class="ms-knowledge-cat-title">${escapeHtml(cat.label)}</h4>
        <span class="ms-knowledge-badge ms-knowledge-badge--${mkClassificationShort(cat.classification) === 'Sensitive' ? 'sensitive' : 'personal'}">${escapeHtml(
        mkClassificationShort(cat.classification)
      )}</span>
      </div>
      ${cat.subtitle ? `<p class="ms-knowledge-cat-sub">${escapeHtml(cat.subtitle)}</p>` : ''}
      <p class="ms-knowledge-cat-blurb">${escapeHtml(cat.blurb)}</p>
      <dl class="ms-knowledge-cat-perms">
        <div><dt>Sarah may use</dt><dd>${cat.sarahMayUse ? 'On' : 'Off'}</dd></div>
        <div><dt>Learn from chat</dt><dd>${cat.learnFromConversations ? 'On' : 'Off'}</dd></div>
      </dl>
      <div class="ms-knowledge-cat-actions">
        <button type="button" class="ms-knowledge-chip-btn" data-mk-mock="cat-open" data-key="${escapeHtml(cat.key)}">Open</button>
        <button type="button" class="ms-knowledge-chip-btn" data-mk-mock="cat-perms" data-key="${escapeHtml(cat.key)}">Permissions</button>
      </div>
    </article>`
    )
    .join('');
}

let __mkKnowledgeUiBound = false;

function bindMyKnowledgePanelOnce() {
  if (__mkKnowledgeUiBound) return;
  __mkKnowledgeUiBound = true;

  const onFilter = () => {
    const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
    if (!mk?.categories) return;
    const input = document.getElementById('mkSearchInput');
    renderMkCategoryGrid(mk.categories, input?.value || '');
  };

  document.getElementById('mkSearchInput')?.addEventListener('input', onFilter);

  document.getElementById('mkAreasNav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mk-area-jump]');
    if (!btn) return;
    const area = btn.getAttribute('data-mk-area-jump');
    if (area === 'understanding') {
      document.getElementById('mkUnderstandingHeading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
    const first = (mk?.categories || []).find((c) => c.area === area);
    if (!first) return;
    const raw = String(first.key);
    const forSelector = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    document.querySelector(`[data-mk-cat-key="${forSelector}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.getElementById('mkHomeRoot')?.addEventListener('click', (e) => {
    const rmUpload = e.target.closest('[data-mk-upload-remove]');
    if (rmUpload) {
      const id = rmUpload.getAttribute('data-mk-upload-remove');
      if (!id) return;
      const list = loadMkUploadedFiles().filter((x) => x.id !== id);
      saveMkUploadedFiles(list);
      renderMkUploadedFilesList();
      showProtoToast('Upload removed from list');
      return;
    }
    const t = e.target.closest('[data-mk-mock],[data-mk-action]');
    if (!t) return;
    if (t.dataset.mkAction === 'add') {
      openMyKnowledgeCategory('identity');
      return;
    }
    if (t.dataset.mkAction === 'upload') {
      bindMkUploadUiOnce();
      openMkUploadModal();
      return;
    }
    if (t.dataset.mkAction === 'review') {
      const act = getEffectiveMkActivity();
      const pendingId = act.pendingApproval && typeof act.pendingApproval.memoryId === 'string' ? act.pendingApproval.memoryId : '';
      if (pendingId) {
        bindMkSuggestionModalOnce();
        openMkSuggestionModal('review', pendingId);
      } else {
        document.getElementById('mkUnderstandingHeading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showProtoToast('No suggestions need approval');
      }
      return;
    }
    if (t.dataset.mkMock === 'approve-suggestion') {
      const id = t.getAttribute('data-id');
      bindMkSuggestionModalOnce();
      openMkSuggestionModal('review', id || '');
      return;
    }
    if (t.dataset.mkMock === 'cat-open') {
      const key = t.getAttribute('data-key');
      if (key) openMyKnowledgeCategory(key);
      return;
    }
    if (t.dataset.mkMock === 'cat-perms') {
      showProtoToast('MK-06: category permissions');
      return;
    }
    if (t.dataset.mkMock === 'memory-edit') {
      bindMkSuggestionModalOnce();
      openMkSuggestionModal('edit', t.getAttribute('data-id') || '');
      return;
    }
    if (t.dataset.mkMock === 'memory-remove') {
      const id = t.getAttribute('data-id');
      if (!id) return;
      removeMkMemory(id);
      refreshMkUnderstandingAndActivity();
      showProtoToast('Removed from list (this device)');
    }
  });
}

function renderKnowledge(knowledgeCategory) {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  if (!mk) return;

  bindMkCategoryDetailOnce();
  const catKey = String(knowledgeCategory || '').trim() || null;
  if (catKey) {
    bindMyKnowledgePanelOnce();
    renderMkCategoryDetail(catKey);
    return;
  }

  setMkKnowledgeViewMode('home');
  const detailHost = document.getElementById('mkCategoryRoot');
  if (detailHost) detailHost.innerHTML = '';

  bindMyKnowledgePanelOnce();
  bindMkUploadUiOnce();
  bindMkSuggestionModalOnce();
  renderMkKnowledgeAreas(mk.areas);
  renderMkUploadedFilesList();
  refreshMkUnderstandingAndActivity();
  const input = document.getElementById('mkSearchInput');
  if (input) input.value = '';
  renderMkCategoryGrid(mk.categories, '');
}

const MS_QUICK_ICONS = {
  insight:
    '<svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>',
  ideas:
    '<svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 19l2-2M19 19l-2-2"/></svg>',
  tasks:
    '<svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><path d="M9 5a2 2 0 014 0"/><path d="M9 12l2 2 4-4"/></svg>',
  sparkle:
    '<svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.4 4.3L18 8l-4.6 1.5L12 14l-1.4-4.5L6 8l4.6-1.7L12 2z"/><path d="M5 18l.9 2.7L8 22l-2.1.6L5 25l-.9-2.4L2 22l2.1-.7L5 18z"/></svg>',
  knowledge:
    '<svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M4 4.5A2.5 2.5 0 016.5 2H14l6 6v9.5A2.5 2.5 0 0117.5 20H6.5A2.5 2.5 0 014 17.5v-13z"/></svg>',
  calendar:
    '<svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  wallet:
    '<svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 12h2"/><path d="M2 10h20"/><path d="M6 6V4a2 2 0 012-2h8a2 2 0 012 2v2"/></svg>',
  pay:
    '<svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11V5a2 2 0 012-2h6l9 8-5 5-4-3-5 5-3-8z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M14 7h7M14 7v7" stroke="currentColor" stroke-width="1.5"/></svg>',
};

function bindMySarahInteractions() {
  if (window.__msBound) return;
  window.__msBound = true;

  document.getElementById('msStartWorkTask')?.addEventListener('click', () => startNewWorkThread());

  document.getElementById('msDrawerOpen')?.addEventListener('click', () => openMsDrawer());
  document.getElementById('msSubmoduleBack')?.addEventListener('click', () => goToMySarahHome());
  document.getElementById('msDrawerClose')?.addEventListener('click', () => closeMsDrawer());
  document.getElementById('msDrawerBackdrop')?.addEventListener('click', () => closeMsDrawer());
  document.getElementById('msDrawerNewChat')?.addEventListener('click', async () => {
    closeMsDrawer();
    await startNewPersonalChat();
  });
  document.getElementById('msDrawerNewChatSmall')?.addEventListener('click', async () => {
    closeMsDrawer();
    await startNewPersonalChat();
  });
  document.getElementById('msDrawerCompanyChats')?.addEventListener('click', () => {
    closeMsDrawer();
    setRoute('chats');
  });

  document.querySelectorAll('[data-ms-drawer-panel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.getAttribute('data-ms-drawer-panel') || 'home';
      if (panel === 'knowledge' && /^home\/knowledge\/.+/.test(location.hash.replace(/^#/, ''))) {
        location.hash = 'home/knowledge';
        return;
      }
      setMySarahPanel(panel);
    });
  });

  document.querySelectorAll('.ms-segment-btn[data-ms-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.msMode || 'chat';
      setMySarahPanel(mode === 'work' ? 'tasks' : 'home');
    });
  });

  document.querySelector('.my-sarah-view')?.addEventListener('click', (e) => {
    const goHome = e.target.closest('[data-ms-go-home]');
    if (goHome) {
      goToMySarahHome(goHome.getAttribute('data-ms-prompt') || '');
    }
    const goChat = e.target.closest('[data-ms-mode="chat"]');
    if (goChat && goChat.classList.contains('ms-link-btn')) {
      setMySarahPanel('home');
    }
    const workPrompt = e.target.closest('[data-ms-work-prompt]');
    if (workPrompt) {
      goToMySarahWork(workPrompt.getAttribute('data-ms-work-prompt') || '');
    }
  });
}

function renderMySarahHistoryFromThreads() {
  const historyHost = document.getElementById('msHistoryList');
  if (!historyHost || personalSarahUsesMockThreads()) return;
  const threads = listPersonalThreads().slice(0, 8);
  if (!threads.length) {
    historyHost.innerHTML = '<p class="ms-thread-empty" style="padding:8px 12px">No chats yet — start a conversation below.</p>';
    return;
  }
  historyHost.innerHTML = threads
    .map(
      (t) => `
      <button type="button" class="ms-history-item" data-personal-thread="${escapeHtml(t.id)}" data-history-prompt="${escapeHtml(t.title)}">
        <span class="ms-history-icon" aria-hidden="true">
          <svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z"/></svg>
        </span>
        <span class="ms-history-body">
          <span class="ms-history-title">${escapeHtml(t.title)}</span>
          <span class="ms-history-time">${escapeHtml(t.time)}</span>
        </span>
        <span class="ms-history-chevron" aria-hidden="true">
          <svg class="icon-svg icon-svg--xs" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </button>`
    )
    .join('');
  historyHost.querySelectorAll('[data-personal-thread]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openPersonalSarahThread(btn.getAttribute('data-personal-thread') || '');
    });
  });
}

function renderMsDrawerRecents() {
  const host = document.getElementById('msDrawerRecents');
  if (!host) return;
  if (personalSarahSessionsLoading) {
    host.innerHTML = '<p class="ms-thread-empty" style="padding:8px 12px">Loading conversations…</p>';
    return;
  }
  const threads = listPersonalThreads();
  const rt = getSarahRuntime();
  const activeId = rt.activeThreadId || '';
  if (!threads.length) {
    host.innerHTML =
      '<p class="ms-thread-empty" style="padding:8px 12px">No chats yet — tap <strong>New chat</strong> or send a message from Home.</p>';
    return;
  }
  host.innerHTML = threads
    .map((t) => {
      const isActive = t.id === activeId;
      const prev = t.preview && t.preview !== t.title ? truncatePersonalTitle(t.preview) : '';
      return `<button type="button" class="ms-drawer-chat-row${isActive ? ' is-active' : ''}" data-open-personal-thread="${escapeHtml(
        t.id
      )}">
        <span class="ms-drawer-chat-icon" aria-hidden="true">
          <svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z"/></svg>
        </span>
        <span class="ms-drawer-chat-body">
          <span class="ms-drawer-chat-title">${escapeHtml(t.title)}</span>
          ${prev ? `<span class="ms-drawer-chat-preview">${escapeHtml(prev)}</span>` : ''}
        </span>
        <span class="ms-drawer-chat-meta">${escapeHtml(t.time || '')}</span>
      </button>`;
    })
    .join('');
  host.querySelectorAll('[data-open-personal-thread]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeMsDrawer();
      openPersonalSarahThread(btn.getAttribute('data-open-personal-thread') || '');
    });
  });
}

function renderMyOrganisationsPanel() {
  bindSub01RegisterModalOnce();
  const root = document.getElementById('msOrganisationsRoot');
  if (!root) return;

  const subscribedIds = loadSub01SubscribedIds();
  const all = MOCK_DISCOVER_COMPANIES || [];
  const byId = (id) => all.find((c) => c.id === id);
  const subscribed = subscribedIds.map((id) => byId(id)).filter(Boolean);
  const suggestedIds = (MOCK_MY_ORGANISATIONS_SUGGESTED_IDS || []).filter((id) => !subscribedIds.includes(id));
  const suggested = suggestedIds.map((id) => byId(id)).filter(Boolean);

  const orgStatusLine = (companyId) => {
    const rec = getSub01Record(companyId);
    if (!rec) return '';
    const v =
      rec.verificationStatus === 'pending'
        ? 'Verification pending (prototype)'
        : 'Verified (simulated — SUB-01B)';
    const ch = [];
    if (rec.prefs?.notifications) ch.push('Notifications');
    if (rec.prefs?.announcements) ch.push('Announcements');
    if (rec.prefs?.reminders) ch.push('Reminders');
    const chStr = ch.length ? ch.join(' · ') : 'No channels selected';
    return `${v} · ${chStr}`;
  };

  const orgRow = (c, listKind) => {
    const img = prototypeAsset(c.image || '');
    const fallback = prototypeAsset(c.imageFallback || MOCK_PROFILE.avatarFallback || 'assets/discover/green-haven-fallback.svg');
    const sub = isOrgSubscribedSub01(c.id);
    const status = sub ? orgStatusLine(c.id) : '';
    const actions =
      listKind === 'subscribed'
        ? `
        <button type="button" class="ms-org-btn ms-org-btn--ghost" data-sub01-open-profile="${escapeHtml(c.id)}">View</button>
        <button type="button" class="ms-org-btn ms-org-btn--ghost" data-sub01-manage="${escapeHtml(c.id)}">Manage</button>
        <button type="button" class="ms-org-btn ms-org-btn--danger" data-sub01-unsub="${escapeHtml(c.id)}">Unsubscribe</button>`
        : `
        <button type="button" class="ms-org-btn ms-org-btn--ghost" data-sub01-open-profile="${escapeHtml(c.id)}">View</button>
        <button type="button" class="ms-org-btn" data-sub01-subscribe="${escapeHtml(c.id)}">Subscribe</button>`;
    return `
    <li class="ms-org-row" data-org-id="${escapeHtml(c.id)}">
      <img class="ms-org-row-img" src="${escapeHtml(img)}" alt="" loading="lazy" data-img-fallback="${escapeHtml(fallback)}" onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src=this.dataset.imgFallback||'';}" />
      <div class="ms-org-row-body">
        <strong class="ms-org-row-name">${escapeHtml(c.name)}</strong>
        <span class="ms-org-row-meta">${escapeHtml(c.categoryLabel || '')}${status ? ` · ${escapeHtml(status)}` : ''}</span>
      </div>
      <div class="ms-org-row-actions">
        ${actions}
      </div>
    </li>`;
  };

  root.innerHTML = `
    <header class="ms-organisations-hero">
      <h5 class="ms-headline">My Organisations</h5>
      <p class="ms-organisations-lead">Discover organisations, <strong>subscribe</strong> for verified updates, and let Personal Sarah turn notifications, announcements, and reminders into help — <span class="ms-organisations-spec">SUB-01</span>.</p>
      <div class="search-bar search-bar--icon ms-organisations-search">
        <span class="search-bar-icon" aria-hidden="true"><svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg></span>
        <input type="search" id="msOrgSearchInput" placeholder="Search organisations (opens Discover)" autocomplete="off" aria-label="Search organisations" />
      </div>
    </header>
    <section class="ms-org-section" aria-labelledby="msOrgSubscribedHeading">
      <h3 class="ms-org-section-title" id="msOrgSubscribedHeading">My subscriptions</h3>
      ${
        subscribed.length
          ? `<ul class="ms-org-list" role="list">${subscribed.map((c) => orgRow(c, 'subscribed')).join('')}</ul>`
          : '<p class="ms-org-empty">No subscriptions yet — use <strong>Subscribe</strong> on Discover or below.</p>'
      }
    </section>
    <section class="ms-org-section" aria-labelledby="msOrgSuggestedHeading">
      <h3 class="ms-org-section-title" id="msOrgSuggestedHeading">Suggested</h3>
      ${
        suggested.length
          ? `<ul class="ms-org-list" role="list">${suggested.map((c) => orgRow(c, 'suggested')).join('')}</ul>`
          : '<p class="ms-org-empty">Nothing to suggest right now.</p>'
      }
    </section>
    <footer class="ms-organisations-foot">
      <button type="button" class="btn btn-secondary" id="msOrgOpenDiscover">Open Discover</button>
      <p class="ms-organisations-note">SUB-01B: subscriptions and preferences in <code>${escapeHtml(SUB01_SUBSCRIBERS_V1_KEY)}</code> (legacy IDs migrate from <code>${escapeHtml(SUB01_SUBSCRIBED_ORGS_STORAGE_KEY)}</code>). Sarah Network delivery ships in SUB-01E+.</p>
    </footer>`;

  root.querySelectorAll('[data-sub01-subscribe]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      sub01OpenSubscribeFlow(btn.getAttribute('data-sub01-subscribe') || '');
    });
  });
  root.querySelectorAll('[data-sub01-manage]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openSub01RegisterModal(btn.getAttribute('data-sub01-manage') || '', { edit: true });
    });
  });
  root.querySelectorAll('[data-sub01-unsub]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-sub01-unsub');
      if (!id) return;
      removeSub01Record(id);
      showProtoToast('Unsubscribed');
      renderMyOrganisationsPanel();
      sub01RefreshSurfaces();
    });
  });
  root.querySelectorAll('[data-sub01-open-profile]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-sub01-open-profile');
      if (id) openDiscoverCompany(id);
    });
  });
  if (!window.__msOrgPanelFootBound) {
    window.__msOrgPanelFootBound = true;
    document.getElementById('msOrganisationsRoot')?.addEventListener('click', (e) => {
      if (e.target.closest('#msOrgOpenDiscover')) setRoute('discover');
    });
    document.getElementById('msOrganisationsRoot')?.addEventListener('keydown', (e) => {
      if (e.target.id === 'msOrgSearchInput' && e.key === 'Enter') {
        e.preventDefault();
        setRoute('discover');
      }
    });
  }
}

function formatMw01Money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(x);
  } catch {
    return `R ${x.toFixed(2)}`;
  }
}

function renderMyWalletPanel() {
  const root = document.getElementById('msWalletRoot');
  if (!root || !MOCK_MY_WALLET) return;
  const { currency, balances, allocation, upcoming, pendingApproval, mandatesPaused: demoPausedDefault } = MOCK_MY_WALLET;
  const demo = loadMw01DemoState();
  const mandatesPaused =
    typeof demo.mandatesPaused === 'boolean' ? demo.mandatesPaused : Boolean(demoPausedDefault);

  const allocRows = (allocation || [])
    .map(
      (row) => `
    <li class="mw-alloc-row">
      <span class="mw-alloc-label">${escapeHtml(row.label)}</span>
      <span class="mw-alloc-amt">${escapeHtml(formatMw01Money(row.amount))}</span>
    </li>`
    )
    .join('');

  const upcomingRows = (upcoming || [])
    .map(
      (row) => `
    <li class="mw-upcoming-row">
      <div>
        <span class="mw-upcoming-what">${escapeHtml(row.label)}</span>
        <span class="mw-upcoming-when">${escapeHtml(row.due)}</span>
      </div>
      <span class="mw-upcoming-amt">${escapeHtml(formatMw01Money(row.amount))}</span>
    </li>`
    )
    .join('');

  const pendingRows = (pendingApproval || [])
    .map(
      (row) => `
    <li class="mw-pending-row">
      <div>
        <span class="mw-pending-what">${escapeHtml(row.label)}</span>
        <span class="mw-pending-meta">${escapeHtml(row.meta || '')}</span>
      </div>
      <span class="mw-pending-amt">${escapeHtml(formatMw01Money(row.amount))}</span>
    </li>`
    )
    .join('');

  root.innerHTML = `
    <header class="ms-organisations-hero mw-wallet-hero">
      <h5 class="ms-headline">My Wallet</h5>
      <p class="ms-organisations-lead">
        Budget, commitments, and payment permissions in one place — <span class="ms-organisations-spec">MW‑01</span> prototype.
        <strong> Illustrative balances only;</strong> no real money moves here.
      </p>
      <div class="mw-balance-card" role="region" aria-label="Wallet balances">
        <div class="mw-balance-main">
          <span class="mw-balance-label">Available to spend</span>
          <span class="mw-balance-value">${escapeHtml(formatMw01Money(balances?.discretionary))}</span>
          <span class="mw-balance-hint">After reserves for this month’s plan (${escapeHtml(currency || 'ZAR')}).</span>
        </div>
        <dl class="mw-balance-dl">
          <div><dt>In wallet</dt><dd>${escapeHtml(formatMw01Money(balances?.total))}</dd></div>
          <div><dt>Reserved</dt><dd>${escapeHtml(formatMw01Money(balances?.reserved))}</dd></div>
        </dl>
      </div>
    </header>

    <nav class="mw-nav-chips" aria-label="My Wallet sections">
      <span class="mw-chip">Budget</span>
      <span class="mw-chip">Payments</span>
      <span class="mw-chip">Commitments</span>
      <span class="mw-chip">Savings</span>
      <span class="mw-chip">Permissions</span>
    </nav>

    <section class="ms-org-section" aria-labelledby="mwAllocHeading">
      <h3 class="ms-org-section-title" id="mwAllocHeading">Money with purpose (example allocation)</h3>
      <ul class="mw-alloc-list" role="list">${allocRows}</ul>
    </section>

    <section class="ms-org-section" aria-labelledby="mwUpHeading">
      <h3 class="ms-org-section-title" id="mwUpHeading">Upcoming</h3>
      ${
        upcomingRows
          ? `<ul class="mw-upcoming-list" role="list">${upcomingRows}</ul>`
          : '<p class="ms-org-empty">No upcoming items in this demo.</p>'
      }
    </section>

    <section class="ms-org-section" aria-labelledby="mwPendingHeading">
      <h3 class="ms-org-section-title" id="mwPendingHeading">Awaiting your approval</h3>
      ${
        pendingRows
          ? `<ul class="mw-pending-list" role="list">${pendingRows}</ul>`
          : '<p class="ms-org-empty">No pending once-off payments.</p>'
      }
    </section>

    <section class="ms-org-section mw-mandate-box" aria-labelledby="mwMandateHeading">
      <h3 class="ms-org-section-title" id="mwMandateHeading">Sarah payment control</h3>
      <p class="mw-mandate-lead">
        Recurring mandates run only when enabled. Org reminders (SUB‑01) never imply pay — you still approve mandates separately.
      </p>
      <label class="mw-toggle">
        <input type="checkbox" id="mwPauseMandates" ${mandatesPaused ? 'checked' : ''} />
        <span>Pause all Sarah recurring payments (demo)</span>
      </label>
    </section>

    <footer class="ms-organisations-foot">
      <p class="ms-organisations-note">
        MW‑01A–C: mock data in <code>MOCK_MY_WALLET</code> (<code>mock-data.js</code>) · demo flag <code>${escapeHtml(
    MW01_DEMO_STORAGE_KEY
  )}</code> · spec in repo: <code>docs/architecture/SARAH_APP_MW01_MY_WALLET_FUNCTIONAL_SPEC.md</code>
      </p>
    </footer>`;

  document.getElementById('mwPauseMandates')?.addEventListener('change', (e) => {
    const on = Boolean(e.target?.checked);
    saveMw01DemoState({ mandatesPaused: on });
    showProtoToast(on ? 'Recurring mandates paused (demo)' : 'Recurring mandates active (demo)');
  });
}

function renderSarahPayPanel() {
  const root = document.getElementById('msSarahPayRoot');
  if (!root || !MOCK_SARAH_PAY) return;

  const demo = loadSyp01DemoState();
  const { spendingControl: sc, simulatedPaymentRequest: req, chips } = MOCK_SARAH_PAY;
  const strictMode = typeof demo.strictMode === 'boolean' ? demo.strictMode : sc?.mode === 'strict';

  const cap = Number(sc?.cap);
  const baseSpent = Number(sc?.spent);
  const extraSpent = Number(demo.spentDelta) || 0;
  const spent = baseSpent + extraSpent;
  const remaining = Math.max(0, cap - spent);
  const simAmount = Number(req?.amount);
  const wouldTotal = spent + (Number.isFinite(simAmount) ? simAmount : 0);
  const overBy = wouldTotal > cap ? wouldTotal - cap : 0;

  const chipHtml = (chips || ['Scan & Pay', 'My purchases', 'Payment requests', 'Spending controls', 'Merchants', 'History'])
    .map((c) => `<span class="mw-chip syp-chip">${escapeHtml(c)}</span>`)
    .join('');

  root.innerHTML = `
    <header class="ms-organisations-hero syp-hero">
      <h5 class="ms-headline">Sarah Pay</h5>
      <p class="ms-organisations-lead">
        Verified checkout and POS flows — <span class="ms-organisations-spec">SYP‑01</span> prototype.
        <strong> No camera, no real payments;</strong> QR must be server‑verified in production (see spec).
      </p>

      <div class="syp-allowance-card" role="region" aria-label="Spending allowance">
        <div class="syp-allowance-head">
          <span class="syp-allowance-label">${escapeHtml(sc?.label || 'Spending allowance')}</span>
          <span class="syp-allowance-mode">${escapeHtml(strictMode ? 'Strict' : 'Flexible')}</span>
        </div>
        <p class="syp-allowance-cap">${escapeHtml(formatMw01Money(cap))} <span class="syp-muted">cap</span></p>
        <dl class="syp-allowance-dl">
          <div><dt>Spent (demo)</dt><dd>${escapeHtml(formatMw01Money(spent))}</dd></div>
          <div><dt>Remaining</dt><dd>${escapeHtml(formatMw01Money(remaining))}</dd></div>
        </dl>
        <label class="syp-toggle mw-toggle">
          <input type="checkbox" id="sypStrictMode" ${strictMode ? 'checked' : ''} />
          <span>Strict mode (block when over cap)</span>
        </label>
      </div>
    </header>

    <nav class="mw-nav-chips" aria-label="Sarah Pay sections">${chipHtml}</nav>

    <section class="ms-org-section" aria-labelledby="sypScanHeading">
      <h3 class="ms-org-section-title" id="sypScanHeading">Scan &amp; Pay (simulated)</h3>
      <div class="syp-scan-card">
        <p class="syp-scan-lead">POS generated a <strong>verified</strong> payment request (demo token).</p>
        <ul class="syp-scan-facts">
          <li><span>Merchant</span> <strong>${escapeHtml(req?.merchant || '—')}</strong></li>
          <li><span>Branch</span> <strong>${escapeHtml(req?.branch || '')}</strong></li>
          <li><span>Amount</span> <strong>${escapeHtml(formatMw01Money(simAmount))}</strong></li>
          <li><span>Reference</span> <code class="syp-code">${escapeHtml(req?.reference || '')}</code></li>
        </ul>
        <p class="syp-scan-hint" id="sypScanHint"></p>
        <div class="syp-scan-actions">
          <button type="button" class="btn btn-primary" id="sypDemoScan">${escapeHtml(req?.ctaLabel || 'Pay with Sarah Pay (demo)')}</button>
          <button type="button" class="btn btn-secondary" id="sypDemoReset">Reset spent (demo)</button>
        </div>
      </div>
    </section>

    <section class="ms-org-section mw-mandate-box syp-link-box" aria-labelledby="sypLinkHeading">
      <h3 class="ms-org-section-title" id="sypLinkHeading">How this links</h3>
      <p class="mw-mandate-lead">
        <strong>My Wallet</strong> holds funds and budgets (MW‑01). <strong>My Organisations</strong> is for ongoing comms (SUB‑01) — paying here does not require Subscribe.
        Seller Sarah presents the invoice; only you (or rules you already set) authorise pay.
      </p>
    </section>

    <footer class="ms-organisations-foot">
      <p class="ms-organisations-note">
        SYP‑01: mock <code>MOCK_SARAH_PAY</code> · demo <code>${escapeHtml(SYP01_DEMO_STORAGE_KEY)}</code> · spec:
        <code>docs/architecture/SARAH_APP_SYP01_SARAH_PAY_FUNCTIONAL_SPEC.md</code>
      </p>
    </footer>`;

  const hintEl = document.getElementById('sypScanHint');

  const refreshHint = () => {
    if (!hintEl) return;
    if (!Number.isFinite(simAmount) || !Number.isFinite(cap)) {
      hintEl.textContent = '';
      return;
    }
    if (overBy <= 0) {
      hintEl.innerHTML = `This charge fits your <strong>${escapeHtml(sc?.label || 'allowance')}</strong> (${escapeHtml(
        formatMw01Money(remaining)
      )} left after this payment).`;
      return;
    }
    if (strictMode) {
      hintEl.innerHTML = `Would exceed cap by <strong>${escapeHtml(formatMw01Money(overBy))}</strong> — <strong>blocked</strong> in strict mode.`;
    } else {
      hintEl.innerHTML = `Would exceed cap by <strong>${escapeHtml(
        formatMw01Money(overBy)
      )}</strong> — Sarah would ask you to <strong>approve</strong> the increase or reduce the basket.`;
    }
  };
  refreshHint();

  document.getElementById('sypStrictMode')?.addEventListener('change', (e) => {
    saveSyp01DemoState({ ...loadSyp01DemoState(), strictMode: Boolean(e.target?.checked) });
    renderSarahPayPanel();
  });

  document.getElementById('sypDemoReset')?.addEventListener('click', () => {
    saveSyp01DemoState({ ...loadSyp01DemoState(), spentDelta: 0 });
    showProtoToast('Outing spent reset (demo)');
    renderSarahPayPanel();
  });

  document.getElementById('sypDemoScan')?.addEventListener('click', () => {
    const state = loadSyp01DemoState();
    const s = Number(MOCK_SARAH_PAY?.spendingControl?.spent) || 0;
    const d = Number(state.spentDelta) || 0;
    const currentSpent = s + d;
    const total = currentSpent + simAmount;
    const strict = typeof state.strictMode === 'boolean' ? state.strictMode : MOCK_SARAH_PAY?.spendingControl?.mode === 'strict';

    if (total <= cap || !Number.isFinite(cap)) {
      saveSyp01DemoState({ ...state, spentDelta: d + simAmount });
      showProtoToast('Paid (simulated) — receipt saved in demo');
      renderSarahPayPanel();
      return;
    }
    if (strict) {
      showProtoToast('Over cap — blocked (strict demo)');
      return;
    }
    const ok = window.confirm(
      `This takes you ${formatMw01Money(total - cap)} over tonight’s cap. Approve this once-off pay in the real app?`
    );
    if (ok) {
      saveSyp01DemoState({ ...state, spentDelta: d + simAmount });
      showProtoToast('Approved overage — paid (simulated)');
      renderSarahPayPanel();
    }
  });
}

function renderMySarahBilling() {
  const host = document.getElementById('msBillingTiers');
  if (!host) return;
  host.innerHTML = MOCK_SARAH_BILLING_TIERS.map(
    (tier) => `
    <article class="ms-tier-card ${tier.current ? 'is-current' : ''}">
      <header class="ms-tier-head">
        <h3>${escapeHtml(tier.name)}</h3>
        ${tier.current ? '<span class="ms-tier-badge">Current plan</span>' : ''}
      </header>
      <p class="ms-tier-price">${tier.price === 0 ? 'Free' : `R ${tier.price}<span>/mo</span>`}</p>
      <ul class="ms-tier-features">
        <li>${escapeHtml(String(tier.dailyChats))} Personal Sarah chats / day</li>
        <li>${escapeHtml(tier.knowledgeLabel)}</li>
        <li>${tier.premiumModels ? 'Premium models' : 'Standard models'}</li>
        <li>Discover &amp; Status access</li>
      </ul>
      <button type="button" class="ms-tier-cta" ${tier.current ? 'disabled' : ''}>
        ${tier.current ? 'Active' : tier.price === 0 ? 'Downgrade (mock)' : 'Upgrade (mock)'}
      </button>
    </article>`
  ).join('');
}

function renderMySarahPage() {
  const reminder = document.getElementById('msReminderText');
  if (reminder) reminder.textContent = MOCK_MY_SARAH_REMINDER;

  document.querySelectorAll('.my-sarah-view .sarah-brand-img').forEach((img) => {
    img.src = SARAH_AVATAR_SRC;
  });

  const historyHost = document.getElementById('msHistoryList');
  if (historyHost && personalSarahUsesMockThreads()) {
    historyHost.innerHTML = MOCK_MY_SARAH_HISTORY.map(
      (item) => `
      <button type="button" class="ms-history-item" data-personal-thread="${escapeHtml(item.threadId || '')}" data-history-prompt="${escapeHtml(item.title)}">
        <span class="ms-history-icon" aria-hidden="true">
          <svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z"/></svg>
        </span>
        <span class="ms-history-body">
          <span class="ms-history-title">${escapeHtml(item.title)}</span>
          <span class="ms-history-time">${escapeHtml(item.time)}</span>
        </span>
        <span class="ms-history-chevron" aria-hidden="true">
          <svg class="icon-svg icon-svg--xs" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </button>`
    ).join('');

    historyHost.querySelectorAll('[data-personal-thread]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const threadId = btn.getAttribute('data-personal-thread');
        if (threadId) openPersonalSarahThread(threadId);
        else goToMySarahHome(btn.getAttribute('data-history-prompt') || '');
      });
    });
  } else if (historyHost) {
    renderMySarahHistoryFromThreads();
  }

  const quickHost = document.getElementById('msQuickGrid');
  if (quickHost) {
    quickHost.innerHTML = MOCK_MY_SARAH_QUICK.map((q) => {
      const statements = Array.isArray(q.statements)
        ? q.statements
        : q.subtitle
          ? [q.subtitle]
          : [];
      const statementLines = statements
        .map((line) => `<li class="ms-quick-sub">${escapeHtml(line)}</li>`)
        .join('');
      return `
      <button type="button" class="ms-quick-card" data-quick-prompt="${escapeHtml(q.prompt)}">
        <span class="ms-quick-icon">${MS_QUICK_ICONS[q.icon] || MS_QUICK_ICONS.insight}</span>
        <span class="ms-quick-title">${escapeHtml(q.title)}</span>
        <ul class="ms-quick-statements">${statementLines}</ul>
      </button>`;
    }).join('');

    quickHost.querySelectorAll('[data-quick-prompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('personalChatInput');
        if (input) input.value = btn.getAttribute('data-quick-prompt') || '';
        input?.focus({ preventScroll: true });
      });
    });
  }

  renderMySarahBilling();
  renderMsDrawerRecents();
  bindMySarahInteractions();
}

function renderThread() {
  const ctx = getActiveThreadContext();
  const isPersonal = ctx.kind === 'personal';
  const titleEl = document.getElementById('threadTitle');
  if (titleEl) {
    titleEl.innerHTML = `${escapeHtml(ctx.name)}${ctx.verified ? ` ${verifiedBadge}` : ''}`;
  }
  const subtitleEl = document.getElementById('threadSubtitle');
  if (subtitleEl) {
    if (isPersonal && personalSarahLiveActive()) {
      const st = window.SarahLive?.getConnectionState?.() || 'connecting';
      const labels = {
        connected: 'Personal Sarah · Connected',
        connecting: 'Personal Sarah · Connecting…',
        offline: 'Personal Sarah · Offline',
        auth_required: 'Personal Sarah · Sign in required',
        error: 'Personal Sarah · Connection error',
      };
      subtitleEl.textContent = labels[st] || labels.connecting;
    } else if (isPersonal) {
      subtitleEl.textContent = 'Personal Sarah · Prototype (offline)';
    } else {
      subtitleEl.textContent = 'Company Sarah · Active now';
    }
  }
  const footnote = document.getElementById('threadFootnote');
  if (footnote) footnote.classList.toggle('hidden', isPersonal);

  const composeForm = document.getElementById('threadComposeForm');
  const composeInput = document.getElementById('threadComposeInput');
  composeForm?.classList.toggle('is-disabled', !isPersonal);
  if (composeInput) {
    composeInput.disabled = !isPersonal;
    composeInput.placeholder = isPersonal ? 'Ask Sarah anything…' : 'Company messaging — Wave 2';
  }

  const log = document.getElementById('threadLog');
  if (!log) return;
  log.innerHTML = ctx.messages.map((m) => renderThreadMessageMarkup(m, isPersonal)).join('');
  log.querySelectorAll('[data-retry-send]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const retryText = btn.getAttribute('data-retry-send') || '';
      const rt = getSarahRuntime();
      const thread = rt.threads[rt.activeThreadId];
      if (thread?.messages?.length) {
        const last = thread.messages[thread.messages.length - 1];
        if (last?.retryable) thread.messages.pop();
      }
      await deliverPersonalSarahMessage(retryText, { threadId: rt.activeThreadId, work: ctx.work, retry: true });
    });
  });
  requestAnimationFrame(() => {
    log.scrollTop = log.scrollHeight;
  });
}

function activateView() {
  const { route, msPanel } = parseLocationHash();

  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('is-active', v.dataset.view === route);
  });

  document.querySelectorAll('.bottom-nav [data-route]').forEach((btn) => {
    const navActive =
      btn.dataset.route === route ||
      (route === 'discover-company' && btn.dataset.route === 'discover');
    btn.classList.toggle('is-active', navActive);
  });

  const preAuth = route === 'welcome' || route === 'auth';
  showNav(!preAuth);

  if (route === 'chats') renderChatsList();
  if (route === 'home') {
    syncUserAvatars();
    renderMySarahPage();
    applyMySarahPanel(msPanel);
    updatePersonalSarahLiveUi();
    if (personalSarahLiveActive()) syncPersonalSarahSessionsFromServer();
  }
  if (route === 'chat-thread') {
    const { personalThreadId } = parseLocationHash();
    const rt = getSarahRuntime();
    if (personalThreadId) {
      rt.activeThreadId = personalThreadId;
      if (personalSarahLiveActive()) {
        loadPersonalThreadFromServer(personalThreadId).then((ok) => {
          if (ok) renderThread();
        });
      } else {
        renderThread();
      }
    } else if (
      personalSarahLiveActive() &&
      rt.activeThreadId &&
      rt.threads[rt.activeThreadId]?.kind === 'personal' &&
      rt.threads[rt.activeThreadId]?.api
    ) {
      setRoute('chat-thread');
    } else if (personalSarahLiveActive() && window.SarahLive?.getSessionId?.()) {
      const sid = window.SarahLive.getSessionId();
      rt.activeThreadId = sid;
      loadPersonalThreadFromServer(sid).then((ok) => {
        if (ok) setRoute('chat-thread');
        else renderThread();
      });
    } else {
      renderThread();
    }
  }

  if (route === 'status') renderHome();
  if (route === 'discover') renderDiscover();
  if (route === 'discover-company') {
    const { companyId } = parseLocationHash();
    renderCompanyDetail(companyId);
  }
  if (route === 'profile') {
    const { profilePanel, profileKind } = parseLocationHash();
    renderProfile(profilePanel || 'public', profileKind || activeProfileKind);
  }
}

function formatProfileCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function profileHashFor(kind, panel) {
  const pub = panel !== 'account';
  if (kind === 'business') return pub ? 'profile/business' : 'profile/business/account';
  return pub ? 'profile' : 'profile/account';
}

function saveProfileKind(kind) {
  if (kind !== 'persona' && kind !== 'business') return;
  activeProfileKind = kind;
  try {
    localStorage.setItem(PROFILE_KIND_STORAGE_KEY, kind);
  } catch {
    /* ignore */
  }
}

function loadStoredProfileKind() {
  try {
    const v = localStorage.getItem(PROFILE_KIND_STORAGE_KEY);
    if (v === 'business' || v === 'persona') return v;
  } catch {
    /* ignore */
  }
  return 'persona';
}

function setProfileKind(kind, opts) {
  const k = kind === 'business' ? 'business' : 'persona';
  saveProfileKind(k);
  const preserve = opts && opts.preservePanel;
  if (!preserve) activeProfilePanel = 'public';
  const hash = profileHashFor(k, activeProfilePanel);
  if (location.hash.replace(/^#/, '') !== hash) location.hash = hash;
  applyProfileKindAndPanels();
}

function setProfilePanel(panel) {
  activeProfilePanel = panel === 'account' ? 'account' : 'public';
  const hash = profileHashFor(activeProfileKind, activeProfilePanel);
  if (location.hash.replace(/^#/, '') !== hash) location.hash = hash;
  applyProfileKindAndPanels();
}

function applyProfileKindAndPanels() {
  const root = document.querySelector('.profile-view');
  if (root) {
    root.dataset.profileKind = activeProfileKind;
    root.dataset.profilePanel = activeProfilePanel;
  }
  const personaWrap = document.getElementById('profilePersonaPanels');
  const businessWrap = document.getElementById('profileBusinessPanels');
  const isPersona = activeProfileKind === 'persona';
  personaWrap?.classList.toggle('hidden', !isPersona);
  businessWrap?.classList.toggle('hidden', isPersona);

  document.getElementById('profileKindPersona')?.classList.toggle('is-active', isPersona);
  document.getElementById('profileKindPersona')?.setAttribute('aria-selected', isPersona ? 'true' : 'false');
  document.getElementById('profileKindBusiness')?.classList.toggle('is-active', !isPersona);
  document.getElementById('profileKindBusiness')?.setAttribute('aria-selected', isPersona ? 'false' : 'true');

  if (isPersona) {
    document.getElementById('profilePersonaPublicPanel')?.classList.toggle('hidden', activeProfilePanel !== 'public');
    document.getElementById('profilePersonaAccountPanel')?.classList.toggle('hidden', activeProfilePanel !== 'account');
  } else {
    document.getElementById('profileBusinessPublicPanel')?.classList.toggle('hidden', activeProfilePanel !== 'public');
    document.getElementById('profileBusinessAccountPanel')?.classList.toggle('hidden', activeProfilePanel !== 'account');
  }
}

function profileActivityTypeClass(type) {
  const map = {
    post: 'profile-pill--post',
    photo: 'profile-pill--photo',
    video: 'profile-pill--video',
    sarah: 'profile-pill--sarah',
    work: 'profile-pill--work',
    discover: 'profile-pill--discover',
  };
  return map[type] || 'profile-pill--post';
}

function renderProfileSocialTab() {
  const host = document.getElementById('profileSocialBody');
  if (!host) return;
  const tab = activeProfileSocialTab;

  if (tab === 'posts') {
    host.className = 'profile-social-body profile-social-body--feed feed-list profile-feed-list';
    const profilePosts = [...getUserCreatedPosts(), ...MOCK_PROFILE_POSTS];
    host.innerHTML = profilePosts
      .map((post) =>
        renderFeedCard({
          id: post.id,
          author: MOCK_USER.name,
          avatar: MOCK_USER.avatar,
          verified: MOCK_PROFILE.verified,
          time: post.time,
          authorType: post.authorType || 'creator',
          body: post.body,
          image: post.image,
          imageFallback: MOCK_PROFILE.coverFallback,
          likes: post.likes,
          comments: post.comments,
          sponsored: false,
        })
      )
      .join('');
    return;
  }
  host.className = 'profile-social-body';

  if (tab === 'photos') {
    host.innerHTML = `<div class="profile-photo-grid">${MOCK_PROFILE_PHOTOS.map(
      (ph) =>
        `<button type="button" class="profile-photo-cell" aria-label="${escapeHtml(ph.alt || 'Photo')}">
          <img src="${escapeHtml(ph.src)}" alt="${escapeHtml(ph.alt || '')}" loading="lazy" />
        </button>`
    ).join('')}</div>`;
    return;
  }

  if (tab === 'videos') {
    host.innerHTML = `<div class="profile-video-grid">${MOCK_PROFILE_VIDEOS.map(
      (vid) =>
        `<article class="profile-video-card">
          <div class="profile-video-thumb">
            <img src="${escapeHtml(vid.thumb)}" alt="" loading="lazy" />
            <span class="profile-video-play" aria-hidden="true">
              <svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            </span>
            <span class="profile-video-duration">${escapeHtml(vid.duration)}</span>
          </div>
          <h4 class="profile-video-title">${escapeHtml(vid.title)}</h4>
        </article>`
    ).join('')}</div>`;
    return;
  }

  host.innerHTML = `
    <p class="profile-saved-note">Only you can see saved items.</p>
    <div class="profile-saved-list">${MOCK_PROFILE_SAVED.map(
      (item) =>
        `<div class="profile-saved-row">
          <span class="profile-saved-type">${escapeHtml(item.type)}</span>
          <span class="profile-saved-title">${escapeHtml(item.title)}</span>
        </div>`
    ).join('')}</div>`;
}

function renderProfileActivity() {
  const activityHost = document.getElementById('profileActivityList');
  if (!activityHost) return;
  activityHost.innerHTML = MOCK_PROFILE_ACTIVITY.map(
    (item) => `
    <article class="profile-activity-card">
      <div class="profile-activity-thumb-wrap">
        <img class="profile-activity-thumb ${item.type === 'sarah' ? 'profile-activity-thumb--sarah' : ''}" src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />
      </div>
      <div class="profile-activity-main">
        <div class="profile-activity-meta">
          <span class="profile-pill ${profileActivityTypeClass(item.type)}">${escapeHtml(item.label)}</span>
          <time class="profile-activity-time">${escapeHtml(item.time)}</time>
        </div>
        <p class="profile-activity-preview">${escapeHtml(item.preview)}</p>
      </div>
      <button type="button" class="profile-activity-more" aria-label="More">⋯</button>
    </article>`
  ).join('');
}

function renderProfileBusinessSocialTab() {
  const host = document.getElementById('profileBusinessSocialBody');
  if (!host) return;
  const tab = activeProfileBusinessSocialTab;
  const biz = MOCK_BUSINESS_PROFILE || {};
  const posts = MOCK_BUSINESS_PROFILE_POSTS || [];

  if (tab === 'posts') {
    host.className = 'profile-social-body profile-social-body--feed feed-list profile-feed-list';
    host.innerHTML = posts
      .map((post) =>
        renderFeedCard({
          id: post.id,
          author: biz.displayName || MOCK_USER.name,
          avatar: MOCK_USER.avatar,
          verified: biz.verified,
          time: post.time,
          authorType: 'creator',
          body: post.body,
          image: post.image,
          imageFallback: biz.coverFallback || MOCK_PROFILE.coverFallback,
          likes: post.likes,
          comments: post.comments,
          sponsored: false,
        })
      )
      .join('');
    return;
  }

  host.className = 'profile-social-body';
  host.innerHTML = `
    <div class="profile-biz-about">
      <p><strong>BP-01</strong> — Business Profile shell. Full sections (identity, companies, knowledge) ship in later slices.</p>
      <ul class="profile-biz-about-list">
        <li><strong>Industry:</strong> ${escapeHtml(biz.industry || '—')}</li>
        <li><strong>Role:</strong> ${escapeHtml(biz.jobTitle || '—')}</li>
        <li><strong>Connected portals (mock):</strong> ${escapeHtml(String(biz.connectedCompanyPortals ?? '—'))}</li>
        <li><strong>Active assignments (mock):</strong> ${escapeHtml(String(biz.activeAssignments ?? '—'))}</li>
      </ul>
    </div>`;
}

function renderProfileBusinessActivity() {
  const activityHost = document.getElementById('profileBusinessActivityList');
  if (!activityHost) return;
  const items = MOCK_BUSINESS_PROFILE_ACTIVITY || [];
  activityHost.innerHTML = items
    .map(
      (item) => `
    <article class="profile-activity-card">
      <div class="profile-activity-thumb-wrap">
        <img class="profile-activity-thumb ${item.type === 'sarah' ? 'profile-activity-thumb--sarah' : ''}" src="${escapeHtml(prototypeAsset(item.thumb))}" alt="" loading="lazy" />
      </div>
      <div class="profile-activity-main">
        <div class="profile-activity-meta">
          <span class="profile-pill ${profileActivityTypeClass(item.type)}">${escapeHtml(item.label)}</span>
          <time class="profile-activity-time">${escapeHtml(item.time)}</time>
        </div>
        <p class="profile-activity-preview">${escapeHtml(item.preview)}</p>
      </div>
      <button type="button" class="profile-activity-more" aria-label="More">⋯</button>
    </article>`
    )
    .join('');
}

function renderProfileBusinessAccountSections() {
  const host = document.getElementById('profileBusinessAccountSections');
  const sections = MOCK_BUSINESS_PROFILE_ACCOUNT_SECTIONS;
  if (!host || !sections?.length) return;
  host.innerHTML = sections
    .map(
      (group) => `
    <section class="profile-account-group" aria-labelledby="profile-biz-group-${escapeHtml(group.id)}">
      <header class="profile-account-group-head">
        <h2 id="profile-biz-group-${escapeHtml(group.id)}">${escapeHtml(group.title)}</h2>
        <p>${escapeHtml(group.subtitle)}</p>
      </header>
      <div class="profile-account-list">
        ${group.items
          .map((item) => {
            const disabled = item.action === 'disabled';
            return `<button type="button" class="profile-account-row ${disabled ? 'is-disabled' : ''}" data-profile-biz-action="${escapeHtml(item.action)}" ${disabled ? 'disabled' : ''}>
              <span class="profile-account-row-body">
                <strong>${escapeHtml(item.label)}</strong>
                <span>${escapeHtml(item.detail)}</span>
              </span>
              ${disabled ? '' : '<span class="profile-account-row-chevron" aria-hidden="true">›</span>'}
            </button>`;
          })
          .join('')}
      </div>
    </section>`
    )
    .join('');

  host.querySelectorAll('[data-profile-biz-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-profile-biz-action');
      if (!action || action === 'none' || action === 'disabled' || action === 'mock') return;
      handleProfileAccountAction(action);
    });
  });
}

async function handleProfileAccountAction(action) {
  switch (action) {
    case 'knowledge':
      setMySarahPanel('knowledge');
      break;
    case 'billing':
      setMySarahPanel('billing');
      break;
    case 'chats':
      setRoute('chats');
      break;
    case 'discover':
      setRoute('discover');
      break;
    case 'sign-out':
      if (window.SarahLive?.signOut) {
        await window.SarahLive.signOut();
        clearLivePersonalSarahState();
        updatePersonalSarahLiveUi();
        setRoute('auth');
        showProtoToast('Signed out.');
      }
      break;
    default:
      break;
  }
}

function renderProfileAccountSections() {
  const host = document.getElementById('profileAccountSections');
  if (!host) return;
  host.innerHTML = MOCK_PROFILE_ACCOUNT_SECTIONS.map(
    (group) => `
    <section class="profile-account-group" aria-labelledby="profile-group-${escapeHtml(group.id)}">
      <header class="profile-account-group-head">
        <h2 id="profile-group-${escapeHtml(group.id)}">${escapeHtml(group.title)}</h2>
        <p>${escapeHtml(group.subtitle)}</p>
      </header>
      <div class="profile-account-list">
        ${group.items
          .map((item) => {
            const disabled = item.action === 'disabled';
            return `<button type="button" class="profile-account-row ${disabled ? 'is-disabled' : ''}" data-profile-action="${escapeHtml(item.action)}" ${disabled ? 'disabled' : ''}>
              <span class="profile-account-row-body">
                <strong>${escapeHtml(item.label)}</strong>
                <span>${escapeHtml(item.detail)}</span>
              </span>
              ${disabled ? '' : '<span class="profile-account-row-chevron" aria-hidden="true">›</span>'}
            </button>`;
          })
          .join('')}
      </div>
    </section>`
  ).join('');

  host.querySelectorAll('[data-profile-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-profile-action');
      if (!action || action === 'none' || action === 'disabled' || action === 'mock') return;
      handleProfileAccountAction(action);
    });
  });
}

function renderProfilePersona(profilePanel) {
  activeProfilePanel = profilePanel === 'account' ? 'account' : 'public';
  applyProfileKindAndPanels();

  const p = MOCK_PROFILE || {};
  syncUserAvatars();
  const cover = document.getElementById('profileCover');
  if (cover) {
    cover.removeAttribute('data-fb');
    cover.src = prototypeAsset(p.cover || 'assets/profile/spencer-cover.jpg');
    cover.onerror = function onCoverErr() {
      if (this.dataset.fb) return;
      this.dataset.fb = '1';
      this.src = prototypeAsset(p.coverFallback || 'assets/discover/green-haven-hero.jpg');
    };
  }
  document.querySelectorAll('.profile-avatar[data-profile-kind="persona"]').forEach((img) => {
    img.removeAttribute('data-fb');
    img.src = prototypeAsset(MOCK_USER.avatar);
    img.onerror = function onAvatarErr() {
      if (this.dataset.fb) return;
      this.dataset.fb = '1';
      this.src = prototypeAsset(p.avatarFallback || 'assets/discover/green-haven-fallback.svg');
    };
  });
  document.querySelectorAll('[data-profile-name][data-profile-kind="persona"]').forEach((el) => {
    el.textContent = MOCK_USER.name;
  });
  const handle = document.getElementById('profileHandle');
  if (handle) handle.textContent = `@${p.username || 'user'} · Joined ${p.joined || ''}`;
  const verifiedHost = document.getElementById('profileVerifiedBadge');
  if (verifiedHost) {
    verifiedHost.innerHTML = p.verified ? `${verifiedBadge} Verified` : '';
    verifiedHost.hidden = !p.verified;
  }
  const bio = document.getElementById('profileBio');
  if (bio) bio.textContent = p.bio || '';
  const meta = document.getElementById('profileMeta');
  if (meta) {
    const interests = (p.interests || []).join(' · ');
    meta.textContent = [p.occupation, p.location, interests].filter(Boolean).join(' · ');
  }
  const stats = document.getElementById('profileStats');
  if (stats) {
    stats.innerHTML = `
      <span><strong>${formatProfileCount(p.following || 0)}</strong> Following</span>
      <span><strong>${formatProfileCount(p.followers || 0)}</strong> Followers</span>
      <span><strong>${(p.posts || 0) + getUserCreatedPosts().length}</strong> Posts</span>`;
  }

  document.querySelectorAll('#profileSocialTabs .profile-social-tab[data-profile-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.profileTab === activeProfileSocialTab);
  });
  renderProfileSocialTab();
  renderProfileActivity();
  renderProfileAccountSections();
}

function renderProfileBusiness(profilePanel) {
  activeProfilePanel = profilePanel === 'account' ? 'account' : 'public';
  applyProfileKindAndPanels();

  const biz = MOCK_BUSINESS_PROFILE || {};
  syncUserAvatars();

  const cover = document.getElementById('profileBusinessCover');
  if (cover) {
    cover.removeAttribute('data-fb');
    cover.src = prototypeAsset(biz.cover || MOCK_PROFILE.cover || 'assets/profile/spencer-cover.jpg');
    cover.onerror = function onBizCoverErr() {
      if (this.dataset.fb) return;
      this.dataset.fb = '1';
      this.src = prototypeAsset(biz.coverFallback || MOCK_PROFILE.coverFallback || 'assets/discover/green-haven-hero.jpg');
    };
  }
  document.querySelectorAll('.profile-avatar[data-profile-kind="business"]').forEach((img) => {
    img.removeAttribute('data-fb');
    img.src = prototypeAsset(MOCK_USER.avatar);
    img.onerror = function onBizAvErr() {
      if (this.dataset.fb) return;
      this.dataset.fb = '1';
      this.src = prototypeAsset(biz.avatarFallback || MOCK_PROFILE.avatarFallback || 'assets/discover/green-haven-fallback.svg');
    };
  });
  document.querySelectorAll('[data-profile-name][data-profile-kind="business"]').forEach((el) => {
    el.textContent = biz.displayName || MOCK_USER.name;
  });
  const handle = document.getElementById('profileBusinessHandle');
  if (handle) handle.textContent = `@${biz.username || 'professional'} · Business · Joined ${biz.joined || MOCK_PROFILE.joined || ''}`;

  const verifiedHost = document.getElementById('profileBusinessVerifiedBadge');
  if (verifiedHost) {
    verifiedHost.innerHTML = biz.verified ? `${verifiedBadge} Verified` : '';
    verifiedHost.hidden = !biz.verified;
  }
  const headline = document.getElementById('profileBusinessHeadline');
  if (headline) headline.textContent = biz.headline || '';
  const bio = document.getElementById('profileBusinessBio');
  if (bio) bio.textContent = biz.bio || '';
  const meta = document.getElementById('profileBusinessMeta');
  if (meta) {
    const interests = (biz.interests || []).join(' · ');
    meta.textContent = [biz.jobTitle, biz.industry, biz.location, interests].filter(Boolean).join(' · ');
  }
  const stats = document.getElementById('profileBusinessStats');
  if (stats) {
    stats.innerHTML = `
      <span><strong>${formatProfileCount(biz.following || 0)}</strong> Following</span>
      <span><strong>${formatProfileCount(biz.followers || 0)}</strong> Followers</span>
      <span><strong>${formatProfileCount(biz.posts || 0)}</strong> Updates</span>`;
  }

  document.querySelectorAll('#profileBusinessSocialTabs .profile-social-tab[data-profile-biz-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.profileBizTab === activeProfileBusinessSocialTab);
  });
  renderProfileBusinessSocialTab();
  renderProfileBusinessActivity();
  renderProfileBusinessAccountSections();
}

function renderProfile(profilePanel, profileKind) {
  const parsed = parseLocationHash();
  const kind = profileKind === 'business' || profileKind === 'persona' ? profileKind : parsed.profileKind === 'business' ? 'business' : 'persona';
  saveProfileKind(kind);

  if (profilePanel === 'account' || profilePanel === 'public') {
    activeProfilePanel = profilePanel;
  } else {
    activeProfilePanel = parsed.profilePanel === 'account' ? 'account' : 'public';
  }

  if (kind === 'business') {
    renderProfileBusiness(activeProfilePanel);
  } else {
    renderProfilePersona(activeProfilePanel);
  }
  bindProfileInteractions();
}

function bindProfileInteractions() {
  if (window.__profileBound) return;
  window.__profileBound = true;

  const openPersonaAccount = () => {
    setProfileKind('persona', { preservePanel: true });
    setProfilePanel('account');
  };
  document.getElementById('profileOpenAccount')?.addEventListener('click', openPersonaAccount);
  document.getElementById('profileOpenAccountBottom')?.addEventListener('click', openPersonaAccount);
  document.getElementById('profileBackPublic')?.addEventListener('click', () => {
    setProfileKind('persona', { preservePanel: true });
    setProfilePanel('public');
  });

  const openBizAccount = () => {
    setProfileKind('business', { preservePanel: true });
    setProfilePanel('account');
  };
  document.getElementById('profileBusinessOpenAccount')?.addEventListener('click', openBizAccount);
  document.getElementById('profileBusinessOpenAccountBottom')?.addEventListener('click', openBizAccount);
  document.getElementById('profileBusinessBackPublic')?.addEventListener('click', () => {
    setProfileKind('business', { preservePanel: true });
    setProfilePanel('public');
  });

  document.getElementById('profileKindPersona')?.addEventListener('click', () => setProfileKind('persona'));
  document.getElementById('profileKindBusiness')?.addEventListener('click', () => setProfileKind('business'));

  document.getElementById('profileSocialTabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-profile-tab]');
    if (!tab) return;
    activeProfileSocialTab = tab.dataset.profileTab || 'posts';
    document.querySelectorAll('#profileSocialTabs .profile-social-tab[data-profile-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.profileTab === activeProfileSocialTab);
    });
    renderProfileSocialTab();
  });

  document.getElementById('profileBusinessSocialTabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-profile-biz-tab]');
    if (!tab) return;
    activeProfileBusinessSocialTab = tab.dataset.profileBizTab || 'posts';
    document.querySelectorAll('#profileBusinessSocialTabs .profile-social-tab[data-profile-biz-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.profileBizTab === activeProfileBusinessSocialTab);
    });
    renderProfileBusinessSocialTab();
  });
}

const DISCOVER_SVG = {
  star: '<svg class="discover-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7h7l-5.5 4.5 2 7L12 17l-6.5 3.5 2-7L2 9h7l3-7z" fill="currentColor"/></svg>',
  pin: '<svg class="icon-svg icon-svg--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.5 6-10a6 6 0 10-12 0c0 4.5 6 10 6 10z"/><circle cx="12" cy="11" r="2"/></svg>',
  plane:
    '<svg class="icon-svg icon-svg--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  crown:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M6 18l-1-8 5 3 5-6 5 6 5-3-1 8" fill="currentColor"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-4.2-8.8-7.4C1.5 11 2.6 7.5 5.8 6.4c1.8-.7 3.7-.2 5 1.3 1.3-1.5 3.2-2 5-1.3 3.2 1.1 4.3 4.6 2.6 7.2C18.5 16.8 12 21 12 21z"/></svg>',
};

function openDiscoverCompany(id) {
  if (!id) return;
  location.hash = `discover/${id}`;
}

function renderDiscover() {
  const catsHost = document.getElementById('discoverCats');
  const gridHost = document.getElementById('discoverGrid');
  if (!catsHost || !gridHost) return;

  catsHost.innerHTML = MOCK_DISCOVER_CATEGORIES.map(
    (cat) => `
    <button type="button" class="discover-cat ${cat.id === activeDiscoverCategory ? 'is-active' : ''}" data-discover-cat="${escapeHtml(cat.id)}" role="tab">
      ${escapeHtml(cat.label)}
    </button>`
  ).join('');

  catsHost.querySelectorAll('[data-discover-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeDiscoverCategory = btn.dataset.discoverCat || 'all';
      renderDiscover();
    });
  });

  const list = MOCK_DISCOVER_COMPANIES.filter((c) => {
    if (activeDiscoverCategory === 'all') return true;
    return c.categories.includes(activeDiscoverCategory);
  });

  gridHost.innerHTML = list
    .map(
      (c) => `
    <article class="discover-card" data-company-id="${escapeHtml(c.id)}">
      <div class="discover-card-media">
        <img ${discoverImgAttrs(c.image, c)} />
        ${c.featured ? `<span class="discover-card-crown">${DISCOVER_SVG.crown}</span>` : ''}
        <button type="button" class="discover-card-fav" data-fav-toggle aria-label="Save">${DISCOVER_SVG.heart}</button>
      </div>
      <div class="discover-card-body">
        <h2 class="discover-card-title">${escapeHtml(c.name)}</h2>
        <p class="discover-card-meta">
          ${DISCOVER_SVG.star}
          <span>${c.rating}(${c.reviewCount})</span>
          <span class="discover-card-meta-sep" aria-hidden="true">|</span>
          ${DISCOVER_SVG.pin}
          <span>${escapeHtml(String(c.distanceKm))} km</span>
        </p>
      </div>
      <div class="discover-card-actions-row">
        <button type="button" class="discover-card-subscribe ${isOrgSubscribedSub01(c.id) ? 'is-active' : ''}" data-sub01-subscribe="${escapeHtml(c.id)}">
          ${isOrgSubscribedSub01(c.id) ? 'Manage' : 'Subscribe'}
        </button>
        <button type="button" class="discover-card-follow ${isCompanyFollowed(c.id) ? 'is-active' : ''}" data-follow-company="${escapeHtml(c.id)}">
          ${isCompanyFollowed(c.id) ? 'Following' : 'Follow'}
        </button>
      </div>
      <button type="button" class="discover-card-profile" data-view-profile="${escapeHtml(c.id)}">
        View Profile
      </button>
    </article>`
    )
    .join('');

  gridHost.querySelectorAll('.discover-card[data-company-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (
        e.target.closest('[data-fav-toggle], .discover-card-profile, [data-view-profile], .discover-card-follow, [data-follow-company], [data-sub01-subscribe]')
      ) {
        return;
      }
      openDiscoverCompany(card.dataset.companyId);
    });
  });

  gridHost.querySelectorAll('[data-sub01-subscribe]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      bindSub01RegisterModalOnce();
      const id = btn.getAttribute('data-sub01-subscribe');
      if (!id) return;
      if (isOrgSubscribedSub01(id)) openSub01RegisterModal(id, { edit: true });
      else sub01OpenSubscribeFlow(id);
    });
  });

  gridHost.querySelectorAll('[data-follow-company]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-follow-company');
      if (!id) return;
      const on = toggleCompanyFollow(id);
      btn.classList.toggle('is-active', on);
      btn.textContent = on ? 'Following' : 'Follow';
    });
  });

  gridHost.querySelectorAll('[data-fav-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.classList.toggle('is-active');
    });
  });

  gridHost.querySelectorAll('[data-view-profile]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDiscoverCompany(btn.getAttribute('data-view-profile'));
    });
  });
}

function renderCompanyDetail(companyId) {
  const root = document.getElementById('companyDetailRoot');
  if (!root) return;
  const company = MOCK_DISCOVER_COMPANIES.find((c) => c.id === companyId);
  if (!company) {
    root.innerHTML = `<div class="company-detail-body"><p>Company not found.</p><button type="button" class="btn btn-primary" onclick="location.hash='discover'">Back</button></div>`;
    return;
  }

  const hoursHtml = company.hours
    .map(
      (h, i) => `
    <div class="company-hours-row ${i === 0 ? 'is-today' : ''}">
      <span>${escapeHtml(h.day)}</span>
      <span>${escapeHtml(h.time)}</span>
    </div>`
    )
    .join('');

  const gallery = getCompanyGallery(company);
  const galleryHtml = gallery
    .map(
      (src, i) => `
      <button type="button" class="company-gallery-thumb" data-gallery-open="${i}" aria-label="View photo ${i + 1}">
        <img ${discoverImgAttrs(src, company)} />
      </button>`
    )
    .join('');

  const products = getCompanyProducts(company);
  const productsHtml = products
    .map((p) => {
      const liked = isProductLiked(company.id, p.id);
      return `
      <article class="product-card">
        <div class="product-card-media">
          <img ${discoverImgAttrs(p.image || company.image, company)} />
        </div>
        <h3 class="product-card-title">${escapeHtml(p.name)}</h3>
        ${p.description ? `<p class="product-card-desc">${escapeHtml(p.description)}</p>` : ''}
        <p class="product-card-price">R ${escapeHtml(String(p.price))}</p>
        <div class="product-card-actions">
          <button type="button" class="product-like ${liked ? 'is-active' : ''}" data-product-like="${escapeHtml(p.id)}" aria-label="Like product">${DISCOVER_SVG.heart}</button>
          <button type="button" class="product-buy" data-product-buy="${escapeHtml(p.id)}">Buy</button>
        </div>
      </article>`;
    })
    .join('');

  const following = isCompanyFollowed(company.id);
  const subbed = isOrgSubscribedSub01(company.id);

  root.innerHTML = `
    <div class="company-hero">
      <img ${discoverImgAttrs(company.image, company).replace('loading="lazy"', 'loading="eager"')} />
      <button type="button" class="company-back" onclick="location.hash='discover'" aria-label="Back">
        <svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
    </div>
    <div class="company-detail-body">
      <header class="company-head">
        <div class="company-head-text">
          <h1>${escapeHtml(company.name)}${company.verified ? ` ${verifiedBadge}` : ''}</h1>
          <p class="company-tags">${escapeHtml(company.categoryLabel)}</p>
          <p class="company-meta">
            ${DISCOVER_SVG.star}
            <span>${company.rating}(${company.reviewCount})</span>
            <span class="discover-card-meta-sep">|</span>
            ${DISCOVER_SVG.pin}
            <span>${escapeHtml(String(company.distanceKm))} km</span>
          </p>
          <p class="company-address">${escapeHtml(company.address)}</p>
        </div>
        <button type="button" class="company-fav-lg" data-fav-toggle aria-label="Favorite">${DISCOVER_SVG.heart}</button>
      </header>

      <div class="company-actions-primary">
        <button type="button" class="company-subscribe ${subbed ? 'is-active' : ''}" data-sub01-subscribe="${escapeHtml(company.id)}">
          ${subbed ? 'Manage' : 'Subscribe'}
        </button>
        <button type="button" class="company-follow ${following ? 'is-active' : ''}" data-follow-company="${escapeHtml(company.id)}">
          ${following ? 'Following' : 'Follow'}
        </button>
      </div>

      <button type="button" class="company-chat-sarah" data-chat-company="${escapeHtml(company.id)}">Chat With Sarah</button>

      <div class="company-actions company-actions--secondary">
        <button type="button" class="company-action"><svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>Direction</button>
        <button type="button" class="company-action"><svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"/><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/></svg>Share</button>
      </div>

      <section class="company-block company-section company-block--description">
        <h2>Description</h2>
        <p class="company-description-text is-clamped" id="companyDescText">${escapeHtml(company.description)}</p>
        <button type="button" class="company-desc-more" id="companyDescToggle" aria-expanded="false">View more</button>
      </section>

      <section class="company-block company-section company-gallery-block">
        <h2>Gallery</h2>
        <div class="company-gallery-grid company-gallery-grid--six">${galleryHtml}</div>
        <p class="company-gallery-hint">Tap a photo to view, like, or swipe through the gallery.</p>
      </section>

      <section class="company-block company-section company-products-block">
        <h2>Products</h2>
        <p class="company-section-lead">Available to order — like items or buy through Sarah (mock checkout).</p>
        <div class="product-grid">${productsHtml}</div>
      </section>

      <section class="company-block company-section company-hours">
        <button type="button" class="company-hours-toggle" id="companyHoursToggle" aria-expanded="true">
          <span>Business Hours</span>
          <svg class="icon-svg icon-svg--xs" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="company-hours-list" id="companyHoursList">${hoursHtml}</div>
      </section>
    </div>`;

  root.querySelector('[data-fav-toggle]')?.addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('is-active');
  });

  root.querySelector('[data-sub01-subscribe]')?.addEventListener('click', (e) => {
    bindSub01RegisterModalOnce();
    const btn = e.currentTarget;
    const id = btn.getAttribute('data-sub01-subscribe');
    if (!id) return;
    if (isOrgSubscribedSub01(id)) openSub01RegisterModal(id, { edit: true });
    else sub01OpenSubscribeFlow(id);
  });

  root.querySelector('[data-follow-company]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const id = btn.getAttribute('data-follow-company');
    if (!id) return;
    const on = toggleCompanyFollow(id);
    btn.classList.toggle('is-active', on);
    btn.textContent = on ? 'Following' : 'Follow';
  });

  root.querySelector('[data-chat-company]')?.addEventListener('click', (e) => {
    openCompanySarahChat(e.currentTarget.getAttribute('data-chat-company'));
  });

  root.querySelectorAll('[data-gallery-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openGalleryViewer(company.id, Number(btn.getAttribute('data-gallery-open')) || 0);
    });
  });

  document.getElementById('companyDescToggle')?.addEventListener('click', (e) => {
    const text = document.getElementById('companyDescText');
    const btn = e.currentTarget;
    const expanded = text?.classList.toggle('is-clamped') === false;
    btn.textContent = expanded ? 'View less' : 'View more';
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });

  root.querySelectorAll('[data-product-like]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-product-like');
      if (!pid) return;
      const on = toggleProductLike(company.id, pid);
      btn.classList.toggle('is-active', on);
    });
  });

  root.querySelectorAll('[data-product-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-product-buy');
      const product = products.find((p) => p.id === pid);
      if (product) {
        btn.textContent = 'Added';
        setTimeout(() => {
          btn.textContent = 'Buy';
        }, 1200);
      }
    });
  });

  document.getElementById('companyHoursToggle')?.addEventListener('click', () => {
    const list = document.getElementById('companyHoursList');
    const btn = document.getElementById('companyHoursToggle');
    const section = btn?.closest('.company-hours');
    const collapsed = list?.classList.toggle('is-collapsed');
    section?.classList.toggle('is-collapsed', Boolean(collapsed));
    btn?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
}

function syncUserAvatars() {
  document.querySelectorAll('[data-user-avatar]').forEach((img) => {
    img.removeAttribute('data-fb');
    img.src = prototypeAsset(MOCK_USER.avatar);
    img.alt = MOCK_USER.name;
    img.onerror = function onUserAvatarErr() {
      if (this.dataset.fb) return;
      this.dataset.fb = '1';
      this.src = prototypeAsset(MOCK_PROFILE?.avatarFallback || 'assets/discover/green-haven-fallback.svg');
    };
  });
}

function renderHome() {
  const greet = document.getElementById('homeGreeting');
  if (greet) {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    greet.textContent = `${part}, ${MOCK_USER.name}`;
  }

  syncUserAvatars();

  document.querySelectorAll('.sarah-brand-img').forEach((img) => {
    img.src = SARAH_AVATAR_SRC;
  });

  const tabsHost = document.getElementById('feedTabs');
  if (tabsHost) {
    tabsHost.innerHTML = MOCK_FEED_TABS.map(
      (t) =>
        `<button type="button" class="feed-tab ${t.id === activeFeedTab ? 'is-active' : ''}" data-feed-tab="${t.id}">${escapeHtml(t.label)}</button>`
    ).join('');
    tabsHost.querySelectorAll('[data-feed-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFeedTab = btn.dataset.feedTab || 'for-you';
        renderHome();
      });
    });
  }

  const feedHost = document.getElementById('feedList');
  if (!feedHost) return;

  const items = MOCK_FEED.filter((p) => {
    if (activeFeedTab === 'for-you') return p.tab === 'for-you';
    if (activeFeedTab === 'following') return p.tab === 'following';
    if (activeFeedTab === 'companies') return p.authorType === 'company';
    if (activeFeedTab === 'creators') return p.authorType === 'creator';
    if (activeFeedTab === 'videos') return Boolean(p.image);
    return true;
  });
  const display = items.length ? items : MOCK_FEED.filter((p) => p.tab === 'for-you');
  const userOnTab = getUserCreatedPosts().filter((p) => userPostVisibleOnFeedTab(p, activeFeedTab));
  const q = statusFeedQuery.trim().toLowerCase();
  const merged = [...userOnTab, ...display].filter((p) => feedMatchesQuery(p, q));

  if (!merged.length && q) {
    feedHost.innerHTML =
      '<p class="feed-empty-search">No posts match your search. Open search and clear the field to see everything again.</p>';
  } else {
    feedHost.innerHTML = merged.map((p) => renderFeedCard(p)).join('');
  }

  syncNotificationBadge();
}

function initAuthTabs() {
  const tabs = document.querySelectorAll('[data-auth-tab]');
  const signIn = document.getElementById('signInPanel');
  const signUp = document.getElementById('signUpPanel');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
      const which = tab.dataset.authTab;
      signIn?.classList.toggle('hidden', which !== 'signin');
      signUp?.classList.toggle('hidden', which !== 'signup');
    });
  });
}

function setAuthStatus(message) {
  const el = document.getElementById('authStatus');
  if (el) el.textContent = message || '';
}

function bindSarahLiveAuth() {
  if (window.__sarahLiveAuthBound || !window.SarahLive?.isLiveEnabled?.()) return;
  window.__sarahLiveAuthBound = true;

  const hint = document.getElementById('authLiveHint');
  if (hint) {
    hint.textContent = 'Live Personal Sarah — sign in with your Sarah account to sync conversations.';
  }

  window.SarahLive.onConnectionChange?.(() => {
    updatePersonalSarahLiveUi();
    renderThread();
  });

  document.getElementById('signInPanel')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    setAuthStatus('Signing in…');
    const res = await window.SarahLive.signIn(fd.get('email'), fd.get('password'));
    if (res.error) {
      setAuthStatus(res.error);
      return;
    }
    applyConsumerProfileToUi(res.profile);
    await syncPersonalSarahSessionsFromServer();
    setAuthStatus('');
    setRoute('home');
  });

  document.getElementById('signUpPanel')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!fd.get('popia')) {
      setAuthStatus('Please accept the privacy terms.');
      return;
    }
    setAuthStatus('Creating account…');
    const res = await window.SarahLive.signUp({
      email: fd.get('email'),
      password: fd.get('password'),
      firstName: fd.get('firstName'),
    });
    if (res.error) {
      setAuthStatus(res.error);
      return;
    }
    applyConsumerProfileToUi(res.profile);
    setAuthStatus('');
    setRoute('home');
  });

  window.SarahLive.onAuthChange(async (user, profile) => {
    if (user && profile) applyConsumerProfileToUi(profile);
    if (!user) clearLivePersonalSarahState();
    updatePersonalSarahLiveUi();
    if (user) {
      await syncPersonalSarahSessionsFromServer();
      const route = parseLocationHash().route;
      if (route === 'auth' || route === 'welcome') setRoute('home');
    }
  });
}

function init() {
  window.__sarahActivate = activateView;

  document.getElementById('btnWelcomeContinue')?.addEventListener('click', () => setRoute('auth'));
  document.getElementById('authMockContinue')?.addEventListener('click', () => setRoute('home'));
  document.getElementById('btnThreadBack')?.addEventListener('click', () => {
    const ctx = getActiveThreadContext();
    if (ctx.kind === 'personal') setMySarahPanel('home');
    else setRoute('chats');
  });

  document.querySelectorAll('.bottom-nav [data-route]').forEach((btn) => {
    btn.addEventListener('click', () => setRoute(btn.dataset.route));
  });

  document.getElementById('personalChatForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('personalChatInput');
    const text = input?.value.trim();
    if (!text) return;
    const panel = document.querySelector('.my-sarah-view')?.dataset.msPanel || 'home';
    const threadId = await deliverPersonalSarahMessage(text, {
      work: panel === 'tasks',
      fromHomeCompose: panel === 'home',
    });
    if (input) input.value = '';
    if (threadId && panel !== 'home') openPersonalSarahThread(threadId);
  });

  document.getElementById('threadComposeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ctx = getActiveThreadContext();
    if (ctx.kind !== 'personal') return;
    const input = document.getElementById('threadComposeInput');
    const text = input?.value.trim();
    if (!text) return;
    await deliverPersonalSarahMessage(text, { threadId: ctx.id, work: ctx.work });
    if (input) input.value = '';
  });

  initAuthTabs();
  bindGalleryLightbox();
  bindCreatePostUi();
  bindProtoSearchAndNotif();

  window.addEventListener('hashchange', () => activateView());

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('protoSearchSheet')?.classList.contains('hidden')) {
      closeProtoSearchSheet();
      return;
    }
    if (!document.getElementById('protoNotifSheet')?.classList.contains('hidden')) {
      closeProtoNotifSheet();
      return;
    }
    if (!document.getElementById('createPostSheet')?.classList.contains('hidden')) {
      closeCreatePostSheet();
      return;
    }
    if (document.querySelector('.my-sarah-view.is-drawer-open')) closeMsDrawer();
  });
  window.sarahNavigate = setRoute;

  syncUserAvatars();
  syncNotificationBadge();

  if (!location.hash) location.hash = 'welcome';
  activateView();
}

function bootSarahApp() {
  try {
    if (!window.__sarahAppBooted) {
      window.__sarahAppBooted = true;
      init();
    }
    bindSarahLiveAuth();
    if (window.SarahLive?.isLiveEnabled?.()) {
      document.getElementById('authMockContinue')?.classList.add('hidden');
    } else {
      document.getElementById('authMockContinue')?.classList.remove('hidden');
    }
    updatePersonalSarahLiveUi();
  } finally {
    window.dismissAppBootSplash?.();
  }
}

window.addEventListener('sarah-live-ready', bootSarahApp);
window.addEventListener('sarah-live-skipped', bootSarahApp);
if (window.__sarahLiveBootSignaled && !window.__sarahAppBooted) bootSarahApp();
setTimeout(() => {
  if (!window.__sarahAppBooted) bootSarahApp();
  else bindSarahLiveAuth();
}, 1200);
