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
  MOCK_MY_SARAH_QUICK_EXTRA,
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

function businessListingAvatarFallback() {
  return MOCK_PROFILE?.avatarFallback || 'assets/discover/green-haven-fallback.svg';
}

function resolveItemAvatar(item) {
  if (!item) return businessListingAvatarFallback();
  if (item.sarahPersonal || item.isSarahPersonal) return SARAH_AVATAR_SRC;
  if (String(item.conversationKind || '').toLowerCase() === 'personal_sarah') return SARAH_AVATAR_SRC;
  if (item.avatar) return item.avatar;
  const map = COMPANY_AVATARS || {};
  if (item.avatarKey && map[item.avatarKey]) return map[item.avatarKey];
  const companyId = item.companyId || (item.company ? item.id : null) || item.id;
  if (companyId && (item.company || item.companyId || isBusinessChatRow(item))) {
    const co = discoverFind(companyId);
    if (co?.avatar) return co.avatar;
    if (co?.image) return co.image;
  }
  if (item.logoUrl) {
    const resolved = resolveListingMediaUrl(item.logoUrl);
    if (resolved) return resolved;
  }
  return businessListingAvatarFallback();
}

const FEED_ENGAGEMENT_STORAGE_KEY = 'sarah.feed.engagement.v2';

function loadPersistedFeedEngagement() {
  try {
    return JSON.parse(localStorage.getItem(FEED_ENGAGEMENT_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function persistFeedEngagement() {
  const eng = getFeedEngagement();
  try {
    localStorage.setItem(
      FEED_ENGAGEMENT_STORAGE_KEY,
      JSON.stringify({
        liked: eng.liked,
        likeBump: eng.likeBump,
        likeApiSent: eng.likeApiSent,
        saved: eng.saved,
        commentExtra: eng.commentExtra,
        commentLiked: eng.commentLiked,
        userComments: eng.userComments,
        commentReplies: eng.commentReplies,
      })
    );
  } catch {
    /* ignore */
  }
}

function getFeedEngagement() {
  const rt = getSarahRuntime();
  if (!rt.feedEngagement) {
    const saved = loadPersistedFeedEngagement();
    rt.feedEngagement = {
      liked: saved.liked || {},
      likeBump: saved.likeBump || {},
      likeApiSent: saved.likeApiSent || {},
      saved: saved.saved || {},
      commentExtra: saved.commentExtra || {},
      commentLiked: saved.commentLiked || {},
      userComments: saved.userComments || {},
      commentReplies: saved.commentReplies || {},
    };
  }
  return rt.feedEngagement;
}

function feedEngagementCounts(item) {
  const eng = getFeedEngagement();
  const id = item.id || '';
  const bump = Number(eng.likeBump?.[id]) || 0;
  const liked = Boolean(eng.liked[id]) || Boolean(item.viewerReacted);
  return {
    likes: Math.max(0, (Number(item.likes) || 0) + bump),
    comments: (Number(item.comments) || 0) + (Number(eng.commentExtra[id]) || 0),
    liked,
    saved: Boolean(eng.saved[id]),
  };
}

function updateLivePostReactions(postId, reactions) {
  if (!postId || liveStatusPosts == null) return;
  const next = Number(reactions);
  if (Number.isNaN(next)) return;
  liveStatusPosts = liveStatusPosts.map((p) => (p.id === postId ? { ...p, likes: next } : p));
  const eng = getFeedEngagement();
  eng.likeBump[postId] = 0;
  persistFeedEngagement();
}

function refreshFeedEngageSurfaces(postId = '') {
  if (postId) patchFeedCardEngage(postId);
}

let feedCommentTarget = { postId: '', replyToId: '' };

function openFeedCommentSheet(postId, replyToId = '') {
  if (!postId) return;
  feedCommentTarget = { postId, replyToId: replyToId || '' };
  const sheet = document.getElementById('feedCommentSheet');
  const input = document.getElementById('feedCommentInput');
  const title = document.getElementById('feedCommentTitle');
  if (!sheet || !input) return;
  syncUserAvatars();
  if (title) title.textContent = replyToId ? 'Write a reply' : 'Write a comment';
  input.value = '';
  input.removeAttribute('readonly');
  blurActiveInput();
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-feed-comment-open');
  if (!shouldDeferSheetAutofocus()) {
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }
}

function closeFeedCommentSheet() {
  const sheet = document.getElementById('feedCommentSheet');
  sheet?.classList.add('hidden');
  sheet?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-feed-comment-open');
  document.getElementById('feedCommentInput')?.blur();
  feedCommentTarget = { postId: '', replyToId: '' };
}

async function submitFeedCommentFromSheet() {
  const input = document.getElementById('feedCommentInput');
  const submit = document.getElementById('feedCommentSubmit');
  const text = input?.value.trim() || '';
  const { postId, replyToId } = feedCommentTarget;
  if (!text || !postId) return;
  if (submit) submit.disabled = true;
  const isLivePost = /^(stp_|csp_)/.test(postId);
  try {
    if (isLivePost && window.SarahLive?.createStatusFeedComment) {
      const res = await window.SarahLive.createStatusFeedComment(postId, {
        body: text,
        parentCommentId: replyToId || null,
      });
      if (res.error) {
        showProtoToast(window.SarahLive.formatSarahApiError?.(res.error) || 'Could not post comment');
        return;
      }
      const raw = res.data?.comment ?? res.data?.data?.comment;
      if (raw && liveStatusPosts) {
        const mapped = {
          id: raw.commentId,
          author: raw.authorName || 'Member',
          text: raw.body || text,
          avatarUrl: raw.authorPhotoUrl,
          parentId: raw.parentCommentId || null,
        };
        liveStatusPosts = liveStatusPosts.map((p) => {
          if (p.id !== postId) return p;
          const preview = [...(p.previewComments || []), mapped];
          return {
            ...p,
            comments: (Number(p.comments) || 0) + 1,
            previewComments: preview,
          };
        });
      }
      closeFeedCommentSheet();
      showProtoToast(replyToId ? 'Reply posted' : 'Comment posted');
      patchFeedCardEngage(postId);
      return;
    }
    const eng = getFeedEngagement();
    const author = consumerDisplayFirstName(window.SarahLive?.getConsumerProfile?.()) || MOCK_USER.name;
    const avatarUrl = getEffectiveUserAvatar();
    if (replyToId) {
      if (!eng.commentReplies[postId]) eng.commentReplies[postId] = [];
      eng.commentReplies[postId].push({
        id: `ur_${Date.now()}`,
        parentId: replyToId,
        author,
        text,
        avatarUrl,
      });
    } else {
      if (!eng.userComments[postId]) eng.userComments[postId] = [];
      eng.userComments[postId].push({
        id: `uc_${Date.now()}`,
        author,
        text,
        avatarUrl,
      });
    }
    eng.commentExtra[postId] = (Number(eng.commentExtra[postId]) || 0) + 1;
    persistFeedEngagement();
    closeFeedCommentSheet();
    showProtoToast(replyToId ? 'Reply posted' : 'Comment posted');
    patchFeedCardEngage(postId);
  } finally {
    if (submit) submit.disabled = false;
  }
}

/** Live Status posts from Company Portal (GET /api/network/v1/status-feed). */
let liveStatusPosts = null;
let liveStatusFeedPromise = null;
const statusFeedLive = { loading: false, loaded: false, error: '' };

function statusPostTimeLabel(iso) {
  if (!iso) return 'Just now';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'Recently';
  if (ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString();
}

function mapLivePreviewComments(preview) {
  return (preview || []).map((c) => ({
    id: c.commentId,
    author: c.authorName || 'Member',
    text: c.body || '',
    avatarUrl: c.authorPhotoUrl,
    parentId: c.parentCommentId || null,
  }));
}

function syncFeedEngagementFromApiPosts(rawPosts) {
  const eng = getFeedEngagement();
  for (const p of rawPosts || []) {
    const id = p.postId;
    if (!id) continue;
    if (p.viewerReacted) {
      eng.liked[id] = true;
      eng.likeApiSent = eng.likeApiSent || {};
      eng.likeApiSent[id] = true;
      eng.likeBump[id] = 0;
    }
  }
  persistFeedEngagement();
}

function mapLiveStatusPost(p) {
  const previewComments = mapLivePreviewComments(p.previewComments);
  const commentCount = Math.max(Number(p.commentCount) || 0, previewComments.length);
  const base = {
    viewerReacted: Boolean(p.viewerReacted),
    previewComments,
    likes: Number(p.reactions) || 0,
    comments: commentCount,
  };
  const isUser = p.publisherType === 'user' || String(p.postId || '').startsWith('csp_');
  if (isUser && !p.companyId) {
    return {
      ...base,
      id: p.postId,
      authorUid: p.authorUid || null,
      author: p.authorName || 'Member',
      authorType: 'user',
      body: p.body || '',
      image: p.imageUrl ? resolveApiMediaUrl(p.imageUrl) : null,
      video: p.videoUrl ? resolveApiMediaUrl(p.videoUrl) : null,
      avatar: p.authorPhotoUrl
        ? /^https?:\/\//i.test(String(p.authorPhotoUrl))
          ? String(p.authorPhotoUrl).trim()
          : resolveApiMediaUrl(p.authorPhotoUrl)
        : null,
      time: statusPostTimeLabel(p.publishedAt || p.createdAt),
      tab: 'for-you',
      sponsored: false,
      verified: false,
      liveStatus: true,
    };
  }
  return {
    ...base,
    id: p.postId,
    author: p.companyName || 'Business',
    authorType: 'company',
    body: p.body || '',
    image: p.imageUrl ? resolveListingMediaUrl(p.imageUrl) : null,
    video: p.videoUrl ? resolveApiMediaUrl(p.videoUrl) : null,
    avatar: p.logoUrl ? resolveListingMediaUrl(p.logoUrl) : null,
    time: statusPostTimeLabel(p.createdAt),
    tab: 'for-you',
    sponsored: Boolean(p.boosted),
    verified: true,
    liveStatus: true,
  };
}

function resetLiveStatusFeedCache() {
  liveStatusPosts = null;
  liveStatusFeedPromise = null;
  statusFeedLive.loading = false;
  statusFeedLive.loaded = false;
  statusFeedLive.error = '';
}

function statusFeedLiveMode() {
  return Boolean(window.SarahLive?.isLiveEnabled?.());
}

function statusFeedMockForTab(tabId) {
  const items = MOCK_FEED.filter((p) => {
    if (tabId === 'for-you') return p.tab === 'for-you';
    if (tabId === 'following') return p.tab === 'following';
    if (tabId === 'companies') return p.authorType === 'company';
    if (tabId === 'creators') return p.authorType === 'creator';
    if (tabId === 'videos') return Boolean(p.image || p.video);
    return true;
  });
  return items.length ? items : MOCK_FEED.filter((p) => p.tab === 'for-you');
}

function statusFeedEmptyMarkup({ error = '', loading = false, signedOut = false } = {}) {
  if (loading) {
    return '<p class="feed-empty-search">Loading your Status feed…</p>';
  }
  if (signedOut) {
    return '<p class="feed-empty-search">Sign in to see live posts from Sarah Network businesses and people you follow.</p>';
  }
  if (error) {
    return `<p class="feed-empty-search">Couldn't load Status: ${escapeHtml(error)}</p><button type="button" class="btn btn-secondary feed-retry-btn" data-status-feed-retry>Try again</button>`;
  }
  return `<p class="feed-empty-search">Nothing here yet. Tap <strong>Share an update on Status…</strong> to post your first update, or open <button type="button" class="link-inline" data-route-jump="discover">Discover</button> to follow businesses.</p>`;
}

function statusFeedHasSession() {
  return Boolean(window.SarahLive?.hasLiveSession?.() || window.SarahLive?.isSignedIn?.());
}

function ensureLiveStatusFeed() {
  return;
  if (!window.SarahLive?.isLiveEnabled?.() || !window.SarahLive?.fetchStatusFeed) return;
  if (liveStatusFeedPromise) return;
  if (!statusFeedHasSession()) {
    if (window.SarahLive?.isAuthReady?.() === false) {
      statusFeedLive.loading = true;
      return;
    }
    statusFeedLive.loading = false;
    statusFeedLive.loaded = false;
    statusFeedLive.error = '';
    return;
  }
  statusFeedLive.loading = true;
  statusFeedLive.error = '';
  if (parseLocationHash().route === 'status') renderHome();
  liveStatusFeedPromise = window.SarahLive.fetchStatusFeed({ limit: 40 })
    .then((res) => {
      statusFeedLive.loading = false;
      statusFeedLive.loaded = true;
      if (res.error) {
        statusFeedLive.error = res.error || 'Request failed';
        if (res.status === 401 || res.code === 'UNAUTHORIZED') {
          resetLiveStatusFeedCache();
        }
        liveStatusPosts = null;
        return;
      }
      const posts = res.data?.posts ?? res.data?.data?.posts ?? [];
      syncFeedEngagementFromApiPosts(posts);
      liveStatusPosts = posts.map(mapLiveStatusPost);
      statusFeedLive.error = '';
      const route = parseLocationHash().route;
      if (route === 'status' || route === 'home') renderHome();
      else if (route === 'profile') renderProfile(activeProfilePanel, activeProfileKind);
    })
    .finally(() => {
      liveStatusFeedPromise = null;
      statusFeedLive.loading = false;
    });
}

function feedEngageButton(iconKey, label, postId, kind, active) {
  const icon = SARAH_ICONS[iconKey] || '';
  const activeClass = active ? ' is-active' : '';
  const activeKind = kind === 'like' && active ? ' is-liked' : '';
  return `<button type="button" class="feed-engage-btn${activeClass}${activeKind}" data-feed-engage="${escapeHtml(kind)}" data-post-id="${escapeHtml(postId)}" aria-pressed="${active ? 'true' : 'false'}"><span class="feed-engage-icon" aria-hidden="true">${icon}</span><span class="feed-engage-label">${escapeHtml(label)}</span></button>`;
}

function findFeedItemById(postId) {
  const live = liveStatusPosts?.find((p) => p.id === postId);
  if (live) return live;
  const user = getUserCreatedPosts().find((p) => p.id === postId);
  if (user) return user;
  return MOCK_FEED.find((p) => p.id === postId) || null;
}

function patchFeedCardEngage(postId) {
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(postId) : postId.replace(/"/g, '\\"');
  const card = document.querySelector(`.feed-card[data-feed-post-id="${esc}"]`);
  const item = findFeedItemById(postId);
  if (!card || !item) {
    refreshFeedEngageSurfaces();
    return;
  }
  const counts = feedEngagementCounts(item);
  const stats = card.querySelector('.feed-stats');
  if (stats) stats.outerHTML = renderFeedStatsRow(counts);
  const footer = card.querySelector('.feed-engage');
  if (footer) {
    const likeLabel = counts.liked ? 'Liked' : 'Like';
    footer.innerHTML = `${feedEngageButton('iconHeart', likeLabel, postId, 'like', counts.liked)}${feedEngageButton('iconComment', 'Comment', postId, 'comment', false)}${feedEngageButton('iconShare', 'Share', postId, 'share', false)}`;
  }
  const commentsWrap = card.querySelector('.feed-comments');
  if (commentsWrap) commentsWrap.outerHTML = renderFeedCommentsSection(item, counts.comments, postId);
  wireFeedEngageButtons(card);
}

function shouldDeferSheetAutofocus() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function blurActiveInput() {
  const el = document.activeElement;
  if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    el.blur();
  }
}

function showProtoToast(message, { ms = 2800 } = {}) {
  const el = document.getElementById('protoToast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(showProtoToast._t);
  showProtoToast._t = setTimeout(() => el.classList.add('hidden'), Math.max(1500, ms));
}

function setCreatePostStatus(message) {
  const el = document.getElementById('createPostStatus');
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

function handleFeedEngageClick(btn) {
  const kind = btn.dataset.feedEngage;
  const postId = btn.dataset.postId;
  if (!kind || !postId) return;
  const eng = getFeedEngagement();
  if (kind === 'like') {
    const liveItem = liveStatusPosts?.find((p) => p.id === postId);
    const serverLiked = Boolean(liveItem?.viewerReacted);
    const wasLiked = Boolean(eng.liked[postId]) || serverLiked;
    if (wasLiked) {
      eng.liked[postId] = false;
      if (!serverLiked && !eng.likeApiSent?.[postId]) {
        eng.likeBump[postId] = (Number(eng.likeBump[postId]) || 0) - 1;
      } else {
        eng.likeBump[postId] = 0;
      }
      persistFeedEngagement();
      patchFeedCardEngage(postId);
      return;
    }
    if (eng.likeApiSent?.[postId] || serverLiked) {
      eng.liked[postId] = true;
      eng.likeBump[postId] = 0;
      persistFeedEngagement();
      patchFeedCardEngage(postId);
      return;
    }
    eng.liked[postId] = true;
    eng.likeBump[postId] = (Number(eng.likeBump[postId]) || 0) + 1;
    persistFeedEngagement();
    patchFeedCardEngage(postId);
    const isLivePost = /^(stp_|csp_)/.test(postId);
    if (isLivePost && window.SarahLive?.reactToStatusFeedPost && !eng.likeApiSent?.[postId]) {
      void window.SarahLive.reactToStatusFeedPost(postId).then((res) => {
        if (res?.error) {
          eng.liked[postId] = false;
          eng.likeBump[postId] = (Number(eng.likeBump[postId]) || 0) - 1;
          showProtoToast(window.SarahLive.formatSarahApiError?.(res.error) || 'Could not like this post');
        } else {
          eng.likeApiSent = eng.likeApiSent || {};
          eng.likeApiSent[postId] = true;
          const payload = res.data?.data ?? res.data;
          const reactions = payload?.reactions;
          if (reactions != null) updateLivePostReactions(postId, reactions);
          if (liveStatusPosts) {
            liveStatusPosts = liveStatusPosts.map((p) =>
              p.id === postId ? { ...p, viewerReacted: true, likes: reactions != null ? reactions : p.likes } : p
            );
          }
          if (payload?.alreadyReacted && reactions == null) {
            eng.likeApiSent[postId] = true;
          }
        }
        persistFeedEngagement();
        patchFeedCardEngage(postId);
      });
    }
    return;
  }
  if (kind === 'comment') {
    blurActiveInput();
    openFeedCommentSheet(postId);
    return;
  }
  if (kind === 'comment-like') {
    const commentId = btn.dataset.commentId;
    if (!commentId) return;
    const key = `${postId}:${commentId}`;
    eng.commentLiked[key] = !eng.commentLiked[key];
    persistFeedEngagement();
    patchFeedCardEngage(postId);
    return;
  }
  if (kind === 'comment-reply') {
    const parentId = btn.dataset.commentId;
    if (!parentId) return;
    openFeedCommentSheet(postId, parentId);
    return;
  }
  if (kind === 'share') {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://sarah.ziricai.com';
    const link = `${origin}/#home`;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(link).then(
        () => showProtoToast('Link copied'),
        () => showProtoToast('Ready to share')
      );
    } else {
      showProtoToast('Ready to share');
    }
    return;
  }
  if (kind === 'save') {
    eng.saved[postId] = !eng.saved[postId];
    persistFeedEngagement();
    showProtoToast(eng.saved[postId] ? 'Saved to your list' : 'Removed from saved');
    refreshFeedEngageSurfaces();
  }
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

function isCurrentFeedAuthor(author) {
  const a = String(author || '').trim();
  if (!a) return false;
  const prof = window.SarahLive?.getConsumerProfile?.();
  const names = new Set(
    [MOCK_USER.name, prof?.preferredName, prof?.firstName, prof?.fullName].filter(Boolean).map((n) => String(n).trim())
  );
  return names.has(a);
}

function feedCommentAvatarUrl(author, comment) {
  const explicit = comment?.avatarUrl || comment?.avatar;
  if (explicit) return prototypeAsset(explicit);
  if (isCurrentFeedAuthor(author)) return prototypeAsset(getEffectiveUserAvatar());
  const seed = encodeURIComponent(String(author || 'user').replace(/\s+/g, ''));
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
}

function feedCommentStableId(postId, c, index) {
  return String(c.id || `${postId}__${index}__${String(c.author || '').slice(0, 24)}`);
}

function feedCommentLikeCount(postId, commentId, seed = 0) {
  const eng = getFeedEngagement();
  const key = `${postId}:${commentId}`;
  return seed + (eng.commentLiked[key] ? 1 : 0);
}

function feedCommentIsLiked(postId, commentId) {
  return Boolean(getFeedEngagement().commentLiked[`${postId}:${commentId}`]);
}

function renderFeedCommentLine(c, postId, commentId, { isReply = false, likeSeed = 0 } = {}) {
  const author = c.author || 'Someone';
  const avatar = escapeHtml(feedCommentAvatarUrl(author, c));
  const liked = feedCommentIsLiked(postId, commentId);
  const likes = feedCommentLikeCount(postId, commentId, likeSeed);
  const likeLabel = likes > 0 ? `Like · ${likes}` : 'Like';
  return `<div class="feed-comment${isReply ? ' feed-comment--reply' : ''}" data-comment-id="${escapeHtml(commentId)}">
    <img class="avatar avatar-xs feed-comment-avatar" src="${avatar}" alt="" width="32" height="32" loading="lazy" />
    <div class="feed-comment-main">
      <div class="feed-comment-bubble">
        <div class="feed-comment-bubble-inner">
          <span class="feed-comment-author text-comment-user">${escapeHtml(author)}</span>
          <span class="feed-comment-text text-comment">${escapeHtml(c.text || c.body || '')}</span>
        </div>
      </div>
      <div class="feed-comment-actions text-action">
        <button type="button" class="feed-comment-action${liked ? ' is-active' : ''}" data-feed-engage="comment-like" data-post-id="${escapeHtml(postId)}" data-comment-id="${escapeHtml(commentId)}">${escapeHtml(likeLabel)}</button>
        <button type="button" class="feed-comment-action" data-feed-engage="comment-reply" data-post-id="${escapeHtml(postId)}" data-comment-id="${escapeHtml(commentId)}">Reply</button>
      </div>
    </div>
  </div>`;
}

function renderFeedCommentThread(postId, comments) {
  const eng = getFeedEngagement();
  const replies = eng.commentReplies[postId] || [];
  const byParent = new Map();
  replies.forEach((r) => {
    const pid = r.parentId || '';
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(r);
  });
  function renderWithReplies(c, commentId, opts) {
    let html = renderFeedCommentLine(c, postId, commentId, opts);
    const children = byParent.get(commentId) || [];
    children.forEach((r) => {
      html += renderFeedCommentLine(r, postId, r.id, { isReply: true });
    });
    return html;
  }
  return comments
    .map((c, i) => {
      const commentId = feedCommentStableId(postId, c, i);
      return renderWithReplies(c, commentId, { likeSeed: c.likes || 0 });
    })
    .join('');
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
  const avatarSrc = escapeHtml(prototypeAsset(getEffectiveUserAvatar()));
  return `<div class="feed-comment-compose">
    <img class="avatar avatar-xs feed-comment-compose-avatar" data-user-avatar src="${avatarSrc}" alt="" width="32" height="32" ${profileImgOnError(MOCK_PROFILE.avatarFallback || '')} />
    <button type="button" class="feed-comment-compose-field" data-feed-engage="comment" data-post-id="${escapeHtml(postId)}">Write a comment…</button>
  </div>`;
}

function renderFeedCommentsSection(item, totalComments, postId) {
  const eng = getFeedEngagement();
  const previews = [
    ...(Array.isArray(item.previewComments) ? item.previewComments : []),
    ...(eng.userComments[postId] || []),
  ];
  const hasComments = previews.length > 0 || totalComments > 0;
  if (!hasComments) {
    return `<div class="feed-comments">${renderFeedCommentCompose(postId)}</div>`;
  }
  const lines = renderFeedCommentThread(postId, previews.slice(0, 4));
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
  const mediaSrc = item.video || item.image;
  let media = '';
  if (item.video) {
    media = `<div class="feed-media feed-media--video"><video src="${escapeHtml(prototypeAsset(item.video))}" controls playsinline preload="metadata"></video></div>`;
  } else if (item.image) {
    media = `<div class="feed-media"><img src="${escapeHtml(prototypeAsset(item.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" ${profileImgOnError(item.imageFallback || '')} /></div>`;
  }
  const bodyBlock = item.body
    ? `<p class="feed-card-body text-post">${escapeHtml(item.body)}</p>`
    : mediaSrc && !item.body
      ? ''
      : `<p class="feed-card-body text-post">${escapeHtml(item.body || '')}</p>`;
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
        ${bodyBlock}
        ${media}
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
    const searchFeed = host.querySelector('.proto-search-feed');
    if (searchFeed) wireFeedEngageButtons(searchFeed);
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
      closeProtoSearchSheet();
      openChatFromList(btn.dataset.openThread || 'smilemore-demo', btn);
    });
  });
}

/**
 * Phase 2.0: in live mode the bell shows the server inbox (GET /api/network/v1/my-notifications — subscriber
 * announcements / reminders from organisations the user subscribed to). Fixtures only render when live mode is off.
 */
const liveNotifs = {
  items: [],
  unread: 0,
  loaded: false,
  loading: false,
  error: '',
  timer: null,
  /** @type {Set<string>} */
  knownIds: new Set(),
  sawInitialInbox: false,
};

function notifLiveActive() {
  return Boolean(window.SarahLive?.isLiveEnabled?.() && window.SarahLive?.fetchMyNotifications);
}

function formatNotifTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(t).toLocaleDateString();
}

async function attentionForSubscriberNotif(kind, { id, title, body, org }) {
  const prefs = { ...defaultSnaGlobalPrefs(), ...(loadSnaGlobalPrefs() || {}) };
  const mod = await import('./sna-reminders.mjs').catch(() => null);
  if (kind === 'reminder' && prefs.reminders !== false) {
    tryOsPushAlert(title, body);
    mod?.triggerServerReminderAlarm?.({ id, title, body });
    return;
  }
  if (kind === 'announcement' && prefs.announcements !== false) {
    tryOsPushAlert(title, body);
    mod?.triggerSchoolAttentionAlert?.({
      id,
      title,
      body,
      label: org ? `${org} — announcement` : 'School announcement',
    });
    return;
  }
  if (kind === 'notification' && prefs.orgNotifications !== false) {
    tryOsPushAlert(title, body);
  }
}

function scanNewLiveNotifications(items) {
  if (!Array.isArray(items) || !items.length) return;
  const known = liveNotifs.knownIds || new Set();
  const announce = liveNotifs.sawInitialInbox;
  for (const n of items) {
    const id = String(n.notificationId || '');
    if (!id || known.has(id)) continue;
    known.add(id);
    if (!announce || n.read) continue;
    const row = mapLiveNotifToRow(n);
    void attentionForSubscriberNotif(row.kind, {
      id: row.id,
      title: row.title,
      body: row.body,
      org: row.org,
    });
  }
  liveNotifs.knownIds = known;
  liveNotifs.sawInitialInbox = true;
}

async function refreshLiveNotifications() {
  if (!notifLiveActive() || liveNotifs.loading) return;
  liveNotifs.loading = true;
  const res = await window.SarahLive.fetchMyNotifications(30);
  liveNotifs.loading = false;
  liveNotifs.loaded = true;
  if (res.error) {
    liveNotifs.error = res.error;
    liveNotifs.items = [];
    liveNotifs.unread = 0;
  } else {
    liveNotifs.error = '';
    liveNotifs.items = res.notifications || [];
    liveNotifs.unread = Number(res.unread) || 0;
    scanNewLiveNotifications(liveNotifs.items);
  }
  syncNotificationBadge();
  if (!document.getElementById('protoNotifSheet')?.classList.contains('hidden')) renderProtoNotifications();
  if (isMyNotificationsOpen()) renderMyNotificationsPanel();
}

function startLiveNotificationPolling() {
  if (liveNotifs.timer || !notifLiveActive()) return;
  void refreshLiveNotifications();
  liveNotifs.timer = setInterval(() => {
    if (!document.hidden) void refreshLiveNotifications();
  }, 30000);
}

/** Phase 2.1/2.2 — FCM token when available; else stable web_* token for server fan-out. */
async function maybeRegisterWebPush() {
  if (!window.SarahLive?.registerPushDevice || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  let token = localStorage.getItem('sarah.pushDeviceToken') || '';
  if (!token || token.startsWith('web_')) {
    try {
      const { obtainFcmWebToken } = await import('./push-fcm.mjs');
      const fcm = await obtainFcmWebToken();
      if (fcm) token = fcm;
    } catch (err) {
      console.warn('[Sarah] FCM token skipped', err?.message || err);
    }
  }
  if (!token) {
    token = `web_${crypto.randomUUID?.() || String(Date.now())}_${Math.random().toString(36).slice(2, 10)}`;
  }
  const res = await window.SarahLive.registerPushDevice({ token, consent: true, platform: 'web' });
  if (!res?.error) localStorage.setItem('sarah.pushDeviceToken', token);
  bindPushDeliveryChannels();
}

function unreadNotificationCount() {
  const extrasUnread = loadSnaInboxExtras().filter((n) => n.unread).length;
  if (notifLiveActive()) return Number(liveNotifs.unread || 0) + extrasUnread;
  return collectInboxNotifications().filter((n) => n.unread).length;
}

function syncNotificationBadge() {
  const count = unreadNotificationCount();
  const drawerBadge = document.getElementById('msNotifBadge');
  if (drawerBadge) {
    drawerBadge.textContent = count > 99 ? '99+' : String(count);
    drawerBadge.classList.toggle('hidden', count <= 0);
    document.querySelector('.ms-drawer-link--notif')?.classList.toggle('has-unread', count > 0);
  }
  const homeBadge = document.getElementById('homeNotifBadge');
  const homeBtn = document.getElementById('homeNotifBtn');
  if (homeBadge) {
    homeBadge.textContent = count > 99 ? '99+' : String(count);
    homeBadge.classList.toggle('hidden', count <= 0);
    homeBadge.setAttribute('aria-hidden', count <= 0 ? 'true' : 'false');
  }
  if (homeBtn) {
    homeBtn.classList.toggle('has-unread', count > 0);
    homeBtn.setAttribute('aria-label', count > 0 ? `Notifications, ${count} unread` : 'Notifications');
  }
  const legacyBadge = document.getElementById('statusNotifBadge');
  if (legacyBadge) {
    legacyBadge.textContent = count > 99 ? '99+' : String(count);
    legacyBadge.hidden = count <= 0;
  }
  if (notifLiveActive()) {
    startLiveNotificationPolling();
    void maybeRegisterWebPush();
  }
}

function bindPushDeliveryChannels() {
  if (window.__sarahPushChannelsBound) return;
  window.__sarahPushChannelsBound = true;
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event?.data?.type === 'sarah-push') handlePushPayload(event.data.payload || {});
  });
  import('./push-fcm.mjs')
    .then((m) => m.bindFcmForegroundMessages((payload) => handlePushPayload(payload)))
    .catch(() => {});
}

function openMyNotifications() {
  setMySarahPanel('notifications');
}

function openProtoNotifSheet() {
  openMyNotifications();
}

function isMyNotificationsOpen() {
  return document.querySelector('.my-sarah-view')?.dataset.msPanel === 'notifications';
}

const SNA_INBOX_EXTRA_KEY = 'sarah.sna.inboxExtra.v1';
const SNA_PUSH_STAR_KEY = 'sarah.sna.pushStarred.v1';
const WORK_USAGE_KEY = 'sarah.swp.workUsageDay.v1';
let snaActiveTab = 'all';
const workQuotaState = {
  used: 0,
  limit: 0,
  dayKey: '',
  loaded: false,
  availableCredits: null,
  periodScoped: false,
  enforcementMode: 'shadow',
};
const WORK_ESTIMATE_TTL_MS = 45_000;
/** @type {Map<string, { at: number, plan: object }>} */
const workEstimateByThread = new Map();
let sarahUsageSurfaceFilter = 'all';
/** @type {Map<string, string>} */
const workWsTabByThread = new Map();
const WORK_WS_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'files', label: 'Files' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
];
const WORK_ASSIGNMENT_STATUS_LABEL = {
  draft: 'Draft',
  running: 'In progress',
  paused: 'Paused',
  completed: 'Complete',
  cancelled: 'Cancelled',
};

function loadSnaInboxExtras() {
  try {
    const raw = localStorage.getItem(SNA_INBOX_EXTRA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSnaInboxExtras(rows) {
  try {
    localStorage.setItem(SNA_INBOX_EXTRA_KEY, JSON.stringify(rows.slice(0, 200)));
  } catch {
    /* ignore */
  }
}

function classifyLiveNotif(n) {
  const ch = String(n.channel || '').toLowerCase();
  const type = String(n.type || '').toLowerCase();
  if (ch === 'announcements' || type.includes('announcement')) return 'announcement';
  if (type.includes('work') || ch === 'sarah_work') return 'work';
  if (type.includes('reminder') || ch === 'reminders' || ch === 'sarah_reminders') return 'reminder';
  if (type.includes('usage') || ch === 'sarah_usage' || type === 'usage_alert') return 'usage';
  return 'notification';
}

function loadPushStarredIds() {
  try {
    const raw = localStorage.getItem(SNA_PUSH_STAR_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function markPushStarred(id) {
  if (!id) return;
  const ids = loadPushStarredIds();
  const next = [String(id), ...ids.filter((x) => x !== String(id))].slice(0, 200);
  try {
    localStorage.setItem(SNA_PUSH_STAR_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function isPushStarred(id) {
  return loadPushStarredIds().includes(String(id));
}

function handlePushPayload(payload = {}) {
  const data = payload.data || {};
  const title = payload.notification?.title || data.title || 'Sarah';
  const body = payload.notification?.body || data.body || '';
  const id = data.notificationId || data.reminderId || data.id || `push-${Date.now()}`;
  markPushStarred(id);
  const rawType = String(data.type || data.pushType || '').toLowerCase();
  const channel = String(data.channel || '').toLowerCase();
  const deepLink = String(data.deepLink || '').toLowerCase();
  if (deepLink.startsWith('news') && typeof globalThis.setRoute === 'function') {
    globalThis.setRoute('news');
  }
  const kind =
    rawType === 'sarah_reminder' || rawType === 'reminders' || rawType.includes('reminder') || channel === 'reminders'
      ? 'reminder'
      : rawType.includes('announcement') || channel === 'announcements'
        ? 'announcement'
        : rawType === 'sarah_usage' || rawType.includes('usage')
          ? 'usage'
          : 'notification';
  const prefs = { ...defaultSnaGlobalPrefs(), ...(loadSnaGlobalPrefs() || {}) };
  const org = data.orgName || data.organisationName || '';
  if (kind === 'reminder' && prefs.reminders !== false) {
    void attentionForSubscriberNotif('reminder', { id, title, body: body || title, org });
  } else if (kind === 'announcement' && prefs.announcements !== false) {
    void attentionForSubscriberNotif('announcement', { id, title, body: body || title, org });
  } else if (kind === 'usage' && prefs.usageAlerts !== false) {
    tryOsPushAlert(title, body);
  } else if (kind === 'notification' && prefs.orgNotifications !== false) {
    tryOsPushAlert(title, body);
  }
  const extras = loadSnaInboxExtras();
  extras.unshift({
    id: String(id),
    kind,
    org: data.orgName || data.organisationName || (kind === 'reminder' ? 'Sarah Reminders' : 'Sarah Network'),
    title: title || (kind === 'reminder' ? 'Reminder' : 'Notification'),
    body,
    createdAt: Date.now(),
    time: 'Just now',
    unread: true,
    viaPush: true,
  });
  saveSnaInboxExtras(extras);
  void refreshLiveNotifications();
  syncNotificationBadge();
  if (isMyNotificationsOpen()) renderMyNotificationsPanel();
}

function mapLiveNotifToRow(n) {
  const org = n.organisation?.displayName || 'Organisation';
  const kind = classifyLiveNotif(n);
  const id = n.notificationId;
  const logoUrl =
    n.organisation?.logoUrl || n.organisation?.avatarUrl || n.organisation?.imageUrl || null;
  return {
    id,
    kind,
    org,
    logoUrl,
    title: n.title || 'Update',
    body: n.body || '',
    createdAt: Date.parse(n.createdAt) || Date.now(),
    time: formatNotifTime(n.createdAt),
    unread: !n.read,
    live: true,
    viaPush: isPushStarred(id),
    actionLabel:
      kind === 'work'
        ? 'View report'
        : kind === 'reminder'
          ? 'Open reminder'
          : kind === 'usage'
            ? 'View plan'
            : 'View details',
    threadId: n.workSessionId || null,
  };
}

function mapMockNotifToRow(n) {
  const rt = getSarahRuntime();
  const dismissed = rt.notifDismissed || {};
  return {
    ...n,
    unread: Boolean(n.unread && !dismissed[n.id]),
    createdAt: n.createdAt || Date.now(),
    time: n.time || formatNotifTime(n.createdAt),
  };
}

function collectInboxNotifications() {
  const extras = loadSnaInboxExtras();
  if (notifLiveActive() && liveNotifs.items.length) {
    return [...liveNotifs.items.map(mapLiveNotifToRow), ...extras];
  }
  return [...(MOCK_NOTIFICATIONS || []).map(mapMockNotifToRow), ...extras];
}

function snaGroupLabel(ts) {
  const age = Date.now() - ts;
  if (age < 86400000) return 'Today';
  if (age < 7 * 86400000) return 'Last 7 days';
  return 'Last 30 days';
}

function filterInboxRows(rows, tab) {
  if (tab === 'unread') return rows.filter((r) => r.unread);
  if (tab === 'notifications')
    return rows.filter((r) => r.kind === 'notification' || r.kind === 'usage' || r.kind === 'announcement');
  if (tab === 'reminders') return rows.filter((r) => r.kind === 'reminder');
  if (tab === 'organisations') return rows.filter((r) => r.kind === 'notification' || r.kind === 'announcement');
  if (tab === 'work') return rows.filter((r) => r.kind === 'work');
  return rows;
}

function rowKindBadge(n) {
  if (n.kind === 'announcement') return '<span class="sna-row-badge">Announcement</span>';
  if (n.kind === 'work') return '<span class="sna-row-badge">Sarah Work</span>';
  if (n.kind === 'reminder') return '<span class="sna-row-badge sna-row-badge--reminder">Reminder</span>';
  if (n.kind === 'usage') return '<span class="sna-row-badge">Plan usage</span>';
  if (n.kind === 'notification') {
    const highlight = n.viaPush || isPushStarred(n.id) ? ' sna-row-badge--star-pulse' : '';
    return `<span class="sna-row-badge sna-row-badge--star${highlight}" title="Notification">★ Notification</span>`;
  }
  return '';
}

function inboxOrgInitial(org) {
  const t = String(org || '?').trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

function inboxUsesSarahAvatar(n) {
  const kind = String(n?.kind || '');
  if (kind === 'work' || kind === 'reminder' || kind === 'usage') return true;
  const org = String(n?.org || '').toLowerCase();
  if (/personal sarah|^sarah\b|sarah work|sarah reminders|sarah news/i.test(org)) return true;
  return false;
}

function inboxRowAvatarHtml(n) {
  if (inboxUsesSarahAvatar(n)) {
    return `<img class="sna-row-avatar sna-row-avatar--img sarah-brand-img" src="${escapeHtml(
      prototypeAsset(SARAH_AVATAR_SRC)
    )}" alt="" width="40" height="40" decoding="async" />`;
  }
  const logo = n.logoUrl || n.thumb;
  if (logo) {
    return `<img class="sna-row-avatar sna-row-avatar--img" src="${escapeHtml(
      prototypeAsset(resolveListingMediaUrl(logo))
    )}" alt="" width="40" height="40" ${profileImgOnError(MOCK_PROFILE.avatarFallback)} />`;
  }
  return `<span class="sna-row-avatar" aria-hidden="true">${escapeHtml(inboxOrgInitial(n.org))}</span>`;
}

function renderMyNotificationsPanel() {
  const host = document.getElementById('snaNotifList');
  if (!host) return;
  if (notifLiveActive() && !liveNotifs.loaded && !liveNotifs.loading) void refreshLiveNotifications();
  const rows = filterInboxRows(
    collectInboxNotifications().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    snaActiveTab
  );
  if (notifLiveActive() && liveNotifs.error) {
    host.innerHTML = `<p class="proto-search-empty">${escapeHtml(
      /sign/i.test(liveNotifs.error) ? 'Sign in to see notifications from businesses you subscribe to.' : 'Notifications are unavailable right now.'
    )}</p>`;
    return;
  }
  if (!rows.length) {
    host.innerHTML = `<p class="proto-search-empty">No notifications in this view yet.</p>`;
    return;
  }
  let lastGroup = '';
  host.innerHTML = rows
    .map((n) => {
      const group = snaGroupLabel(n.createdAt || Date.now());
      const groupHtml = group !== lastGroup ? `<h3 class="sna-group-label">${escapeHtml(group)}</h3>` : '';
      lastGroup = group;
      const badge = rowKindBadge(n);
      return `${groupHtml}
    <button type="button" class="sna-row ${n.unread ? 'is-unread' : ''}" data-sna-id="${escapeHtml(n.id)}" data-sna-kind="${escapeHtml(n.kind)}">
      ${inboxRowAvatarHtml(n)}
      <span class="sna-row-body">
        <span class="sna-row-org">${escapeHtml(n.org || '')}</span>
        <span class="sna-row-title">${escapeHtml(n.title || '')}</span>
        <span class="sna-row-preview">${escapeHtml(n.body || '')}</span>
        ${badge}
      </span>
      <span class="sna-row-meta">${escapeHtml(n.time || '')}</span>
    </button>`;
    })
    .join('');
  host.querySelectorAll('[data-sna-id]').forEach((btn) => {
    btn.addEventListener('click', () => void openInboxNotification(btn.dataset.snaId, btn.dataset.snaKind));
  });
}

let snaDetailRow = null;

function hideNotificationDetail() {
  snaDetailRow = null;
  document.getElementById('snaNotifDetail')?.classList.add('hidden');
  document.getElementById('snaNotifBrowse')?.classList.remove('hidden');
}

function showNotificationDetail(row) {
  if (!row) return;
  snaDetailRow = row;
  document.getElementById('snaNotifBrowse')?.classList.add('hidden');
  const detail = document.getElementById('snaNotifDetail');
  detail?.classList.remove('hidden');
  const orgEl = document.getElementById('snaDetailOrg');
  const titleEl = document.getElementById('snaDetailTitle');
  const timeEl = document.getElementById('snaDetailTime');
  const bodyEl = document.getElementById('snaDetailBody');
  const actionBtn = document.getElementById('snaDetailAction');
  if (orgEl) orgEl.textContent = row.org || '';
  if (titleEl) titleEl.textContent = row.title || 'Notification';
  if (timeEl) timeEl.textContent = row.time || '';
  if (bodyEl) {
    const report = Array.isArray(row.reportLines) ? row.reportLines.map((l) => `• ${l}`).join('\n') : '';
    bodyEl.textContent = [row.body || '', report].filter(Boolean).join('\n\n');
  }
  if (actionBtn) {
    const isWork = row.kind === 'work';
    const label = isWork ? 'View completed work' : row.actionLabel || 'Open';
    actionBtn.textContent = label;
    actionBtn.classList.toggle('hidden', false);
    actionBtn.onclick = async () => {
      if (isWork) {
        const sessionId = row.threadId || row.workSessionId;
        if (sessionId) await openWorkReport(sessionId);
        return;
      }
      if (row.kind === 'usage') {
        closeMsDrawer();
        setRoute('home');
        setMySarahPanel('billing');
        hideNotificationDetail();
        return;
      }
      if (row.id === 'n1') {
        getSarahRuntime().activeThreadId = 'smilemore-demo';
        setRoute('chat-thread');
      } else if (row.id === 'n2') {
        if (consumerChatLiveActive()) showProtoToast('That business is not on Sarah Network yet.');
        else {
          getSarahRuntime().activeThreadId = 'central-motors';
          setRoute('chat-thread');
        }
      } else {
        showProtoToast(`${label} (prototype)`);
      }
    };
  }
}

async function openWorkReport(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return;
  const sheet = document.getElementById('workReportSheet');
  const bodyEl = document.getElementById('workReportBody');
  if (personalSarahLiveActive() && window.SarahLive?.fetchPersonalWorkReport) {
    const res = await window.SarahLive.fetchPersonalWorkReport(id);
    if (res.error) {
      if (res.code === 'WORK_REPORT_PENDING') showProtoToast('Sarah is still working on this report…');
      else showProtoToast(res.error);
      await openPersonalSarahThread(id);
      return;
    }
    let body = res.report?.markdown || res.report?.summary || 'Report ready.';
    const b = res.report?.budget;
    if (b && typeof b === 'object') {
      const est =
        b.estimateMin != null && b.estimateMax != null
          ? `${formatSarahCredits(b.estimateMin)}–${formatSarahCredits(b.estimateMax)}`
          : '—';
      const cap = b.capCredits != null ? formatSarahCredits(b.capCredits) : '—';
      const used = formatSarahCredits(b.actualCredits ?? b.usedCredits ?? 0);
      body += `\n\n---\n**Credits ·** estimate ${est} · fair-share cap ${cap} · used ${used}`;
    }
    if (bodyEl) bodyEl.textContent = body;
    sheet?.classList.remove('hidden');
    sheet?.setAttribute('aria-hidden', 'false');
    return;
  }
  await openPersonalSarahThread(id);
  showProtoToast('Work report (prototype) — open the thread for details.');
}

async function openInboxNotification(id, kind) {
  const rt = getSarahRuntime();
  if (!rt.notifDismissed) rt.notifDismissed = {};
  rt.notifDismissed[id] = true;
  const row =
    collectInboxNotifications().find((n) => n.id === id) || loadSnaInboxExtras().find((n) => n.id === id);
  if (row?.live && window.SarahLive?.markNotificationsRead) {
    const res = await window.SarahLive.markNotificationsRead({ ids: [id] });
    const item = liveNotifs.items.find((n) => n.notificationId === id);
    if (item) item.read = true;
    if (!res?.error && typeof res.unread === 'number') liveNotifs.unread = res.unread;
  }
  syncNotificationBadge();
  if (row) {
    if (row.live && kind === 'work') {
      const liveRow = liveNotifs.items.find((n) => n.notificationId === id);
      row.workSessionId = row.threadId || liveRow?.workSessionId;
    }
    showNotificationDetail(row);
    return;
  }
  renderMyNotificationsPanel();
}

function bindMyNotificationsUi() {
  if (window.__snaUiBound) return;
  window.__snaUiBound = true;
  document.getElementById('snaDetailBack')?.addEventListener('click', () => {
    hideNotificationDetail();
    renderMyNotificationsPanel();
  });
  document.querySelectorAll('[data-sna-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      snaActiveTab = btn.dataset.snaTab || 'all';
      document.querySelectorAll('[data-sna-tab]').forEach((tab) => {
        const active = tab.dataset.snaTab === snaActiveTab;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderMyNotificationsPanel();
    });
  });
}

const SNA_PREFS_KEY = 'sarah.sna.globalPrefs.v1';

function loadSnaGlobalPrefs() {
  try {
    const raw = localStorage.getItem(SNA_PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSnaGlobalPrefs(prefs) {
  try {
    localStorage.setItem(SNA_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  void syncSnaPrefsToServer(prefs);
}

async function syncSnaPrefsToServer(prefs) {
  if (!personalSarahLiveActive() || !window.SarahLive?.updateMyNotificationPreferences) return;
  const p = prefs || { ...defaultSnaGlobalPrefs(), ...(loadSnaGlobalPrefs() || {}) };
  try {
    await window.SarahLive.updateMyNotificationPreferences({
      orgNotifications: p.orgNotifications !== false,
      announcements: p.announcements !== false,
      workCompletions: p.workCompletions !== false,
      reminders: p.reminders !== false,
      usageAlerts: p.usageAlerts !== false,
      quietHours: Boolean(p.quietHours),
      timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
    });
  } catch {
    /* offline — local prefs still apply for tryOsPushAlert */
  }
}

async function pullSnaPrefsFromServer() {
  if (!personalSarahLiveActive() || !window.SarahLive?.fetchMyNotificationPreferences) return;
  try {
    const res = await window.SarahLive.fetchMyNotificationPreferences();
    if (res.error || !res.prefs) return;
    const merged = { ...defaultSnaGlobalPrefs(), ...res.prefs };
    try {
      localStorage.setItem(SNA_PREFS_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
    syncSnaPrefsForm();
  } catch {
    /* ignore */
  }
}

function defaultSnaGlobalPrefs() {
  return {
    orgNotifications: true,
    announcements: true,
    workCompletions: true,
    reminders: true,
    usageAlerts: true,
    quietHours: false,
  };
}

function syncSnaPrefsForm() {
  const p = { ...defaultSnaGlobalPrefs(), ...(loadSnaGlobalPrefs() || {}) };
  document.getElementById('snaPrefOrgNotif') && (document.getElementById('snaPrefOrgNotif').checked = p.orgNotifications !== false);
  document.getElementById('snaPrefAnnounce') && (document.getElementById('snaPrefAnnounce').checked = p.announcements !== false);
  document.getElementById('snaPrefWork') && (document.getElementById('snaPrefWork').checked = p.workCompletions !== false);
  document.getElementById('snaPrefReminders') && (document.getElementById('snaPrefReminders').checked = p.reminders !== false);
  document.getElementById('snaPrefUsage') && (document.getElementById('snaPrefUsage').checked = p.usageAlerts !== false);
  document.getElementById('snaPrefQuiet') && (document.getElementById('snaPrefQuiet').checked = Boolean(p.quietHours));
  const status = document.getElementById('snaPushStatus');
  if (status && 'Notification' in window) {
    status.textContent =
      Notification.permission === 'granted'
        ? 'Push is enabled on this device.'
        : Notification.permission === 'denied'
          ? 'Push is blocked in browser settings.'
          : 'Push is not enabled yet.';
  }
}

function readSnaPrefsForm() {
  return {
    orgNotifications: Boolean(document.getElementById('snaPrefOrgNotif')?.checked),
    announcements: Boolean(document.getElementById('snaPrefAnnounce')?.checked),
    workCompletions: Boolean(document.getElementById('snaPrefWork')?.checked),
    reminders: Boolean(document.getElementById('snaPrefReminders')?.checked),
    usageAlerts: Boolean(document.getElementById('snaPrefUsage')?.checked),
    quietHours: Boolean(document.getElementById('snaPrefQuiet')?.checked),
  };
}

function openSnaPrefsSheet() {
  const sheet = document.getElementById('snaPrefsSheet');
  sheet?.classList.remove('hidden');
  sheet?.setAttribute('aria-hidden', 'false');
  syncSnaPrefsForm();
}

function closeSnaPrefsSheet() {
  document.getElementById('snaPrefsSheet')?.classList.add('hidden');
  document.getElementById('snaPrefsSheet')?.setAttribute('aria-hidden', 'true');
}

function bindSnaPrefsUi() {
  if (window.__snaPrefsBound) return;
  window.__snaPrefsBound = true;
  document.querySelectorAll('[data-proto-sheet-close="sna-prefs"]').forEach((el) => {
    el.addEventListener('click', () => {
      saveSnaGlobalPrefs(readSnaPrefsForm());
      closeSnaPrefsSheet();
    });
  });
  ['snaPrefOrgNotif', 'snaPrefAnnounce', 'snaPrefWork', 'snaPrefReminders', 'snaPrefUsage', 'snaPrefQuiet'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => saveSnaGlobalPrefs(readSnaPrefsForm()));
  });
  document.getElementById('snaEnablePushBtn')?.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      showProtoToast('This browser does not support notifications.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') await maybeRegisterWebPush();
      syncSnaPrefsForm();
      showProtoToast(perm === 'granted' ? 'Push enabled for this device.' : 'Push permission not granted.');
    } catch {
      showProtoToast('Could not request push permission.');
    }
  });
}

async function tryOsPushAlert(title, body) {
  const prefs = { ...defaultSnaGlobalPrefs(), ...(loadSnaGlobalPrefs() || {}) };
  if (prefs.quietHours) {
    const h = new Date().getHours();
    if (h >= 22 || h < 7) return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const payload = { body, tag: `sarah-${Date.now()}`, icon: '/assets/sarah-avatar.svg', badge: '/assets/sarah-avatar.svg' };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.showNotification) {
        await reg.showNotification(title, payload);
        return;
      }
    }
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, payload);
  } catch {
    /* ignore */
  }
}

function appendSarahWorkInboxNotification({ threadId, taskTitle, reportLines }) {
  const id = `work-${threadId}-${Date.now()}`;
  const body = `Sarah completed: ${taskTitle}`;
  const row = {
    id,
    kind: 'work',
    org: 'Sarah Work',
    title: 'Task completed',
    body,
    createdAt: Date.now(),
    time: 'Just now',
    unread: true,
    threadId,
    reportLines: reportLines || [],
  };
  const extras = loadSnaInboxExtras();
  extras.unshift(row);
  saveSnaInboxExtras(extras);
  syncNotificationBadge();
  if (isMyNotificationsOpen()) renderMyNotificationsPanel();
  const prefs = { ...defaultSnaGlobalPrefs(), ...(loadSnaGlobalPrefs() || {}) };
  if (prefs.workCompletions !== false) tryOsPushAlert('Sarah Work', body);
}

function renderLiveNotifications(host) {
  if (liveNotifs.error) {
    host.innerHTML = `<p class="proto-search-empty">${escapeHtml(
      /sign/i.test(liveNotifs.error) ? 'Sign in to see notifications from businesses you subscribe to.' : 'Notifications are unavailable right now.'
    )}</p>`;
    return;
  }
  if (!liveNotifs.items.length) {
    host.innerHTML = `<p class="proto-search-empty">${liveNotifs.loaded ? 'No notifications yet. Subscribe to a business to receive its updates.' : 'Loading…'}</p>`;
    return;
  }
  host.innerHTML = liveNotifs.items
    .map(
      (n) => `
    <button type="button" class="proto-notif-item ${n.read ? '' : 'is-unread'}" data-live-notif-id="${escapeHtml(n.notificationId)}">
      <span class="proto-notif-title">${escapeHtml(n.title)}${n.organisation?.displayName ? ` · ${escapeHtml(n.organisation.displayName)}` : ''}</span>
      <span class="proto-notif-body">${escapeHtml(n.body || '')}</span>
      <span class="proto-notif-time">${escapeHtml(formatNotifTime(n.createdAt))}</span>
    </button>`
    )
    .join('');
  host.querySelectorAll('[data-live-notif-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.liveNotifId;
      const item = liveNotifs.items.find((n) => n.notificationId === id);
      if (!item || item.read) return;
      item.read = true;
      liveNotifs.unread = Math.max(0, liveNotifs.unread - 1);
      btn.classList.remove('is-unread');
      syncNotificationBadge();
      const res = await window.SarahLive.markNotificationsRead({ ids: [id] });
      if (!res.error && typeof res.unread === 'number') {
        liveNotifs.unread = res.unread;
        syncNotificationBadge();
      }
    });
  });
}

function closeProtoNotifSheet() {
  document.getElementById('protoNotifSheet')?.classList.add('hidden');
  document.getElementById('protoNotifSheet')?.setAttribute('aria-hidden', 'true');
}

function renderProtoNotifications() {
  const host = document.getElementById('protoNotifList');
  if (!host) return;
  if (notifLiveActive()) {
    renderLiveNotifications(host);
    return;
  }
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
        // SNET-08: `central-motors` is a prototype fixture id, not a tenant. In live mode fail closed (no fake chat).
        if (consumerChatLiveActive()) {
          showProtoToast('That business is not on Sarah Network yet.');
          return;
        }
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
  bindThreadComposeMedia();

  document.getElementById('homeNotifBtn')?.addEventListener('click', () => {
    void refreshLiveNotifications();
    openMyNotifications();
  });
  document.getElementById('protoSearchInput')?.addEventListener('input', (e) => {
    renderProtoSearchResults(e.target.value.trim().toLowerCase());
  });

  bindChatsPanelTabsOnce();

  const chatsTabSearchEl = document.getElementById('chatsTabSearchInput');
  chatsTabSearchEl?.addEventListener('input', () => {
    if (chatsTabSearchDebounceTimer) clearTimeout(chatsTabSearchDebounceTimer);
    chatsTabSearchDebounceTimer = setTimeout(() => void renderChatsList(), 200);
  });
  chatsTabSearchEl?.addEventListener('search', () => {
    if (chatsTabSearchDebounceTimer) clearTimeout(chatsTabSearchDebounceTimer);
    void renderChatsList();
  });

  const discoverSearchEl = document.getElementById('discoverSearchInput');
  const applyDiscoverSearch = (raw) => {
    discoverSearchRaw = String(raw || '').trim();
    const split = splitDiscoverSearchInput(discoverSearchRaw);
    discoverSearchQuery = split.q;
    discoverPlaceQuery = split.place;
    renderDiscover();
  };
  discoverSearchEl?.addEventListener('input', (e) => {
    const next = (e.target.value || '').trim();
    if (discoverSearchDebounceTimer) clearTimeout(discoverSearchDebounceTimer);
    discoverSearchDebounceTimer = setTimeout(() => applyDiscoverSearch(next), 220);
  });
  discoverSearchEl?.addEventListener('search', (e) => {
    if (discoverSearchDebounceTimer) clearTimeout(discoverSearchDebounceTimer);
    applyDiscoverSearch(e.target.value);
  });

  bindDiscoverCatsOnce();

  document.querySelectorAll('[data-proto-sheet-close]').forEach((el) => {
    el.addEventListener('click', () => {
      const which = el.getAttribute('data-proto-sheet-close');
      if (which === 'search') closeProtoSearchSheet();
      if (which === 'notif') closeProtoNotifSheet();
      if (which === 'work-report') {
        document.getElementById('workReportSheet')?.classList.add('hidden');
        document.getElementById('workReportSheet')?.setAttribute('aria-hidden', 'true');
      }
    });
  });

}

/** Direct button listeners (pre-PWA / TWA behaviour — each tap hits its own control). */
function wireFeedEngageButtons(root) {
  if (!root) return;
  root.querySelectorAll('[data-feed-engage]').forEach((btn) => {
    if (btn.dataset.engageWired === '1') return;
    btn.dataset.engageWired = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        handleFeedEngageClick(btn);
      } catch (err) {
        console.warn('[Status] engage', err);
        showProtoToast('Could not complete that action. Try again.', { ms: 4000 });
      }
    });
  });
}

function bindAppPrimaryTap(el, handler) {
  if (!el || el.dataset.tapBound === '1') return;
  el.dataset.tapBound = '1';
  let lastAt = 0;
  const run = (e) => {
    const now = Date.now();
    if (now - lastAt < 350) return;
    lastAt = now;
    if (e.type === 'touchend') e.preventDefault();
    handler(e);
  };
  el.addEventListener('click', run);
  el.addEventListener('touchend', run, { passive: false });
}

/** Immediate visual feedback while navigation or network work is queued. */
function markControlTapPending(el) {
  if (!el) return;
  el.classList.add('is-tap-pending');
  const hadBusy = el.getAttribute('aria-busy') === 'true';
  if (!hadBusy) el.setAttribute('aria-busy', 'true');
  window.setTimeout(() => {
    el.classList.remove('is-tap-pending');
    if (!hadBusy) el.removeAttribute('aria-busy');
  }, 420);
}

function primeCompanyThreadForOpen(company) {
  const rt = getSarahRuntime();
  const companyId = resolveLiveCompanySarahId(company.id);
  const live = consumerChatLiveActive();
  const existing = rt.threads[companyId];
  if (existing?.kind === 'company' && existing.api && existing.messages?.length) {
    rt.activeThreadId = companyId;
    return;
  }
  rt.threads[companyId] = {
    kind: 'company',
    name: company.name,
    companyId,
    snId: company.snId || existing?.snId || null,
    verified: Boolean(company.verified),
    avatar: companyAvatarUrl(company),
    api: live,
    fetching: live,
    messages: existing?.messages?.length
      ? existing.messages
      : live
        ? []
        : [
            {
              role: 'assistant',
              markdown: `**Hi ${MOCK_USER.name}** — I'm Sarah from **${company.name}**. How can I help you today?`,
            },
          ],
  };
  rt.activeThreadId = companyId;
}

function bindStatusInteractionDelegates() {
  /* no-op — feed engage is wired per card via wireFeedEngageButtons */
}

let activeFeedTab = 'for-you';
let activeDiscoverCategory = 'all';
let discoverSearchQuery = '';
let discoverSearchRaw = '';
let discoverSearchDebounceTimer = null;
let discoverPlaceQuery = '';
const DISCOVER_PROVINCES = [
  'eastern cape',
  'free state',
  'gauteng',
  'kwazulu-natal',
  'limpopo',
  'mpumalanga',
  'north west',
  'northern cape',
  'western cape',
];
let pendingDiscoverSearchFromOrg = '';
/**
 * SNET-01b: live Discover directory (GET /api/discover/companies). In live mode the mock fixtures are
 * NEVER merged into results; they only render when live mode is off (offline / signed out / file://).
 */
const liveDiscover = {
  loaded: false,
  loading: false,
  pendingRefetch: false,
  error: '',
  companies: [],
  facets: [],
  query: null,
  category: null,
  place: '',
  /** every live card seen this session, keyed by companyId (detail pages / chat headers survive new searches) */
  byId: new Map(),
};
let activeProfileSocialTab = 'photos';
/** BP-01: 'posts' | 'about' for Business Profile public tab */
let activeProfileBusinessSocialTab = 'posts';
let activeProfilePanel = 'public';
/** BP-01A: persona vs business profile environment */
let activeProfileKind = 'persona';
const PROFILE_KIND_STORAGE_KEY = 'sarah.prototype.profile.activeKind.v1';
const PROFILE_AVATAR_STORAGE_KEY = 'sarah.prototype.profile.avatar.v1';
const PROFILE_PHOTO_URL_CACHE_KEY = 'sarah.app.profile.photoURL';
const PROFILE_COVER_STORAGE_KEY = 'sarah.prototype.profile.cover.v1';
const PROFILE_UPLOAD_MAX_BYTES = 2_500_000;
const CREATE_POST_IMAGE_MAX_BYTES = 5_000_000;
const CREATE_POST_VIDEO_MAX_BYTES = 12_000_000;
let createPostPendingMedia = null;
let createPostMediaPick = 'image';

const VIEWS = [
  'welcome',
  'auth',
  'register-details',
  'home',
  'news',
  'discover',
  'discover-company',
  'chats',
  'chat-thread',
  'profile',
];
const NAV_ROUTES = ['home', 'news', 'discover', 'chats', 'profile'];
const MY_SARAH_PANELS = ['home', 'tasks', 'knowledge', 'organisations', 'wallet', 'pay', 'billing', 'notifications'];

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

const EDUCARE_SCHOOL_COMPANY_ID = 'educare-christian-combined';

function isSchoolOrganisation(company) {
  if (!company) return false;
  const id = String(company.id || company.companyId || '').trim();
  if (id === EDUCARE_SCHOOL_COMPANY_ID) return true;
  if (company.settings?.education?.requireVerifiedGuardians === true) return true;
  return String(company.categoryLabel || company.industry || '').toLowerCase().includes('education');
}

function renderSub01LearnerRow(index, campuses, values = {}) {
  const campusOpts = (campuses || [])
    .map((c) => `<option value="${c.id}" ${values.campusId === c.id ? 'selected' : ''}>${c.name || c.id}</option>`)
    .join('');
  return `
    <div class="sub01-learner-row" data-learner-index="${index}">
      <input class="ms-knowledge-input" data-learner-name placeholder="Learner first name" value="${values.name || ''}" />
      <input class="ms-knowledge-input" data-learner-grade placeholder="Grade" value="${values.grade || ''}" style="margin-top:6px" />
      <select class="ms-knowledge-input" data-learner-campus style="margin-top:6px">
        <option value="">Select campus</option>
        ${campusOpts}
      </select>
    </div>`;
}

async function fetchSchoolCampuses(companyId) {
  try {
    const res = await fetch(`/api/education/v1/orgs/${encodeURIComponent(companyId)}/campuses`);
    const json = await res.json();
    if (json?.ok && json.data?.campuses?.length) return json.data.campuses;
  } catch {
    /* fallback */
  }
  try {
    const res = await fetch('/api/education/v1/educare/campus-catalog');
    const json = await res.json();
    return json?.data?.campuses || [];
  } catch {
    return [];
  }
}

async function submitSchoolGuardianApplicationLive(companyId) {
  const campuses = await fetchSchoolCampuses(companyId);
  const host = document.getElementById('sub01LearnersHost');
  const learners = [];
  host?.querySelectorAll('.sub01-learner-row').forEach((row) => {
    const name = row.querySelector('[data-learner-name]')?.value?.trim();
    const grade = row.querySelector('[data-learner-grade]')?.value?.trim();
    const campusId = row.querySelector('[data-learner-campus]')?.value?.trim();
    if (name && grade && campusId) learners.push({ name, grade, campusId });
  });
  if (!learners.length) {
    showProtoToast('Add at least one learner with campus and grade');
    return false;
  }
  if (!document.getElementById('sub01CompetentConsent')?.checked) {
    showProtoToast('Competent-person consent is required');
    return false;
  }
  const token = await window.SarahLive?.getIdToken?.();
  if (!token) {
    showProtoToast('Sign in required');
    return false;
  }
  const prefs = {
    notifications: Boolean(document.getElementById('sub01PrefNotify')?.checked),
    announcements: Boolean(document.getElementById('sub01PrefAnnounce')?.checked),
    reminders: Boolean(document.getElementById('sub01PrefRemind')?.checked),
  };
  const body = {
    learners,
    relationship: document.getElementById('sub01Relationship')?.value || 'parent',
    prefs,
    competentPersonConsent: true,
    parentName: document.getElementById('sub01ParentName')?.value?.trim() || '',
    parentEmail: document.getElementById('sub01ParentEmail')?.value?.trim() || '',
    parentPhone: document.getElementById('sub01ParentPhone')?.value?.trim() || '',
  };
  const res = await fetch(`/api/education/v1/orgs/${encodeURIComponent(companyId)}/guardian-application`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    showProtoToast(json?.error?.message || 'Application failed');
    return false;
  }
  showProtoToast(json.data?.message || 'Application submitted — pending school verification');
  return true;
}

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
  const live = liveRelationState(companyId);
  if (live !== null) return live === 'subscribed';
  return Boolean(getSub01Record(companyId));
}

/** Subscribed id list: local prototype subscriptions + live subscriptions (from the connections API) seen on Discover. */
function loadSub01SubscribedIds() {
  const ids = new Set(Object.keys(loadSub01SubscribersMap()));
  if (discoverLiveActive()) {
    liveDiscover.byId.forEach((card, companyId) => {
      if (card.snId && liveConnections.bySnId.get(card.snId)?.state === 'subscribed') ids.add(companyId);
    });
  }
  return [...ids];
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

  document.getElementById('sub01RegisterSubmit')?.addEventListener('click', async () => {
    const idEl = document.getElementById('sub01RegisterCompanyId');
    const companyId = idEl && 'value' in idEl ? String(idEl.value || '').trim() : '';
    if (!companyId) return;
    if (discoverFind(companyId)?.live) {
      const submitBtn = document.getElementById('sub01RegisterSubmit');
      if (submitBtn) submitBtn.disabled = true;
      const company = discoverFind(companyId);
      let ok = false;
      if (isSchoolOrganisation(company)) {
        ok = await submitSchoolGuardianApplicationLive(companyId);
      } else {
        const already = isOrgSubscribedSub01(companyId);
        ok = already ? true : await handleLiveSubscribe(companyId);
      }
      if (submitBtn) submitBtn.disabled = false;
      if (ok) close();
      return;
    }
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

  document.getElementById('sub01RegisterRemove')?.addEventListener('click', async () => {
    const idEl = document.getElementById('sub01RegisterCompanyId');
    const companyId = idEl && 'value' in idEl ? String(idEl.value || '').trim() : '';
    if (!companyId) return;
    if (discoverFind(companyId)?.live) {
      if (await handleLiveUnsubscribe(companyId)) close();
      return;
    }
    removeSub01Record(companyId);
    close();
    showProtoToast('Subscription removed');
    sub01RefreshSurfaces();
  });
}

function openSub01RegisterModal(companyId, opts) {
  bindSub01RegisterModalOnce();
  const id = String(companyId || '').trim();
  const company = discoverFind(id);
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

  document.getElementById('sub01RegisterRemove')?.classList.toggle('hidden', !rec && !isOrgSubscribedSub01(id));

  const live = Boolean(company.live);
  const schoolLive = live && isSchoolOrganisation(company);
  modal.querySelectorAll('.ms-knowledge-field-row').forEach((row) => {
    if (row.closest('#sub01SchoolFields')) return;
    row.classList.toggle('hidden', live && !schoolLive);
  });
  const schoolFields = document.getElementById('sub01SchoolFields');
  schoolFields?.classList.toggle('hidden', !schoolLive);
  if (schoolLive) {
    fetchSchoolCampuses(id).then((campuses) => {
      const host = document.getElementById('sub01LearnersHost');
      if (host && !host.querySelector('.sub01-learner-row')) {
        host.innerHTML = renderSub01LearnerRow(0, campuses);
      }
      document.getElementById('sub01AddLearner')?.addEventListener('click', () => {
        const n = host.querySelectorAll('.sub01-learner-row').length;
        host.insertAdjacentHTML('beforeend', renderSub01LearnerRow(n, campuses));
      });
    });
  }
  const leadEl = document.getElementById('sub01RegisterLead');
  if (leadEl) {
    if (leadEl.dataset.protoLead === undefined) leadEl.dataset.protoLead = leadEl.textContent || '';
    leadEl.textContent = schoolLive
      ? `Submit a parent/guardian application for ${company.name}. Communications activate only after school staff verify your learner links.`
      : live
        ? `Subscribing records your consent for ${company.name} to send you updates. No personal details are shared. You can unsubscribe any time.`
        : leadEl.dataset.protoLead;
  }
  const footEl = modal.querySelector('.sub01-register-foot');
  if (footEl) {
    if (footEl.dataset.protoFoot === undefined) footEl.dataset.protoFoot = footEl.textContent || '';
    footEl.textContent = schoolLive
      ? 'EDU-04 · Guardian verification required before school communications.'
      : live
        ? 'Sarah Network · consent-linked subscription'
        : footEl.dataset.protoFoot;
  }
  const submitEl = document.getElementById('sub01RegisterSubmit');
  if (submitEl) {
    submitEl.textContent = schoolLive
      ? 'Submit application'
      : live
        ? isOrgSubscribedSub01(id)
          ? 'Subscribed'
          : 'Subscribe'
        : 'Save subscription';
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  ref?.focus();
}

function sub01OpenSubscribeFlow(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return;
  if (discoverFind(id)?.live && !requireLiveSignIn('subscribe to businesses')) return;
  openSub01RegisterModal(id, { edit: isOrgSubscribedSub01(id) });
}

function applyCompanySarahUiHints(hints = [], companyId = '') {
  if (!Array.isArray(hints) || !hints.length) return;
  for (const hint of hints) {
    if (hint?.action === 'openEducareAdmissionForm') {
      showProtoToast?.('Sarah will complete your enrolment enquiry here in chat — no form needed.');
    }
  }
}

function parseHomeSubRoute(raw) {
  const legacy = raw.replace(/^my-sarah/, 'home');
  if (raw === 'chat' || legacy === 'chat') {
    return { route: 'home', msPanel: 'home' };
  }
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
  let raw = (location.hash || '#welcome').replace(/^#/, '') || 'welcome';
  if (raw === 'status' || raw.startsWith('status/')) raw = 'home';
  const homeRoute = parseHomeSubRoute(raw);
  if (homeRoute) return homeRoute;
  if (raw === 'knowledge') {
    return { route: 'home', msPanel: 'knowledge', knowledgeCategory: null };
  }
  if (raw === 'notifications') {
    return { route: 'home', msPanel: 'notifications' };
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

function renderThreadMessageMarkup(message, isPersonal, ctx = null) {
  const fmt = window.SARAH_THREAD_FORMAT;
  if (message.thinking) {
    return `<article class="thread-turn thread-turn--assistant thread-turn--thinking" aria-live="polite" aria-busy="true" aria-label="Sarah is typing">
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
    const userHtml = fmt?.formatUserMessage
      ? fmt.formatUserMessage(message)
      : escapeHtml(message.content || '');
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
  const recPanel = isPersonal && message.recommendationsUi ? renderRecommendationsUiMarkup(message.recommendationsUi) : '';
  return `<article class="thread-turn thread-turn--assistant">
    <div class="thread-msg thread-msg--assistant">
      <div class="thread-prose thread-prose--rich ${proseKind}">${body}</div>
      ${recPanel}
      ${retry}
    </div>
  </article>`;
}

function setRoute(route) {
  if (route === 'knowledge') {
    setMySarahPanel('knowledge');
    return;
  }
  if (route === 'status') route = 'home';
  if (!VIEWS.includes(route)) route = 'welcome';
  const prev = parseLocationHash();
  if (route === 'chat-thread' && prev.route !== 'chat-thread') {
    const rt = getSarahRuntime();
    rt.threadReturnRoute =
      prev.route === 'discover-company'
        ? 'discover'
        : prev.route === 'home' ||
            prev.route === 'news' ||
            prev.route === 'chats' ||
            prev.route === 'discover' ||
            prev.route === 'profile'
          ? prev.route
          : 'chats';
  }
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
  if (panel === 'notifications') return 'home/notifications';
  return `home/${panel}`;
}

const MS_HOME_CARD_MODE_KEY = 'sarah.home.cardMode';

function msHomeCardMode() {
  return sessionStorage.getItem(MS_HOME_CARD_MODE_KEY) === 'work' ? 'work' : 'chat';
}

function setMsHomeCardMode(mode) {
  sessionStorage.setItem(MS_HOME_CARD_MODE_KEY, mode === 'work' ? 'work' : 'chat');
}

function msModeForPanel(panel) {
  if (panel === 'tasks') return 'work';
  if (panel === 'home') return msHomeCardMode();
  return 'chat';
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
  if (p === 'tasks') {
    showWorkTasksHub(prompt || '');
    return;
  }
  try {
    sessionStorage.setItem(MS_LAST_PANEL_KEY, p);
  } catch {
    /* ignore */
  }
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
  setMySarahPanel('knowledge');
  const hash = mySarahHashForPanel('knowledge', { knowledgeCategory: key });
  if (location.hash.replace(/^#/, '') !== hash) {
    location.hash = hash;
  }
  void openMkSectionModal(key);
}

function closeMyKnowledgeCategory() {
  closeMkSectionModal();
  closeMkAreaPickerModal();
}

const MS_SUBMODULE_PANELS = new Set(['knowledge', 'wallet', 'pay', 'organisations', 'tasks', 'billing', 'notifications']);
const MS_PANEL_DISPLAY_TITLES = {
  knowledge: 'Knowledge',
  wallet: 'Wallet',
  pay: 'Pay',
  organisations: 'Organisations',
  tasks: 'Sarah Tasks',
  billing: 'Billing',
  notifications: 'My Notifications',
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
    panel === 'home' || panel === 'organisations' || panel === 'wallet' || panel === 'pay';
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
  if (panel === 'notifications') {
    hideNotificationDetail();
    void refreshLiveNotifications().then(() => renderMyNotificationsPanel());
    renderMyNotificationsPanel();
  } else {
    hideNotificationDetail();
  }
  if (panel === 'tasks') {
    void refreshWorkQuotaState().then(() => {
      renderWorkQuotaBanner();
      void initSarahTasksPanel();
    });
  }
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
  snaActiveTab = 'all';
  setMySarahPanel('home', prompt || '');
}

const MS_LAST_PANEL_KEY = 'sarah.home.lastMsPanel';

function showWorkTasksHub(prompt = '') {
  void loadSarahTasksModule();
  try {
    sessionStorage.setItem(MS_LAST_PANEL_KEY, 'tasks');
  } catch {
    /* ignore */
  }
  const hash = mySarahHashForPanel('tasks');
  if (location.hash.replace(/^#/, '') !== hash) {
    location.hash = hash;
  }
  applyMySarahPanel('tasks', prompt || '');
}

function goToMySarahWork(prompt) {
  showWorkTasksHub(prompt || '');
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

function getViewerUid() {
  const fromAuth = window.SarahLive?.getAuthUid?.();
  if (fromAuth) return String(fromAuth);
  const prof = window.SarahLive?.getConsumerProfile?.();
  if (prof?.uid) return String(prof.uid);
  return '';
}

function getMyLiveStatusPostsForProfile() {
  const posts = liveStatusPosts || [];
  const uid = getViewerUid();
  if (uid) {
    return posts.filter((p) => p.authorUid === uid || (p.optimistic && p.authorType === 'user'));
  }
  return posts.filter((p) => p.optimistic && p.authorType === 'user');
}

function countProfilePosts() {
  if (isLiveEnabled()) return getMyLiveStatusPostsForProfile().length;
  return getUserCreatedPosts().length;
}

function refreshHomeAndProfileAfterPost() {
  const route = parseLocationHash().route;
  if (route === 'profile') renderProfile(activeProfilePanel, activeProfileKind);
}

function buildUserFeedPost(body, media) {
  return {
    id: `user-${Date.now()}`,
    tab: 'for-you',
    author: MOCK_USER.name,
    authorType: 'creator',
    verified: MOCK_PROFILE?.verified,
    avatar: getEffectiveUserAvatar(),
    time: 'Just now',
    body: body || '',
    image: media?.type === 'image' ? media.dataUrl : null,
    video: media?.type === 'video' ? media.dataUrl : null,
    likes: 0,
    comments: 0,
    sponsored: false,
  };
}

function userPostVisibleOnFeedTab(post, tabId) {
  if (tabId === 'for-you' || tabId === 'following') return true;
  if (tabId === 'creators') return post.authorType === 'creator';
  if (tabId === 'companies') return false;
  if (tabId === 'videos') return Boolean(post.video || post.image);
  return true;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function loadStoredProfileDataUrl(key) {
  try {
    const v = localStorage.getItem(key);
    return v && v.startsWith('data:') ? v : '';
  } catch {
    return '';
  }
}

function saveStoredProfileDataUrl(key, dataUrl) {
  try {
    if (!dataUrl) localStorage.removeItem(key);
    else localStorage.setItem(key, dataUrl);
    return true;
  } catch {
    return false;
  }
}

function loadCachedProfilePhotoUrl() {
  try {
    const url = String(localStorage.getItem(PROFILE_PHOTO_URL_CACHE_KEY) || '').trim();
    return url && /^https?:\/\//i.test(url) ? url : '';
  } catch {
    return '';
  }
}

function saveCachedProfilePhotoUrl(url) {
  try {
    const trimmed = String(url || '').trim();
    if (!trimmed) localStorage.removeItem(PROFILE_PHOTO_URL_CACHE_KEY);
    else if (/^https?:\/\//i.test(trimmed)) localStorage.setItem(PROFILE_PHOTO_URL_CACHE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

function getEffectiveUserAvatar() {
  const photoURL = String(window.SarahLive?.getConsumerProfile?.()?.photoURL || '').trim();
  if (photoURL) {
    saveCachedProfilePhotoUrl(photoURL);
    return photoURL;
  }
  const cached = loadCachedProfilePhotoUrl();
  if (cached) return cached;
  const local = loadStoredProfileDataUrl(PROFILE_AVATAR_STORAGE_KEY);
  if (local) return local;
  return SARAH_AVATAR_SRC;
}

function getEffectiveProfileCover() {
  const coverURL = String(window.SarahLive?.getConsumerProfile?.()?.coverURL || '').trim();
  if (coverURL) return coverURL;
  const local = loadStoredProfileDataUrl(PROFILE_COVER_STORAGE_KEY);
  if (local) return local;
  return MOCK_PROFILE?.cover || 'assets/profile/spencer-cover.jpg';
}

let createPostBusy = false;

function setCreatePostBusy(busy, label = 'Post') {
  createPostBusy = Boolean(busy);
  const submit = document.getElementById('createPostSubmit');
  if (!submit) return;
  submit.disabled = busy || (!document.getElementById('createPostInput')?.value.trim() && !createPostPendingMedia);
  submit.textContent = label;
  submit.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function updateCreatePostSubmitState() {
  if (createPostBusy) return;
  const input = document.getElementById('createPostInput');
  const submit = document.getElementById('createPostSubmit');
  const text = input?.value.trim() || '';
  const hasMedia = Boolean(createPostPendingMedia?.file || createPostPendingMedia?.dataUrl);
  if (submit) {
    submit.disabled = !text && !hasMedia;
    submit.textContent = 'Post';
  }
}

async function compressImageForStatusUpload(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  if (!file || !(file.type || '').startsWith('image/')) return file;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function removeOptimisticStatusPost(optimisticId) {
  if (!optimisticId || !liveStatusPosts) return;
  liveStatusPosts = liveStatusPosts.filter((p) => p.id !== optimisticId);
}

function prependOptimisticStatusPost({ text, media }) {
  const id = `optimistic_${Date.now()}`;
  const prof = window.SarahLive?.getConsumerProfile?.();
  const mapped = {
    id,
    authorUid: getViewerUid() || null,
    author: consumerDisplayFirstName(prof) || MOCK_USER.name,
    authorType: 'user',
    body: text || '',
    image: media?.type === 'image' ? media.dataUrl : null,
    video: media?.type === 'video' ? media.dataUrl : null,
    avatar: getEffectiveUserAvatar(),
    likes: 0,
    comments: 0,
    time: 'Just now',
    tab: 'for-you',
    sponsored: false,
    verified: false,
    liveStatus: true,
    optimistic: true,
  };
  liveStatusPosts = [mapped, ...(liveStatusPosts || [])];
  return id;
}

function renderCreatePostPreview() {
  const host = document.getElementById('createPostPreview');
  const clearBtn = document.getElementById('createPostClearMedia');
  if (!host) return;
  if (!createPostPendingMedia?.dataUrl) {
    host.classList.add('hidden');
    host.innerHTML = '';
    clearBtn?.classList.add('hidden');
    return;
  }
  host.classList.remove('hidden');
  clearBtn?.classList.remove('hidden');
  if (createPostPendingMedia.type === 'video') {
    host.innerHTML = `<video src="${escapeHtml(createPostPendingMedia.dataUrl)}" controls playsinline preload="metadata"></video>`;
  } else {
    host.innerHTML = `<img src="${escapeHtml(createPostPendingMedia.dataUrl)}" alt="Attached photo" />`;
  }
}

function clearCreatePostMedia() {
  createPostPendingMedia = null;
  const input = document.getElementById('createPostMediaInput');
  if (input) input.value = '';
  renderCreatePostPreview();
  updateCreatePostSubmitState();
}

async function attachCreatePostMediaFile(file) {
  if (!file) return;
  const isVideo = (file.type || '').startsWith('video/');
  const isImage = (file.type || '').startsWith('image/');
  if (!isVideo && !isImage) {
    showProtoToast('Choose a photo or video file.');
    return;
  }
  const limit = isVideo ? CREATE_POST_VIDEO_MAX_BYTES : CREATE_POST_IMAGE_MAX_BYTES;
  if (file.size > limit) {
    showProtoToast(`File is too large for the prototype (max ${Math.round(limit / 1_000_000)} MB).`);
    return;
  }
  try {
    const dataUrl = await readFileAsDataUrl(file);
    createPostPendingMedia = { type: isVideo ? 'video' : 'image', dataUrl, name: file.name, file };
    renderCreatePostPreview();
    updateCreatePostSubmitState();
  } catch {
    showProtoToast('Could not attach that file.');
  }
}

async function saveProfileImageFile(file, kind) {
  if (!file || !(file.type || '').startsWith('image/')) {
    showProtoToast('Choose an image file.');
    return;
  }
  if (file.size > PROFILE_UPLOAD_MAX_BYTES) {
    showProtoToast('Image is too large — try under 2.5 MB.');
    return;
  }
  if (kind === 'avatar') setProfileAvatarUploading(true);
  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    showProtoToast('Could not read that image.');
    if (kind === 'avatar') setProfileAvatarUploading(false);
    return;
  }
  const key = kind === 'cover' ? PROFILE_COVER_STORAGE_KEY : PROFILE_AVATAR_STORAGE_KEY;
  if (!saveStoredProfileDataUrl(key, dataUrl)) {
    showProtoToast('Could not save — browser storage may be full.');
    if (kind === 'avatar') setProfileAvatarUploading(false);
    return;
  }
  applyStoredProfileMedia();
  syncUserAvatars();
  if (kind === 'avatar' && isLiveEnabled() && window.SarahLive?.uploadProfilePhoto) {
    const res = await window.SarahLive.uploadProfilePhoto(file);
    if (res?.error) {
      showProtoToast(window.SarahLive.formatSarahApiError?.(res.error) || res.error);
      setProfileAvatarUploading(false);
    } else {
      await window.SarahLive.refreshConsumerProfile?.();
      const remote = String(window.SarahLive.getConsumerProfile?.()?.photoURL || '').trim();
      if (remote) {
        saveCachedProfilePhotoUrl(remote);
        saveStoredProfileDataUrl(PROFILE_AVATAR_STORAGE_KEY, '');
      }
      applyStoredProfileMedia();
      syncUserAvatars();
      showProtoToast('Profile photo saved to your account.');
      const { route } = parseLocationHash();
      if (route === 'profile') renderProfile(activeProfilePanel, 'persona');
      setProfileAvatarUploading(false);
      return;
    }
  }
  if (kind === 'cover' && isLiveEnabled() && window.SarahLive?.uploadProfileCover) {
    const res = await window.SarahLive.uploadProfileCover(file);
    if (res?.error) {
      showProtoToast(res.error);
    } else {
      saveStoredProfileDataUrl(PROFILE_COVER_STORAGE_KEY, '');
      applyStoredProfileMedia();
      showProtoToast('Cover photo saved to your account.');
      const { route } = parseLocationHash();
      if (route === 'profile') renderProfile(activeProfilePanel, 'persona');
      return;
    }
  }
  const { route } = parseLocationHash();
  if (route === 'profile') renderProfile(activeProfilePanel, 'persona');
  showProtoToast(kind === 'cover' ? 'Cover photo updated.' : 'Profile photo updated.');
  if (kind === 'avatar') setProfileAvatarUploading(false);
}

function applyStoredProfileMedia() {
  const cover = document.getElementById('profileCover');
  const coverSrc = getEffectiveProfileCover();
  if (cover) {
    cover.removeAttribute('data-fb');
    cover.src = prototypeAsset(coverSrc);
    if (!/^data:/i.test(coverSrc)) {
      cover.onerror = function onCoverErr() {
        if (this.dataset.fb) return;
        this.dataset.fb = '1';
        this.src = prototypeAsset(MOCK_PROFILE?.coverFallback || 'assets/discover/green-haven-hero.jpg');
      };
    }
  }
  document
    .querySelectorAll('[data-profile-avatar][data-profile-kind="persona"], .profile-avatar[data-profile-kind="persona"]')
    .forEach((img) => {
      const av = getEffectiveUserAvatar();
      img.removeAttribute('data-fb');
      img.src = prototypeAsset(av);
      img.onerror = function onAvatarErr() {
        if (this.dataset.fb) return;
        this.dataset.fb = '1';
        this.src = prototypeAsset(SARAH_AVATAR_SRC);
      };
    });
}

function setProfileAvatarUploading(uploading) {
  document.getElementById('profileAvatarPick')?.classList.toggle('is-uploading', Boolean(uploading));
}

function openCreatePostSheet() {
  const sheet = document.getElementById('createPostSheet');
  if (!sheet) return;
  syncUserAvatars();
  createPostSubmitLock = false;
  setCreatePostBusy(false);
  setCreatePostStatus('');
  clearCreatePostMedia();
  blurActiveInput();
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-create-post-open');
  const input = document.getElementById('createPostInput');
  if (input) {
    input.value = '';
    input.removeAttribute('readonly');
    if (!shouldDeferSheetAutofocus()) {
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
  }
  updateCreatePostSubmitState();
}

function closeCreatePostSheet() {
  const sheet = document.getElementById('createPostSheet');
  if (!sheet || sheet.classList.contains('hidden')) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-create-post-open');
  document.getElementById('createPostInput')?.blur();
  clearCreatePostMedia();
}

function prependLiveStatusPostFromApi(res) {
  const raw = res?.data?.post ?? res?.data?.data?.post;
  if (!raw?.postId) return false;
  const mapped = mapLiveStatusPost(raw);
  const existing = liveStatusPosts || [];
  liveStatusPosts = [mapped, ...existing.filter((p) => p.id !== mapped.id)];
  return true;
}

let createPostSubmitLock = false;

async function submitCreatePost() {
  if (createPostSubmitLock) {
    showProtoToast('Still working on your post…');
    return;
  }
  const input = document.getElementById('createPostInput');
  const text = input?.value.trim() || '';
  const hasMedia = Boolean(createPostPendingMedia?.file || createPostPendingMedia?.dataUrl);
  if (!text && !hasMedia) {
    showProtoToast('Add text or a photo to post.');
    return;
  }

  if (isLiveEnabled()) {
    if (!window.SarahLive?.createConsumerStatusPost) {
      showProtoToast('Still connecting… wait a moment and try again.');
      return;
    }
    createPostSubmitLock = true;
    setCreatePostBusy(true, 'Posting…');
    setCreatePostStatus('Connecting…');
    showProtoToast('Posting…', { ms: 5000 });
    let imageUrl = null;
    let videoUrl = null;
    let optimisticId = '';
    const work = async () => {
      setCreatePostStatus('Checking sign-in…');
      const session = await window.SarahLive.waitForLiveSession?.(12000);
      if (session?.error) {
        const msg = window.SarahLive.formatSarahApiError?.(session.error) || session.error;
        setCreatePostStatus(msg);
        showProtoToast(msg, { ms: 6000 });
        if (session.code === 'AUTH_REQUIRED') setRoute('auth');
        return;
      }
      setCreatePostStatus('Refreshing session…');
      const tokenRefresh = await window.SarahLive.ensureFreshAuthToken?.();
      if (tokenRefresh?.error) {
        const msg = window.SarahLive.formatSarahApiError?.(tokenRefresh.error) || tokenRefresh.error;
        setCreatePostStatus(msg);
        showProtoToast(msg, { ms: 6000 });
        if (tokenRefresh.code === 'AUTH_REQUIRED') setRoute('auth');
        return;
      }
      setCreatePostStatus('Preparing your profile…');
      const ready = await window.SarahLive.ensureConsumerReady?.();
      if (ready?.error) {
        const msg = window.SarahLive.formatSarahApiError?.(ready.error) || ready.error;
        setCreatePostStatus(msg);
        showProtoToast(msg || 'Sign in and complete your Sarah profile first.', { ms: 6000 });
        if (ready.code === 'CONSUMER_PROFILE_REQUIRED') setRoute('register-details');
        return;
      }
      setCreatePostStatus('');
      const mediaSnapshot = createPostPendingMedia
        ? { type: createPostPendingMedia.type, dataUrl: createPostPendingMedia.dataUrl, file: createPostPendingMedia.file }
        : null;
      optimisticId = prependOptimisticStatusPost({ text, media: mediaSnapshot });
      closeCreatePostSheet();
      refreshHomeAndProfileAfterPost();
      showProtoToast('Posting…');
      let mediaFile = mediaSnapshot?.file;
      if (mediaFile && mediaSnapshot?.type === 'image') {
        try {
          mediaFile = await compressImageForStatusUpload(mediaFile);
        } catch {
          mediaFile = mediaSnapshot.file;
        }
      }
      if (mediaFile && window.SarahLive.uploadChatMedia) {
        const up = await window.SarahLive.uploadChatMedia(mediaFile);
        if (up.error) {
          removeOptimisticStatusPost(optimisticId);
          renderHome();
          showProtoToast(window.SarahLive.formatSarahApiError?.(up.error) || up.error);
          return;
        }
        const url = up.attachment?.url || '';
        const kind = up.attachment?.kind || mediaSnapshot?.type;
        if (kind === 'video') videoUrl = url;
        else imageUrl = url;
      }
      const res = await window.SarahLive.createConsumerStatusPost({ body: text, imageUrl, videoUrl });
      if (res.error) {
        removeOptimisticStatusPost(optimisticId);
        renderHome();
        const msg = window.SarahLive.formatSarahApiError?.(res.error) || res.error;
        showProtoToast(msg || 'Could not post');
        if (res.code === 'CONSUMER_PROFILE_REQUIRED') setRoute('register-details');
        return;
      }
      removeOptimisticStatusPost(optimisticId);
      if (!prependLiveStatusPostFromApi(res)) {
        liveStatusFeedPromise = null;
        ensureLiveStatusFeed();
      }
      refreshHomeAndProfileAfterPost();
      showProtoToast('Posted to Status and your profile.');
    };

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Posting timed out. Check connection and try again.')), 45000)
    );

    try {
      await Promise.race([work(), timeout]);
    } catch (err) {
      removeOptimisticStatusPost(optimisticId);
      renderHome();
      const msg = err?.message || 'Could not post. Check your connection.';
      setCreatePostStatus(msg);
      showProtoToast(msg, { ms: 6000 });
    } finally {
      createPostSubmitLock = false;
      setCreatePostBusy(false);
      updateCreatePostSubmitState();
    }
    return;
  }

  const media = createPostPendingMedia ? { ...createPostPendingMedia } : null;
  getUserCreatedPosts().unshift(buildUserFeedPost(text, media));
  closeCreatePostSheet();
  refreshHomeAndProfileAfterPost();
  showProtoToast('Posted to Status and your profile.');
}

function bindCreatePostUi() {
  if (window.__createPostBound) return;
  window.__createPostBound = true;

  document.querySelectorAll('[data-create-post-open]').forEach((el) => {
    bindAppPrimaryTap(el, () => openCreatePostSheet());
  });

  document.querySelectorAll('[data-feed-comment-close]').forEach((el) => {
    el.addEventListener('click', closeFeedCommentSheet);
  });
  document.getElementById('feedCommentInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitFeedCommentFromSheet();
    }
  });
  document.getElementById('createPostInput')?.addEventListener('input', () => updateCreatePostSubmitState());
  document.getElementById('createPostInput')?.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submitCreatePost();
    }
  });

  const submitBtn = document.getElementById('createPostSubmit');
  bindAppPrimaryTap(submitBtn, () => {
    if (createPostSubmitLock || createPostBusy) return;
    if (submitBtn.disabled) {
      updateCreatePostSubmitState();
      setCreatePostStatus('Add text or a photo, then tap Post.');
      showProtoToast('Add text or a photo to post.', { ms: 4000 });
      return;
    }
    void submitCreatePost();
  });

  bindAppPrimaryTap(document.getElementById('feedCommentSubmit'), () => {
    void submitFeedCommentFromSheet();
  });

  document.getElementById('createPostPickImage')?.addEventListener('click', () => {
    createPostMediaPick = 'image';
    const input = document.getElementById('createPostMediaInput');
    if (!input) return;
    input.accept = 'image/*';
    input.click();
  });
  document.getElementById('createPostPickVideo')?.addEventListener('click', () => {
    createPostMediaPick = 'video';
    const input = document.getElementById('createPostMediaInput');
    if (!input) return;
    input.accept = 'video/*';
    input.click();
  });
  document.getElementById('createPostMediaInput')?.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    attachCreatePostMediaFile(input.files[0]);
    input.value = '';
  });
  document.getElementById('createPostClearMedia')?.addEventListener('click', () => clearCreatePostMedia());

  document.querySelectorAll('[data-create-post-close]').forEach((el) => {
    el.addEventListener('click', closeCreatePostSheet);
  });
}

function bindStatusSheetKeyboardPin() {
  if (window.__statusSheetKbPin || !window.visualViewport) return;
  window.__statusSheetKbPin = true;
  const panels = () => {
    const out = [];
    const createOpen = document.getElementById('createPostSheet') && !document.getElementById('createPostSheet').classList.contains('hidden');
    const commentOpen = document.getElementById('feedCommentSheet') && !document.getElementById('feedCommentSheet').classList.contains('hidden');
    if (createOpen) {
      const p = document.querySelector('#createPostSheet .create-post-panel');
      if (p) out.push(p);
    }
    if (commentOpen) {
      const p = document.querySelector('#feedCommentSheet .feed-comment-panel');
      if (p) out.push(p);
    }
    return out;
  };
  const update = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    panels().forEach((panel) => {
      panel.style.paddingBottom = kb > 0 ? `calc(${kb}px + env(safe-area-inset-bottom, 0))` : '';
    });
  };
  window.visualViewport.addEventListener('resize', update);
  window.visualViewport.addEventListener('scroll', update);
  window.addEventListener('hashchange', update);
  update();
}

function bindMsComposeViewportPin() {
  if (window.__msComposeViewportBound || !window.visualViewport) return;
  window.__msComposeViewportBound = true;
  const composeEls = () =>
    [...document.querySelectorAll('.ms-compose, .thread-compose')].filter(
      (el) => el instanceof HTMLElement
    );
  const composeBaseBottom = () => {
    const onThread = parseLocationHash().route === 'chat-thread';
    return onThread
      ? 'calc(12px + env(safe-area-inset-bottom, 0))'
      : 'calc(var(--nav-h) + 12px + env(safe-area-inset-bottom, 0))';
  };
  const update = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const keyboardOffset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const baseBottom = composeBaseBottom();
    const bottom =
      keyboardOffset > 0 ? `calc(${baseBottom} + ${Math.round(keyboardOffset)}px)` : baseBottom;
    composeEls().forEach((el) => {
      el.style.bottom = bottom;
    });
  };
  window.visualViewport.addEventListener('resize', update);
  window.visualViewport.addEventListener('scroll', update);
  window.addEventListener('orientationchange', update);
  window.addEventListener('hashchange', update);
  update();
}

function bindProfileMediaUiOnce() {
  if (window.__profileMediaBound) return;
  window.__profileMediaBound = true;

  document.getElementById('profileCoverPick')?.addEventListener('click', () => {
    document.getElementById('profileCoverInput')?.click();
  });
  document.getElementById('profileAvatarPick')?.addEventListener('click', () => {
    document.getElementById('profileAvatarInput')?.click();
  });
  document.getElementById('profileCoverInput')?.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    saveProfileImageFile(input.files[0], 'cover');
    input.value = '';
  });
  document.getElementById('profileAvatarInput')?.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    saveProfileImageFile(input.files[0], 'avatar');
    input.value = '';
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
  return (messages || []).map((m) => {
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        markdown: m.content,
        content: m.content,
        authorDisplayName: m.authorDisplayName || null,
        authorName: m.authorDisplayName || m.senderName || null,
        authorKind: m.source === 'human' ? 'human' : 'sarah',
        source: m.source || null,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
      };
    }
    return {
      role: 'user',
      content: m.content,
      attachments: m.attachments || [],
    };
  });
}

function mergeWorkThreadField(session, existing, key, sessionKey, { asBool = false } = {}) {
  const sk = sessionKey || key;
  if (Object.prototype.hasOwnProperty.call(session, sk)) {
    return asBool ? Boolean(session[sk]) : session[sk] ?? null;
  }
  if (existing && existing[key] !== undefined) return existing[key];
  return asBool ? false : null;
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
  const isWork =
    session.mode != null
      ? String(session.mode).toLowerCase() === 'work'
      : Boolean(existing?.work);
  rt.threads[session.id] = {
    kind: 'personal',
    work: isWork,
    workSubmitted: mergeWorkThreadField(session, existing, 'workSubmitted', 'workSubmittedAt', { asBool: true }),
    workSubmittedAt: mergeWorkThreadField(session, existing, 'workSubmittedAt'),
    workCompleted: mergeWorkThreadField(session, existing, 'workCompleted', 'workCompletedAt', { asBool: true }),
    workCompletedAt: mergeWorkThreadField(session, existing, 'workCompletedAt'),
    workCancelled: mergeWorkThreadField(session, existing, 'workCancelled', 'workCancelledAt', { asBool: true }),
    workCancelledAt: mergeWorkThreadField(session, existing, 'workCancelledAt'),
    workPaused: mergeWorkThreadField(session, existing, 'workPaused', 'workPausedAt', { asBool: true }),
    workPausedAt: mergeWorkThreadField(session, existing, 'workPausedAt'),
    workPauseReason: mergeWorkThreadField(session, existing, 'workPauseReason'),
    workBudgetBand: mergeWorkThreadField(session, existing, 'workBudgetBand'),
    workBudgetCapCredits:
      session.workBudgetCapCredits !== undefined && session.workBudgetCapCredits !== null
        ? session.workBudgetCapCredits
        : (existing?.workBudgetCapCredits ?? null),
    workBudgetEstimateMin:
      session.workBudgetEstimateMin !== undefined && session.workBudgetEstimateMin !== null
        ? session.workBudgetEstimateMin
        : (existing?.workBudgetEstimateMin ?? null),
    workBudgetEstimateMax:
      session.workBudgetEstimateMax !== undefined && session.workBudgetEstimateMax !== null
        ? session.workBudgetEstimateMax
        : (existing?.workBudgetEstimateMax ?? null),
    workCreditsUsedCredits:
      session.workCreditsUsedCredits !== undefined && session.workCreditsUsedCredits !== null
        ? session.workCreditsUsedCredits
        : (existing?.workCreditsUsedCredits ?? 0),
    workReport: session.workReport != null ? session.workReport : (existing?.workReport ?? null),
    workWorkspace:
      session.workWorkspace != null && typeof session.workWorkspace === 'object'
        ? session.workWorkspace
        : (existing?.workWorkspace ?? null),
    api: true,
    messagesLoaded: partial ? Boolean(existing?.messagesLoaded) : true,
    title: session.title || existing?.title || 'My Sarah',
    lastMessagePreview: session.lastMessagePreview || existing?.lastMessagePreview || '',
    timeLabel: formatPersonalThreadTime(session.lastMessageAt || session.updatedAt || existing?.lastMessageAt),
    name: session.title || existing?.name || 'My Sarah',
    avatar: SARAH_AVATAR_SRC,
    verified: false,
    lastMessageAt: session.lastMessageAt || session.updatedAt || existing?.lastMessageAt || Date.now(),
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

function listPersonalThreads(opts = {}) {
  const chatOnly = Boolean(opts.chatOnly);
  const workOnly = Boolean(opts.workOnly);
  if (personalSarahUsesMockThreads()) ensurePersonalThreadsSeeded();
  const rt = getSarahRuntime();
  const ids = personalSarahUsesMockThreads()
    ? rt.personalThreadOrder || []
    : (rt.personalThreadOrder || []).filter((id) => rt.threads[id]?.api);
  const rows = ids
    .map((id) => {
      const thread = rt.threads[id];
      if (!thread || thread.kind !== 'personal') return null;
      if (chatOnly && thread.work) return null;
      if (workOnly && !thread.work) return null;
      return {
        id,
        title: getPersonalThreadHeadline(thread),
        time: thread.timeLabel || formatPersonalThreadTime(thread.lastMessageAt) || '',
        preview: getPersonalThreadPreview(thread),
        lastMessageAt: thread.lastMessageAt || 0,
        work: Boolean(thread.work),
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
const threadComposePending = { items: [] };
const personalComposePending = { items: [] };
let threadVoiceRecorder = null;
let personalSarahSessionsLoading = false;
let personalSarahSessionsSyncGen = 0;
let personalSarahSessionsLastSyncAt = 0;
const PERSONAL_SESSIONS_SYNC_MIN_MS = 60_000;
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

function consumerChatLiveActive() {
  return personalSarahLiveActive();
}

function isExplicitNonPersonalThreadSelection(rt) {
  const id = String(rt.activeThreadId || '').trim();
  if (!id) return false;
  const thread = rt.threads[id];
  if (thread?.kind === 'personal' && thread?.api) return false;
  if (thread?.kind === 'company') return true;
  if (id === 'smilemore-demo') return true;
  if (getAllChats().some((c) => c.id === id)) return true;
  if (discoverFind(id)) return true;
  return false;
}

/** Avoid treating person-to-person inbox rows as Company Sarah loads. */
function activeThreadNeedsCompanyApiLoad(rt) {
  const id = String(rt.activeThreadId || '').trim();
  if (!id) return false;
  const thread = rt.threads[id];
  if (thread?.kind === 'personal') return false;
  if (thread?.kind && thread.kind !== 'company') return false;
  if (thread?.kind === 'company') return true;
  if (id === 'smilemore-demo') return true;
  const chat = getAllChats().find((c) => c.id === id);
  if (chat && !chat.company) return false;
  if (chat?.company) return true;
  if (discoverFind(resolveLiveCompanySarahId(id))) return true;
  return false;
}

function guessCompanyAvatarKey(companyId, label = '') {
  const hay = `${companyId} ${label}`.toLowerCase();
  if (hay.includes('smile')) return 'smilemore';
  if (hay.includes('motor') || hay.includes('central')) return 'centralMotors';
  return null;
}

function mapFederatedConversationToChatRow(c) {
  const kind = String(c.conversationKind || c.type || 'person_to_business')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  const isBusiness = kind === 'person_to_business';
  const label = c.displayLabel || c.companyName || c.title || '';
  const isPersonalSarah =
    !isBusiness &&
    (kind.includes('personal') || /personal\s+sarah|^my\s+sarah/i.test(String(label || '')));
  const companyId = c.companyId || '';
  const convId = c.id || '';
  const id = isBusiness ? companyId || convId : convId || companyId;
  const rawLogo = c.logoUrl || c.avatarUrl || null;
  let avatar = isPersonalSarah ? SARAH_AVATAR_SRC : rawLogo ? resolveListingMediaUrl(rawLogo) : null;
  if (!avatar && isBusiness && companyId) {
    const co = discoverFind(companyId);
    if (co?.avatar) avatar = co.avatar;
    else if (co?.image) avatar = co.image;
  }
  return {
    id,
    convId,
    conversationKind: isPersonalSarah ? 'personal_sarah' : kind,
    name: label || id || 'Chat',
    preview: c.preview || c.lastMessagePreview || 'Tap to open',
    time: formatPersonalThreadTime(c.lastMessageAt) || '',
    online: false,
    avatarKey: avatar ? null : isBusiness ? guessCompanyAvatarKey(companyId, c.displayLabel) : null,
    avatar,
    sarahPersonal: isPersonalSarah,
    company: isBusiness,
    snId: c.snId || null,
    api: true,
    lastMessageAt: c.lastMessageAt ? Date.parse(c.lastMessageAt) || 0 : 0,
  };
}

function resolveCompanyIdForActiveThread(threadId) {
  const id = String(threadId || '').trim();
  if (!id) return null;
  const rt = getSarahRuntime();
  const cached = rt.threads[id];
  if (cached?.kind === 'company' && (cached.companyId || id)) {
    return cached.companyId || id;
  }
  const chat = getAllChats().find((c) => c.id === id);
  if (chat?.company) return id;
  if (discoverFind(id)) return id;
  if (id === 'smilemore-demo') return id;
  const rowCompanyId = document.querySelector(`[data-open-thread="${id}"]`)?.dataset?.companyId;
  if (rowCompanyId) return rowCompanyId;
  return null;
}

function resolveLiveCompanySarahId(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return id;
  if (window.SarahLive?.resolveLiveCompanySarahId) return window.SarahLive.resolveLiveCompanySarahId(id);
  if (id === 'central-motors' || id === 'central_motors') return 'central-motors-rtb';
  return id;
}

async function loadCompanyThreadFromApiIfNeeded() {
  if (!consumerChatLiveActive()) return false;
  const rt = getSarahRuntime();
  const id = String(rt.activeThreadId || '').trim();
  if (!id) return false;
  const companyId = resolveLiveCompanySarahId(resolveCompanyIdForActiveThread(id));
  if (!companyId) return false;

  const existing = rt.threads[companyId] || rt.threads[id];
  if (existing?.api && existing.kind === 'company' && existing.messages?.length) {
    if (existing.fetching) existing.fetching = false;
    return true;
  }

  if (companyThreadFetchInflight.has(companyId)) {
    return companyThreadFetchInflight.get(companyId);
  }

  const job = (async () => {
    const chat = getAllChats().find((c) => c.id === id || c.id === companyId);
    const discoverCo = discoverFind(companyId);
    const threadRef = rt.threads[companyId] || rt.threads[id];
    if (threadRef) threadRef.fetching = true;
    if (parseLocationHash().route === 'chat-thread') renderThread();

    const res = await window.SarahLive.fetchCompanyMessages(companyId);
    if (res.error) {
      if (threadRef) threadRef.fetching = false;
      if (parseLocationHash().route === 'chat-thread') renderThread();
      showProtoToast(res.error);
      return false;
    }
    const payload = res.data || {};
    const messages = mapApiMessagesToThread(payload.messages);
    const name =
      payload.conversation?.companyName || chat?.name || discoverCo?.name || companyId;
    rt.threads[companyId] = {
      kind: 'company',
      name,
      companyId,
      snId: payload.conversation?.snId || chat?.snId || discoverCo?.snId || null,
      verified: true,
      api: true,
      fetching: false,
      messages,
    };
    rt.activeThreadId = companyId;
    return true;
  })();

  companyThreadFetchInflight.set(companyId, job);
  try {
    return await job;
  } finally {
    companyThreadFetchInflight.delete(companyId);
  }
}

let chatsListLoadGen = 0;
let chatsListLastFetchAt = 0;
const CHATS_LIST_FETCH_MIN_MS = 45_000;
const CHATS_LIST_SESSION_KEY = 'sarah.chats.list.cache.v1';
const companyThreadFetchInflight = new Map();
/** @type {object[]|null} */
let chatsListMemoryCache = null;
let chatsTabSearchDebounceTimer = null;
let activeChatsPanel = 'sarah';
/** @type {{ businessChats: object[], sarahChatRows: object[], orgSection?: string }|null} */
let chatsListPanelCache = null;

function loadChatsListSessionCache() {
  if (chatsListMemoryCache?.length) return chatsListMemoryCache;
  try {
    const raw = sessionStorage.getItem(CHATS_LIST_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChatsListSessionCache(chats) {
  if (!Array.isArray(chats)) return;
  chatsListMemoryCache = chats;
  try {
    sessionStorage.setItem(CHATS_LIST_SESSION_KEY, JSON.stringify(chats.slice(0, 80)));
  } catch {
    /* ignore */
  }
}
/** Discover businesses matching the Chats tab query (for starting new Company Sarah threads). */
const chatsTabOrgSearch = { query: '', loading: false, companies: [] };

async function loadNonCompanyThreadFromApi(convId, kind) {
  if (!consumerChatLiveActive() || !convId) return false;
  const rt = getSarahRuntime();
  const k = String(kind || '').toLowerCase();
  let res;
  if (k === 'person_to_person') res = await window.SarahLive.fetchPersonMessages(convId);
  else if (k === 'group_personal' || k === 'group_organisation') {
    res = await window.SarahLive.fetchGroupMessages(convId);
  } else if (k === 'ai_to_ai') res = await window.SarahLive.fetchNetworkMessages(convId);
  else return false;
  if (res?.error) {
    showProtoToast(res.error);
    return false;
  }
  const payload = res.data || {};
  const title =
    payload.conversation?.peerDisplayName ||
    payload.conversation?.title ||
    payload.conversation?.companyName ||
    convId;
  rt.threads[convId] = {
    kind: k,
    convId,
    name: title,
    api: true,
    readOnly: k === 'ai_to_ai',
    consentScope: payload.consentScope || payload.conversation?.networkConsentScope,
    messages: mapApiMessagesToThread(payload.messages || []),
  };
  rt.activeThreadId = convId;
  return true;
}

async function openChatFromList(chatId, rowEl) {
  markControlTapPending(rowEl);
  const rt = getSarahRuntime();
  const kind = rowEl?.dataset?.kind || '';
  const convId = rowEl?.dataset?.convId || chatId;
  const isCompany = rowEl?.dataset?.company !== '0';
  if (!isCompany && (kind === 'personal_sarah' || rowEl?.dataset?.personalSarah === '1')) {
    openPersonalSarahThread(convId || chatId);
    return;
  }
  const targetId = isCompany ? chatId || 'smilemore-demo' : convId;
  rt.activeThreadId = targetId;
  if (consumerChatLiveActive()) {
    if (isCompany) {
      const co =
        discoverFind(resolveLiveCompanySarahId(targetId)) ||
        ({ id: targetId, name: rowEl?.querySelector('.chat-title')?.textContent?.trim() || targetId, verified: true });
      primeCompanyThreadForOpen(co);
      setRoute('chat-thread');
      return;
    }
    await loadNonCompanyThreadFromApi(convId, kind);
  }
  setRoute('chat-thread');
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
      if (personalSarahLiveActive()) syncPersonalSarahSessionsFromServer({ force: true });
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

function sarahTimeGreetingPart(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function sarahHomeGreetingText(name) {
  const part = sarahTimeGreetingPart();
  const first = String(name || '').trim().split(/\s+/)[0];
  if (first) return `${part}, ${first}. How can I help you today?`;
  return `${part}. How can I help you today?`;
}

function sarahStatusFeedGreetingText(name) {
  const part = sarahTimeGreetingPart();
  const first = String(name || '').trim().split(/\s+/)[0];
  if (first) return `${part}, ${first}`;
  return part;
}

function syncSarahTimeGreetings() {
  const prof = window.SarahLive?.getConsumerProfile?.();
  const first = consumerDisplayFirstName(prof) || MOCK_USER.name;
  const statusEl = document.getElementById('homeGreeting');
  if (statusEl) statusEl.textContent = sarahStatusFeedGreetingText(first);
  const bubble = document.querySelector('.ms-greeting-bubble');
  if (bubble) bubble.textContent = sarahHomeGreetingText(first);
}

function consumerDisplayFirstName(profile) {
  if (!profile) return '';
  return String(
    profile.firstName || profile.preferredName || profile.displayName || profile.fullName || profile.name || ''
  )
    .trim()
    .split(/\s+/)[0];
}

function consumerRegistrationComplete(profile) {
  if (!profile) return false;
  if (profile.onboardingCompletedAt) return true;
  const required = ['firstName', 'lastName', 'city', 'country'];
  return required.every((key) => String(profile[key] || '').trim());
}

function consumerProfileToIdentity(profile, extras = {}) {
  const first = String(profile?.firstName || '').trim();
  const last = String(profile?.lastName || '').trim();
  return {
    fullName: profile?.fullName || [first, last].filter(Boolean).join(' '),
    preferredName: profile?.preferredName || first,
    country: profile?.country || extras.country || '',
    city: profile?.city || extras.city || '',
    locationNote: extras.locationNote || '',
    preferredLanguage: extras.preferredLanguage || '',
    sarahBehavior: loadPersonalIdentity().sarahBehavior || {},
  };
}

async function syncConsumerProfileToPersonalKnowledge(profile, extras = {}) {
  const identity = consumerProfileToIdentity(profile, extras);
  savePersonalIdentity({
    fullName: identity.fullName,
    preferredName: identity.preferredName,
    country: identity.country,
    city: identity.city,
    locationNote: identity.locationNote,
    preferredLanguage: identity.preferredLanguage,
  });
  await syncPersonalProfileKnowledge(identity);
}

async function routeAfterConsumerAuth(profile) {
  const p = profile || window.SarahLive?.getConsumerProfile?.();
  applyConsumerProfileToUi(p);
  if (!consumerRegistrationComplete(p)) {
    if (personalSarahLiveActive() && window.SarahLive?.isSignedIn?.()) {
      await syncPersonalSarahSessionsFromServer({ force: true });
    }
    setRoute('register-details');
    return;
  }
  setRoute('home');
  void renderSarahHomeIntelligence();
  if (personalSarahLiveActive() && window.SarahLive?.isSignedIn?.()) {
    void (async () => {
      await syncPersonalSarahSessionsFromServer({ force: true });
      await syncConsumerProfileToPersonalKnowledge(p);
      void renderSarahHomeIntelligence();
    })();
  }
}

function populateRegisterDetailsForm(profile) {
  const form = document.getElementById('registerDetailsForm');
  if (!form || !profile) return;
  const set = (name, value) => {
    const el = form.elements.namedItem(name);
    if (el && 'value' in el) el.value = value ?? '';
  };
  set('firstName', profile.firstName || profile.preferredName || '');
  set('lastName', profile.lastName || '');
  set('email', profile.email || window.SarahLive?.getConsumerProfile?.()?.email || '');
  set('city', profile.city || '');
  set('country', profile.country || '');
  const local = loadPersonalIdentity();
  set('locationNote', local.locationNote || '');
  set('preferredLanguage', local.preferredLanguage || '');
}

function renderRegisterDetails() {
  if (personalSarahLiveActive() && window.SarahLive?.isSignedIn && !window.SarahLive.isSignedIn()) {
    setRoute('auth');
    return;
  }
  const profile = window.SarahLive?.getConsumerProfile?.() || {};
  if (consumerRegistrationComplete(profile)) {
    setRoute('home');
    return;
  }
  populateRegisterDetailsForm(profile);
  const statusEl = document.getElementById('registerDetailsStatus');
  if (statusEl) statusEl.textContent = '';
}

function clearLegacySampleProfileAvatar() {
  try {
    const raw = localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY) || '';
    if (/spencer-avatar|profile\/spencer/i.test(raw)) {
      localStorage.removeItem(PROFILE_AVATAR_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function applyConsumerProfileToUi(profile) {
  if (!profile) return;
  if (!String(profile.photoURL || '').trim()) clearLegacySampleProfileAvatar();
  const first = consumerDisplayFirstName(profile) || 'Member';
  const full =
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
    profile.fullName ||
    profile.preferredName ||
    first;
  MOCK_USER.name = first;
  if (profile.email) MOCK_USER.email = profile.email;
  document.querySelectorAll('[data-profile-name-mode="first"], .ms-drawer-user-name').forEach((el) => {
    el.textContent = first;
  });
  document.querySelectorAll('[data-profile-name][data-profile-kind="persona"]').forEach((el) => {
    el.textContent = full;
  });
  document.querySelectorAll('[data-profile-name]:not([data-profile-name-mode="first"])').forEach((el) => {
    if (el.classList.contains('ms-drawer-user-name')) return;
    if (el.dataset.profileKind === 'business') return;
    el.textContent = full;
  });
  syncSarahTimeGreetings();
  syncUserAvatars();
  applyStoredProfileMedia();
  void syncSarahPlanLabels();
}

async function syncPersonalSarahSessionsFromServer({ force = false, silent = false } = {}) {
  if (!personalSarahLiveActive()) return;
  const now = Date.now();
  if (!force && now - personalSarahSessionsLastSyncAt < PERSONAL_SESSIONS_SYNC_MIN_MS) {
    return;
  }
  const gen = ++personalSarahSessionsSyncGen;
  const hadThreads = listPersonalThreads().length > 0;
  if (!silent && !hadThreads) {
    personalSarahSessionsLoading = true;
    renderMsDrawerRecents();
  }
  const res = await window.SarahLive.fetchPersonalSessions();
  if (gen !== personalSarahSessionsSyncGen) return;
  personalSarahSessionsLoading = false;
  personalSarahSessionsLastSyncAt = Date.now();
  if (res.error) {
    if (!silent) showProtoToast(res.error);
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
        mode: summary.mode,
        lastMessagePreview: summary.lastMessagePreview || '',
        lastMessageAt: summary.lastMessageAt,
        updatedAt: summary.updatedAt,
        workSubmittedAt: summary.workSubmittedAt,
        workCompletedAt: summary.workCompletedAt,
        workCancelledAt: summary.workCancelledAt,
        workPausedAt: summary.workPausedAt,
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
  const msPanel = document.querySelector('.my-sarah-view')?.dataset.msPanel;
  if (msPanel === 'tasks') void renderSarahWorkHomeDashboard();
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

function pushPersonalAssistantReply(threadId, markdown, creditsMeta, recommendationsUi) {
  const rt = getSarahRuntime();
  const thread = rt.threads[threadId];
  if (!thread) return;
  const msg = { role: 'assistant', markdown: String(markdown || '…') };
  if (creditsMeta && Number.isFinite(Number(creditsMeta.credits))) {
    msg.creditsUsed = Number(creditsMeta.credits);
    msg.creditArchetype = creditsMeta.archetype || null;
  }
  if (recommendationsUi && typeof recommendationsUi === 'object') {
    msg.recommendationsUi = recommendationsUi;
  }
  thread.messages.push(msg);
}

function discoverHashFromProfileUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const m = raw.match(/\/discover\/([^/?#]+)/i) || raw.match(/^discover\/([^/?#]+)/i);
  return m ? m[1] : null;
}

function renderRecommendationsUiMarkup(ui) {
  if (!ui || typeof ui !== 'object') return '';
  const organic = Array.isArray(ui.organic) ? ui.organic : [];
  const sponsored = Array.isArray(ui.sponsored) ? ui.sponsored : [];
  if (!organic.length && !sponsored.length) return '';
  const disc = ui.disclosure || {};
  const head = disc.headline ? `<p class="rec-disclosure-head"><strong>${escapeHtml(disc.headline)}</strong></p>` : '';
  const body = disc.body ? `<p class="rec-disclosure-body">${escapeHtml(disc.body)}</p>` : '';

  const card = (item, sponsoredRow) => {
    const sn = discoverHashFromProfileUrl(item.discoverProfileUrl);
    const link = sn
      ? `<button type="button" class="rec-card-link" data-rec-discover="${escapeHtml(sn)}">View on Discover</button>`
      : '';
    const badge = sponsoredRow
      ? `<span class="rec-badge rec-badge--sponsored" title="Paid visibility — not an endorsement">${escapeHtml(item.disclosureLabel || 'Sponsored')}</span>`
      : `<span class="rec-badge rec-badge--organic">Match</span>`;
  const reason = item.reason ? `<p class="rec-card-reason">${escapeHtml(item.reason)}</p>` : '';
    return `<li class="rec-card${sponsoredRow ? ' rec-card--sponsored' : ''}">
      <div class="rec-card-top">
        <span class="rec-card-name">${escapeHtml(item.displayName || 'Offering')}</span>
        ${badge}
      </div>
      ${reason}
      ${link}
    </li>`;
  };

  const organicList = organic.length
    ? `<section class="rec-section" aria-label="Organic recommendations"><h4 class="rec-section-title">Relevant options</h4><ul class="rec-card-list">${organic.map((o) => card(o, false)).join('')}</ul></section>`
    : '';
  const sponsoredList = sponsored.length
    ? `<section class="rec-section" aria-label="Sponsored recommendations"><h4 class="rec-section-title">Sponsored</h4><ul class="rec-card-list">${sponsored.map((o) => card(o, true)).join('')}</ul></section>`
    : '';

  return `<aside class="rec-disclosure-panel" role="complementary" data-request-id="${escapeHtml(ui.requestId || '')}">
    ${head}
    ${body}
    ${organicList}
    ${sponsoredList}
  </aside>`;
}

function removeThinkingBubble(threadId) {
  const rt = getSarahRuntime();
  const thread = rt.threads[threadId];
  if (!thread?.messages?.length) return;
  const last = thread.messages[thread.messages.length - 1];
  if (last?.thinking) thread.messages.pop();
}

function pushThinkingToThread(threadId) {
  const rt = getSarahRuntime();
  const thread = rt.threads[threadId];
  if (!thread?.messages) return;
  removeThinkingBubble(threadId);
  thread.messages.push({ thinking: true });
}

function composePendingBucket(kind) {
  return kind === 'personal' ? personalComposePending : threadComposePending;
}

function renderComposePendingStrip(bucket, hostId) {
  const host = document.getElementById(hostId);
  if (!host) return;
  if (!bucket.items.length) {
    host.classList.add('hidden');
    host.innerHTML = '';
    return;
  }
  host.classList.remove('hidden');
  host.innerHTML = bucket.items
    .map(
      (item, index) => `
    <div class="thread-compose-chip${item.error ? ' is-error' : ''}${item.uploading ? ' is-uploading' : ''}" data-pending-index="${index}">
      ${
        item.previewUrl
          ? `<img src="${escapeHtml(item.previewUrl)}" alt="" class="thread-compose-chip-thumb" />`
          : `<span class="thread-compose-chip-icon" aria-hidden="true">${item.kind === 'audio' ? '🎙' : '📎'}</span>`
      }
      <button type="button" class="thread-compose-chip-remove" data-remove-pending="${index}" aria-label="Remove">×</button>
    </div>`
    )
    .join('');
  host.querySelectorAll('[data-remove-pending]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-remove-pending'));
      const removed = bucket.items.splice(i, 1)[0];
      if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
      renderComposePendingStrip(bucket, hostId);
    });
  });
}

async function uploadComposePending(bucket) {
  if (!window.SarahLive?.uploadChatMedia) return bucket.items.filter((i) => i.attachment).map((i) => i.attachment);
  const out = [];
  for (const item of bucket.items) {
    if (item.attachment) {
      out.push(item.attachment);
      continue;
    }
    if (!item.file || item.error) continue;
    item.uploading = true;
    const res = await window.SarahLive.uploadChatMedia(item.file);
    item.uploading = false;
    if (res.error || !res.attachment) {
      item.error = res.error || 'Upload failed';
      showProtoToast(item.error);
      continue;
    }
    item.attachment = res.attachment;
    out.push(res.attachment);
  }
  return out;
}

function addFilesToComposePending(files, bucket, hostId) {
  const list = Array.from(files || []).slice(0, 4);
  list.forEach((file) => {
    const kind = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('image/')
          ? 'image'
          : 'file';
    const previewUrl = kind === 'image' ? URL.createObjectURL(file) : '';
    bucket.items.push({ file, kind, previewUrl, attachment: null, uploading: false, error: '' });
  });
  renderComposePendingStrip(bucket, hostId);
}

function clearComposePending(bucket, hostId) {
  bucket.items.forEach((item) => {
    if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
  });
  bucket.items = [];
  renderComposePendingStrip(bucket, hostId);
}

function bindThreadComposeMedia() {
  if (window.__threadComposeMediaBound) return;
  window.__threadComposeMediaBound = true;

  const threadFile = document.getElementById('threadComposeFile');
  const threadAttach = document.getElementById('threadComposeAttachBtn');
  const threadVoice = document.getElementById('threadComposeVoiceBtn');
  threadAttach?.addEventListener('click', () => threadFile?.click());
  threadFile?.addEventListener('change', (e) => {
    addFilesToComposePending(e.target.files, threadComposePending, 'threadComposePending');
    if (threadFile) threadFile.value = '';
  });

  threadVoice?.addEventListener('click', () => void toggleThreadVoiceRecording('thread'));

  const personalFile = document.getElementById('personalChatFile');
  const personalAttach = document.getElementById('personalChatAttachBtn');
  const personalVoice = document.getElementById('personalChatVoiceBtn');
  personalAttach?.addEventListener('click', () => personalFile?.click());
  personalFile?.addEventListener('change', (e) => {
    addFilesToComposePending(e.target.files, personalComposePending, 'personalComposePending');
    if (personalFile) personalFile.value = '';
  });
  personalVoice?.addEventListener('click', () => void toggleThreadVoiceRecording('personal'));
}

async function toggleThreadVoiceRecording(scope) {
  const bucket = composePendingBucket(scope);
  const hostId = scope === 'personal' ? 'personalComposePending' : 'threadComposePending';
  const btn = scope === 'personal' ? document.getElementById('personalChatVoiceBtn') : document.getElementById('threadComposeVoiceBtn');
  if (threadVoiceRecorder?.scope === scope && threadVoiceRecorder?.recorder?.state === 'recording') {
    threadVoiceRecorder.recorder.stop();
    btn?.classList.remove('is-recording');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showProtoToast('Microphone not available on this device.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data?.size) chunks.push(ev.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
      addFilesToComposePending([file], bucket, hostId);
      threadVoiceRecorder = null;
    };
    threadVoiceRecorder = { recorder, scope };
    recorder.start();
    btn?.classList.add('is-recording');
    showProtoToast('Recording… tap mic again to stop.');
    setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
        btn?.classList.remove('is-recording');
      }
    }, 90_000);
  } catch {
    showProtoToast('Could not access the microphone.');
  }
}

function ensureActiveCompanyThreadRecord(companyId) {
  const rt = getSarahRuntime();
  const existing = rt.threads[companyId];
  if (existing?.kind === 'company' && Array.isArray(existing.messages)) return existing;
  const ctx = getActiveThreadContext();
  const record = {
    kind: 'company',
    companyId,
    api: Boolean(ctx.api),
    name: ctx.name,
    avatar: ctx.avatar,
    verified: ctx.verified,
    messages: Array.isArray(existing?.messages) ? existing.messages : Array.isArray(ctx.messages) ? [...ctx.messages] : [],
  };
  rt.threads[companyId] = record;
  rt.activeThreadId = companyId;
  return record;
}

async function deliverPersonalSarahMessage(text, opts) {
  const trimmed = String(text || '').trim();
  const pendingBucket = opts?.fromHomeCompose ? personalComposePending : threadComposePending;
  const pendingHost = opts?.fromHomeCompose ? 'personalComposePending' : 'threadComposePending';
  const attachments = await uploadComposePending(pendingBucket);
  if (!trimmed && !attachments.length) return null;
  if (personalSarahSending) return null;
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
    if (!isRetry) {
      const rt = getSarahRuntime();
      const thread = rt.threads[threadId];
      if (thread) {
        thread.messages.push({ role: 'user', content: trimmed, attachments: [...attachments] });
      } else {
        pushPersonalUserMessage(threadId, trimmed);
      }
    }
    pushThinkingToThread(threadId);
    clearComposePending(pendingBucket, pendingHost);
    if (fromHomeCompose) {
      await openPersonalSarahThread(threadId, { skipServerLoad: true });
    } else {
      renderThread();
    }
    setPersonalSarahComposeBusy(true);
    const res = await window.SarahLive.sendPersonalMessage(trimmed, { work, sessionId: threadId, attachments });
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
      } else if (res.code === 'CREDITS_EXHAUSTED') {
        thread?.messages.push({
          role: 'assistant',
          markdown:
            '**AI credits used up** for this billing period. Open **Profile → Billing** to buy a top-up, or wait until your plan renews. Sarah Work is paused until you have credits again.',
        });
        showProtoToast('AI credits exhausted — top up or wait for renewal.');
        void refreshSarahPlanUsageUi(['profile', 'account', 'billing']);
        setRoute('home');
        setMySarahPanel('billing');
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
      pushPersonalAssistantReply(threadId, res.reply, res.creditsLast, res.recommendationsUi);
      const rt = getSarahRuntime();
      const thread = rt.threads[threadId];
      if (thread) thread.lastMessageAt = Date.now();
      if (res.workCompleted) {
        thread && (thread.workCompleted = true);
        showProtoToast('Sarah Work task completed — see My Notifications.');
        void refreshLiveNotifications();
      }
      void applyPersonalReminderSideEffects(res.actions, trimmed);
      void refreshSarahPlanUsageUi();
    }
    renderThread();
    renderMsDrawerRecents();
    renderMySarahHistoryFromThreads();
    updatePersonalSarahLiveUi();
    return threadId;
  }

  if (threadId) {
    pushPersonalUserMessage(threadId, trimmed);
    pushThinkingToThread(threadId);
    renderThread();
    setPersonalSarahComposeBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 560));
    removeThinkingBubble(threadId);
    const thread = getSarahRuntime().threads[threadId];
    thread?.messages.push({
      role: 'assistant',
      markdown: assistantReplyForThread(thread?.work, trimmed),
    });
    if (thread && (!thread.title || thread.title === 'New chat')) {
      thread.title = truncatePersonalTitle(trimmed);
      thread.name = thread.title;
    }
    if (thread) thread.timeLabel = 'Just now';
    getSarahRuntime().personalThreadOrder = [threadId, ...getSarahRuntime().personalThreadOrder.filter((x) => x !== threadId)];
    setPersonalSarahComposeBusy(false);
    renderThread();
    if (thread?.work) schedulePrototypeWorkCompletion(threadId);
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
  if (thread.work) schedulePrototypeWorkCompletion(threadId);
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
function openPersonalSarahThread(threadId, { skipServerLoad = false } = {}) {
  if (personalSarahUsesMockThreads()) ensurePersonalThreadsSeeded();
  const rt = getSarahRuntime();
  if (!rt.threads[threadId] && personalSarahLiveActive()) {
    upsertPersonalThreadFromSession({ id: threadId, title: 'My Sarah', messages: [] }, { partial: true });
  }
  if (!rt.threads[threadId]) return;
  rt.activeThreadId = threadId;
  persistPersonalSarahSessionId(threadId);
  setRoute('chat-thread');
  if (personalSarahLiveActive() && !skipServerLoad) {
    void loadPersonalThreadFromServer(threadId).then((ok) => {
      if (ok && parseLocationHash().route === 'chat-thread') renderThread();
    });
  }
}

async function startNewPersonalChat(options = {}) {
  const work = Boolean(options.work);
  if (work) {
    return startNewWorkThread();
  }
  goToMySarahHome('');

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

function utcDayKeyClient() {
  return new Date().toISOString().slice(0, 10);
}

function readMockWorkUsage() {
  try {
    const raw = localStorage.getItem(WORK_USAGE_KEY);
    if (!raw) return { dayKey: utcDayKeyClient(), used: 0 };
    const parsed = JSON.parse(raw);
    if (parsed.dayKey !== utcDayKeyClient()) return { dayKey: utcDayKeyClient(), used: 0 };
    return { dayKey: parsed.dayKey, used: Number(parsed.used) || 0 };
  } catch {
    return { dayKey: utcDayKeyClient(), used: 0 };
  }
}

function writeMockWorkUsage(used) {
  try {
    localStorage.setItem(WORK_USAGE_KEY, JSON.stringify({ dayKey: utcDayKeyClient(), used }));
  } catch {
    /* ignore */
  }
}

function currentBillingTier() {
  return MOCK_SARAH_BILLING_TIERS.find((t) => t.current) || MOCK_SARAH_BILLING_TIERS[0];
}

function buildClientWorkHomeFromThreads() {
  const threads = Object.values(getSarahRuntime().threads || {}).filter((t) => t.kind === 'personal' && t.work);
  const assignments = threads.map((t) => {
    const ws = getThreadWorkWorkspace(t);
    const pendingApprovals = (ws.approvals || []).filter((a) => a.status === 'pending').length;
    let priorityBand = 'planned';
    let priorityLabel = 'Open';
    let priorityScore = 30;
    if (t.workPaused) {
      priorityBand = 'urgent';
      priorityLabel = 'Paused';
      priorityScore = 100;
    } else if (pendingApprovals) {
      priorityBand = 'urgent';
      priorityLabel = 'Needs approval';
      priorityScore = 90;
    } else if (t.workSubmitted && !t.workCompleted) {
      priorityBand = 'active';
      priorityLabel = 'In progress';
      priorityScore = 70;
    } else if (t.workCompleted) {
      priorityBand = 'done';
      priorityLabel = 'Complete';
      priorityScore = 10;
    } else if (!t.workSubmitted) {
      priorityBand = 'planned';
      priorityLabel = 'Draft';
      priorityScore = 40;
    }
    return {
      id: t.api ? Object.keys(getSarahRuntime().threads).find((k) => getSarahRuntime().threads[k] === t) : null,
      title: t.title || t.name || 'Work assignment',
      assignmentStatus: ws.assignmentStatus,
      progressPercent: ws.progressPercent || 0,
      phaseLabel: ws.phaseLabel || '',
      capabilityLabel: ws.capabilityLabel || null,
      priorityBand,
      priorityLabel,
      priorityScore,
      pendingApprovals,
      lastMessageAt: t.lastMessageAt,
    };
  });
  assignments.forEach((a, i) => {
    if (!a.id) {
      const key = Object.entries(getSarahRuntime().threads).find(([, v]) => v.title === a.title)?.[0];
      if (key) assignments[i].id = key;
    }
  });
  const byCapability = {};
  for (const a of assignments) {
    const cap = inferClientWorkCapability(getSarahRuntime().threads[a.id] || {}) || 'coordination';
    byCapability[cap] = (byCapability[cap] || 0) + 1;
  }
  const stats = {
    total: assignments.length,
    inProgress: assignments.filter((a) => a.priorityBand === 'active').length,
    completed: assignments.filter((a) => a.assignmentStatus === 'completed').length,
    draft: assignments.filter((a) => a.assignmentStatus === 'draft').length,
    urgent: assignments.filter((a) => a.priorityBand === 'urgent').length,
    avgProgress: assignments.length
      ? Math.round(assignments.reduce((s, a) => s + (a.progressPercent || 0), 0) / assignments.length)
      : 0,
    byCapability,
  };
  const priority = [...assignments].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 8);
  const urgent = priority.filter((a) => a.priorityBand === 'urgent');
  const summary =
    urgent.length > 0
      ? `Today's Work: ${urgent.length} need attention · ${stats.inProgress} in progress.`
      : stats.inProgress
        ? `Today's Work: ${stats.inProgress} assignment${stats.inProgress === 1 ? '' : 's'} in progress.`
        : 'Start a work item — Sarah tracks milestones and deliverables for you.';
  return { summary, stats, priority, assignments };
}

const CLIENT_CAPABILITY_LABELS = {
  research: 'Research',
  writing: 'Writing & creation',
  planning: 'Planning',
  administration: 'Administration',
  analysis: 'Analysis',
  monitoring: 'Monitoring',
  coordination: 'Coordination',
  personal_assistance: 'Personal assistance',
};

const WORK_ACTIVITY_KIND_LABELS_CLIENT = {
  submit: 'Submitted',
  cancel: 'Cancelled',
  pause: 'Paused',
  complete: 'Completed',
  run_start: 'Execution',
  milestone_start: 'Milestone',
  milestone_complete: 'Milestone',
  milestone_blocked: 'Blocked',
  approval_requested: 'Approval',
  approval_approved: 'Approval',
  approval_rejected: 'Approval',
  step_meter: 'Credits',
  message: 'Update',
};

function inferClientWorkCapability(thread) {
  const firstUser = (thread?.messages || []).find((m) => m.role === 'user');
  const text = String(firstUser?.content || thread?.title || '').toLowerCase();
  if (/\b(research|compare|market|supplier|fact)\b/.test(text)) return 'research';
  if (/\b(report|proposal|presentation|document|draft|write)\b/.test(text)) return 'writing';
  if (/\b(plan|schedule|travel|event|project)\b/.test(text)) return 'planning';
  if (/\b(spreadsheet|financial|analys|analyz|numbers)\b/.test(text)) return 'analysis';
  if (/\b(track|monitor|deadline|price|reply|follow up|follow-up|watch)\b/.test(text)) return 'monitoring';
  if (/\b(remind|organis|organiz|admin)\b/.test(text)) return 'administration';
  return 'coordination';
}

function buildClientWorkActivity(thread) {
  const acts = Array.isArray(thread?.workWorkspace?.activity) ? [...thread.workWorkspace.activity] : [];
  if (thread?.workSubmitted) {
    acts.push({ kind: 'submit', kindLabel: 'Submitted', label: 'Assignment submitted to Sarah', at: new Date().toISOString() });
  }
  if (thread?.workPaused) {
    acts.push({
      kind: 'pause',
      kindLabel: 'Paused',
      label: thread.workPauseReason || 'Assignment paused',
      at: new Date().toISOString(),
    });
  }
  if (thread?.workCompleted) {
    acts.push({ kind: 'complete', kindLabel: 'Completed', label: 'Assignment completed', at: new Date().toISOString() });
  }
  if (thread?.workCancelled) {
    acts.push({ kind: 'cancel', kindLabel: 'Cancelled', label: 'Assignment cancelled', at: new Date().toISOString() });
  }
  return acts.slice(-48);
}

function formatWorkReminderDue(dueAt) {
  const ms = Date.parse(dueAt);
  if (!Number.isFinite(ms)) return String(dueAt || '');
  try {
    const now = Date.now();
    const sameDay = new Date(ms).toDateString() === new Date(now).toDateString();
    const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: false });
    if (sameDay) return `Today · ${timeFmt.format(ms)}`;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (new Date(ms).toDateString() === tomorrow.toDateString()) {
      return `Tomorrow · ${timeFmt.format(ms)}`;
    }
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).format(ms);
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function workReminderCardHtml(r, { done = false } = {}) {
  const when = formatWorkReminderDue(r.dueAt);
  const status = done ? 'Completed' : 'Scheduled';
  const modifier = done ? 'ms-work-reminder-card--done' : 'ms-work-reminder-card--upcoming';
  return `<li class="ms-work-reminder-card ${modifier}">
    <span class="ms-work-reminder-icon" aria-hidden="true">
      <svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>
    </span>
    <div class="ms-work-reminder-body">
      <span class="ms-work-reminder-title">${escapeHtml(r.title || 'Reminder')}</span>
      <span class="ms-work-reminder-meta">
        <span class="ms-work-reminder-pill">${status}</span>
        <time class="ms-work-reminder-when" datetime="${escapeHtml(String(r.dueAt || ''))}">${escapeHtml(when)}</time>
      </span>
    </div>
  </li>`;
}

function reminderActionSucceeded(actions) {
  return (actions || []).some((a) => a.tool === 'createPersonalReminder' && a.success && a.data?.taskId);
}

async function ensureClientReminderFromMessage(userText, actions = []) {
  if (reminderActionSucceeded(actions)) return null;
  if (!/\b(remind|reminder|alarm|remember to)\b/i.test(String(userText || ''))) return null;
  if (!personalSarahLiveActive() || !window.SarahLive?.createPersonalReminder) return null;
  const title = String(userText || '')
    .replace(/\b(remind(?: me)?(?: to| as(?: an?)? alarm)?)\b/i, '')
    .trim()
    .slice(0, 120);
  const res = await window.SarahLive.createPersonalReminder({
    title: title || 'Reminder',
    dueAt: userText,
    notes: userText,
  });
  if (res.error) return null;
  return res.reminder || null;
}

let sarahTasksModulePromise = null;

function loadSarahTasksModule() {
  if (!sarahTasksModulePromise) {
    sarahTasksModulePromise = import('./sarah-tasks.mjs');
  }
  return sarahTasksModulePromise;
}

function sarahTasksHubOptions() {
  return {
    escapeHtml,
    toast: showProtoToast,
    fetchReminders: (opts) => window.SarahLive?.fetchPersonalReminders?.(opts),
    fetchTasks: (opts) => window.SarahLive?.fetchPersonalSarahTasks?.(opts),
    createReminder: (body) => window.SarahLive?.createPersonalReminder?.(body),
    createTask: (body) => window.SarahLive?.createPersonalSarahTask?.(body),
    updateTask: (id, patch) => window.SarahLive?.updatePersonalSarahTask?.(id, patch),
    onReminderCreated: async (rem) => {
      if (rem?.id) {
        try {
          const alarm = await import('./sna-reminders.mjs');
          alarm.syncServerReminderSchedule({
            id: rem.id,
            title: rem.title,
            body: rem.notes || rem.title,
            dueAt: rem.dueAt,
          });
        } catch {
          /* ignore */
        }
      }
      void refreshLiveNotifications();
      syncNotificationBadge();
    },
    onDelegate: (payload) => {
      const prompt = typeof payload === 'string' ? payload : payload?.prompt || '';
      showProtoToast(prompt ? 'Opening Sarah Work…' : 'Opening Sarah Work chat…');
      void startNewWorkThread(prompt);
    },
  };
}

let sarahTasksHubReady = false;

async function initSarahTasksPanel() {
  const mod = await loadSarahTasksModule();
  const opts = sarahTasksHubOptions();
  if (sarahTasksHubReady) {
    mod.mountSarahTasksHub(opts, { preserveNavigation: true });
    mod.refreshSarahTasksHub({ forceReminders: true });
    return;
  }
  mod.mountSarahTasksHub(opts);
  sarahTasksHubReady = true;
}

async function refreshSarahTasksPanelIfOpen() {
  if (document.querySelector('.my-sarah-view')?.dataset.msPanel !== 'tasks') return;
  const mod = await loadSarahTasksModule();
  mod.mountSarahTasksHub(sarahTasksHubOptions(), { preserveNavigation: true });
  mod.refreshSarahTasksHub({ forceReminders: true });
}

async function applyPersonalReminderSideEffects(actions = [], userText = '') {
  let reminder = (actions || []).find((a) => a.tool === 'createPersonalReminder' && a.success)?.data;
  if (!reminder?.taskId) {
    const saved = await ensureClientReminderFromMessage(userText, actions);
    if (saved) reminder = { taskId: saved.id, dueAt: saved.dueAt, title: saved.title };
  }
  if (!reminder?.taskId) return;
  try {
    const alarm = await import('./sna-reminders.mjs');
    alarm.syncServerReminderSchedule({
      id: reminder.taskId,
      title: reminder.title,
      body: reminder.notes || reminder.title || userText,
      dueAt: reminder.dueAt,
    });
  } catch {
    /* ignore */
  }
  void refreshLiveNotifications();
  void renderWorkRemindersList();
  void refreshSarahTasksPanelIfOpen();
  syncNotificationBadge();
  if (document.querySelector('.my-sarah-view')?.dataset.msPanel === 'tasks') {
    showProtoToast('Reminder saved — see Sarah Tasks and My Notifications → Reminders.');
  }
}

async function renderWorkRemindersList() {
  const listEl = document.getElementById('msWorkRemindersList');
  const leadEl = document.getElementById('msWorkRemindersLead');
  if (!listEl) return;
  if (!personalSarahLiveActive() || !window.SarahLive?.fetchPersonalReminders) {
    listEl.innerHTML = '<li class="ms-work-reminder-empty">Sign in to save and track reminders here.</li>';
    return;
  }
  const res = await window.SarahLive.fetchPersonalReminders({ limit: 30 });
  if (res.error) {
    listEl.innerHTML = '<li class="ms-work-reminder-empty">Could not load reminders right now.</li>';
    return;
  }
  const now = Date.now();
  const rows = (res.reminders || []).slice().sort((a, b) => Date.parse(a.dueAt || 0) - Date.parse(b.dueAt || 0));
  const scheduled = rows.filter((r) => r.status === 'scheduled');
  const upcoming = scheduled.filter((r) => Date.parse(r.dueAt || 0) >= now - 60_000);
  const overdue = scheduled.filter((r) => Date.parse(r.dueAt || 0) < now - 60_000);
  const recent = rows.filter((r) => r.status === 'fired').slice(-4).reverse();
  const upcomingCount = upcoming.length;
  if (leadEl) {
    if (upcomingCount) {
      leadEl.textContent = `${upcomingCount} upcoming — alarm + push at the due time.`;
    } else if (scheduled.length) {
      leadEl.textContent = `${scheduled.length} waiting to fire — open Sarah near the due time or we’ll catch up on the next poll.`;
    } else {
      leadEl.textContent = 'Ask Sarah to remind you, or tap Set reminder.';
    }
  }
  if (!scheduled.length && !recent.length) {
    listEl.innerHTML =
      '<li class="ms-work-reminder-empty">No reminders yet. Tap <strong>Set reminder</strong> or tell Sarah when to alert you.</li>';
    return;
  }
  const parts = [];
  if (overdue.length) {
    parts.push(`<li class="ms-work-reminder-group-label">Needs attention</li>`);
    parts.push(...overdue.map((r) => workReminderCardHtml(r)));
  }
  if (upcoming.length) {
    parts.push(`<li class="ms-work-reminder-group-label">${overdue.length ? 'Upcoming' : 'Scheduled'}</li>`);
    parts.push(...upcoming.map((r) => workReminderCardHtml(r)));
  }
  if (recent.length) {
    parts.push(`<li class="ms-work-reminder-group-label">Recently completed</li>`);
    parts.push(...recent.map((r) => workReminderCardHtml(r, { done: true })));
  }
  listEl.innerHTML = parts.join('');
}

async function renderSarahWorkHomeDashboard() {
  const dashRoot = document.getElementById('msWorkDashboard');
  const summaryEl = document.querySelector('#msWorkDaySummary .sw-home-ai-text');
  const statsEl = document.getElementById('msWorkStats');
  const chipsEl = document.getElementById('msWorkCapabilityChips');
  const listEl = document.getElementById('msWorkPriorityList');
  if (!summaryEl || !statsEl || !listEl) return;

  const clientDash = buildClientWorkHomeFromThreads();
  let dash = null;
  if (personalSarahLiveActive() && window.SarahLive?.fetchPersonalWorkHome) {
    const res = await window.SarahLive.fetchPersonalWorkHome();
    if (!res.error && res.dashboard) dash = res.dashboard;
  }
  if (!dash) dash = clientDash;
  else if ((dash.stats?.total || 0) < (clientDash.stats?.total || 0)) {
    dash = {
      ...dash,
      stats: { ...dash.stats, ...clientDash.stats, byCapability: dash.stats?.byCapability || clientDash.stats?.byCapability },
      priority: (dash.priority?.length ? dash.priority : clientDash.priority) || [],
      assignments: (dash.assignments?.length ? dash.assignments : clientDash.assignments) || [],
      summary: dash.summary || clientDash.summary,
    };
  }

  const st = dash.stats || {};
  const hasAssignments = (st.total || 0) > 0 || (Array.isArray(dash.priority) && dash.priority.length > 0);
  if (dashRoot) {
    dashRoot.classList.toggle('hidden', !hasAssignments);
    dashRoot.hidden = !hasAssignments;
  }
  if (!hasAssignments) {
    void renderWorkAssignmentsHistory(dash.assignments || []);
    return;
  }
  summaryEl.textContent = dash.summary || 'No assignments yet.';
  const completedPct = st.total ? Math.round((st.completed / st.total) * 100) : 0;
  statsEl.innerHTML = `
    <div class="sw-home-stat" role="listitem">
      <span class="sw-home-stat-value">${escapeHtml(String(st.inProgress || 0))}</span>
      <span class="sw-home-stat-label">In progress</span>
    </div>
    <div class="sw-home-stat" role="listitem">
      <span class="sw-home-stat-value">${escapeHtml(String(completedPct))}%</span>
      <span class="sw-home-stat-label">Completed</span>
    </div>
    <div class="sw-home-stat" role="listitem">
      <span class="sw-home-stat-value">${escapeHtml(String(st.avgProgress || 0))}%</span>
      <span class="sw-home-stat-label">Avg progress</span>
    </div>`;

  const capMap = st.byCapability || {};
  const capCatalog =
    Array.isArray(dash.capabilities) && dash.capabilities.length
      ? dash.capabilities
      : Object.keys(CLIENT_CAPABILITY_LABELS).map((id) => ({ id, label: CLIENT_CAPABILITY_LABELS[id] }));
  if (chipsEl) {
    const chips = capCatalog
      .map((c) => {
        const count = capMap[c.id] || 0;
        if (!count && !st.total) return '';
        return `<span class="sw-home-cap-chip" role="listitem" data-capability="${escapeHtml(c.id)}">${escapeHtml(c.label)} · ${escapeHtml(String(count))}</span>`;
      })
      .filter(Boolean);
    chipsEl.innerHTML =
      chips.length > 0
        ? chips.join('')
        : '<span class="sw-home-cap-chip sw-home-cap-chip--muted">Capability tags appear as you add assignments</span>';
  }

  const rows = (Array.isArray(dash.priority) ? dash.priority : []).filter((a) => {
    if (!a?.id) return false;
    const thread = getSarahRuntime().threads[a.id];
    if (!thread) return true;
    const hasUser = (thread.messages || []).some((m) => m.role === 'user' && String(m.content || '').trim());
    const isBlankDraft =
      thread.work &&
      !thread.workSubmitted &&
      !hasUser &&
      (!a.title || a.title === 'New work item');
    return !isBlankDraft;
  });
  if (!rows.length) {
    if (dashRoot) {
      dashRoot.classList.add('hidden');
      dashRoot.hidden = true;
    }
    void renderWorkAssignmentsHistory(dash.assignments || []);
    return;
  }
  listEl.innerHTML = rows
    .map((a) => {
      const id = a.id || '';
      return `<li class="sw-home-priority-item sw-home-priority--${escapeHtml(a.priorityBand || 'planned')}">
        <button type="button" class="sw-home-priority-btn" data-open-work-assignment="${escapeHtml(id)}">
          <span class="sw-home-priority-title">${escapeHtml(a.title || 'Assignment')}</span>
          <span class="sw-home-priority-meta">
            ${a.capabilityLabel ? `<span class="sw-home-priority-cap">${escapeHtml(a.capabilityLabel)}</span>` : ''}
            <span class="sw-home-priority-pill">${escapeHtml(a.priorityLabel || '')}</span>
            ${a.progressPercent != null ? `<span>${escapeHtml(String(a.progressPercent))}%</span>` : ''}
            ${a.phaseLabel ? `<span>${escapeHtml(a.phaseLabel)}</span>` : ''}
          </span>
        </button>
      </li>`;
    })
    .join('');
  listEl.querySelectorAll('[data-open-work-assignment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sid = btn.getAttribute('data-open-work-assignment');
      if (sid) void openPersonalSarahThread(sid);
    });
  });
  void renderWorkAssignmentsHistory(dash.assignments || rows);
}

function renderWorkAssignmentsHistory(assignments) {
  const historyHost = document.getElementById('msHistoryList');
  if (!historyHost) return;
  const rows = Array.isArray(assignments) ? assignments : [];
  if (!rows.length) {
    historyHost.innerHTML =
      '<p class="ms-thread-empty" style="padding:8px 12px">No assignments yet — start with New work item.</p>';
    return;
  }
  historyHost.innerHTML = rows
    .slice(0, 12)
    .map(
      (a) => `<button type="button" class="ms-history-item" data-personal-thread="${escapeHtml(a.id || '')}">
        <span class="ms-history-body">
          <span class="ms-history-title">${escapeHtml(a.title || 'Work')}</span>
          <span class="ms-history-time">${escapeHtml(a.capabilityLabel ? `${a.capabilityLabel} · ` : '')}${escapeHtml(a.priorityLabel || a.phaseLabel || '')} · ${escapeHtml(String(a.progressPercent ?? 0))}%</span>
        </span>
      </button>`
    )
    .join('');
  historyHost.querySelectorAll('[data-personal-thread]').forEach((btn) => {
    btn.addEventListener('click', () => openPersonalSarahThread(btn.getAttribute('data-personal-thread') || ''));
  });
}

async function refreshWorkQuotaState() {
  if (personalSarahLiveActive() && window.SarahLive?.fetchPersonalQuota) {
    const res = await window.SarahLive.fetchPersonalQuota();
    if (!res.error && res.quota) {
      const q = res.quota;
      workQuotaState.used = Number(q.workTasksUsed) || 0;
      workQuotaState.limit =
        Number(q.workTasksRemaining) >= 0 && q.workTasksUsed !== undefined
          ? Number(q.workTasksUsed) + Number(q.workTasksRemaining)
          : Number(q.workTasksPerDay ?? q.limit) || 0;
      workQuotaState.periodScoped = Boolean(q.periodScoped);
      workQuotaState.dayKey = q.dayKey || utcDayKeyClient();
      const cs = q.creditsShadow && typeof q.creditsShadow === 'object' ? q.creditsShadow : q;
      workQuotaState.availableCredits = Number(cs.availableCredits ?? q.availableCredits);
      workQuotaState.enforcementMode = String(cs.enforcementMode || q.enforcementMode || 'shadow');
      workQuotaState.loaded = true;
      return workQuotaState;
    }
  }
  const tier = currentBillingTier();
  const usage = readMockWorkUsage();
  workQuotaState.used = usage.used;
  workQuotaState.limit = Number(tier.workTasksPerDay) || 0;
  workQuotaState.dayKey = usage.dayKey;
  workQuotaState.loaded = true;
  return workQuotaState;
}

async function reserveWorkTaskSlot() {
  const q = await refreshWorkQuotaState();
  if (q.limit <= 0) return { allowed: false, reason: 'plan' };
  if (q.used >= q.limit) return { allowed: false, reason: 'quota' };
  if (personalSarahLiveActive()) return { allowed: true, live: true };
  const next = q.used + 1;
  writeMockWorkUsage(next);
  workQuotaState.used = next;
  return { allowed: true, live: false };
}

function renderWorkQuotaBanner() {
  const el = document.getElementById('msWorkQuota');
  if (!el) return;
  const q = workQuotaState;
  if (!q.loaded) {
    el.textContent = 'Loading Sarah Work allowance…';
    void refreshWorkQuotaState().then(() => renderWorkQuotaBanner());
    return;
  }
  if (q.limit <= 0) {
    el.textContent = 'Sarah Work is not included on Sarah Free. Upgrade to delegate tasks to Sarah.';
    return;
  }
  const creditsLine =
    Number.isFinite(q.availableCredits) && q.availableCredits >= 0
      ? `${formatSarahCredits(q.availableCredits)} AI credits available.`
      : '';
  const submitted = q.used > 0 ? `${q.used} task${q.used === 1 ? '' : 's'} submitted this period.` : '';
  if (q.enforcementMode === 'enforce') {
    el.textContent =
      [creditsLine, 'Sarah Work uses credits automatically (submit + run).', submitted].filter(Boolean).join(' ') ||
      'Sarah Work is included on your plan.';
    return;
  }
  const remaining = Math.max(0, q.limit - q.used);
  if (q.periodScoped) {
    el.textContent = `${creditsLine ? `${creditsLine} ` : ''}Tasks: ${q.used} / ${q.limit} this billing period · ${remaining} remaining.`;
  } else {
    el.textContent = `${creditsLine ? `${creditsLine} ` : ''}Tasks: ${q.used} / ${q.limit} today · ${remaining} remaining.`;
  }
}

function applyWorkEstimateToBar(plan) {
  const lead = document.getElementById('threadWorkSubmitLead');
  const meta = document.getElementById('threadWorkSubmitMeta');
  if (!lead || !plan) return;
  const band = plan.bandLabel || plan.band || 'Assignment';
  const min = plan.estimateRange?.min ?? plan.estimateMin;
  const max = plan.estimateRange?.max ?? plan.estimateMax;
  const cap = plan.capCredits;
  lead.textContent = `${band}: typical ${formatSarahCredits(min)}–${formatSarahCredits(max)} credits. Fair-share cap ${formatSarahCredits(cap)}.`;
  if (meta) {
    const rem = plan.remainingCredits;
    if (rem != null && Number.isFinite(Number(rem))) {
      meta.textContent = `${formatSarahCredits(rem)} credits on your account. Submit deducts a small starter cost, then Sarah runs within the cap.`;
      meta.hidden = false;
    } else {
      meta.textContent = '';
      meta.hidden = true;
    }
  }
}

async function loadWorkSubmitEstimate(threadId) {
  const lead = document.getElementById('threadWorkSubmitLead');
  if (!lead || !threadId) return;
  const cached = workEstimateByThread.get(threadId);
  if (cached && Date.now() - cached.at < WORK_ESTIMATE_TTL_MS) {
    applyWorkEstimateToBar(cached.plan);
    return;
  }
  lead.textContent = 'Estimating credits for this assignment…';
  if (personalSarahLiveActive() && window.SarahLive?.fetchPersonalWorkEstimate) {
    const res = await window.SarahLive.fetchPersonalWorkEstimate(threadId);
    if (res.error) {
      lead.textContent = 'Submit when ready — Sarah manages credits from your balance.';
      return;
    }
    workEstimateByThread.set(threadId, { at: Date.now(), plan: res.workBudget });
    applyWorkEstimateToBar(res.workBudget);
  } else {
    lead.textContent = 'Submit your task — credits are managed automatically within your plan.';
  }
}

function milestoneStatusLabel(status) {
  const map = {
    pending: 'Pending',
    in_progress: 'In progress',
    complete: 'Complete',
    blocked: 'Blocked',
  };
  return map[status] || status;
}

function milestoneStatusClass(status) {
  return `work-ws-ms--${String(status || 'pending').replace(/_/g, '-')}`;
}

function buildClientWorkReferenceFiles(thread) {
  const files = [];
  (thread?.messages || []).forEach((msg, msgIndex) => {
    const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
    attachments.forEach((att, i) => {
      files.push({
        id: `file-${msgIndex}-${i}`,
        name: att.name || att.filename || 'Attachment',
        mimeType: att.mimeType || att.type || 'file',
        url: att.url || null,
        source: 'chat_attachment',
        role: msg.role,
        contextPreview: String(msg.content || '').trim().slice(0, 120) || null,
      });
    });
    if (msg.role === 'user' && msg.content) {
      const urls = String(msg.content).match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
      [...new Set(urls)].slice(0, 6).forEach((url, i) => {
        files.push({
          id: `link-${msgIndex}-${i}`,
          name: url.length > 56 ? `${url.slice(0, 53)}…` : url,
          mimeType: 'link',
          url,
          source: 'message_link',
          role: 'user',
          contextPreview: String(msg.content).trim().slice(0, 120),
        });
      });
    }
  });
  return files;
}

function buildClientWorkDeliverables(thread) {
  const st = thread.workCompleted ? 'ready' : thread.workSubmitted ? 'in_progress' : 'pending';
  const items = [
    {
      id: 'del-primary',
      title: thread.workReport?.taskTitle || thread.title || 'Assignment deliverable',
      kind: 'document',
      status: st,
      summary: thread.workReport?.summary || null,
      charCount: thread.workReport?.markdown ? thread.workReport.markdown.length : 0,
    },
  ];
  const research = thread.workReport?.execution?.research;
  if (research) {
    items.push({
      id: 'del-research',
      title: 'Research notes',
      kind: 'summary',
      status: 'ready',
      summary: String(research).slice(0, 200),
    });
  }
  return items;
}

function deliverableStatusLabel(status) {
  const map = {
    pending: 'Pending',
    in_progress: 'In progress',
    ready: 'Ready',
    failed: 'Failed',
    pending_approval: 'Needs approval',
  };
  return map[status] || status;
}

function approvalStatusLabel(status) {
  const map = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
  return map[status] || status;
}

async function resolveWorkApprovalUi(sessionId, approvalId, decision) {
  if (!personalSarahLiveActive() || !window.SarahLive?.resolvePersonalWorkApproval) {
    showProtoToast('Approvals require live Personal Sarah.');
    return;
  }
  const res = await window.SarahLive.resolvePersonalWorkApproval(sessionId, approvalId, { decision });
  if (res.error) {
    showProtoToast(res.error);
    return;
  }
  if (res.session) upsertPersonalThreadFromSession(res.session, { partial: false });
  showProtoToast(
    decision === 'approved'
      ? res.resumed
        ? 'Approved — Sarah resumed the assignment.'
        : 'Approved.'
      : 'Request rejected.'
  );
  syncWorkWorkspaceUi(getActiveThreadContext());
  if (res.resumed) void pollWorkSessionUntilSettled(sessionId);
}

async function downloadWorkDeliverable(sessionId, deliverableId, title) {
  const safeName = String(title || deliverableId || 'deliverable')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
  if (personalSarahLiveActive() && window.SarahLive?.fetchPersonalWorkDeliverable) {
    const res = await window.SarahLive.fetchPersonalWorkDeliverable(sessionId, deliverableId);
    if (res.error) {
      if (res.code === 'DELIVERABLE_NOT_READY') showProtoToast('Deliverable not ready yet.');
      else if (res.code === 'WORK_APPROVAL_REQUIRED') {
        showProtoToast('Approve the outbound action in Approvals first.');
        setWorkWorkspaceTab(sessionId, 'approvals');
        syncWorkWorkspaceUi(getActiveThreadContext());
      } else showProtoToast(res.error);
      return;
    }
    const md = res.deliverable?.markdown || res.deliverable?.summary || '';
    if (!md) {
      showProtoToast('Nothing to download yet.');
      return;
    }
    downloadTextFile(`${safeName || deliverableId}.md`, md, 'text/markdown');
    return;
  }
  const thread = getSarahRuntime().threads[sessionId];
  if (deliverableId === 'del-primary' && thread?.workReport?.markdown) {
    downloadTextFile(`${safeName}.md`, thread.workReport.markdown, 'text/markdown');
  } else showProtoToast('Deliverable not available offline.');
}

function workActivityKindClass(kind) {
  const k = String(kind || 'message');
  if (k === 'step_meter') return 'work-ws-act-kind--meter';
  if (k.startsWith('approval')) return 'work-ws-act-kind--approval';
  if (k.startsWith('milestone')) return 'work-ws-act-kind--milestone';
  if (k === 'pause' || k === 'milestone_blocked') return 'work-ws-act-kind--warn';
  if (k === 'complete') return 'work-ws-act-kind--done';
  return 'work-ws-act-kind--neutral';
}

function buildClientWorkWorkspace(thread) {
  const status = thread.workCancelled
    ? 'cancelled'
    : thread.workPaused
      ? 'paused'
      : thread.workCompleted
        ? 'completed'
        : thread.workSubmitted
          ? 'running'
          : 'draft';
  const milestones = [
    { id: 'm1', title: 'Review brief and source material', order: 1, status: 'pending' },
    { id: 'm2', title: 'Research relevant information', order: 2, status: 'pending' },
    { id: 'm3', title: 'Prepare assignment draft', order: 3, status: 'pending' },
    { id: 'm4', title: 'Final quality review', order: 4, status: 'pending' },
  ];
  if (status === 'draft') milestones[0].status = 'in_progress';
  if (status === 'running') {
    milestones[0].status = 'complete';
    milestones[1].status = 'complete';
    milestones[2].status = 'in_progress';
  }
  if (status === 'paused') {
    milestones[0].status = 'complete';
    milestones[1].status = 'complete';
    milestones[2].status = 'blocked';
  }
  if (status === 'completed') milestones.forEach((m) => (m.status = 'complete'));
  const weights = { complete: 1, in_progress: 0.5, blocked: 0.25, pending: 0 };
  const progressPercent = Math.round(
    (milestones.reduce((s, m) => s + (weights[m.status] ?? 0), 0) / milestones.length) * 100
  );
  const firstUser = (thread.messages || []).find((m) => m.role === 'user');
  const brief = String(firstUser?.content || thread.title || '').trim();
  const capability =
    thread?.workWorkspace?.capability || (thread?.work ? inferClientWorkCapability(thread) : 'coordination');
  return {
    version: 1,
    assignmentStatus: status,
    phaseLabel: status === 'running' ? 'Research and writing' : status === 'draft' ? 'Planning' : status,
    capability,
    capabilityLabel: thread?.workWorkspace?.capabilityLabel || CLIENT_CAPABILITY_LABELS[capability] || 'Coordination',
    objective: brief
      ? `Complete this assignment: ${brief.length > 280 ? `${brief.slice(0, 277)}…` : brief}`
      : 'Describe what Sarah should complete for this assignment.',
    milestones,
    deliverables: buildClientWorkDeliverables(thread),
    approvals: [],
    files: buildClientWorkReferenceFiles(thread),
    activity: buildClientWorkActivity(thread),
    settings: thread?.workWorkspace?.settings || {
      notifyOnStart: true,
      notifyOnMilestone: true,
      notifyOnApproval: true,
      notifyOnComplete: true,
      notifyOnPause: true,
      sarahTrustOutbound: 'require_approval',
      defaultApprovalLevel: 1,
    },
    trust: thread?.workWorkspace?.trust || null,
    progressPercent,
    budget: thread.workBudgetCapCredits
      ? {
          band: thread.workBudgetBand,
          capCredits: thread.workBudgetCapCredits,
          estimateMin: thread.workBudgetEstimateMin,
          estimateMax: thread.workBudgetEstimateMax,
          usedCredits: thread.workCreditsUsedCredits,
        }
      : null,
  };
}

function getThreadWorkWorkspace(thread) {
  const ws = thread?.workWorkspace;
  if (ws && typeof ws === 'object' && (ws.milestones?.length || ws.objective || ws.capability)) return ws;
  return buildClientWorkWorkspace(thread || {});
}

function getWorkWorkspaceTab(threadId) {
  return workWsTabByThread.get(threadId) || 'conversation';
}

function setWorkWorkspaceTab(threadId, tab) {
  if (!threadId) return;
  workWsTabByThread.set(threadId, tab);
}

function renderWorkWorkspacePanelMarkup(ws, tab, threadId) {
  if (tab === 'approvals') {
    const rows = Array.isArray(ws.approvals) ? ws.approvals : [];
    if (!rows.length) {
      return `<p class="work-ws-placeholder">No approvals yet. Sarah requests Level 2 before sending or booking, and Level 3 before payments or signatures.</p>`;
    }
    const list = rows
      .map((a) => {
        const pending = a.status === 'pending';
        const detail = a.details?.briefExcerpt
          ? `<p class="work-ws-apr-detail">${escapeHtml(String(a.details.briefExcerpt).slice(0, 200))}</p>`
          : '';
        const actions = pending
          ? `<span class="work-ws-apr-actions">
              <button type="button" class="btn btn-primary btn-sm" data-work-apr="${escapeHtml(a.id)}" data-work-apr-decision="approved">Approve</button>
              <button type="button" class="btn btn-secondary btn-sm" data-work-apr="${escapeHtml(a.id)}" data-work-apr-decision="rejected">Reject</button>
            </span>`
          : '';
        return `<li class="work-ws-apr">
          <span class="work-ws-apr-level">L${escapeHtml(String(a.level))}</span>
          <span class="work-ws-apr-summary">${escapeHtml(a.summary || a.actionType || 'Approval')}</span>
          <span class="work-ws-apr-state">${escapeHtml(approvalStatusLabel(a.status))}</span>
          ${detail}
          ${actions}
        </li>`;
      })
      .join('');
    return `<ul class="work-ws-apr-list">${list}</ul>`;
  }
  if (tab === 'files') {
    const files = ws.files || [];
    if (!files.length) {
      return `<p class="work-ws-placeholder">No files or links yet. Attach documents in the assignment conversation or paste reference URLs.</p>`;
    }
    const list = files
      .map((f) => {
        const src = f.source === 'message_link' ? 'Link' : 'Attachment';
        const open =
          f.url && /^https?:\/\//i.test(f.url)
            ? `<a class="ms-link-btn" href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">Open</a>`
            : '';
        return `<li class="work-ws-file">
          <span class="work-ws-file-name">${escapeHtml(f.name)}</span>
          <span class="work-ws-file-meta">${escapeHtml(src)} · ${escapeHtml(f.mimeType || 'file')}</span>
          ${f.contextPreview ? `<p class="work-ws-file-ctx">${escapeHtml(f.contextPreview)}</p>` : ''}
          ${open}
        </li>`;
      })
      .join('');
    return `<ul class="work-ws-file-list">${list}</ul>`;
  }
  if (tab === 'overview') {
    const st = WORK_ASSIGNMENT_STATUS_LABEL[ws.assignmentStatus] || ws.assignmentStatus;
    const budget = ws.budget
      ? `<p class="work-ws-meta">Credits · cap ${escapeHtml(formatSarahCredits(ws.budget.capCredits))}${
          ws.budget.usedCredits != null ? ` · used ${escapeHtml(formatSarahCredits(ws.budget.usedCredits))}` : ''
        }</p>`
      : '';
    return `
      <article class="work-ws-card">
        <header class="work-ws-card-head">
          <span class="work-ws-pill">${escapeHtml(ws.phaseLabel || '')}</span>
          <span class="work-ws-status">${escapeHtml(st)}</span>
        </header>
        <p class="work-ws-cap"><span class="work-ws-cap-badge">${escapeHtml(ws.capabilityLabel || 'Coordination')}</span></p>
        <h3 class="work-ws-h">Assignment objective</h3>
        <p class="work-ws-body">${escapeHtml(ws.objective || '')}</p>
        ${budget}
        <p class="work-ws-meta">This conversation is scoped to this assignment only — Sarah does not mix other tasks.</p>
      </article>`;
  }
  if (tab === 'milestones') {
    const list = (ws.milestones || [])
      .map(
        (m) => {
          const when = m.completedAt
            ? formatSarahUsageWhen(m.completedAt)
            : m.startedAt && m.status === 'in_progress'
              ? `Started ${formatSarahUsageWhen(m.startedAt)}`
              : '';
          return `<li class="work-ws-ms ${milestoneStatusClass(m.status)}">
        <span class="work-ws-ms-title">${escapeHtml(m.title)}</span>
        <span class="work-ws-ms-state">${escapeHtml(milestoneStatusLabel(m.status))}</span>
        ${when ? `<span class="work-ws-ms-when">${escapeHtml(when)}</span>` : ''}
      </li>`;
        }
      )
      .join('');
    return `<ul class="work-ws-ms-list">${list}</ul>`;
  }
  if (tab === 'deliverables') {
    const items = (ws.deliverables || [])
      .map((d) => {
        const st = deliverableStatusLabel(d.status);
        const canOpen = d.status === 'ready' && threadId;
        const viewReport =
          canOpen && d.id === 'del-primary'
            ? `<button type="button" class="ms-link-btn" data-work-open-report="${escapeHtml(threadId)}">View</button>`
            : '';
        const download =
          d.status === 'pending_approval'
            ? `<span class="work-ws-del-pending">Approve outbound action to download</span>`
            : canOpen || (d.status === 'ready' && d.id !== 'del-primary')
              ? `<button type="button" class="ms-link-btn" data-work-download-del="${escapeHtml(d.id)}" data-work-download-title="${escapeHtml(d.title)}">Download</button>`
              : d.status === 'in_progress'
                ? `<span class="work-ws-del-pending">Sarah is drafting…</span>`
                : '';
        const size =
          d.charCount > 0 ? `<span class="work-ws-del-size">${escapeHtml(formatSarahCredits(d.charCount))} chars</span>` : '';
        return `<li class="work-ws-del">
          <span class="work-ws-del-title">${escapeHtml(d.title)}</span>
          <span class="work-ws-del-kind">${escapeHtml(d.kind || 'document')}</span>
          <span class="work-ws-del-state">${escapeHtml(st)}</span>
          ${size}
          ${d.summary ? `<p class="work-ws-del-sum">${escapeHtml(d.summary)}</p>` : ''}
          <span class="work-ws-del-actions">${viewReport} ${download}</span>
        </li>`;
      })
      .join('');
    return `<ul class="work-ws-del-list">${items || '<li class="work-ws-placeholder">No deliverables yet.</li>'}</ul>`;
  }
  if (tab === 'activity') {
    const sorted = [...(ws.activity || [])].sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    const items = sorted
      .map((a) => {
        const kind = a.kind || 'message';
        const kindLabel = a.kindLabel || WORK_ACTIVITY_KIND_LABELS_CLIENT[kind] || 'Update';
        const detail = a.detail ? `<span class="work-ws-act-detail">${escapeHtml(a.detail)}</span>` : '';
        const credits =
          a.credits != null && Number(a.credits) > 0
            ? `<span class="work-ws-act-credits">${escapeHtml(formatSarahCredits(a.credits))} credits</span>`
            : '';
        return `<li class="work-ws-act work-ws-act--${escapeHtml(kind.replace(/[^a-z0-9_-]/g, ''))}">
        <span class="work-ws-act-head">
          <span class="work-ws-act-kind ${workActivityKindClass(kind)}">${escapeHtml(kindLabel)}</span>
          <span class="work-ws-act-when">${escapeHtml(formatSarahUsageWhen(a.at))}</span>
        </span>
        <span class="work-ws-act-label">${escapeHtml(a.label || '')}</span>
        ${detail}
        ${credits}
      </li>`;
      })
      .join('');
    return `<ul class="work-ws-act-list">${items || '<li class="work-ws-placeholder">Activity will appear after you submit.</li>'}</ul>`;
  }
  if (tab === 'settings') {
    const settings = ws.settings || {};
    const trust = ws.trust || {};
    const frozen = ws.assignmentStatus !== 'draft';
    const outbound = settings.sarahTrustOutbound || 'require_approval';
    return `<article class="work-ws-card work-ws-settings">
      <h3 class="work-ws-h">Notifications</h3>
      <p class="work-ws-meta">Sarah notifies you at meaningful milestones — not every step.</p>
      <ul class="work-ws-settings-list">
        ${['notifyOnStart', 'notifyOnMilestone', 'notifyOnApproval', 'notifyOnComplete', 'notifyOnPause']
          .map((key) => {
            const labels = {
              notifyOnStart: 'When Sarah starts',
              notifyOnMilestone: 'Milestone progress (50%+)',
              notifyOnApproval: 'Approvals needed',
              notifyOnComplete: 'When complete',
              notifyOnPause: 'If paused',
            };
            const on = settings[key] !== false;
            return `<li><label class="work-ws-settings-row"><input type="checkbox" data-work-setting="${escapeHtml(key)}" ${on ? 'checked' : ''} ${frozen ? 'disabled' : ''}/> ${escapeHtml(labels[key] || key)}</label></li>`;
          })
          .join('')}
      </ul>
      <h3 class="work-ws-h">Sarah Trust (outbound)</h3>
      <p class="work-ws-meta">Level ${escapeHtml(String(trust.level || settings.defaultApprovalLevel || 1))} · ${trust.actions?.length ? escapeHtml(trust.actions.join(', ')) : 'No outbound actions detected'}</p>
      <label class="work-ws-settings-row">Outbound policy
        <select id="workSettingOutbound" data-work-setting-outbound ${frozen ? 'disabled' : ''}>
          <option value="require_approval" ${outbound === 'require_approval' ? 'selected' : ''}>Require approval</option>
          <option value="block" ${outbound === 'block' ? 'selected' : ''}>Block outbound actions</option>
        </select>
      </label>
      ${!frozen && threadId ? `<button type="button" class="btn btn-primary btn-sm" data-work-save-settings="${escapeHtml(threadId)}">Save settings</button>` : '<p class="work-ws-meta">Settings lock after submit.</p>'}
    </article>`;
  }
  return '';
}

function syncWorkWorkspaceUi(ctx) {
  const shell = document.getElementById('threadWorkWorkspace');
  const tabsEl = document.getElementById('workWsTabs');
  const panelEl = document.getElementById('workWsPanel');
  const log = document.getElementById('threadLog');
  const compose = document.getElementById('threadComposeForm');
  const body = document.querySelector('.thread-screen-body');
  const isWork = ctx.kind === 'personal' && ctx.work;
  shell?.classList.toggle('hidden', !isWork);
  body?.classList.toggle('thread-screen-body--work-ws', Boolean(isWork));
  if (!isWork || !shell || !tabsEl || !panelEl) {
    log?.classList.remove('hidden');
    compose?.classList.remove('hidden');
    panelEl?.classList.add('hidden');
    return;
  }
  const rt = getSarahRuntime();
  const thread = rt.threads[ctx.id] || ctx;
  const ws = getThreadWorkWorkspace(thread);
  thread.workWorkspace = ws;
  const tab = getWorkWorkspaceTab(ctx.id);
  const pct = Math.min(100, Math.max(0, Number(ws.progressPercent) || 0));
  document.getElementById('workWsProgressFill')?.style.setProperty('width', `${pct}%`);
  const progLabel = document.getElementById('workWsProgressLabel');
  if (progLabel) progLabel.textContent = `${pct}%`;
  tabsEl.innerHTML = WORK_WS_TABS.map((t) => {
    const active = t.id === tab;
    return `<button type="button" class="work-ws-tab${active ? ' is-active' : ''}" role="tab" aria-selected="${active}" data-work-ws-tab="${t.id}">${escapeHtml(t.label)}</button>`;
  }).join('');
  const isConversation = tab === 'conversation';
  log?.classList.toggle('hidden', !isConversation);
  compose?.classList.toggle('hidden', !isConversation);
  panelEl.classList.toggle('hidden', isConversation);
  if (!isConversation) {
    panelEl.innerHTML = renderWorkWorkspacePanelMarkup(ws, tab, ctx.id);
    panelEl.querySelector('[data-work-open-report]')?.addEventListener('click', (e) => {
      const sid = e.currentTarget.getAttribute('data-work-open-report');
      if (sid) void openWorkReport(sid);
    });
    panelEl.querySelectorAll('[data-work-download-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delId = btn.getAttribute('data-work-download-del');
        const title = btn.getAttribute('data-work-download-title');
        if (delId && ctx.id) void downloadWorkDeliverable(ctx.id, delId, title);
      });
    });
    panelEl.querySelector('[data-work-save-settings]')?.addEventListener('click', async (e) => {
      const sid = e.currentTarget.getAttribute('data-work-save-settings');
      if (!sid || !window.SarahLive?.patchPersonalWorkSettings) return;
      const patch = {};
      panelEl.querySelectorAll('[data-work-setting]').forEach((input) => {
        patch[input.getAttribute('data-work-setting')] = input.checked;
      });
      const outbound = panelEl.querySelector('[data-work-setting-outbound]')?.value;
      if (outbound) patch.sarahTrustOutbound = outbound;
      const res = await window.SarahLive.patchPersonalWorkSettings(sid, patch);
      if (res.error) showProtoToast(res.error);
      else {
        if (res.session) upsertPersonalThreadFromSession(res.session, { partial: false });
        showProtoToast('Assignment settings saved.');
        syncWorkWorkspaceUi(getActiveThreadContext());
      }
    });
    panelEl.querySelectorAll('[data-work-apr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const aprId = btn.getAttribute('data-work-apr');
        const decision = btn.getAttribute('data-work-apr-decision');
        if (aprId && decision && ctx.id) void resolveWorkApprovalUi(ctx.id, aprId, decision);
      });
    });
  }
  const submitBar = document.getElementById('threadWorkSubmitBar');
  const cancelBar = document.getElementById('threadWorkCancelBar');
  const showBarsOnTab = isConversation || tab === 'overview';
  if (submitBar && !submitBar.classList.contains('hidden')) {
    submitBar.style.display = showBarsOnTab ? '' : 'none';
  }
  if (cancelBar && !cancelBar.classList.contains('hidden')) {
    cancelBar.style.display = showBarsOnTab ? '' : 'none';
  }
}

if (!window.__workWsTabsBound) {
  window.__workWsTabsBound = true;
  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-work-ws-tab]');
    if (!btn) return;
    const tab = btn.getAttribute('data-work-ws-tab');
    const rt = getSarahRuntime();
    const id = rt.activeThreadId;
    if (!id || !tab) return;
    setWorkWorkspaceTab(id, tab);
    const ctx = getActiveThreadContext();
    syncWorkWorkspaceUi(ctx);
    if (tab === 'conversation') renderThread();
  });
}

async function pollWorkSessionUntilSettled(threadId, { maxMs = 120_000 } = {}) {
  if (!personalSarahLiveActive() || !window.SarahLive?.fetchPersonalSession) return;
  const started = Date.now();
  const tick = async () => {
    if (Date.now() - started > maxMs) return;
    const res = await window.SarahLive.fetchPersonalSession(threadId);
    if (res.error || !res.session) return;
    upsertPersonalThreadFromSession(res.session, { partial: false });
    const s = res.session;
    if (s.workCompletedAt || s.workPausedAt || s.workCancelledAt) {
      syncThreadWorkSubmitBar();
      syncWorkWorkspaceUi(getActiveThreadContext());
      renderThread();
      if (s.workCompletedAt) {
        showProtoToast('Sarah Work task completed — see My Notifications.');
        void refreshLiveNotifications();
      } else if (s.workPausedAt) {
        showProtoToast(s.workPauseReason || 'Sarah Work paused — top up credits or revise and submit again.');
        void refreshSarahPlanUsageUi(['billing', 'profile']);
      }
      return;
    }
    setTimeout(() => void tick(), 2800);
  };
  setTimeout(() => void tick(), 2500);
}

async function submitWorkTaskForThread(threadId) {
  const thread = getSarahRuntime().threads[threadId];
  if (!thread?.work || thread.workSubmitted) return true;
  if (personalSarahLiveActive() && thread.api) {
    const res = await window.SarahLive.submitPersonalWorkSession(threadId);
    if (res.error) {
      if (res.code === 'WORK_NOT_INCLUDED' || res.code === 'WORK_QUOTA_EXCEEDED') {
        showProtoToast(res.error);
        setMySarahPanel('billing');
      } else if (res.code === 'CREDITS_EXHAUSTED') {
        showProtoToast('AI credits exhausted — top up or wait for renewal.');
        setRoute('home');
        setMySarahPanel('billing');
        void refreshSarahPlanUsageUi(['billing', 'profile']);
      } else showProtoToast(res.error);
      await refreshWorkQuotaState();
      renderWorkQuotaBanner();
      return false;
    }
    if (res.session) upsertPersonalThreadFromSession(res.session, { partial: false });
    thread.workSubmitted = true;
    thread.workSubmittedAt = res.session?.workSubmittedAt || new Date().toISOString();
    if (res.workBudget) {
      thread.workBudgetBand = res.workBudget.band;
      thread.workBudgetCapCredits = res.workBudget.capCredits;
      thread.workBudgetEstimateMin = res.workBudget.estimateMin;
      thread.workBudgetEstimateMax = res.workBudget.estimateMax;
    }
    workEstimateByThread.delete(threadId);
    await refreshWorkQuotaState();
    renderWorkQuotaBanner();
    showProtoToast('Task submitted — Sarah is working on it.');
    void pollWorkSessionUntilSettled(threadId);
    void refreshSarahPlanUsageUi(['billing', 'profile']);
    if (document.querySelector('.my-sarah-view')?.dataset.msPanel === 'home') void renderSarahHomeIntelligence();
    return true;
  }
  const slot = await reserveWorkTaskSlot();
  if (!slot.allowed) {
    showProtoToast(
      slot.reason === 'plan'
        ? 'Sarah Work needs a paid plan. Messages still work on Free.'
        : 'Your Sarah Work task allowance is used up for today.'
    );
    setMySarahPanel('billing');
    return false;
  }
  thread.workSubmitted = true;
  renderWorkQuotaBanner();
  showProtoToast('Task submitted (prototype).');
  return true;
}

function syncThreadWorkSubmitBar() {
  const bar = document.getElementById('threadWorkSubmitBar');
  if (!bar) return;
  const ctx = getActiveThreadContext();
  const show =
    ctx.kind === 'personal' && ctx.work && !ctx.workSubmitted && !ctx.workCancelled && !ctx.workPaused;
  bar.classList.toggle('hidden', !show);
  if (show && ctx.id) void loadWorkSubmitEstimate(ctx.id);
  syncThreadWorkCancelBar();
}

function syncThreadWorkCancelBar() {
  const bar = document.getElementById('threadWorkCancelBar');
  if (!bar) return;
  const ctx = getActiveThreadContext();
  const show =
    ctx.kind === 'personal' && ctx.work && ctx.workSubmitted && !ctx.workCompleted && !ctx.workCancelled;
  bar.classList.toggle('hidden', !show);
}

async function cancelWorkTaskForThread(threadId) {
  const thread = getSarahRuntime().threads[threadId];
  if (!thread?.work || !thread.workSubmitted || thread.workCompleted || thread.workCancelled) return true;
  if (personalSarahLiveActive() && thread.api && window.SarahLive?.cancelPersonalWorkSession) {
    const res = await window.SarahLive.cancelPersonalWorkSession(threadId);
    if (res.error) {
      if (res.code === 'WORK_ALREADY_COMPLETED') showProtoToast('This task has already completed.');
      else showProtoToast(res.error);
      return false;
    }
    thread.workSubmitted = false;
    thread.workSubmittedAt = null;
    thread.workCancelled = true;
    await refreshWorkQuotaState();
    renderWorkQuotaBanner();
    showProtoToast(res.alreadyCancelled ? 'Task was already cancelled.' : 'Task cancelled — allowance restored.');
    return true;
  }
  if (thread.workSubmitted && !thread.workCompleted) {
    const u = readMockWorkUsage();
    writeMockWorkUsage(Math.max(0, u.used - 1));
    workQuotaState.used = Math.max(0, workQuotaState.used - 1);
  }
  thread.workSubmitted = false;
  thread.workCancelled = true;
  renderWorkQuotaBanner();
  showProtoToast('Task cancelled (prototype).');
  return true;
}

async function startNewWorkThread(prompt = '') {
  goToMySarahWork('');
  const text = String(prompt || '').trim();
  if (personalSarahLiveActive()) {
    const res = await window.SarahLive.createPersonalSession({ title: 'New work item', mode: 'work' });
    if (res.error) {
      showProtoToast(res.error);
      return;
    }
    const id = upsertPersonalThreadFromSession(res.session, { partial: false });
    await openPersonalSarahThread(id);
    if (text) await deliverPersonalSarahMessage(text, { threadId: id, work: true });
    return;
  }
  const id = createPersonalThread('', { work: true });
  await openPersonalSarahThread(id);
  if (text) await deliverPersonalSarahMessage(text, { threadId: id, work: true });
}

function schedulePrototypeWorkCompletion(threadId) {
  const thread = getSarahRuntime().threads[threadId];
  if (
    !thread?.work ||
    !thread.workSubmitted ||
    thread.workCompleted ||
    thread.workCancelled ||
    (personalSarahLiveActive() && thread?.api)
  )
    return;
  clearTimeout(thread._workCompleteTimer);
  thread._workCompleteTimer = setTimeout(() => finalizePrototypeWorkTask(threadId), 2800);
}

function finalizePrototypeWorkTask(threadId) {
  const thread = getSarahRuntime().threads[threadId];
  if (!thread || thread.workCompleted) return;
  thread.workCompleted = true;
  const taskTitle = getPersonalThreadHeadline(thread);
  const report = [
    'Task steps executed (prototype).',
    'Deliverable saved in this Work thread.',
    'Open the thread for the completion summary.',
  ];
  thread.messages.push({
    role: 'assistant',
    markdown: `**Task completed**\n\n**${taskTitle}**\n\n${report.map((l) => `- ${l}`).join('\n')}\n\n_Tap **My Notifications** for the completion record._`,
  });
  if (getSarahRuntime().activeThreadId === threadId) renderThread();
  appendSarahWorkInboxNotification({ threadId, taskTitle, reportLines: report });
}

const GALLERY_SIZE = 6;

function getCompanyGallery(company) {
  const raw = company.gallery && company.gallery.length ? company.gallery : [];
  let items = raw
    .map((g) => (typeof g === 'string' ? g : g?.imageUrl || g?.src || ''))
    .map((u) => String(u || '').trim())
    .filter(Boolean);
  if (!items.length && company.image) items = [company.image];
  if (!items.length) return [];
  if (company.live) return items.slice(0, GALLERY_SIZE);
  while (items.length < GALLERY_SIZE) {
    items.push(items[items.length % items.length]);
  }
  return items.slice(0, GALLERY_SIZE);
}

function getCompanyProducts(company) {
  if (company.products && company.products.length) {
    return company.live ? company.products : sortDiscoverProducts(company.products);
  }
  if (company.live) return [];
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

/** Chat media + listing paths proxied on sarah.ziricai.com */
function resolveApiMediaUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw, window.location.origin);
    if (
      (u.pathname.includes('/api/chat/media/') || u.pathname.includes('/api/network/v1/listing-media/')) &&
      u.pathname.endsWith('/content')
    ) {
      return `${window.location.origin}${u.pathname}${u.search}`;
    }
  } catch {
    // ignore
  }
  if (raw.startsWith('/api/chat/media/') || raw.startsWith('/api/network/v1/listing-media/')) {
    return `${window.location.origin}${raw}`;
  }
  return raw;
}

/** Portal uploads → same-origin /api/network/v1/listing-media/… (Netlify proxies to API). */
function resolveListingMediaUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw, window.location.origin);
    if (u.pathname.includes('/api/network/v1/listing-media/') && u.pathname.endsWith('/content')) {
      return `${window.location.origin}${u.pathname}${u.search}`;
    }
  } catch {
  }
  if (raw.startsWith('/api/network/v1/listing-media/')) {
    return `${window.location.origin}${raw}`;
  }
  return raw;
}

function parseProductPriceSortValue(price) {
  const digits = String(price || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
}

function sortDiscoverProducts(products) {
  return [...(products || [])].sort(
    (a, b) => parseProductPriceSortValue(a.price) - parseProductPriceSortValue(b.price)
  );
}

function formatDiscoverProductPrice(price) {
  const s = String(price || '').trim();
  if (!s) return 'Quote at consultation';
  if (/^from\b/i.test(s) || /^R\s/i.test(s)) return s;
  return `From R ${s}`;
}

function resolveDiscoverProductImage(url, cardFallback) {
  const raw = String(url || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('assets/')) return prototypeAsset(raw);
  if (raw) {
    const resolved = resolveListingMediaUrl(raw);
    if (resolved) return resolved;
  }
  const fb = String(cardFallback || '').trim();
  if (fb.startsWith('assets/')) return prototypeAsset(fb);
  return resolveListingMediaUrl(fb) || fb || '';
}

function discoverImgAttrs(src, company) {
  const fallback =
    company.imageFallback || company.image || 'assets/dental-products/fallback.svg';
  const safeFb = escapeHtml(prototypeAsset(fallback));
  const resolved = resolveListingMediaUrl(src) || src;
  const safeSrc = escapeHtml(prototypeAsset(resolved));
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
  if (!company) return businessListingAvatarFallback();
  if (company.avatar) return company.avatar;
  if (company.logoUrl) {
    const resolved = resolveListingMediaUrl(company.logoUrl);
    if (resolved) return resolved;
  }
  if (company.image) return company.image;
  return businessListingAvatarFallback();
}

function isCompanyFollowed(companyId) {
  const live = liveRelationState(companyId);
  if (live !== null) return LIVE_FOLLOWING_STATES.has(live);
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
  const companyId = resolveCompanyIdForActiveThread(id);
  const threadKey = companyId && rt.threads[companyId] ? companyId : id;

  if (rt.threads[threadKey]) {
    const row = rt.threads[threadKey];
    return {
      id: threadKey,
      ...row,
      companyId: row.companyId || companyId || threadKey,
      name: row.name || row.title || 'Sarah',
      avatar: row.avatar || SARAH_AVATAR_SRC,
    };
  }

  if (consumerChatLiveActive() && companyId) {
    const discoverCo = discoverFind(companyId);
    const chat = getAllChats().find((c) => c.id === companyId);
    return {
      id: companyId,
      kind: 'company',
      companyId,
      api: true,
      verified: discoverCo?.verified ?? true,
      name: discoverCo?.name || chat?.name || companyId,
      avatar: discoverCo ? companyAvatarUrl(discoverCo) : chat?.avatar || MOCK_THREAD.avatar,
      messages: [],
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
  const discoverCo = discoverFind(id);
  if (discoverCo) {
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

function openCompanySarahChat(companyId, triggerEl) {
  const id = String(companyId || '').trim();
  if (!id) return;
  markControlTapPending(triggerEl);
  const company = discoverFind(id) || {
    id,
    name: id,
    verified: true,
  };
  // Public Discover can be browsed signed out; chatting with Company Sarah needs an account.
  if (company.live && !requireLiveSignIn('chat with this business')) return;
  primeCompanyThreadForOpen(company);
  upsertRuntimeChat({
    id: company.id,
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
  const company = discoverFind(companyId);
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

async function refreshChatsTabOrgSearch(rawQuery) {
  const q = String(rawQuery || '').trim();
  if (q.length < 2) {
    chatsTabOrgSearch.query = '';
    chatsTabOrgSearch.loading = false;
    chatsTabOrgSearch.companies = [];
    return;
  }
  if (chatsTabOrgSearch.query === q && chatsTabOrgSearch.companies.length && !chatsTabOrgSearch.loading) return;
  chatsTabOrgSearch.query = q;
  if (discoverLiveActive() && window.SarahLive?.fetchDiscoverCompanies) {
    chatsTabOrgSearch.loading = true;
    const res = await window.SarahLive.fetchDiscoverCompanies({ q, category: 'all' });
    chatsTabOrgSearch.loading = false;
    if (chatsTabOrgSearch.query !== q) return;
    const cards = (res.error ? [] : res.data?.companies || []).map(mapLiveDiscoverCard);
    chatsTabOrgSearch.companies = cards;
    cards.forEach((c) => liveDiscover.byId.set(c.id, c));
    return;
  }
  chatsTabOrgSearch.companies = filterDiscoverListings(MOCK_DISCOVER_COMPANIES || [], 'all', q);
}

function isBusinessChatRow(c) {
  if (c?.company) return true;
  const kind = String(c?.conversationKind || '').toLowerCase().replace(/\s+/g, '_');
  return kind === 'person_to_business';
}

function isSarahSideChatRow(c) {
  if (c?.sarahPersonal || c?.isSarahPersonal) return true;
  const kind = String(c?.conversationKind || '').toLowerCase().replace(/\s+/g, '_');
  if (kind === 'personal_sarah') return true;
  return !isBusinessChatRow(c);
}

function mapPersonalThreadToChatRow(t) {
  return {
    id: t.id,
    convId: t.id,
    name: t.title || 'Personal Sarah',
    preview: t.preview || 'Tap to open',
    time: t.time || '',
    online: false,
    avatar: SARAH_AVATAR_SRC,
    sarahPersonal: true,
    company: false,
    conversationKind: 'personal_sarah',
    api: true,
    lastMessageAt: t.lastMessageAt || 0,
  };
}

function buildChatsPanelHtml(panel, businessChats, sarahChatRows, orgSection = '') {
  if (panel === 'sarah') {
    return sarahChatRows.length
      ? sarahChatRows.map((c) => renderChatRowHtml(c)).join('')
      : '<p class="chats-list-empty chats-list-empty--section">No Sarah chats yet. Open My Sarah to start talking with Personal Sarah.</p>';
  }
  const businessSection = businessChats.length
    ? businessChats.map((c) => renderChatRowHtml(c)).join('')
    : '<p class="chats-list-empty chats-list-empty--section">No business conversations yet. Search for a business to message Company Sarah.</p>';
  return `${businessSection}${orgSection}`;
}

function paintChatsPanelFromCache() {
  const host = document.getElementById('chatsList');
  const q = (document.getElementById('chatsTabSearchInput')?.value || '').trim();
  if (!host || !chatsListPanelCache || q) return false;
  syncChatsPanelChrome(false);
  host.innerHTML = buildChatsPanelHtml(
    activeChatsPanel,
    chatsListPanelCache.businessChats,
    chatsListPanelCache.sarahChatRows,
    chatsListPanelCache.orgSection || ''
  );
  host.dataset.chatsPanel = activeChatsPanel;
  bindChatsListInteractions(host);
  return true;
}

function bindChatsPanelTabsOnce() {
  const wrap = document.getElementById('chatsSegmentWrap');
  if (!wrap || wrap.dataset.bound === '1') return;
  wrap.dataset.bound = '1';
  wrap.querySelectorAll('[data-chats-panel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-chats-panel') === 'sarah' ? 'sarah' : 'business';
      if (next === activeChatsPanel) return;
      activeChatsPanel = next;
      wrap.querySelectorAll('[data-chats-panel]').forEach((b) => {
        const on = b.getAttribute('data-chats-panel') === activeChatsPanel;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (paintChatsPanelFromCache()) return;
      void renderChatsList({ force: true });
    });
  });
}

function syncChatsPanelChrome(searching) {
  const wrap = document.getElementById('chatsSegmentWrap');
  if (wrap) wrap.classList.toggle('hidden', Boolean(searching));
  if (!searching) {
    const wrapEl = document.getElementById('chatsSegmentWrap');
    wrapEl?.querySelectorAll('[data-chats-panel]').forEach((b) => {
      const on = b.getAttribute('data-chats-panel') === activeChatsPanel;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
}

function mergeSarahChatRows(federated, personalThreads) {
  const byId = new Map();
  federated.filter(isSarahSideChatRow).forEach((c) => byId.set(String(c.convId || c.id), c));
  personalThreads.forEach((t) => {
    const row = mapPersonalThreadToChatRow(t);
    const key = String(row.id);
    const existing = byId.get(key);
    if (!existing) byId.set(key, row);
    else {
      byId.set(key, {
        ...existing,
        ...row,
        name: row.name || existing.name,
        preview: row.preview || existing.preview,
        time: row.time || existing.time,
        lastMessageAt: Math.max(row.lastMessageAt || 0, existing.lastMessageAt || 0),
      });
    }
  });
  return Array.from(byId.values()).sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
}

function chatRowAvatarFallback(c) {
  if (c?.sarahPersonal || c?.conversationKind === 'personal_sarah') return SARAH_AVATAR_SRC;
  if (c?.company) {
    const co = discoverFind(c.companyId || c.id);
    if (co?.avatar) return co.avatar;
    if (co?.image) return co.image;
    if (co?.imageFallback) return co.imageFallback;
  }
  return (c?.avatarKey && COMPANY_AVATARS?.[c.avatarKey]) || businessListingAvatarFallback();
}

function resolveChatRowAvatarSrc(item) {
  const row = enrichBusinessChatRowAvatar(item);
  const raw = row?.avatar || resolveItemAvatar(row);
  if (!raw) return prototypeAsset(businessListingAvatarFallback());
  if (/^https?:\/\//i.test(raw) || /^data:|^blob:/i.test(raw)) return raw;
  const resolved = resolveListingMediaUrl(raw) || raw;
  return prototypeAsset(resolved);
}

function enrichBusinessChatRowAvatar(row) {
  if (!row || (!row.company && !isBusinessChatRow(row))) return row;
  const companyId = String(row.companyId || row.id || '').trim();
  let avatar = row.avatar || row.logoUrl || null;
  const co = companyId ? discoverFind(companyId) : null;
  if (co?.avatar) avatar = co.avatar;
  else if (co?.image && !avatar) avatar = co.image;
  if (avatar && !/^https?:\/\//i.test(avatar)) {
    avatar = resolveListingMediaUrl(avatar) || avatar;
  }
  return { ...row, companyId: companyId || row.companyId, avatar, company: true };
}

function chatRowAvatarImgAttrs(c) {
  const primary = escapeHtml(resolveChatRowAvatarSrc(c));
  const fb1 = escapeHtml(prototypeAsset(chatRowAvatarFallback(c)));
  const fb2 = escapeHtml(prototypeAsset(businessListingAvatarFallback()));
  return `src="${primary}" alt="" width="52" height="52" loading="lazy" referrerpolicy="no-referrer" onerror="if(this.dataset.fb==='2')return;if(this.dataset.fb==='1'){this.dataset.fb='2';this.src='${fb2}';return}this.dataset.fb='1';this.src='${fb1}'"`;
}

function renderChatRowHtml(c) {
  const personalSarah = c.sarahPersonal || c.conversationKind === 'personal_sarah';
  const avatarAttrs = personalSarah
    ? `src="${escapeHtml(prototypeAsset(SARAH_AVATAR_SRC))}" alt="" width="52" height="52" ${profileImgOnError(SARAH_AVATAR_SRC)}`
    : chatRowAvatarImgAttrs(c);
  return `
    <div class="chat-row" data-open-thread="${escapeHtml(c.id)}" data-company="${c.company ? '1' : '0'}" data-personal-sarah="${personalSarah ? '1' : '0'}" data-company-id="${escapeHtml(c.company ? c.id : '')}" data-conv-id="${escapeHtml(c.convId || c.id || '')}" data-kind="${escapeHtml(c.conversationKind || '')}" role="button" tabindex="0">
      <img class="avatar chat-row-avatar" ${avatarAttrs} />
      <div class="meta">
        <div class="name">${escapeHtml(c.name)}${c.company ? ` ${verifiedBadge}` : ''}</div>
        <div class="preview">${escapeHtml(c.preview)}</div>
      </div>
      <div class="time">${escapeHtml(c.time || '')}</div>
    </div>`;
}

function renderChatsTabOrgRowHtml(company) {
  const preview = company.address || company.categoryLabel || 'Sarah Network business';
  return `
    <div class="chat-row chat-row--org" data-start-company-chat="${escapeHtml(company.id)}" role="button" tabindex="0">
      <img class="avatar chat-row-avatar" ${chatRowAvatarImgAttrs({ company: true, companyId: company.id, id: company.id, avatar: companyAvatarUrl(company) })} />
      <div class="meta">
        <div class="name">${escapeHtml(company.name)}${company.verified ? ` ${verifiedBadge}` : ''}</div>
        <div class="preview">${escapeHtml(preview)}</div>
      </div>
      <div class="time chats-org-cta">Message</div>
    </div>`;
}

function bindChatsListInteractions(host) {
  host.querySelectorAll('[data-open-thread]').forEach((row) => {
    const open = () => openChatFromList(row.dataset.openThread || 'smilemore-demo', row);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
  host.querySelectorAll('[data-start-company-chat]').forEach((row) => {
    const start = () => openCompanySarahChat(row.dataset.startCompanyChat || '', row);
    row.addEventListener('click', start);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        start();
      }
    });
  });
}

async function renderChatsList(opts = {}) {
  const host = document.getElementById('chatsList');
  if (!host) return;
  const qRaw = (document.getElementById('chatsTabSearchInput')?.value || '').trim();
  const q = qRaw.toLowerCase();
  const now = Date.now();
  if (
    !opts.force &&
    !q &&
    chatsListLastFetchAt &&
    now - chatsListLastFetchAt < CHATS_LIST_FETCH_MIN_MS &&
    host.querySelector('.chat-row, .chats-list-empty, .chats-list-hint') &&
    host.dataset.chatsPanel === activeChatsPanel
  ) {
    return;
  }
  const gen = ++chatsListLoadGen;

  let chats = getAllChats();
  if (!q && consumerChatLiveActive()) {
    const cached = loadChatsListSessionCache();
    if (cached.length && !host.querySelector('.chat-row')) {
      if (discoverLiveActive()) await ensureLiveDiscoverFresh();
      const businessCached = cached.filter(isBusinessChatRow).map(enrichBusinessChatRowAvatar);
      const sarahCached = mergeSarahChatRows(cached, listPersonalThreads({ chatOnly: true }));
      syncChatsPanelChrome(false);
      chatsListPanelCache = { businessChats: businessCached, sarahChatRows: sarahCached, orgSection: '' };
      host.innerHTML = buildChatsPanelHtml(activeChatsPanel, businessCached, sarahCached);
      host.dataset.chatsPanel = activeChatsPanel;
      bindChatsListInteractions(host);
    } else if (!host.querySelector('.chat-row')) {
      host.innerHTML = '<p class="chats-list-hint">Loading your conversations…</p>';
    }
  }
  if (consumerChatLiveActive()) {
    const searchApi = q.length >= 2 && window.SarahLive?.searchChatThreads;
  const res =
      searchApi
        ? await window.SarahLive.searchChatThreads(qRaw)
        : await window.SarahLive.fetchChatConversations('all');
    if (gen !== chatsListLoadGen) return;
    const payload = res.data || {};
    const conversations = payload.conversations;
    if (!res.error && Array.isArray(conversations) && (searchApi || conversations.length)) {
      chats = conversations.map(mapFederatedConversationToChatRow);
      if (!q) saveChatsListSessionCache(chats);
    }
  }

  if (!consumerChatLiveActive() || !window.SarahLive?.searchChatThreads) {
    chats = chats.filter((c) => {
      if (!q) return true;
      return `${c.name} ${c.preview}`.toLowerCase().includes(q);
    });
  }

  let sarahChatRows = [];
  let businessChats = chats;
  if (!q) {
    if (discoverLiveActive()) await ensureLiveDiscoverFresh();
    if (personalSarahLiveActive()) {
      await syncPersonalSarahSessionsFromServer({ silent: true });
      if (gen !== chatsListLoadGen) return;
    }
    sarahChatRows = mergeSarahChatRows(chats, listPersonalThreads({ chatOnly: true }));
    businessChats = chats.filter(isBusinessChatRow).map(enrichBusinessChatRowAvatar);
  }

  let orgSection = '';
  if (q.length >= 2) {
    await refreshChatsTabOrgSearch(qRaw);
    if (gen !== chatsListLoadGen) return;
    const existingCompanyIds = new Set(
      chats.filter((c) => c.company).map((c) => String(c.id || c.companyId || '').toLowerCase()).filter(Boolean)
    );
    const orgHits = chatsTabOrgSearch.companies.filter((co) => !existingCompanyIds.has(String(co.id || '').toLowerCase()));
    if (chatsTabOrgSearch.loading && !orgHits.length) {
      orgSection = '<p class="chats-list-hint">Searching Sarah Network…</p>';
    } else if (orgHits.length) {
      orgSection = `<p class="chats-list-section">Businesses on Sarah Network</p>${orgHits.map((co) => renderChatsTabOrgRowHtml(co)).join('')}`;
    }
  }

  const chatSection = q
    ? chats.length
      ? chats.map((c) => renderChatRowHtml(c)).join('')
      : '<p class="chats-list-empty">No existing chats match that search.</p>'
  : '';

  syncChatsPanelChrome(q);

  if (!q) {
    chatsListPanelCache = { businessChats, sarahChatRows, orgSection };
    host.innerHTML = buildChatsPanelHtml(activeChatsPanel, businessChats, sarahChatRows, orgSection);
    host.dataset.chatsPanel = activeChatsPanel;
  } else if (!chats.length && !orgSection && q.length >= 2 && !chatsTabOrgSearch.loading) {
    host.innerHTML =
      '<p class="chats-list-empty">No chats or businesses match that search. Try another name or open Discover.</p>';
  } else {
    host.innerHTML = `${q && chats.length ? '<p class="chats-list-section">Your chats</p>' : ''}${chatSection}${orgSection}`;
  }
  if (!q) chatsListLastFetchAt = Date.now();

  bindChatsListInteractions(host);
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

const MK_FAMILY_CONTACT_FREQUENCY_OPTIONS = [
  { value: '', label: 'How often you connect…' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'occasionally', label: 'Occasionally' },
  { value: 'rarely', label: 'Rarely' },
];

const MK_FAMILY_LIVES_WITH_OPTIONS = [
  { value: '', label: 'Where they live…' },
  { value: 'same_home', label: 'Lives with me' },
  { value: 'nearby', label: 'Nearby' },
  { value: 'same_city', label: 'Same city / region' },
  { value: 'long_distance', label: 'Long distance' },
  { value: 'abroad', label: 'Lives abroad' },
];

const MK_FORM_SYNC_LEAD =
  'Saves on this device and syncs when you are signed in. Personal Sarah uses sections you allow.';

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
              <input class="ms-knowledge-input" id="fam_name_${id}" data-fam-field="name" type="text" placeholder="Full name" value="${escapeHtml(p.name || '')}" autocomplete="name" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="fam_rel_${id}">Relationship</label>
              <select class="ms-knowledge-input" id="fam_rel_${id}" data-fam-field="relationship">${mkRelationshipSelectHtml(p.relationship)}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="fam_bday_${id}">Birthday <span class="ms-knowledge-optional">(optional)</span></label>
              <input class="ms-knowledge-input" id="fam_bday_${id}" data-fam-field="birthday" type="date" value="${escapeHtml(p.birthday || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="fam_contact_${id}">How often you connect</label>
              <select class="ms-knowledge-input" id="fam_contact_${id}" data-fam-field="contactFrequency">${mkPlainSelectHtml('contactFrequency', MK_FAMILY_CONTACT_FREQUENCY_OPTIONS, p.contactFrequency || '')}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="fam_lives_${id}">Where they live</label>
            <select class="ms-knowledge-input" id="fam_lives_${id}" data-fam-field="livesWith">${mkPlainSelectHtml('livesWith', MK_FAMILY_LIVES_WITH_OPTIONS, p.livesWith || '')}</select>
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
        Sarah does not assume relationships or invent facts about other people — only what you enter here. ${MK_FORM_SYNC_LEAD}
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
  const root = mkScopedElement('mkFamilyList');
  if (!root) return [];
  const cards = root.querySelectorAll('[data-mk-family-person]');
  const people = [];
  cards.forEach((card) => {
    const id = card.getAttribute('data-mk-family-person');
    if (!id) return;
    const row = {
      id,
      name: '',
      relationship: 'other',
      birthday: '',
      contactFrequency: '',
      livesWith: '',
      details: '',
      reminders: '',
    };
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
            <input class="ms-knowledge-input" id="goal_title_${id}" data-goal-field="title" type="text" placeholder="Short title for this goal" value="${escapeHtml(g.title || '')}" />
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_desc_${id}">Description</label>
            <textarea class="ms-knowledge-textarea" id="goal_desc_${id}" data-goal-field="description" rows="2" placeholder="What you want to achieve">${escapeHtml(g.description || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_why_${id}">Why it matters</label>
            <textarea class="ms-knowledge-textarea" id="goal_why_${id}" data-goal-field="whyItMatters" rows="2" placeholder="Why this matters to you">${escapeHtml(g.whyItMatters || '')}</textarea>
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
            <textarea class="ms-knowledge-textarea" id="goal_prog_${id}" data-goal-field="progress" rows="2" placeholder="Latest progress or status">${escapeHtml(g.progress || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_mile_${id}">Milestones <span class="ms-knowledge-optional">(one per line)</span></label>
            <textarea class="ms-knowledge-textarea" id="goal_mile_${id}" data-goal-field="milestones" rows="3" placeholder="Key milestones — one per line">${escapeHtml(g.milestones || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_chal_${id}">Challenges</label>
            <textarea class="ms-knowledge-textarea" id="goal_chal_${id}" data-goal-field="challenges" rows="2" placeholder="What might get in the way">${escapeHtml(g.challenges || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_res_${id}">Required resources</label>
            <textarea class="ms-knowledge-textarea" id="goal_res_${id}" data-goal-field="resources" rows="2" placeholder="People, budget, tools that help">${escapeHtml(g.resources || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="goal_rel_${id}">Related assignments <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="goal_rel_${id}" data-goal-field="relatedAssignments" rows="2" placeholder="Linked tasks, projects, or chats">${escapeHtml(g.relatedAssignments || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-goal-empty">No goals yet — tap <strong>Add goal</strong> to track something important.</p>';

  return `
    <form id="mkGoalsForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Goals you save here can inform planning and follow-ups when permissions allow. ${MK_FORM_SYNC_LEAD}
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
  const root = mkScopedElement('mkGoalsList');
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
              <input class="ms-knowledge-input" id="work_title_${id}" data-work-field="jobTitle" type="text" placeholder="Job title" value="${escapeHtml(r.jobTitle || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_emp_${id}">Employer / organisation</label>
            <input class="ms-knowledge-input" id="work_emp_${id}" data-work-field="employer" type="text" placeholder="Employer or client name" value="${escapeHtml(r.employer || '')}" />
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
            <textarea class="ms-knowledge-textarea" id="work_resp_${id}" data-work-field="responsibilities" rows="3" placeholder="Main responsibilities and scope">${escapeHtml(r.responsibilities || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_qual_${id}">Professional qualifications <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_qual_${id}" data-work-field="qualifications" rows="2" placeholder="Degrees, certs, licences relevant to this role">${escapeHtml(r.qualifications || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_skills_${id}">Skills &amp; expertise</label>
            <textarea class="ms-knowledge-textarea" id="work_skills_${id}" data-work-field="skillsExpertise" rows="2" placeholder="Skills Sarah can reference for work help">${escapeHtml(r.skillsExpertise || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_proj_${id}">Projects &amp; assignments <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_proj_${id}" data-work-field="projectsAssignments" rows="2" placeholder="Active projects or assignments">${escapeHtml(r.projectsAssignments || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_hours_${id}">Working hours &amp; routines <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_hours_${id}" data-work-field="workingHoursRoutines" rows="2" placeholder="Typical hours, deep-work blocks, time zones">${escapeHtml(r.workingHoursRoutines || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_pref_${id}">Workplace preferences <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_pref_${id}" data-work-field="workplacePreferences" rows="2" placeholder="Remote/hybrid, meeting style, tools">${escapeHtml(r.workplacePreferences || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_contacts_${id}">Professional contacts <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_contacts_${id}" data-work-field="professionalContacts" rows="2" placeholder="Key colleagues — names and context only">${escapeHtml(r.professionalContacts || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_exp_${id}">Work experience highlights</label>
            <textarea class="ms-knowledge-textarea" id="work_exp_${id}" data-work-field="experienceHighlights" rows="2" placeholder="Standout wins or experiences">${escapeHtml(r.experienceHighlights || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="work_career_${id}">Career ambitions <span class="ms-knowledge-optional">(optional)</span></label>
            <textarea class="ms-knowledge-textarea" id="work_career_${id}" data-work-field="careerAmbitions" rows="2" placeholder="Where you want your career to go">${escapeHtml(r.careerAmbitions || '')}</textarea>
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
        Keep current and previous roles separate so Sarah does not merge employers. ${MK_FORM_SYNC_LEAD}
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
  const root = mkScopedElement('mkWorkList');
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
              <input class="ms-knowledge-input" id="biz_name_${id}" data-biz-field="businessName" type="text" placeholder="Legal or trading name" value="${escapeHtml(v.businessName || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="biz_ind_${id}">Industry</label>
              <input class="ms-knowledge-input" id="biz_ind_${id}" data-biz-field="industry" type="text" placeholder="Industry or sector" value="${escapeHtml(v.industry || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="biz_role_${id}">Your role</label>
              <input class="ms-knowledge-input" id="biz_role_${id}" data-biz-field="userRole" type="text" placeholder="Your role in this venture" value="${escapeHtml(v.userRole || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="biz_conf_${id}">Confidentiality level</label>
              <select class="ms-knowledge-input" id="biz_conf_${id}" data-biz-field="confidentialityLevel">${confOpts}</select>
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_desc_${id}">Description</label>
            <textarea class="ms-knowledge-textarea" id="biz_desc_${id}" data-biz-field="description" rows="3" placeholder="What this business does — in your words">${escapeHtml(v.description || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_prod_${id}">Products &amp; services</label>
            <textarea class="ms-knowledge-textarea" id="biz_prod_${id}" data-biz-field="productsServices" rows="2" placeholder="Products or services you offer">${escapeHtml(v.productsServices || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_stage_${id}">Current stage</label>
            <textarea class="ms-knowledge-textarea" id="biz_stage_${id}" data-biz-field="currentStage" rows="2" placeholder="Idea, launch, growth, pause…">${escapeHtml(v.currentStage || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_obj_${id}">Objectives</label>
            <textarea class="ms-knowledge-textarea" id="biz_obj_${id}" data-biz-field="objectives" rows="2" placeholder="Near-term business objectives">${escapeHtml(v.objectives || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_contacts_${id}">Key contacts</label>
            <textarea class="ms-knowledge-textarea" id="biz_contacts_${id}" data-biz-field="keyContacts" rows="2" placeholder="People Sarah might reference when helping with this business…">${escapeHtml(v.keyContacts || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_docs_${id}">Related documents <span class="ms-knowledge-optional">(paths or notes until MK‑04)</span></label>
            <textarea class="ms-knowledge-textarea" id="biz_docs_${id}" data-biz-field="relatedDocuments" rows="2" placeholder="Where contracts or filings live — not credentials">${escapeHtml(v.relatedDocuments || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="biz_proj_${id}">Current projects</label>
            <textarea class="ms-knowledge-textarea" id="biz_proj_${id}" data-biz-field="currentProjects" rows="2" placeholder="What you are working on now">${escapeHtml(v.currentProjects || '')}</textarea>
          </div>
          <p class="ms-knowledge-biz-footnote">Sarah keeps each venture separate — nothing is merged with your employer profile unless you connect it (MK‑06).</p>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-biz-empty">No businesses yet — tap <strong>Add business</strong> for a venture, startup, or idea.</p>';

  return `
    <form id="mkBusinessForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Add one profile per business so goals, documents, and contacts stay scoped correctly. ${MK_FORM_SYNC_LEAD}
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
  const root = mkScopedElement('mkBusinessList');
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
            <input class="ms-knowledge-input" id="edu_sch_${id}" data-edu-formal-field="institution" type="text" placeholder="School, university, or provider" value="${escapeHtml(p.institution || '')}" />
          </div>
          <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
            <div>
              <label class="ms-knowledge-label" for="edu_qual_${id}">Qualification</label>
              <input class="ms-knowledge-input" id="edu_qual_${id}" data-edu-formal-field="qualification" type="text" placeholder="Degree, diploma, or qualification name" value="${escapeHtml(p.qualification || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="edu_area_${id}">Study area</label>
              <input class="ms-knowledge-input" id="edu_area_${id}" data-edu-formal-field="studyArea" type="text" placeholder="Field of study" value="${escapeHtml(p.studyArea || '')}" />
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
            <textarea class="ms-knowledge-textarea" id="edu_hi_${id}" data-edu-formal-field="highlights" rows="2" placeholder="Honours, thesis topic, standout modules">${escapeHtml(p.highlights || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="edu_doc_${id}">Documents <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
            <textarea class="ms-knowledge-textarea" id="edu_doc_${id}" data-edu-formal-field="documentsNote" rows="2" placeholder="Where transcripts or certs live — see MK‑04 for uploads">${escapeHtml(p.documentsNote || '')}</textarea>
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
              <input class="ms-knowledge-input" id="ec_name_${id}" data-edu-course-field="name" type="text" placeholder="Course or certification name" value="${escapeHtml(c.name || '')}" />
            </div>
            <div>
              <label class="ms-knowledge-label" for="ec_prov_${id}">Provider</label>
              <input class="ms-knowledge-input" id="ec_prov_${id}" data-edu-course-field="provider" type="text" placeholder="Provider or platform" value="${escapeHtml(c.provider || '')}" />
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
            <textarea class="ms-knowledge-textarea" id="ec_notes_${id}" data-edu-course-field="notes" rows="2" placeholder="What you learned or how you use it">${escapeHtml(c.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-edu-empty">No courses yet — tap <strong>Add course</strong>.</p>';

  return `
    <form id="mkEducationForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Helps Sarah tune explanations to your level and remember what you are studying. ${MK_FORM_SYNC_LEAD}
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
          <textarea class="ms-knowledge-textarea" id="lc_currentStudies" name="lc_currentStudies" rows="2" placeholder="Formal study you are in now, if any">${escapeHtml(lc.currentStudies || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_subjectsOfInterest">Subjects of interest</label>
          <textarea class="ms-knowledge-textarea" id="lc_subjectsOfInterest" name="lc_subjectsOfInterest" rows="2" placeholder="Topics you want to explore">${escapeHtml(lc.subjectsOfInterest || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_learningGoals">Learning goals</label>
          <textarea class="ms-knowledge-textarea" id="lc_learningGoals" name="lc_learningGoals" rows="2" placeholder="Skills or knowledge you are building toward">${escapeHtml(lc.learningGoals || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_skillsDeveloping">Skills being developed</label>
          <textarea class="ms-knowledge-textarea" id="lc_skillsDeveloping" name="lc_skillsDeveloping" rows="2" placeholder="Skills you are practising now">${escapeHtml(lc.skillsDeveloping || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_studySchedule">Study schedule</label>
          <textarea class="ms-knowledge-textarea" id="lc_studySchedule" name="lc_studySchedule" rows="2" placeholder="When you usually study or practise">${escapeHtml(lc.studySchedule || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_learningPreferences">Learning preferences</label>
          <textarea class="ms-knowledge-textarea" id="lc_learningPreferences" name="lc_learningPreferences" rows="2" placeholder="Video vs reading, pace, format preferences">${escapeHtml(lc.learningPreferences || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_researchTopics">Research topics</label>
          <textarea class="ms-knowledge-textarea" id="lc_researchTopics" name="lc_researchTopics" rows="2" placeholder="Areas you dig into for work or curiosity">${escapeHtml(lc.researchTopics || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_readingList">Reading list</label>
          <textarea class="ms-knowledge-textarea" id="lc_readingList" name="lc_readingList" rows="2" placeholder="Books, articles, or papers on your list">${escapeHtml(lc.readingList || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="lc_educationalDocumentsNote">Educational documents <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
          <textarea class="ms-knowledge-textarea" id="lc_educationalDocumentsNote" name="lc_educationalDocumentsNote" rows="2" placeholder="Where certificates or notes live">${escapeHtml(lc.educationalDocumentsNote || '')}</textarea>
        </div>
      </fieldset>

      <div class="ms-knowledge-form-actions">
        <button type="button" class="btn btn-secondary" id="mkEducationReset">Reset to defaults</button>
        <button type="submit" class="btn btn-primary" id="mkEducationSave">Save</button>
      </div>
    </form>`;
}

function collectEducationLearningFromForm(form) {
  const formalRoot = mkScopedElement('mkEduFormalList');
  const courseRoot = mkScopedElement('mkEduCourseList');
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
        Sharing health details with Company Sarah requires separate consent. ${MK_FORM_SYNC_LEAD}
      </div>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">General &amp; clinical notes</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_generalNotes">General health notes</label>
          <textarea class="ms-knowledge-textarea" id="hl_generalNotes" name="generalNotes" rows="2" placeholder="Overall health context Sarah may remember — optional">${escapeHtml(h.generalNotes || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_conditions">Medical conditions &amp; diagnoses <span class="ms-knowledge-optional">(optional)</span></label>
          <textarea class="ms-knowledge-textarea" id="hl_conditions" name="conditionsDiagnoses" rows="2" placeholder="Conditions or diagnoses you choose to share">${escapeHtml(h.conditionsDiagnoses || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="hl_allergies">Allergies</label>
            <textarea class="ms-knowledge-textarea" id="hl_allergies" name="allergies" rows="2" placeholder="Allergies or intolerances">${escapeHtml(h.allergies || '')}</textarea>
          </div>
          <div>
            <label class="ms-knowledge-label" for="hl_meds">Medications</label>
            <textarea class="ms-knowledge-textarea" id="hl_meds" name="medications" rows="2" placeholder="List what you take — Sarah will not suggest dose changes">${escapeHtml(h.medications || '')}</textarea>
          </div>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_history">Medical history</label>
          <textarea class="ms-knowledge-textarea" id="hl_history" name="medicalHistory" rows="2" placeholder="Relevant history — not a substitute for records">${escapeHtml(h.medicalHistory || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_providers">Healthcare providers</label>
          <textarea class="ms-knowledge-textarea" id="hl_providers" name="healthcareProviders" rows="2" placeholder="Clinicians or practices — names only">${escapeHtml(h.healthcareProviders || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_appts">Appointments</label>
          <textarea class="ms-knowledge-textarea" id="hl_appts" name="appointments" rows="2" placeholder="Upcoming or recurring appointments">${escapeHtml(h.appointments || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_tests">Test results &amp; medical documents <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
          <textarea class="ms-knowledge-textarea" id="hl_tests" name="testResultsDocuments" rows="2" placeholder="Where results live — not clinical advice">${escapeHtml(h.testResultsDocuments || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Fitness, nutrition &amp; sleep</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_fitnessGoals">Fitness goals</label>
          <textarea class="ms-knowledge-textarea" id="hl_fitnessGoals" name="fitnessGoals" rows="2" placeholder="Fitness goals Sarah can support (not prescribe)">${escapeHtml(h.fitnessGoals || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_exercise">Exercise routines</label>
          <textarea class="ms-knowledge-textarea" id="hl_exercise" name="exerciseRoutines" rows="2" placeholder="Typical exercise week">${escapeHtml(h.exerciseRoutines || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_nutrition">Nutrition preferences</label>
          <textarea class="ms-knowledge-textarea" id="hl_nutrition" name="nutritionPreferences" rows="2" placeholder="Diet preferences — not medical nutrition therapy">${escapeHtml(h.nutritionPreferences || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_sleep">Sleep routines</label>
          <textarea class="ms-knowledge-textarea" id="hl_sleep" name="sleepRoutines" rows="2" placeholder="Sleep patterns or goals">${escapeHtml(h.sleepRoutines || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_wellbeing">Wellbeing goals</label>
          <textarea class="ms-knowledge-textarea" id="hl_wellbeing" name="wellbeingGoals" rows="2" placeholder="Stress, energy, mental wellbeing goals">${escapeHtml(h.wellbeingGoals || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Reminders</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="hl_reminders">Health-related reminders</label>
          <textarea class="ms-knowledge-textarea" id="hl_reminders" name="healthReminders" rows="2" placeholder="Check-ups, scripts, follow-ups to remember">${escapeHtml(h.healthReminders || '')}</textarea>
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
        <strong>Not financial advice.</strong> Do not store card numbers, CVVs, PINs, passwords, or full account numbers. Sharing with Company Sarah needs separate consent. ${MK_FORM_SYNC_LEAD}
      </div>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Overview</legend>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="fn_employmentStatus">Employment status</label>
            <select class="ms-knowledge-input" id="fn_employmentStatus" name="employmentStatus">${mkPlainSelectHtml('employmentStatus', MK_EMPLOYMENT_STATUS_OPTIONS, f.employmentStatus || '')}</select>
          </div>
          <div>
            <label class="ms-knowledge-label" for="fn_primaryCurrency">Primary currency</label>
            <select class="ms-knowledge-input" id="fn_primaryCurrency" name="primaryCurrency">${mkPlainSelectHtml('primaryCurrency', MK_CURRENCY_OPTIONS, f.primaryCurrency || '')}</select>
          </div>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_generalNotes">General financial notes</label>
          <textarea class="ms-knowledge-textarea" id="fn_generalNotes" name="generalNotes" rows="2" placeholder="High-level picture — currencies, life stage, what you want Sarah to remember…">${escapeHtml(f.generalNotes || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_income">Income sources <span class="ms-knowledge-optional">(descriptions only)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_income" name="incomeSources" rows="2" placeholder="Salary, business, side income — no account numbers">${escapeHtml(f.incomeSources || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_budget">Budget &amp; cashflow overview</label>
          <textarea class="ms-knowledge-textarea" id="fn_budget" name="monthlyBudgetOverview" rows="2" placeholder="How you think about monthly cash flow">${escapeHtml(f.monthlyBudgetOverview || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_expenses">Recurring expenses &amp; subscriptions</label>
          <textarea class="ms-knowledge-textarea" id="fn_expenses" name="expensesRecurring" rows="2" placeholder="Rent, subscriptions, regular bills — rounded amounts OK">${escapeHtml(f.expensesRecurring || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Debts, savings &amp; goals</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_debts">Debts &amp; loans <span class="ms-knowledge-optional">(no account numbers)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_debts" name="debtsLoans" rows="2" placeholder="Loans or credit — types and goals, not full numbers">${escapeHtml(f.debtsLoans || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_savings">Savings &amp; investments <span class="ms-knowledge-optional">(types &amp; goals, not login details)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_savings" name="savingsInvestments" rows="2" placeholder="Savings pots, investment approach — no credentials">${escapeHtml(f.savingsInvestments || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_fingoals">Financial goals &amp; milestones</label>
          <textarea class="ms-knowledge-textarea" id="fn_fingoals" name="financialGoals" rows="2" placeholder="What you are saving or planning for">${escapeHtml(f.financialGoals || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Insurance &amp; tax</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_insurance">Insurance policies <span class="ms-knowledge-optional">(provider &amp; type)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_insurance" name="insurancePolicies" rows="2" placeholder="Policy types and renewal rhythm — not policy numbers">${escapeHtml(f.insurancePolicies || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_tax">Tax &amp; compliance notes</label>
          <textarea class="ms-knowledge-textarea" id="fn_tax" name="taxesCompliance" rows="2" placeholder="Filing cadence, accountant contact — not tax IDs">${escapeHtml(f.taxesCompliance || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Institutions &amp; documents</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_accounts">Banks &amp; institutions <span class="ms-knowledge-optional">(names only — never passwords)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_accounts" name="accountsInstitutionsNote" rows="2" placeholder="Which institutions you use — never passwords or card numbers">${escapeHtml(f.accountsInstitutionsNote || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_docs">Statements &amp; records <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
          <textarea class="ms-knowledge-textarea" id="fn_docs" name="documentsRecordsNote" rows="2" placeholder="Where financial documents live">${escapeHtml(f.documentsRecordsNote || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Reminders</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="fn_reminders">Money-related reminders</label>
          <textarea class="ms-knowledge-textarea" id="fn_reminders" name="financialReminders" rows="2" placeholder="Payment dates, reviews, renewals">${escapeHtml(f.financialReminders || '')}</textarea>
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
    'employmentStatus',
    'primaryCurrency',
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
        Music, sport, social life, and what you do for fun — distinct from health or money detail. Syncs to Personal Sarah when you are signed in.
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
        <legend class="ms-knowledge-legend">Music, sport &amp; personality</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_music">Music you like</label>
          <input class="ms-knowledge-input" id="ls_music" name="musicTastes" type="text" placeholder="Genres, artists, moods…" value="${escapeHtml(x.musicTastes || '')}" />
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_sports">Sports teams you support</label>
          <input class="ms-knowledge-input" id="ls_sports" name="sportsTeams" type="text" placeholder="Teams, leagues, or sports you follow…" value="${escapeHtml(x.sportsTeams || '')}" />
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_socialStyle">Outgoing or reserved?</label>
          <select class="ms-knowledge-input" id="ls_socialStyle" name="socialStyle">${mkPlainSelectHtml('socialStyle', MK_SOCIAL_STYLE_OPTIONS, x.socialStyle || '')}</select>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_fun">What you do for fun</label>
          <textarea class="ms-knowledge-textarea" id="ls_fun" name="leisureWeekends" rows="2" placeholder="Weekends, hobbies, how you recharge…">${escapeHtml(x.leisureWeekends || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Friends &amp; hangouts</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_friends">Close friends</label>
          <textarea class="ms-knowledge-textarea" id="ls_friends" name="closeFriends" rows="2" placeholder="First names or groups Sarah should know about…">${escapeHtml(x.closeFriends || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="ls_hangouts">Where you usually hang out</label>
          <textarea class="ms-knowledge-textarea" id="ls_hangouts" name="usualHangouts" rows="2" placeholder="Spots, suburbs, venues you frequent…">${escapeHtml(x.usualHangouts || '')}</textarea>
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
    'musicTastes',
    'sportsTeams',
    'socialStyle',
    'leisureWeekends',
    'closeFriends',
    'usualHangouts',
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
            <textarea class="ms-knowledge-textarea" id="date_notes_${id}" data-date-field="notes" rows="2" placeholder="Extra context for this event">${escapeHtml(ev.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-date-empty">No dates yet — tap <strong>Add date</strong> for a birthday, renewal, trip, or deadline.</p>';

  return `
    <form id="mkDatesForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Birthdays, renewals, travel, deadlines — one entry each so Sarah can keep them straight. ${MK_FORM_SYNC_LEAD}
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
  const root = mkScopedElement('mkDatesList');
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
            <textarea class="ms-knowledge-textarea" id="doc_notes_${id}" data-doc-field="notes" rows="2" placeholder="Notes about this record">${escapeHtml(rec.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-doc-empty">No documents listed yet — tap <strong>Add document</strong> for files you want Sarah to know about (metadata only until MK‑04).</p>';

  return `
    <form id="mkDocumentsForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Record what you have and where it lives — distinct from approved memories or chat attachments. Sarah does not scan files in the prototype. ${MK_FORM_SYNC_LEAD}
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
  const root = mkScopedElement('mkDocumentsList');
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
        Schedules, habits, and commitments — separate from health treatment detail (use Health when clinical). ${MK_FORM_SYNC_LEAD}
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
          <textarea class="ms-knowledge-textarea" id="rt_weekend" name="typicalWeekend" rows="3" placeholder="How Saturdays and Sundays usually look">${escapeHtml(r.typicalWeekend || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_morning">Morning routine</label>
          <textarea class="ms-knowledge-textarea" id="rt_morning" name="morningRoutine" rows="2" placeholder="First hour or two of your day">${escapeHtml(r.morningRoutine || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="rt_evening">Evening &amp; wind-down</label>
          <textarea class="ms-knowledge-textarea" id="rt_evening" name="eveningWindDown" rows="2" placeholder="How you wind down before sleep">${escapeHtml(r.eveningWindDown || '')}</textarea>
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
          <textarea class="ms-knowledge-textarea" id="rt_chores" name="householdErrands" rows="2" placeholder="Groceries, school runs, admin blocks">${escapeHtml(r.householdErrands || '')}</textarea>
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
          <textarea class="ms-knowledge-textarea" id="rt_reminders" name="routineReminders" rows="2" placeholder="Recurring nudges tied to your routine">${escapeHtml(r.routineReminders || '')}</textarea>
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
            <textarea class="ms-knowledge-textarea" id="prop_desc_${id}" data-prop-field="description" rows="2" placeholder="Make, model, size — whatever helps Sarah">${escapeHtml(it.description || '')}</textarea>
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
            <textarea class="ms-knowledge-textarea" id="prop_renew_${id}" data-prop-field="renewalsServices" rows="2" placeholder="Licence, service, insurance renewals">${escapeHtml(it.renewalsServices || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="prop_docs_${id}">Records &amp; documents <span class="ms-knowledge-optional">(notes until MK‑04)</span></label>
            <textarea class="ms-knowledge-textarea" id="prop_docs_${id}" data-prop-field="documentsNote" rows="2" placeholder="Link Documents & records or describe where files live">${escapeHtml(it.documentsNote || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="prop_notes_${id}">Notes</label>
            <textarea class="ms-knowledge-textarea" id="prop_notes_${id}" data-prop-field="notes" rows="2" placeholder="Anything else about this asset">${escapeHtml(it.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-prop-empty">No assets yet — tap <strong>Add asset</strong> for a home, vehicle, or other item.</p>';

  return `
    <form id="mkPropertyForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Homes, vehicles, equipment — one card each. Do not store full policy numbers or banking detail here (use Financial or Documents metadata). ${MK_FORM_SYNC_LEAD}
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
  const root = mkScopedElement('mkPropertyList');
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
              <input class="ms-knowledge-input" id="tv_companions_${id}" data-travel-field="companions" type="text" placeholder="Who is travelling with you" value="${escapeHtml(trip.companions || '')}" />
            </div>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="tv_docs_${id}">Passport, visa &amp; documents <span class="ms-knowledge-optional">(notes)</span></label>
            <textarea class="ms-knowledge-textarea" id="tv_docs_${id}" data-travel-field="passportVisaNote" rows="2" placeholder="Expiry hints, visa type — details live in Documents when you add them">${escapeHtml(trip.passportVisaNote || '')}</textarea>
          </div>
          <div class="ms-knowledge-field-row">
            <label class="ms-knowledge-label" for="tv_notes_${id}">Notes</label>
            <textarea class="ms-knowledge-textarea" id="tv_notes_${id}" data-travel-field="notes" rows="2" placeholder="Plans, bookings, things to remember">${escapeHtml(trip.notes || '')}</textarea>
          </div>
        </article>`;
        })
        .join('')
    : '<p class="ms-knowledge-travel-empty">No trips yet — tap <strong>Add trip</strong> for something planned or past.</p>';

  return `
    <form id="mkTravelForm" class="ms-knowledge-form">
      <p class="ms-knowledge-detail-note">
        Trips, destinations, and travel logistics notes — passports and scans stay in Documents until MK‑04. ${MK_FORM_SYNC_LEAD}
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
  const root = mkScopedElement('mkTravelList');
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
  const identity = loadPersonalIdentity();
  const behavior = { ...getSarahBehaviorFromIdentity(identity), ...(v.sarahBehavior || {}) };
  const boundaryBehavior = SARAH_BEHAVIOR_VALUES_KEYS.map((k) => mkBehaviorSelectField(k, behavior)).join('');
  return `
    <form id="mkValuesForm" class="ms-knowledge-form">
      <div class="ms-knowledge-values-callout" role="note">
        <strong>Private by default.</strong> Sarah does not debate your worldview or pressure you to disclose more than you choose. ${MK_FORM_SYNC_LEAD}
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
          <textarea class="ms-knowledge-textarea" id="val_causes" name="causesCommunities" rows="2" placeholder="Causes or communities you care about">${escapeHtml(v.causesCommunities || '')}</textarea>
        </div>
      </fieldset>
      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Boundaries for Sarah</legend>
        <p class="ms-knowledge-detail-note">Pick how Sarah should handle values and sensitive topics.</p>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="val_rel">Relationship &amp; consent boundaries</label>
          <textarea class="ms-knowledge-textarea" id="val_rel" name="relationshipConsentBoundaries" rows="2" placeholder="Optional: names or situations Sarah should treat carefully…">${escapeHtml(v.relationshipConsentBoundaries || '')}</textarea>
        </div>
        ${boundaryBehavior}
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

const SARAH_BEHAVIOR_IDENTITY_KEYS = [
  'responseStyle',
  'communicationTone',
  'answerLength',
  'proactivity',
  'whenUnsure',
  'citeKnowledge',
];

const SARAH_BEHAVIOR_VALUES_KEYS = ['howSarahShouldWeigh', 'civicTopics', 'sensitiveTopics', 'topicsToAvoid'];

function getSarahBehaviorFromIdentity(data) {
  const d = data || {};
  const b = { ...(d.sarahBehavior || {}) };
  if (d.responseStyle && !b.responseStyle) b.responseStyle = d.responseStyle;
  return b;
}

function mkBehaviorSelectField(fieldKey, behavior) {
  const field = window.SARAH_BEHAVIOR_FIELDS?.[fieldKey];
  if (!field) return '';
  const sel = behavior?.[fieldKey] || field.default;
  const opts = field.options
    .map((o) => `<option value="${escapeHtml(o.value)}"${sel === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
    .join('');
  return `
    <div class="ms-knowledge-field-row">
      <label class="ms-knowledge-label" for="sb_${escapeHtml(fieldKey)}">${escapeHtml(field.label)}</label>
      <select class="ms-knowledge-input" id="sb_${escapeHtml(fieldKey)}" name="sarahBehavior_${escapeHtml(fieldKey)}">${opts}</select>
    </div>`;
}

function collectSarahBehaviorFromForm(form, keys) {
  const behavior = {};
  for (const key of keys) {
    const el = form.elements.namedItem(`sarahBehavior_${key}`);
    if (el && 'value' in el) behavior[key] = String(el.value || '');
  }
  return behavior;
}

const MK_API_SECTION_BY_CATEGORY = {
  identity: 'personal_profile',
  financial: 'finance',
  dates: 'important_dates',
  work: 'career',
};

const MK_MARITAL_STATUS_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'partnered', label: 'In a relationship / partnered' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
];

const MK_SEX_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
];

const MK_RELIGION_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'christian', label: 'Christian' },
  { value: 'muslim', label: 'Muslim' },
  { value: 'jewish', label: 'Jewish' },
  { value: 'hindu', label: 'Hindu' },
  { value: 'buddhist', label: 'Buddhist' },
  { value: 'traditional', label: 'Traditional / ancestral' },
  { value: 'spiritual', label: 'Spiritual (not religious)' },
  { value: 'atheist', label: 'Atheist / agnostic' },
  { value: 'other', label: 'Other' },
];

const MK_HAS_CHILDREN_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
];

const MK_CHILDREN_COUNT_OPTIONS = [
  { value: '', label: '—' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5plus', label: '5 or more' },
];

const MK_HOME_REGION_OPTIONS = [
  { value: '', label: 'Select region…' },
  { value: 'gauteng', label: 'Gauteng' },
  { value: 'western_cape', label: 'Western Cape' },
  { value: 'kwazulu_natal', label: 'KwaZulu-Natal' },
  { value: 'eastern_cape', label: 'Eastern Cape' },
  { value: 'free_state', label: 'Free State' },
  { value: 'limpopo', label: 'Limpopo' },
  { value: 'mpumalanga', label: 'Mpumalanga' },
  { value: 'north_west', label: 'North West' },
  { value: 'northern_cape', label: 'Northern Cape' },
  { value: 'other', label: 'Other country / region' },
];

const MK_CAREER_FIELD_OPTIONS = [
  { value: '', label: 'Select or type in notes…' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'education', label: 'Education' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
  { value: 'retail', label: 'Retail' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'entrepreneur', label: 'Entrepreneur / business owner' },
  { value: 'student', label: 'Student' },
  { value: 'other', label: 'Other' },
];

const MK_SOCIAL_STYLE_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'outgoing', label: 'Outgoing — energised by people' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'reserved', label: 'Reserved — smaller circles' },
  { value: 'introverted', label: 'Introverted — needs recharge time' },
];

const MK_COUNTRY_OPTIONS = [
  { value: '', label: 'Select country…' },
  { value: 'south_africa', label: 'South Africa' },
  { value: 'botswana', label: 'Botswana' },
  { value: 'namibia', label: 'Namibia' },
  { value: 'zimbabwe', label: 'Zimbabwe' },
  { value: 'mozambique', label: 'Mozambique' },
  { value: 'lesotho', label: 'Lesotho' },
  { value: 'eswatini', label: 'Eswatini' },
  { value: 'united_kingdom', label: 'United Kingdom' },
  { value: 'united_states', label: 'United States' },
  { value: 'other', label: 'Other' },
];

const MK_CURRENCY_OPTIONS = [
  { value: '', label: 'Primary currency…' },
  { value: 'ZAR', label: 'ZAR (Rand)' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'BWP', label: 'BWP' },
  { value: 'other', label: 'Other' },
];

const MK_EMPLOYMENT_STATUS_OPTIONS = [
  { value: '', label: 'Employment status…' },
  { value: 'employed_full', label: 'Employed full-time' },
  { value: 'employed_part', label: 'Employed part-time' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'business_owner', label: 'Business owner' },
  { value: 'student', label: 'Student' },
  { value: 'homemaker', label: 'Homemaker' },
  { value: 'retired', label: 'Retired' },
  { value: 'between_jobs', label: 'Between jobs' },
  { value: 'other', label: 'Other' },
];

function mkPlainSelectHtml(name, options, selected) {
  const sel = String(selected || '');
  return options
    .map((o) => `<option value="${escapeHtml(o.value)}"${sel === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
    .join('');
}

function mkCategoryMeta(categoryKey) {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  return mk?.categories?.find((c) => c.key === categoryKey) || null;
}

function mkApiSectionKey(categoryKey) {
  return MK_API_SECTION_BY_CATEGORY[categoryKey] || categoryKey;
}

async function syncMkCategoryToServer(categoryKey, data, { sarahMayUse } = {}) {
  if (!personalSarahLiveActive() || !window.SarahLive?.upsertPersonalKnowledgeSection) return { ok: false };
  const cat = mkCategoryMeta(categoryKey);
  const apiKey = mkApiSectionKey(categoryKey);
  const mayUse = sarahMayUse ?? cat?.sarahMayUse ?? true;
  const res = await window.SarahLive.upsertPersonalKnowledgeSection(apiKey, {
    content: JSON.stringify({ version: 1, category: categoryKey, data }),
    sarahMayUse: mayUse,
  });
  return res?.error ? { ok: false, error: res.error } : { ok: true };
}

async function syncPersonalProfileKnowledge(identity) {
  if (!personalSarahLiveActive() || !window.SarahLive?.upsertPersonalKnowledgeSection) return;
  const payload = {
    version: 1,
    fullName: identity.fullName || '',
    preferredName: identity.preferredName || '',
    dateOfBirth: identity.dateOfBirth || '',
    preferredLanguage: identity.preferredLanguage || '',
    country: identity.country || '',
    city: identity.city || '',
    homeRegion: identity.homeRegion || '',
    homeAddressNote: identity.homeAddressNote || '',
    locationNote: identity.locationNote || '',
    maritalStatus: identity.maritalStatus || '',
    sex: identity.sex || '',
    religion: identity.religion || '',
    careerField: identity.careerField || '',
    hasChildren: identity.hasChildren || '',
    childrenCount: identity.childrenCount || '',
    nationalityBackground: identity.nationalityBackground || '',
    educationQualifications: identity.educationQualifications || '',
    personalBiography: identity.personalBiography || '',
    importantLifeExperiences: identity.importantLifeExperiences || '',
    skillsExpertise: identity.skillsExpertise || '',
    interestsHobbies: identity.interestsHobbies || '',
    enjoysDislikes: identity.enjoysDislikes || '',
    personalValues: identity.personalValues || '',
    strengthsImprove: identity.strengthsImprove || '',
    sarahBehavior: identity.sarahBehavior || {},
  };
  await window.SarahLive.upsertPersonalKnowledgeSection('personal_profile', {
    content: JSON.stringify(payload),
    sarahMayUse: true,
  });
}

const MK_CATEGORY_BY_API_SECTION = {
  personal_profile: 'identity',
  finance: 'financial',
  important_dates: 'dates',
  career: 'work',
};

function mkCategoryFromApiSection(sectionKey) {
  return MK_CATEGORY_BY_API_SECTION[sectionKey] || String(sectionKey || '').trim();
}

let __mkServerHydratePromise = null;

function applyMkServerSectionToLocal(categoryKey, content) {
  const raw = String(content || '').trim();
  if (!raw) return;
  const key = String(categoryKey || '').trim();
  if (key === 'identity') {
    const { fields, sarahBehavior } = parsePersonalProfilePayloadClient(raw);
    savePersonalIdentity({ ...fields, sarahBehavior: sarahBehavior || {} });
    return;
  }
  try {
    const j = JSON.parse(raw);
    const data = j?.data != null ? j.data : j;
    if (!data || typeof data !== 'object') return;
    const apply = {
      family: saveFamilyRelationships,
      goals: saveGoalsAmbitions,
      work: saveWorkProfessional,
      business: saveBusinessEntrepreneurship,
      education: saveEducationLearning,
      health: saveHealthWellbeing,
      financial: saveFinancialLife,
      lifestyle: saveLifestylePreferences,
      dates: saveImportantDatesEvents,
      documents: saveDocumentsRecords,
      routines: saveRoutinesDailyLife,
      property: savePropertyAssets,
      travel: saveTravelPlaces,
      values: saveValuesPrinciples,
    }[key];
    if (apply) apply(data);
  } catch {
    /* ignore */
  }
}

function ensureMkHydratedFromServer() {
  if (!personalSarahLiveActive() || !window.SarahLive?.fetchPersonalKnowledgeSections) {
    return Promise.resolve();
  }
  if (__mkServerHydratePromise) return __mkServerHydratePromise;
  __mkServerHydratePromise = (async () => {
    const res = await window.SarahLive.fetchPersonalKnowledgeSections();
    if (res?.error || !Array.isArray(res.sections)) return;
    res.sections.forEach((sec) => {
      if (!sec?.content) return;
      const cat = mkCategoryFromApiSection(sec.sectionKey);
      if (!mkCategoryMeta(cat)) return;
      applyMkServerSectionToLocal(cat, sec.content);
    });
  })();
  return __mkServerHydratePromise;
}

function isMkSectionModalOpen() {
  const modal = document.getElementById('mkSectionModal');
  return modal && !modal.classList.contains('hidden');
}

function closeMkSectionModal() {
  const modal = document.getElementById('mkSectionModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  const { msPanel, knowledgeCategory } = parseLocationHash();
  if (msPanel === 'knowledge' && knowledgeCategory) {
    const hash = mySarahHashForPanel('knowledge', {});
    if (location.hash.replace(/^#/, '') !== hash) {
      location.hash = hash;
    }
  }
}

function mkScopedElement(id) {
  const sid = String(id || '').replace(/^#/, '');
  if (!sid) return null;
  if (isMkSectionModalOpen()) {
    const inModal = document.getElementById('mkSectionModalBody')?.querySelector(`#${sid}`);
    if (inModal) return inModal;
  }
  const inDetail = document.getElementById('mkCategoryRoot')?.querySelector(`#${sid}`);
  if (inDetail) return inDetail;
  return document.getElementById(sid);
}

function mkCategoryNavSiblings(categoryKey) {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const cat = mk?.categories?.find((c) => c.key === categoryKey);
  if (!cat || !mk?.categories) return { prev: null, next: null };
  const ordered = mk.categories.filter((c) => c.area === cat.area);
  const i = ordered.findIndex((c) => c.key === categoryKey);
  return {
    prev: i > 0 ? ordered[i - 1].key : null,
    next: i >= 0 && i < ordered.length - 1 ? ordered[i + 1].key : null,
  };
}

function renderMkSectionModalMeta(cat) {
  const meta = document.getElementById('mkSectionModalMeta');
  if (!meta || !cat) {
    meta?.setAttribute('hidden', '');
    return;
  }
  const badgeClass = mkClassificationShort(cat.classification) === 'Sensitive' ? 'sensitive' : 'personal';
  const mayUse = cat.sarahMayUse ? 'Sarah may use' : 'Private by default';
  meta.innerHTML = `
    <span class="ms-knowledge-badge ms-knowledge-badge--${badgeClass}">${escapeHtml(cat.classification)}</span>
    <span class="ms-knowledge-meta-line">${escapeHtml(mayUse)}</span>
    <span class="ms-knowledge-meta-line">Learn from chat: ${cat.learnFromConversations ? 'On' : 'Off'}</span>`;
  meta.removeAttribute('hidden');
}

function updateMkSectionModalFoot(categoryKey) {
  const foot = document.getElementById('mkSectionModalFoot');
  if (!foot) return;
  const { prev, next } = mkCategoryNavSiblings(categoryKey);
  const prevBtn = foot.querySelector('[data-mk-section-prev]');
  const nextBtn = foot.querySelector('[data-mk-section-next]');
  if (prevBtn) {
    prevBtn.hidden = !prev;
    if (prev) prevBtn.setAttribute('data-mk-section-target', prev);
    else prevBtn.removeAttribute('data-mk-section-target');
  }
  if (nextBtn) {
    nextBtn.hidden = !next;
    if (next) nextBtn.setAttribute('data-mk-section-target', next);
    else nextBtn.removeAttribute('data-mk-section-target');
  }
  if (!prev && !next) foot.setAttribute('hidden', '');
  else foot.removeAttribute('hidden');
}

function closeMkAreaPickerModal() {
  const modal = document.getElementById('mkAreaPickerModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function renderMkCategoryFormBody(categoryKey) {
  const key = String(categoryKey || '').trim();
  if (key === 'identity') return renderMkPersonalIdentityForm(loadPersonalIdentity());
  if (key === 'family') return renderMkFamilyForm(loadFamilyRelationships());
  if (key === 'goals') return renderMkGoalsForm(loadGoalsAmbitions());
  if (key === 'work') return renderMkWorkForm(loadWorkProfessional());
  if (key === 'business') return renderMkBusinessForm(loadBusinessEntrepreneurship());
  if (key === 'education') return renderMkEducationForm(loadEducationLearning());
  if (key === 'health') return renderMkHealthForm(loadHealthWellbeing());
  if (key === 'financial') return renderMkFinancialForm(loadFinancialLife());
  if (key === 'lifestyle') return renderMkLifestyleForm(loadLifestylePreferences());
  if (key === 'dates') return renderMkImportantDatesForm(loadImportantDatesEvents());
  if (key === 'documents') return renderMkDocumentsForm(loadDocumentsRecords());
  if (key === 'routines') return renderMkRoutinesForm(loadRoutinesDailyLife());
  if (key === 'property') return renderMkPropertyForm(loadPropertyAssets());
  if (key === 'travel') return renderMkTravelForm(loadTravelPlaces());
  if (key === 'values') return renderMkValuesForm(loadValuesPrinciples());
  const cat = mkCategoryMeta(key);
  return cat ? renderMkCategoryPlaceholder(cat) : '<p class="ms-knowledge-detail-note">Category not found.</p>';
}

function refreshMkCategoryView(categoryKey) {
  void openMkSectionModal(categoryKey);
}

function bindMkModalChromeOnce() {
  if (window.__mkModalChromeBound) return;
  window.__mkModalChromeBound = true;
  document.getElementById('mkSectionModal')?.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-mk-section-prev],[data-mk-section-next]');
    if (nav) {
      e.preventDefault();
      const target = nav.getAttribute('data-mk-section-target');
      if (target) {
        openMyKnowledgeCategory(target);
      }
      return;
    }
    if (e.target.closest('[data-mk-section-close]')) {
      e.preventDefault();
      closeMkSectionModal();
    }
  });
  document.getElementById('mkAreaPickerModal')?.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-mk-area-pick]');
    if (pick) {
      const key = pick.getAttribute('data-mk-area-pick');
      closeMkAreaPickerModal();
      if (key) openMkSectionModal(key);
      return;
    }
    if (e.target.closest('[data-mk-area-close]')) {
      e.preventDefault();
      closeMkAreaPickerModal();
    }
  });
}

function openMkAreaPickerModal(areaKey) {
  bindMkModalChromeOnce();
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const area = (mk?.areas || []).find((a) => a.key === areaKey);
  const cats = (mk?.categories || []).filter((c) => c.area === areaKey);
  if (!cats.length) return;
  if (areaKey === 'understanding') {
    document.getElementById('mkUnderstandingHeading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (cats.length === 1) {
    openMkSectionModal(cats[0].key);
    return;
  }
  const modal = document.getElementById('mkAreaPickerModal');
  const list = document.getElementById('mkAreaPickerList');
  const title = document.getElementById('mkAreaPickerTitle');
  const lead = document.getElementById('mkAreaPickerLead');
  if (!modal || !list) {
    openMkSectionModal(cats[0].key);
    return;
  }
  if (title) title.textContent = area?.label || 'My Knowledge';
  if (lead) lead.textContent = area?.description || 'Choose a section to fill in or update.';
  list.innerHTML = cats
    .map(
      (c) => `
      <button type="button" class="ms-knowledge-area-picker-btn" data-mk-area-pick="${escapeHtml(c.key)}">
        <strong>${escapeHtml(c.label)}</strong>
        <span>${escapeHtml(c.blurb || c.subtitle || '')}</span>
      </button>`
    )
    .join('');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

async function openMkSectionModal(categoryKey) {
  bindMkModalChromeOnce();
  bindMkCategoryDetailOnce();
  const cat = mkCategoryMeta(categoryKey);
  const modal = document.getElementById('mkSectionModal');
  const body = document.getElementById('mkSectionModalBody');
  const title = document.getElementById('mkSectionModalTitle');
  const eyebrow = document.getElementById('mkSectionModalEyebrow');
  if (!modal || !body || !cat) {
    refreshMkCategoryView(categoryKey);
    return;
  }
  if (title) title.textContent = cat.label;
  if (eyebrow) eyebrow.textContent = cat.subtitle || cat.area || '';
  setMkKnowledgeViewMode('home');
  const hash = mySarahHashForPanel('knowledge', { knowledgeCategory: String(categoryKey) });
  if (parseLocationHash().msPanel === 'knowledge' && location.hash.replace(/^#/, '') !== hash) {
    location.hash = hash;
  }
  renderMkSectionModalMeta(cat);
  updateMkSectionModalFoot(categoryKey);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  body.innerHTML =
    '<p class="ms-knowledge-detail-note" aria-live="polite">Loading your saved details…</p>';
  await ensureMkHydratedFromServer();
  body.innerHTML = renderMkCategoryFormBody(categoryKey);
  body.querySelector('input, select, textarea')?.focus();
}

function renderMkPersonalIdentityForm(data) {
  const d = data || {};
  const behavior = getSarahBehaviorFromIdentity(d);
  const behaviorFields = SARAH_BEHAVIOR_IDENTITY_KEYS.map((k) => mkBehaviorSelectField(k, behavior)).join('');
  return `
    <form id="mkIdentityForm" class="ms-knowledge-form" autocomplete="on">
      <p class="ms-knowledge-detail-note">Tell Sarah who you are. Saves on this device and syncs to your account when you are signed in — Personal Sarah uses this to address you by name and personalise replies.</p>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Who you are</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_fullName">Full name</label>
          <input class="ms-knowledge-input" id="mk_fullName" name="fullName" type="text" placeholder="Legal or full name" value="${escapeHtml(d.fullName || '')}" />
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_preferredName">Preferred name</label>
          <input class="ms-knowledge-input" id="mk_preferredName" name="preferredName" type="text" placeholder="What Sarah should call you" value="${escapeHtml(d.preferredName || '')}" />
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="mk_dateOfBirth">Date of birth</label>
            <input class="ms-knowledge-input" id="mk_dateOfBirth" name="dateOfBirth" type="date" value="${escapeHtml(d.dateOfBirth || '')}" />
          </div>
          <div>
            <label class="ms-knowledge-label" for="mk_preferredLanguage">Preferred language</label>
            <input class="ms-knowledge-input" id="mk_preferredLanguage" name="preferredLanguage" type="text" placeholder="e.g. English, isiZulu" value="${escapeHtml(d.preferredLanguage || '')}" />
          </div>
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="mk_sex">Sex</label>
            <select class="ms-knowledge-input" id="mk_sex" name="sex">${mkPlainSelectHtml('sex', MK_SEX_OPTIONS, d.sex || '')}</select>
          </div>
          <div>
            <label class="ms-knowledge-label" for="mk_maritalStatus">Marital status</label>
            <select class="ms-knowledge-input" id="mk_maritalStatus" name="maritalStatus">${mkPlainSelectHtml('maritalStatus', MK_MARITAL_STATUS_OPTIONS, d.maritalStatus)}</select>
          </div>
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="mk_religion">Religion / spirituality</label>
            <select class="ms-knowledge-input" id="mk_religion" name="religion">${mkPlainSelectHtml('religion', MK_RELIGION_OPTIONS, d.religion)}</select>
          </div>
          <div>
            <label class="ms-knowledge-label" for="mk_careerField">Career field</label>
            <select class="ms-knowledge-input" id="mk_careerField" name="careerField">${mkPlainSelectHtml('careerField', MK_CAREER_FIELD_OPTIONS, d.careerField)}</select>
          </div>
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="mk_hasChildren">Children</label>
            <select class="ms-knowledge-input" id="mk_hasChildren" name="hasChildren">${mkPlainSelectHtml('hasChildren', MK_HAS_CHILDREN_OPTIONS, d.hasChildren)}</select>
          </div>
          <div>
            <label class="ms-knowledge-label" for="mk_childrenCount">How many children</label>
            <select class="ms-knowledge-input" id="mk_childrenCount" name="childrenCount">${mkPlainSelectHtml('childrenCount', MK_CHILDREN_COUNT_OPTIONS, d.childrenCount)}</select>
          </div>
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="mk_country">Country</label>
            <select class="ms-knowledge-input" id="mk_country" name="country">${mkPlainSelectHtml('country', MK_COUNTRY_OPTIONS, d.country || '')}</select>
          </div>
          <div>
            <label class="ms-knowledge-label" for="mk_city">City / area</label>
            <input class="ms-knowledge-input" id="mk_city" name="city" type="text" placeholder="City or main area" value="${escapeHtml(d.city || '')}" />
          </div>
        </div>
        <div class="ms-knowledge-field-row ms-knowledge-field-row--half">
          <div>
            <label class="ms-knowledge-label" for="mk_homeRegion">Home region</label>
            <select class="ms-knowledge-input" id="mk_homeRegion" name="homeRegion">${mkPlainSelectHtml('homeRegion', MK_HOME_REGION_OPTIONS, d.homeRegion)}</select>
          </div>
          <div>
            <label class="ms-knowledge-label" for="mk_homeAddressNote">Address note <span class="ms-knowledge-optional">(optional)</span></label>
            <input class="ms-knowledge-input" id="mk_homeAddressNote" name="homeAddressNote" type="text" placeholder="Suburb or area — not your street number" value="${escapeHtml(d.homeAddressNote || '')}" />
          </div>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_locationNote">Location note <span class="ms-knowledge-optional">(optional)</span></label>
          <input class="ms-knowledge-input" id="mk_locationNote" name="locationNote" type="text" placeholder="Region, neighbourhood, timezone…" value="${escapeHtml(d.locationNote || '')}" />
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_nationalityBackground">Nationality or background <span class="ms-knowledge-optional">(optional)</span></label>
          <textarea class="ms-knowledge-textarea" id="mk_nationalityBackground" name="nationalityBackground" rows="2" placeholder="Nationality, culture, or background — optional">${escapeHtml(d.nationalityBackground || '')}</textarea>
        </div>
      </fieldset>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Story & expertise</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_educationQualifications">Education & qualifications</label>
          <textarea class="ms-knowledge-textarea" id="mk_educationQualifications" name="educationQualifications" rows="3" placeholder="Degrees, certs, training">${escapeHtml(d.educationQualifications || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_personalBiography">Personal biography</label>
          <textarea class="ms-knowledge-textarea" id="mk_personalBiography" name="personalBiography" rows="4" placeholder="Short bio in your words">${escapeHtml(d.personalBiography || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_importantLifeExperiences">Important life experiences</label>
          <textarea class="ms-knowledge-textarea" id="mk_importantLifeExperiences" name="importantLifeExperiences" rows="3" placeholder="Milestones or experiences that shaped you">${escapeHtml(d.importantLifeExperiences || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_skillsExpertise">Skills, talents & areas of expertise</label>
          <textarea class="ms-knowledge-textarea" id="mk_skillsExpertise" name="skillsExpertise" rows="3" placeholder="Skills, talents, areas of expertise">${escapeHtml(d.skillsExpertise || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_interestsHobbies">Interests & hobbies</label>
          <textarea class="ms-knowledge-textarea" id="mk_interestsHobbies" name="interestsHobbies" rows="2" placeholder="Hobbies and interests for casual context">${escapeHtml(d.interestsHobbies || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_enjoysDislikes">Things you enjoy & dislike</label>
          <textarea class="ms-knowledge-textarea" id="mk_enjoysDislikes" name="enjoysDislikes" rows="3" placeholder="Likes and dislikes — one line each is fine">${escapeHtml(d.enjoysDislikes || '')}</textarea>
        </div>
      </fieldset>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">How Sarah should respond</legend>
        <p class="ms-knowledge-detail-note">Choose how Sarah talks and acts — no need to write instructions in your own words.</p>
        ${behaviorFields}
      </fieldset>

      <fieldset class="ms-knowledge-fieldset">
        <legend class="ms-knowledge-legend">Values & growth</legend>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_personalValues">Important values & principles</label>
          <textarea class="ms-knowledge-textarea" id="mk_personalValues" name="personalValues" rows="3" placeholder="Values that matter in how Sarah helps you">${escapeHtml(d.personalValues || '')}</textarea>
        </div>
        <div class="ms-knowledge-field-row">
          <label class="ms-knowledge-label" for="mk_strengthsImprove">Strengths & areas to improve</label>
          <textarea class="ms-knowledge-textarea" id="mk_strengthsImprove" name="strengthsImprove" rows="3" placeholder="Strengths and areas you are working on">${escapeHtml(d.strengthsImprove || '')}</textarea>
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
  setMkKnowledgeViewMode('home');
  void openMkSectionModal(categoryKey);
}

function mkKnowledgeInteractionRoot(target) {
  return target?.closest?.('#mkCategoryRoot, #mkSectionModalBody');
}

let __mkCategoryDetailBound = false;

function bindMkCategoryDetailOnce() {
  if (__mkCategoryDetailBound) return;
  __mkCategoryDetailBound = true;

  document.addEventListener('click', (e) => {
    if (!mkKnowledgeInteractionRoot(e.target) && !e.target.closest('#mkCategoryBack')) return;
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
      refreshMkCategoryView('identity');
      return;
    }
    const resetFamily = e.target.closest('#mkFamilyReset');
    if (resetFamily) {
      discardFamilyRelationshipsEdits();
      showProtoToast('Family list reset to prototype defaults');
      refreshMkCategoryView('family');
      return;
    }
    const resetGoals = e.target.closest('#mkGoalsReset');
    if (resetGoals) {
      discardGoalsAmbitionsEdits();
      showProtoToast('Goals reset to prototype defaults');
      refreshMkCategoryView('goals');
      return;
    }
    const resetWork = e.target.closest('#mkWorkReset');
    if (resetWork) {
      discardWorkProfessionalEdits();
      showProtoToast('Work profile reset to prototype defaults');
      refreshMkCategoryView('work');
      return;
    }
    const resetBusiness = e.target.closest('#mkBusinessReset');
    if (resetBusiness) {
      discardBusinessEntrepreneurshipEdits();
      showProtoToast('Business profiles reset to prototype defaults');
      refreshMkCategoryView('business');
      return;
    }
    const resetEducation = e.target.closest('#mkEducationReset');
    if (resetEducation) {
      discardEducationLearningEdits();
      showProtoToast('Education reset to prototype defaults');
      refreshMkCategoryView('education');
      return;
    }
    const resetHealth = e.target.closest('#mkHealthReset');
    if (resetHealth) {
      discardHealthWellbeingEdits();
      showProtoToast('Health notes reset to prototype defaults');
      refreshMkCategoryView('health');
      return;
    }
    const resetFinancial = e.target.closest('#mkFinancialReset');
    if (resetFinancial) {
      discardFinancialLifeEdits();
      showProtoToast('Financial notes reset to prototype defaults');
      refreshMkCategoryView('financial');
      return;
    }
    const resetLifestyle = e.target.closest('#mkLifestyleReset');
    if (resetLifestyle) {
      discardLifestylePreferencesEdits();
      showProtoToast('Lifestyle preferences reset to prototype defaults');
      refreshMkCategoryView('lifestyle');
      return;
    }
    const resetDates = e.target.closest('#mkDatesReset');
    if (resetDates) {
      discardImportantDatesEventsEdits();
      showProtoToast('Dates & events reset to prototype defaults');
      refreshMkCategoryView('dates');
      return;
    }
    const resetDocuments = e.target.closest('#mkDocumentsReset');
    if (resetDocuments) {
      discardDocumentsRecordsEdits();
      showProtoToast('Documents list reset to prototype defaults');
      refreshMkCategoryView('documents');
      return;
    }
    const resetRoutines = e.target.closest('#mkRoutinesReset');
    if (resetRoutines) {
      discardRoutinesDailyLifeEdits();
      showProtoToast('Routines reset to prototype defaults');
      refreshMkCategoryView('routines');
      return;
    }
    const resetProperty = e.target.closest('#mkPropertyReset');
    if (resetProperty) {
      discardPropertyAssetsEdits();
      showProtoToast('Property & assets reset to prototype defaults');
      refreshMkCategoryView('property');
      return;
    }
    const resetTravel = e.target.closest('#mkTravelReset');
    if (resetTravel) {
      discardTravelPlacesEdits();
      showProtoToast('Travel reset to prototype defaults');
      refreshMkCategoryView('travel');
      return;
    }
    const resetValues = e.target.closest('#mkValuesReset');
    if (resetValues) {
      discardValuesPrinciplesEdits();
      showProtoToast('Values & principles reset to prototype defaults');
      refreshMkCategoryView('values');
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
        contactFrequency: '',
        livesWith: '',
        details: '',
        reminders: '',
      });
      saveFamilyRelationships(data);
      refreshMkCategoryView('family');
      showProtoToast('Person added — fill in and save');
      return;
    }
    const rm = e.target.closest('[data-mk-family-remove]');
    if (rm) {
      const pid = rm.getAttribute('data-mk-family-remove');
      const data = loadFamilyRelationships();
      data.people = (data.people || []).filter((p) => p.id !== pid);
      saveFamilyRelationships(data);
      refreshMkCategoryView('family');
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
      refreshMkCategoryView('goals');
      showProtoToast('Goal added — fill in and save');
      return;
    }
    const rmGoal = e.target.closest('[data-mk-goal-remove]');
    if (rmGoal) {
      const gid = rmGoal.getAttribute('data-mk-goal-remove');
      const data = loadGoalsAmbitions();
      data.goals = (data.goals || []).filter((g) => g.id !== gid);
      saveGoalsAmbitions(data);
      refreshMkCategoryView('goals');
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
      refreshMkCategoryView('work');
      showProtoToast('Role added — fill in and save');
      return;
    }
    const rmWork = e.target.closest('[data-mk-work-remove]');
    if (rmWork) {
      const wid = rmWork.getAttribute('data-mk-work-remove');
      const data = loadWorkProfessional();
      data.roles = (data.roles || []).filter((r) => r.id !== wid);
      saveWorkProfessional(data);
      refreshMkCategoryView('work');
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
      refreshMkCategoryView('business');
      showProtoToast('Business added — fill in and save');
      return;
    }
    const rmBiz = e.target.closest('[data-mk-biz-remove]');
    if (rmBiz) {
      const bid = rmBiz.getAttribute('data-mk-biz-remove');
      const data = loadBusinessEntrepreneurship();
      data.ventures = (data.ventures || []).filter((v) => v.id !== bid);
      saveBusinessEntrepreneurship(data);
      refreshMkCategoryView('business');
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
      refreshMkCategoryView('education');
      showProtoToast('Program added — fill in and save');
      return;
    }
    const rmEduFormal = e.target.closest('[data-mk-edu-formal-remove]');
    if (rmEduFormal) {
      const rid = rmEduFormal.getAttribute('data-mk-edu-formal-remove');
      const data = loadEducationLearning();
      data.formalPrograms = (data.formalPrograms || []).filter((p) => p.id !== rid);
      saveEducationLearning(data);
      refreshMkCategoryView('education');
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
      refreshMkCategoryView('education');
      showProtoToast('Course added — fill in and save');
      return;
    }
    const rmEduCourse = e.target.closest('[data-mk-edu-course-remove]');
    if (rmEduCourse) {
      const cid = rmEduCourse.getAttribute('data-mk-edu-course-remove');
      const data = loadEducationLearning();
      data.coursesAndCerts = (data.coursesAndCerts || []).filter((c) => c.id !== cid);
      saveEducationLearning(data);
      refreshMkCategoryView('education');
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
      refreshMkCategoryView('dates');
      showProtoToast('Date added — fill in and save');
      return;
    }
    const rmDate = e.target.closest('[data-mk-date-remove]');
    if (rmDate) {
      const did = rmDate.getAttribute('data-mk-date-remove');
      const data = loadImportantDatesEvents();
      data.events = (data.events || []).filter((ev) => ev.id !== did);
      saveImportantDatesEvents(data);
      refreshMkCategoryView('dates');
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
      refreshMkCategoryView('documents');
      showProtoToast('Document added — fill in and save');
      return;
    }
    const rmDoc = e.target.closest('[data-mk-doc-remove]');
    if (rmDoc) {
      const rid = rmDoc.getAttribute('data-mk-doc-remove');
      const data = loadDocumentsRecords();
      data.records = (data.records || []).filter((r) => r.id !== rid);
      saveDocumentsRecords(data);
      refreshMkCategoryView('documents');
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
      refreshMkCategoryView('property');
      showProtoToast('Asset added — fill in and save');
      return;
    }
    const rmProperty = e.target.closest('[data-mk-property-remove]');
    if (rmProperty) {
      const pid = rmProperty.getAttribute('data-mk-property-remove');
      const data = loadPropertyAssets();
      data.items = (data.items || []).filter((x) => x.id !== pid);
      savePropertyAssets(data);
      refreshMkCategoryView('property');
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
      refreshMkCategoryView('travel');
      showProtoToast('Trip added — fill in and save');
      return;
    }
    const rmTravel = e.target.closest('[data-mk-travel-remove]');
    if (rmTravel) {
      const tid = rmTravel.getAttribute('data-mk-travel-remove');
      const data = loadTravelPlaces();
      data.trips = (data.trips || []).filter((t) => t.id !== tid);
      saveTravelPlaces(data);
      refreshMkCategoryView('travel');
      showProtoToast('Trip removed');
      return;
    }
    if (e.target.closest('[data-mk-placeholder="notify"]')) {
      showProtoToast('We will use this for product updates in a later build');
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!mkKnowledgeInteractionRoot(form)) return;
    e.preventDefault();
    const mkSavedRemote = (categoryKey, data) => {
      void syncMkCategoryToServer(categoryKey, data);
      void refreshProfileSarahKnowledgeUi();
    };
    if (form.id === 'mkIdentityForm') {
      const fd = new FormData(form);
      const partial = {};
      fd.forEach((val, key) => {
        if (String(key).startsWith('sarahBehavior_')) return;
        partial[key] = typeof val === 'string' ? val : String(val || '');
      });
      const behavior = collectSarahBehaviorFromForm(form, SARAH_BEHAVIOR_IDENTITY_KEYS);
      const prev = loadPersonalIdentity();
      partial.sarahBehavior = { ...(prev.sarahBehavior || {}), ...behavior };
      partial.responseStyle = partial.sarahBehavior.responseStyle || partial.responseStyle;
      const saved = savePersonalIdentity(partial);
      void syncPersonalProfileKnowledge(saved);
      showProtoToast('Personal identity saved — Personal Sarah will use your name and details');
      return;
    }
    if (form.id === 'mkFamilyForm') {
      const people = collectFamilyPeopleFromDom();
      const data = { people };
      saveFamilyRelationships(data);
      mkSavedRemote('family', data);
      showProtoToast('Family & relationships saved');
      return;
    }
    if (form.id === 'mkGoalsForm') {
      const goals = collectGoalsFromDom();
      const data = { goals };
      saveGoalsAmbitions(data);
      mkSavedRemote('goals', data);
      showProtoToast('Goals saved');
      return;
    }
    if (form.id === 'mkWorkForm') {
      const roles = collectWorkRolesFromDom();
      const data = { roles };
      saveWorkProfessional(data);
      mkSavedRemote('work', data);
      showProtoToast('Work profile saved');
      return;
    }
    if (form.id === 'mkBusinessForm') {
      const ventures = collectBusinessVenturesFromDom();
      const data = { ventures };
      saveBusinessEntrepreneurship(data);
      mkSavedRemote('business', data);
      showProtoToast('Business profiles saved');
      return;
    }
    if (form.id === 'mkEducationForm') {
      const snapshot = collectEducationLearningFromForm(form);
      saveEducationLearning(snapshot);
      mkSavedRemote('education', snapshot);
      showProtoToast('Education saved');
      return;
    }
    if (form.id === 'mkHealthForm') {
      const snapshot = collectHealthWellbeingFromForm(form);
      saveHealthWellbeing(snapshot);
      mkSavedRemote('health', snapshot);
      showProtoToast('Health notes saved');
      return;
    }
    if (form.id === 'mkFinancialForm') {
      const snapshot = collectFinancialLifeFromForm(form);
      saveFinancialLife(snapshot);
      mkSavedRemote('financial', snapshot);
      showProtoToast('Financial notes saved');
      return;
    }
    if (form.id === 'mkLifestyleForm') {
      const snapshot = collectLifestylePreferencesFromForm(form);
      saveLifestylePreferences(snapshot);
      mkSavedRemote('lifestyle', snapshot);
      showProtoToast('Lifestyle preferences saved');
      return;
    }
    if (form.id === 'mkDatesForm') {
      const snapshot = collectImportantDatesFromDom(form);
      saveImportantDatesEvents(snapshot);
      mkSavedRemote('dates', snapshot);
      showProtoToast('Dates & events saved');
      return;
    }
    if (form.id === 'mkDocumentsForm') {
      const snapshot = collectDocumentsRecordsFromDom(form);
      saveDocumentsRecords(snapshot);
      mkSavedRemote('documents', snapshot);
      showProtoToast('Documents & records saved');
      return;
    }
    if (form.id === 'mkRoutinesForm') {
      const snapshot = collectRoutinesDailyLifeFromForm(form);
      saveRoutinesDailyLife(snapshot);
      mkSavedRemote('routines', snapshot);
      showProtoToast('Routines saved');
      return;
    }
    if (form.id === 'mkPropertyForm') {
      const snapshot = collectPropertyAssetsFromDom(form);
      savePropertyAssets(snapshot);
      mkSavedRemote('property', snapshot);
      showProtoToast('Property & assets saved');
      return;
    }
    if (form.id === 'mkTravelForm') {
      const snapshot = collectTravelPlacesFromDom(form);
      saveTravelPlaces(snapshot);
      mkSavedRemote('travel', snapshot);
      showProtoToast('Travel saved');
      return;
    }
    if (form.id === 'mkValuesForm') {
      const values = collectValuesPrinciplesFromForm(form);
      saveValuesPrinciples(values);
      const behaviorPart = collectSarahBehaviorFromForm(form, SARAH_BEHAVIOR_VALUES_KEYS);
      const identity = loadPersonalIdentity();
      const merged = {
        ...identity,
        sarahBehavior: { ...(identity.sarahBehavior || {}), ...behaviorPart },
      };
      savePersonalIdentity(merged);
      void syncPersonalProfileKnowledge(merged);
      mkSavedRemote('values', values);
      showProtoToast('Values and Sarah boundaries saved');
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
    if (!area) return;
    openMkAreaPickerModal(area);
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
    openMkSectionModal(catKey);
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
  document.getElementById('msHomeSarahTasksBtn')?.addEventListener('click', () => showWorkTasksHub());
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
      const panel = document.querySelector('.my-sarah-view')?.dataset.msPanel || 'home';
      if (mode === 'work') {
        setMsHomeCardMode('work');
        if (panel !== 'tasks') showWorkTasksHub('');
        else syncMsSegment('tasks');
        return;
      }
      setMsHomeCardMode('chat');
      if (panel === 'tasks' || panel === 'home') {
        setMySarahPanel('home');
        void renderSarahHomeIntelligence();
      } else {
        syncMsSegment(panel);
      }
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
  const msPanel = document.querySelector('.my-sarah-view')?.dataset.msPanel;
  if (msPanel === 'tasks') return;
  const threads = listPersonalThreads({ chatOnly: true }).slice(0, 8);
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
  const panel = document.querySelector('.my-sarah-view')?.dataset.msPanel;
  const threads = listPersonalThreads({
    chatOnly: panel !== 'tasks',
    workOnly: panel === 'tasks',
  });
  const rt = getSarahRuntime();
  const activeId = rt.activeThreadId || '';
  if (!threads.length) {
    host.innerHTML =
      panel === 'tasks'
        ? '<p class="ms-thread-empty" style="padding:8px 12px">No work threads yet — tap <strong>New work item</strong>.</p>'
        : '<p class="ms-thread-empty" style="padding:8px 12px">No chats yet — tap <strong>New chat</strong> or send a message from Home.</p>';
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
  ensureLiveDiscoverFresh();
  ensureLiveConnectionsFresh();
  if (discoverLiveActive()) {
    renderLiveMyOrganisations(root);
    return;
  }

  const subscribedIds = loadSub01SubscribedIds();
  const byId = (id) => discoverFind(id);
  const subscribed = subscribedIds.map((id) => byId(id)).filter(Boolean);
  const suggestedIds = (MOCK_MY_ORGANISATIONS_SUGGESTED_IDS || []).filter((id) => !subscribedIds.includes(id));
  const suggested = suggestedIds.map((id) => byId(id)).filter(Boolean);

  const orgStatusLine = (companyId) => {
    if (discoverFind(companyId)?.live) return isOrgSubscribedSub01(companyId) ? 'Subscribed on Sarah Network' : '';
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
      if (discoverFind(id)?.live) {
        void handleLiveUnsubscribe(id).then(() => renderMyOrganisationsPanel());
        return;
      }
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
        const q = (e.target.value || '').trim();
        discoverSearchQuery = q;
        pendingDiscoverSearchFromOrg = q;
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

const SARAH_TIER_SKU = {
  free: 'rs02.sarah.free.zar.monthly',
  plus: 'rs02.sarah.plus.zar.monthly',
  premium: 'rs02.sarah.premium.zar.monthly',
  ultimate: 'rs02.sarah.ultimate.zar.monthly',
};

const SARAH_DEFAULT_TOPUP_SKU = 'rs06.credits.consumer.500.zar';

async function maybeCompleteCheckoutReturn() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkoutCancelled') === '1') {
      params.delete('checkoutCancelled');
      const qs0 = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${qs0 ? `?${qs0}` : ''}${window.location.hash || ''}`
      );
      showProtoToast('Checkout cancelled.');
      return;
    }
    const ref = params.get('checkoutRef') || params.get('reference');
    if (!ref || !window.SarahLive?.verifyConsumerCheckout) return;
    if (!personalSarahLiveActive()) return;
    const res = await window.SarahLive.verifyConsumerCheckout(ref);
    params.delete('checkoutRef');
    params.delete('reference');
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', next);
    if (res.error) {
      showProtoToast(res.error);
      return;
    }
    const creditTopUp = res.checkoutKind === 'rs06_credit_pack';
    if (creditTopUp) {
      const bal = res.topUpBalanceCredits != null ? formatSarahCredits(res.topUpBalanceCredits) : '';
      showProtoToast(
        res.duplicate
          ? 'Top-up already applied.'
          : `Payment confirmed. +${res.creditsAdded || 500} credits${bal ? ` · balance ${bal}` : ''}.`
      );
      void refreshSarahPlanUsageUi(['billing', 'profile', 'account']);
    } else {
      showProtoToast(res.duplicate ? 'Plan already active.' : 'Payment confirmed. Plan updated.');
    }
    await refreshWorkQuotaState();
    renderWorkQuotaBanner();
    setMySarahPanel('billing');
  } catch {
    /* non-fatal */
  }
}

const HOME_CARD_GRID_SIZE = 4;

function homeCardLaunchMessage(card) {
  const prompt = String(card?.prompt || '').trim();
  if (prompt) return prompt;
  const title = String(card?.title || 'this').trim();
  const lines = Array.isArray(card?.lines)
    ? card.lines.join(' ')
    : Array.isArray(card?.statements)
      ? card.statements.join(' ')
      : '';
  return `I'd like help with "${title}".${lines ? ` ${lines}` : ''} Please guide me step by step.`;
}

function parseHomeCardPayload(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

function selectHomeCardsForGrid(primary, extra, prefs, mode) {
  const dismissed = new Set((prefs?.dismissed || []).map(String));
  const pool = [...(primary || []), ...(extra || []), ...MOCK_MY_SARAH_QUICK, ...MOCK_MY_SARAH_QUICK_EXTRA];
  const seen = new Set();
  const out = [];
  for (const c of pool) {
    if (!c?.id || dismissed.has(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
    if (out.length >= HOME_CARD_GRID_SIZE) break;
  }
  if (!out.length && mode === 'work') {
    return pool.slice(0, HOME_CARD_GRID_SIZE);
  }
  return out;
}

async function activateSarahHomeCard(card) {
  const action = card?.action;
  if (bindSarahHomeCardAction(card)) return;

  const work = msHomeCardMode() === 'work';
  const message = homeCardLaunchMessage(card);

  if (action?.type === 'mode' && action.mode === 'work') {
    setMsHomeCardMode('work');
    syncMsSegment('home');
    void renderSarahHomeIntelligence();
  }

  if (action?.type === 'route' && action.route === 'news') {
    setRoute('news');
    return;
  }
  if (action?.type === 'news_story' && action.storyId) {
    try {
      sessionStorage.setItem('sarah.news.openStory', String(action.storyId));
    } catch {
      /* ignore */
    }
    setRoute('news');
    return;
  }

  if (action?.type === 'thread' && action.sessionId) {
    const sid = action.sessionId;
    await openPersonalSarahThread(sid);
    if (message) {
      await deliverPersonalSarahMessage(message, { threadId: sid, work });
    }
    return;
  }

  const input = document.getElementById('personalChatInput');
  if (input) input.value = '';
  await deliverPersonalSarahMessage(message, { fromHomeCompose: true, work });
}

function bindSarahHomeCardAction(card) {
  const action = card?.action;
  if (!action) return false;
  if (action.type === 'panel' && action.panel) {
    setMySarahPanel(action.panel);
    return true;
  }
  if (action.type === 'route' && action.route === 'discover') {
    setRoute('discover');
    return true;
  }
  if (action.type === 'route' && action.route === 'profile') {
    setRoute('profile');
    return true;
  }
  if (action.type === 'route' && action.route === 'news') {
    setRoute('news');
    return true;
  }
  if (action.type === 'news_story' && action.storyId) {
    try {
      sessionStorage.setItem('sarah.news.openStory', String(action.storyId));
    } catch {
      /* ignore */
    }
    setRoute('news');
    return true;
  }
  if (action.type === 'thread' && action.sessionId) {
    openPersonalSarahThread(action.sessionId);
    return true;
  }
  if (action.type === 'mode' && action.mode === 'work') {
    setMsHomeCardMode('work');
    syncMsSegment('home');
    void renderSarahHomeIntelligence();
    return true;
  }
  if (action.type === 'entity' && action.snId) {
    location.hash = `discover-company/${encodeURIComponent(action.snId)}`;
    return true;
  }
  return false;
}

function readLocalSarahHomePrefs() {
  if (window.SarahLive?.readSarahHomePrefs) return window.SarahLive.readSarahHomePrefs();
  try {
    return JSON.parse(sessionStorage.getItem('sarah.home.prefs') || '{}');
  } catch {
    return { dismissed: [], pinned: [], staticHome: false };
  }
}

function writeLocalSarahHomePrefs(prefs) {
  if (window.SarahLive?.saveSarahHomePrefsLocal) window.SarahLive.saveSarahHomePrefsLocal(prefs);
  else sessionStorage.setItem('sarah.home.prefs', JSON.stringify(prefs));
}

function dismissSarahHomeCard(cardId) {
  if (!cardId) return;
  const prefs = readLocalSarahHomePrefs();
  const dismissed = new Set([...(prefs.dismissed || []), cardId]);
  writeLocalSarahHomePrefs({ ...prefs, dismissed: [...dismissed] });
  void renderSarahHomeIntelligence();
}

const SARAH_HOME_CARDS_CACHE_KEY = 'sarah.home.cardsCache.v1';

function readSarahHomeCardsCache(mode) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SARAH_HOME_CARDS_CACHE_KEY) || '{}');
    return raw[mode === 'work' ? 'work' : 'chat'] || null;
  } catch {
    return null;
  }
}

function writeSarahHomeCardsCache(mode, payload) {
  try {
    const key = mode === 'work' ? 'work' : 'chat';
    const raw = JSON.parse(sessionStorage.getItem(SARAH_HOME_CARDS_CACHE_KEY) || '{}');
    raw[key] = {
      cards: payload.cards || [],
      moreCards: payload.moreCards || [],
      greeting: payload.greeting || null,
      cachedAt: Date.now(),
    };
    sessionStorage.setItem(SARAH_HOME_CARDS_CACHE_KEY, JSON.stringify(raw));
  } catch {
    /* ignore */
  }
}

function paintSarahHomeQuickGrid(quickHost, cards, { showDismiss = true } = {}) {
  if (!quickHost) return;
  quickHost.innerHTML = (cards || [])
    .slice(0, HOME_CARD_GRID_SIZE)
    .map((q) => renderHomeCardMarkup(q, { showDismiss }))
    .join('');
  bindHomeCardClicks(quickHost);
}

function normalizeHomeCardDisplayLines(lines) {
  const raw = Array.isArray(lines) ? lines : [];
  const trimmed = raw
    .map((line) => {
      const t = String(line || '').replace(/\s+/g, ' ').trim();
      if (!t) return '';
      if (t.length <= 54) return t;
      const slice = t.slice(0, 54);
      const cutAt = slice.lastIndexOf(' ');
      return `${cutAt > 26 ? slice.slice(0, cutAt) : slice}…`;
    })
    .filter(Boolean)
    .slice(0, 2);
  return trimmed.length ? trimmed : ['Tap to open'];
}

function renderHomeCardMarkup(q, { showDismiss = false } = {}) {
  const statements = normalizeHomeCardDisplayLines(
    Array.isArray(q.lines) ? q.lines : Array.isArray(q.statements) ? q.statements : q.subtitle ? [q.subtitle] : []
  );
  const statementLines = statements.map((line) => `<li class="ms-quick-sub">${escapeHtml(line)}</li>`).join('');
  const reason = q.reason ? `<p class="ms-quick-reason">${escapeHtml(q.reason)}</p>` : '';
  const prompt = q.prompt || '';
  const dismiss =
    showDismiss && q.id
      ? `<button type="button" class="ms-quick-dismiss" data-dismiss-card="${escapeHtml(q.id)}" aria-label="Dismiss suggestion">×</button>`
      : '';
  return `
    <div class="ms-quick-card-wrap">
      ${dismiss}
      <button type="button" class="ms-quick-card" data-card-id="${escapeHtml(q.id || '')}" data-quick-prompt="${escapeHtml(prompt)}" data-card-action="${encodeURIComponent(JSON.stringify(q.action || null))}" data-card-payload="${encodeURIComponent(JSON.stringify({ id: q.id, title: q.title, prompt: q.prompt, lines: q.lines || q.statements, action: q.action || null }))}">
        <span class="ms-quick-icon">${MS_QUICK_ICONS[q.icon] || MS_QUICK_ICONS.insight}</span>
        <span class="ms-quick-title">${escapeHtml(q.title)}</span>
        ${reason}
        <ul class="ms-quick-statements">${statementLines}</ul>
      </button>
    </div>`;
}

function bindHomeCardClicks(host) {
  if (!host) return;
  host.querySelectorAll('.ms-quick-dismiss').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissSarahHomeCard(btn.getAttribute('data-dismiss-card'));
    });
  });
  host.querySelectorAll('.ms-quick-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = parseHomeCardPayload(btn.getAttribute('data-card-payload'));
      if (card) void activateSarahHomeCard(card);
    });
  });
}

async function renderSarahHomeIntelligence() {
  const quickHost = document.getElementById('msQuickGrid');
  const moreHost = document.getElementById('msHomeMore');
  const prefsHost = document.getElementById('msHomePrefs');
  const staticBox = document.getElementById('msHomeStaticPref');
  const greetingEl = document.querySelector('.ms-greeting-bubble');
  if (!quickHost) return;

  const mode = msHomeCardMode();
  const live = personalSarahLiveActive() && window.SarahLive?.fetchSarahHomeCards;

  if (prefsHost) prefsHost.classList.toggle('hidden', !live);
  const prefs = readLocalSarahHomePrefs();
  if (staticBox) staticBox.checked = Boolean(prefs.staticHome);

  const cached = live ? readSarahHomeCardsCache(mode) : null;
  let moreCards = cached?.moreCards || [];
  let cards = selectHomeCardsForGrid(
    cached?.cards?.length ? cached.cards : MOCK_MY_SARAH_QUICK,
    cached?.cards?.length ? moreCards : MOCK_MY_SARAH_QUICK_EXTRA,
    prefs,
    mode
  );

  const liveProfile = window.SarahLive?.getConsumerProfile?.();
  const greetName = consumerDisplayFirstName(liveProfile) || MOCK_USER.name;

  if (greetingEl) {
    greetingEl.textContent = sarahHomeGreetingText(greetName);
  }

  paintSarahHomeQuickGrid(quickHost, cards, { showDismiss: Boolean(live) });

  if (moreHost) {
    moreHost.classList.add('hidden');
    moreHost.innerHTML = '';
  }

  if (!live) {
    return;
  }

  const res = await window.SarahLive.fetchSarahHomeCards(mode);
  if (res.error) return;

  writeSarahHomeCardsCache(mode, res);
  moreCards = res.moreCards || [];
  cards = selectHomeCardsForGrid(res.cards || [], moreCards, prefs, mode);
  if (greetingEl) {
    greetingEl.textContent = res.greeting || sarahHomeGreetingText(greetName);
  }
  paintSarahHomeQuickGrid(quickHost, cards, { showDismiss: true });
}

if (!window.__sarahHomeStaticBound) {
  window.__sarahHomeStaticBound = true;
  document.addEventListener(
    'change',
    (e) => {
      if (e.target?.id !== 'msHomeStaticPref') return;
      const prefs = readLocalSarahHomePrefs();
      writeLocalSarahHomePrefs({ ...prefs, staticHome: Boolean(e.target.checked) });
      void renderSarahHomeIntelligence();
    },
    true
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    syncSarahTimeGreetings();
    const panel = document.querySelector('.my-sarah-view')?.dataset.msPanel;
    if (panel === 'home') void renderSarahHomeIntelligence();
  });
}

const SARAH_MONTHLY_CREDITS_BY_TIER_ID = {
  free: 250,
  plus: 2800,
  premium: 5500,
  ultimate: 11000,
};

function tierIdFromSkuId(skuId) {
  const id = String(skuId || '');
  if (id.includes('.ultimate.')) return 'ultimate';
  if (id.includes('.premium.')) return 'premium';
  if (id.includes('.plus.')) return 'plus';
  return 'free';
}

function formatSarahCredits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString('en-ZA') : String(Math.round(n * 10) / 10);
}

const SARAH_USAGE_ARCHETYPE_LABELS = {
  'CHAT-TURN': 'Chat',
  'CHAT-TOOL': 'Chat (tools)',
  'WORK-STEP': 'Sarah Work',
  'WORK-SUBMIT': 'Work submission',
  'DOC-SMALL': 'Document',
  DEMO: 'Preview',
};

function labelSarahUsageEvent(ev = {}) {
  const archetype = String(ev.archetype || '').trim().toUpperCase();
  if (archetype && SARAH_USAGE_ARCHETYPE_LABELS[archetype]) return SARAH_USAGE_ARCHETYPE_LABELS[archetype];
  const surface = String(ev.surface || '').toLowerCase();
  if (surface.includes('work')) return 'Sarah Work';
  if (surface.includes('personal') || surface.includes('chat')) return 'Chat';
  return archetype || 'AI activity';
}

function sarahUsageEventSurfaceKind(ev = {}) {
  const archetype = String(ev.archetype || '').trim().toUpperCase();
  if (archetype.startsWith('WORK')) return 'work';
  const surface = String(ev.surface || '').toLowerCase();
  if (surface.includes('work')) return 'work';
  return 'chat';
}

function filterSarahUsageEvents(rows, filter = 'all') {
  const list = Array.isArray(rows) ? rows : [];
  if (filter === 'work') return list.filter((ev) => sarahUsageEventSurfaceKind(ev) === 'work');
  if (filter === 'chat') return list.filter((ev) => sarahUsageEventSurfaceKind(ev) === 'chat');
  return list;
}

function formatSarahUsageWhen(iso) {
  if (!iso) return 'Just now';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recently';
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 60_000) return 'Just now';
  if (diffMs < 86_400_000) {
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function buildSarahPlanUsageHistoryMarkup(snap, { limit = 10, compact = false, surfaceFilter = 'all' } = {}) {
  const filtered = filterSarahUsageEvents(snap.recentUsage, surfaceFilter);
  const rows = filtered.slice(0, limit);
  if (!snap.live) {
    return compact
      ? ''
      : `<section class="sarah-plan-usage-history" aria-labelledby="sarahUsageHistoryTitle">
          <h3 class="sarah-plan-usage-history-title" id="sarahUsageHistoryTitle">Recent activity</h3>
          <p class="sarah-plan-usage-meta">Sign in to see credit usage for this billing period.</p>
        </section>`;
  }
  const filterBar = compact
    ? ''
    : `<div class="sarah-usage-surface-filter" role="tablist" aria-label="Filter activity">
        <button type="button" class="ms-link-btn sarah-usage-filter-btn${surfaceFilter === 'all' ? ' is-active' : ''}" data-sarah-usage-filter="all">All</button>
        <button type="button" class="ms-link-btn sarah-usage-filter-btn${surfaceFilter === 'chat' ? ' is-active' : ''}" data-sarah-usage-filter="chat">Chat</button>
        <button type="button" class="ms-link-btn sarah-usage-filter-btn${surfaceFilter === 'work' ? ' is-active' : ''}" data-sarah-usage-filter="work">Sarah Work</button>
      </div>`;
  if (!rows.length) {
    return `<section class="sarah-plan-usage-history" aria-labelledby="sarahUsageHistoryTitle">
      <h3 class="sarah-plan-usage-history-title" id="sarahUsageHistoryTitle">Recent activity</h3>
      ${filterBar}
      <p class="sarah-plan-usage-meta">${
        surfaceFilter === 'work'
          ? 'No Sarah Work credit usage this period yet.'
          : surfaceFilter === 'chat'
            ? 'No chat credit usage this period yet.'
            : 'No credit usage recorded this period yet. Chat with Sarah to see activity here.'
      }</p>
    </section>`;
  }
  const list = rows
    .map((ev) => {
      const label = labelSarahUsageEvent(ev);
      const credits = formatSarahCredits(ev.credits);
      const when = formatSarahUsageWhen(ev.at);
      const preview = ev.messagePreview ? String(ev.messagePreview).trim() : '';
      const openLabel = sarahUsageEventSurfaceKind(ev) === 'work' ? 'Open task' : 'Open chat';
      const sessionBtn =
        ev.sessionId && !compact
          ? `<button type="button" class="ms-link-btn sarah-usage-open-thread" data-session-id="${escapeHtml(String(ev.sessionId))}">${escapeHtml(openLabel)}</button>`
          : '';
      return `<li class="sarah-plan-usage-history-item">
        <span class="sarah-plan-usage-history-main">
          <span class="sarah-plan-usage-history-label">${escapeHtml(label)}</span>
          ${preview ? `<span class="sarah-plan-usage-history-preview">${escapeHtml(preview)}</span>` : ''}
          <span class="sarah-plan-usage-history-when">${escapeHtml(when)}</span>
        </span>
        <span class="sarah-plan-usage-history-credits">−${escapeHtml(credits)}</span>
        ${sessionBtn}
      </li>`;
    })
    .join('');
  const more =
    compact && Array.isArray(snap.recentUsage) && snap.recentUsage.length > limit
      ? `<button type="button" class="ms-link-btn" data-sarah-usage-open-billing>View all in Billing</button>`
      : '';
  return `<section class="sarah-plan-usage-history" aria-labelledby="sarahUsageHistoryTitle">
    <h3 class="sarah-plan-usage-history-title" id="sarahUsageHistoryTitle">Recent activity</h3>
    ${filterBar}
    <ul class="sarah-plan-usage-history-list">${list}</ul>
    ${more}
  </section>`;
}

async function syncSarahPlanLabels() {
  const snap = await fetchSarahPlanUsageSnapshot();
  const label = snap.tierName || 'Sarah Free';
  document.querySelectorAll('[data-sarah-plan-label], .ms-drawer-user-plan').forEach((el) => {
    el.textContent = label;
  });
  if (snap.tierId) {
    MOCK_SARAH_BILLING_TIERS.forEach((t) => {
      t.current = t.id === snap.tierId;
    });
  }
  return snap;
}

async function fetchSarahPlanUsageSnapshot() {
  let tierName = currentBillingTier().name;
  let tierId = currentBillingTier().id;
  let skuId = SARAH_TIER_SKU[tierId] || SARAH_TIER_SKU.free;

  if (personalSarahLiveActive() && window.SarahLive?.fetchMySubscription) {
    const subRes = await window.SarahLive.fetchMySubscription();
    const liveSku = subRes?.subscription?.skuId || subRes?.entitlement?.skuId;
    if (liveSku) {
      skuId = liveSku;
      tierId = tierIdFromSkuId(liveSku);
      const tier = MOCK_SARAH_BILLING_TIERS.find((t) => t.id === tierId);
      if (tier?.name) tierName = tier.name;
    }
  }

  if (personalSarahLiveActive() && window.SarahLive?.fetchPersonalQuota) {
    const res = await window.SarahLive.fetchPersonalQuota();
    if (!res.error && res.quota) {
      const q = res.quota;
      const cs = q.creditsShadow && typeof q.creditsShadow === 'object' ? q.creditsShadow : q;
      if (cs.tierSkuId) {
        skuId = cs.tierSkuId;
        tierId = tierIdFromSkuId(skuId);
        const tier = MOCK_SARAH_BILLING_TIERS.find((t) => t.id === tierId);
        if (tier?.name) tierName = tier.name;
      }
      return {
        live: true,
        tierName,
        tierId,
        meteringMode: cs.meteringMode || q.meteringMode || cs.enforcementMode || 'shadow',
        enforcementMode: cs.enforcementMode || q.enforcementMode || 'shadow',
        monthlyAllowance: Number(cs.monthlyAllowanceCredits ?? q.monthlyAllowanceCredits),
        monthlyUsed: Number(cs.monthlyUsedCredits ?? q.monthlyUsedCredits),
        monthlyRemaining: Number(cs.monthlyRemainingCredits ?? q.monthlyRemainingCredits),
        topUp: Number(cs.topUpBalanceCredits ?? q.topUpBalanceCredits ?? 0),
        usagePercent: Number(cs.usagePercent ?? q.usagePercent ?? 0),
        periodKey: String(cs.periodKey || q.periodKey || ''),
        wouldBlock: Boolean(cs.wouldBlockAtEnforce),
        renewalDate: cs.renewalDate || cs.periodEnd || q.periodEnd || null,
        recentUsage: Array.isArray(cs.recentUsage) ? cs.recentUsage : [],
        usageAlert: cs.usageAlert || q.usageAlert || null,
        creditsBlocked: Boolean(cs.creditsBlocked ?? q.creditsBlocked),
        availableCredits: Number(cs.availableCredits ?? q.availableCredits),
      };
    }
  }

  const allowance = SARAH_MONTHLY_CREDITS_BY_TIER_ID[tierId] ?? 250;
  return {
    live: false,
    tierName,
    tierId,
    meteringMode: 'prototype',
    enforcementMode: 'shadow',
    monthlyAllowance: allowance,
    monthlyUsed: 0,
    monthlyRemaining: allowance,
    topUp: 0,
    usagePercent: 0,
    periodKey: `month_${new Date().toISOString().slice(0, 7)}`,
    wouldBlock: false,
    recentUsage: [],
  };
}

function buildSarahPlanUsageMarkup(snap, { variant = 'full' } = {}) {
  const compact = variant === 'compact';
  const pct = Math.min(100, Math.max(0, Number(snap.usagePercent) || 0));
  const fillClass = pct >= 90 ? 'is-critical' : pct >= 75 ? 'is-warning' : '';
  const renewalBit =
    snap.renewalDate && snap.live
      ? ` Renews ${new Date(snap.renewalDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}.`
      : '';
  const periodLabel = snap.periodKey ? snap.periodKey.replace(/^(month_|period_)/, '').replace('_', ' → ') : 'This period';
  const modeHint =
    snap.enforcementMode === 'enforce' || snap.meteringMode === 'enforce'
      ? 'Live enforcement — Sarah pauses when monthly allowance and top-ups are used up.'
      : snap.meteringMode === 'shadow'
        ? 'Preview metering — limits are recorded but not enforced. Unused monthly credits expire each billing period.'
        : snap.live
          ? 'Live usage for this billing period.'
          : 'Sign in for live usage from your account.';
  const shadowNote = snap.wouldBlock
    ? ' At full enforcement, new AI requests would pause until you top up or renew.'
    : '';
  const alertCopy =
    snap.usageAlert === 'exhausted' || snap.creditsBlocked
      ? 'Credits exhausted — buy a top-up or wait for renewal.'
      : snap.usageAlert === 'exhausted_preview'
        ? 'Monthly allowance fully used — top up before enforce goes live.'
        : snap.usageAlert === 'approaching_95'
          ? 'You have used 95%+ of your monthly allowance.'
          : snap.usageAlert === 'approaching_80'
            ? 'You have used 80%+ of your monthly allowance.'
            : '';

  const rows = `
    <div class="sarah-plan-usage-rows">
      <div class="sarah-plan-usage-row">
        <span class="sarah-plan-usage-label">Monthly allowance</span>
        <span class="sarah-plan-usage-value">${escapeHtml(formatSarahCredits(snap.monthlyAllowance))}</span>
      </div>
      <div class="sarah-plan-usage-row">
        <span class="sarah-plan-usage-label">Used this period</span>
        <span class="sarah-plan-usage-value">${escapeHtml(formatSarahCredits(snap.monthlyUsed))}</span>
      </div>
      <div class="sarah-plan-usage-row">
        <span class="sarah-plan-usage-label">Remaining</span>
        <span class="sarah-plan-usage-value">${escapeHtml(formatSarahCredits(snap.monthlyRemaining))}</span>
      </div>
      <div class="sarah-plan-usage-row">
        <span class="sarah-plan-usage-label">Top-up balance</span>
        <span class="sarah-plan-usage-value">${escapeHtml(formatSarahCredits(snap.topUp))}</span>
      </div>
    </div>`;

  const meter = `
    <div class="sarah-plan-usage-meter" role="presentation">
      <div class="sarah-plan-usage-meter-track">
        <div class="sarah-plan-usage-meter-fill ${fillClass}" style="width:${pct}%"></div>
      </div>
    </div>
    <p class="sarah-plan-usage-meta">${escapeHtml(String(pct))}% of monthly allowance · ${escapeHtml(periodLabel)}${escapeHtml(renewalBit)}${shadowNote ? ` — ${escapeHtml(shadowNote.trim())}` : ''}</p>
    ${alertCopy ? `<p class="sarah-plan-usage-alert${snap.usageAlert === 'exhausted' || snap.creditsBlocked ? ' is-critical' : ''}">${escapeHtml(alertCopy)}</p>` : ''}`;

  const history = buildSarahPlanUsageHistoryMarkup(snap, {
    limit: compact ? 5 : 30,
    compact,
    surfaceFilter: compact ? 'all' : sarahUsageSurfaceFilter,
  });
  const actions = compact
    ? ''
    : `<div class="sarah-plan-usage-actions">
        <button type="button" class="ms-link-btn" data-sarah-usage-topup>Buy 500 top-up credits</button>
        <button type="button" class="ms-link-btn" data-sarah-usage-export>Export my usage (CSV + JSON)</button>
      </div>
      <p class="sarah-plan-usage-meta sarah-plan-usage-topup-note">Top-up credits stay on your account separately from your monthly plan allowance. Non-refundable once used (preview terms).</p>`;

  return `
    <article class="sarah-plan-usage-card${compact ? ' sarah-plan-usage-card--compact' : ''}">
      ${compact ? '' : `<span class="sarah-plan-usage-badge">${snap.enforcementMode === 'enforce' ? 'Live enforcement' : 'Metered usage'}</span>`}
      <p class="sarah-plan-usage-tier"><strong>${escapeHtml(snap.tierName || 'Sarah Free')}</strong></p>
      ${meter}
      ${rows}
      ${history}
      <p class="sarah-plan-usage-meta">${escapeHtml(modeHint)}</p>
      ${actions}
    </article>`;
}

function downloadTextFile(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function usageEventsToClientCsv(events = []) {
  const header = ['at', 'credits', 'archetype', 'surface', 'interaction', 'sessionId', 'messagePreview'];
  const esc = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${[header.join(','), ...events.map((ev) => header.map((k) => esc(ev[k])).join(','))].join('\n')}\n`;
}

async function exportMySarahUsageFiles() {
  if (!personalSarahLiveActive() || !window.SarahLive?.fetchPersonalUsageExport) {
    showProtoToast('Sign in to export usage.');
    return;
  }
  showProtoToast('Preparing your usage export…');
  const res = await window.SarahLive.fetchPersonalUsageExport();
  if (res.error) {
    showProtoToast(res.error);
    return;
  }
  const payload = res.export || {};
  const stamp = String(payload.periodKey || 'period').replace(/[^\w-]/g, '_');
  downloadTextFile(`sarah-usage-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
  downloadTextFile(`sarah-usage-${stamp}.csv`, usageEventsToClientCsv(payload.events), 'text/csv');
  showProtoToast('Downloaded JSON and CSV for this billing period.');
}

async function startSarahCreditTopUpCheckout() {
  if (!personalSarahLiveActive()) {
    showProtoToast('Sign in to buy top-up credits.');
    return;
  }
  if (!window.SarahLive?.checkoutConsumerPlan) {
    showProtoToast('Checkout is unavailable in this build.');
    return;
  }
  const cfgRes = await window.SarahLive.fetchRevenuePublicConfig?.();
  const cfg = cfgRes?.config || {};
  const sku = String(cfg.defaultCreditTopUpSkuId || SARAH_DEFAULT_TOPUP_SKU);
  if (!cfg.creditsTopUpEnabled) {
    showProtoToast('Top-up checkout is not enabled yet.');
    return;
  }
  if (!cfg.paidCheckoutAvailable) {
    showProtoToast('Payment provider is not configured for top-ups yet.');
    return;
  }
  showProtoToast('Opening secure checkout…');
  const res = await window.SarahLive.checkoutConsumerPlan(sku, {
    returnUrl: `${window.location.origin}${window.location.pathname}`,
  });
  if (res.error) {
    showProtoToast(res.error);
    return;
  }
  if (res.completed) {
    showProtoToast(`+${res.creditsAdded || 500} credits added to your balance.`);
    void refreshSarahPlanUsageUi(['billing', 'profile', 'account']);
    return;
  }
  if (res.authorizationUrl) {
    window.location.href = res.authorizationUrl;
    return;
  }
  showProtoToast('Could not start checkout.');
}

function bindSarahPlanUsageActions(host) {
  host?.querySelector('[data-sarah-usage-topup]')?.addEventListener('click', () => {
    void startSarahCreditTopUpCheckout();
  });
  host?.querySelector('[data-sarah-usage-export]')?.addEventListener('click', () => {
    void exportMySarahUsageFiles();
  });
  host?.querySelector('[data-sarah-usage-open-billing]')?.addEventListener('click', () => {
    setRoute('home');
    setMySarahPanel('billing');
    closeMsDrawer();
  });
  host?.querySelectorAll('.sarah-usage-open-thread').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sid = btn.getAttribute('data-session-id');
      if (sid) void openPersonalSarahThread(sid);
    });
  });
  host?.querySelectorAll('[data-sarah-usage-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-sarah-usage-filter') || 'all';
      if (!['all', 'chat', 'work'].includes(next)) return;
      sarahUsageSurfaceFilter = next;
      void refreshSarahPlanUsageUi(['billing']);
    });
  });
}

/**
 * @param {Array<'billing'|'profile'|'account'>} [surfaces]
 */
async function refreshSarahPlanUsageUi(surfaces) {
  const want =
    surfaces && surfaces.length
      ? new Set(surfaces)
      : new Set(['billing', 'profile', 'account'].filter((s) => {
          if (s === 'billing') return document.getElementById('msBillingUsage');
          if (s === 'profile') return document.getElementById('profileUsageSummary');
          if (s === 'account') return document.getElementById('profileAccountUsage');
          return false;
        }));

  if (!want.size) return;
  const snap = await fetchSarahPlanUsageSnapshot();
  const label = snap.tierName || 'Sarah Free';
  document.querySelectorAll('[data-sarah-plan-label], .ms-drawer-user-plan').forEach((el) => {
    el.textContent = label;
  });
  if (snap.tierId) {
    MOCK_SARAH_BILLING_TIERS.forEach((t) => {
      t.current = t.id === snap.tierId;
    });
  }

  if (want.has('billing')) {
    const el = document.getElementById('msBillingUsage');
    if (el) {
      el.innerHTML = buildSarahPlanUsageMarkup(snap, { variant: 'full' });
      bindSarahPlanUsageActions(el);
    }
  }
  if (want.has('profile')) {
    const el = document.getElementById('profileUsageSummary');
    if (el) {
      el.innerHTML = buildSarahPlanUsageMarkup(snap, { variant: 'compact' });
      bindSarahPlanUsageActions(el);
    }
  }
  if (want.has('account')) {
    const el = document.getElementById('profileAccountUsage');
    if (el) {
      el.innerHTML = buildSarahPlanUsageMarkup(snap, { variant: 'compact' });
      bindSarahPlanUsageActions(el);
    }
  }
}

async function renderMySarahBilling() {
  await refreshSarahPlanUsageUi(['billing']);
  const host = document.getElementById('msBillingTiers');
  if (!host) return;
  let checkoutEnabled = false;
  let paidCheckoutAvailable = false;
  let currentSku = SARAH_TIER_SKU.free;
  if (personalSarahLiveActive() && window.SarahLive) {
    const cfg = await window.SarahLive.fetchRevenuePublicConfig?.();
    checkoutEnabled = Boolean(cfg?.config?.checkoutEnabled);
    paidCheckoutAvailable = Boolean(cfg?.config?.paidCheckoutAvailable);
    const sub = await window.SarahLive.fetchMySubscription?.();
    if (sub?.subscription?.skuId) currentSku = sub.subscription.skuId;
  }
  host.innerHTML = MOCK_SARAH_BILLING_TIERS.map((tier) => {
    const sku = SARAH_TIER_SKU[tier.id] || SARAH_TIER_SKU.free;
    const isCurrent = currentSku === sku || (!personalSarahLiveActive() && tier.current);
    const cta =
      isCurrent
        ? 'Active'
        : checkoutEnabled && (tier.price === 0 || paidCheckoutAvailable)
          ? tier.price === 0
            ? 'Switch to Free'
            : 'Upgrade'
          : tier.price === 0
            ? 'Downgrade (mock)'
            : 'Upgrade (unavailable)';
    return `
    <article class="ms-tier-card ${isCurrent ? 'is-current' : ''}" data-tier-id="${escapeHtml(tier.id)}">
      <header class="ms-tier-head">
        <h3>${escapeHtml(tier.name)}</h3>
        ${isCurrent ? '<span class="ms-tier-badge">Current plan</span>' : ''}
      </header>
      <p class="ms-tier-price">${tier.price === 0 ? 'Free' : `R ${tier.price}<span>/mo</span>`}</p>
      <ul class="ms-tier-features">
        <li>${escapeHtml(String(SARAH_MONTHLY_CREDITS_BY_TIER_ID[tier.id] || 250))} AI credits / month (draft allowance)</li>
        <li>${escapeHtml(String(tier.dailyChats))} Personal Sarah chats / day (legacy cap)</li>
        <li>${Number(tier.workTasksPerDay) > 0 ? `${escapeHtml(String(tier.workTasksPerDay))} Sarah Work tasks / day` : 'No Sarah Work tasks (chat only)'}</li>
        <li>${escapeHtml(tier.knowledgeLabel)}</li>
        <li>${tier.premiumModels ? 'Premium models' : 'Standard models'}</li>
        <li>Discover &amp; Status access</li>
      </ul>
      <button type="button" class="ms-tier-cta" data-tier-sku="${escapeHtml(sku)}" ${isCurrent ? 'disabled' : ''}>
        ${escapeHtml(cta)}
      </button>
    </article>`;
  }).join('');
  host.querySelectorAll('.ms-tier-cta:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sku = btn.getAttribute('data-tier-sku');
      if (!sku || !personalSarahLiveActive() || !window.SarahLive?.checkoutConsumerPlan) {
        showProtoToast('Billing change (prototype).');
        return;
      }
      if (!checkoutEnabled) {
        showProtoToast('Live checkout is not enabled on this environment yet.');
        return;
      }
      const tierPrice = MOCK_SARAH_BILLING_TIERS.find((t) => SARAH_TIER_SKU[t.id] === sku)?.price ?? 0;
      if (tierPrice > 0 && !paidCheckoutAvailable) {
        showProtoToast('Paid checkout is not configured on this server yet.');
        return;
      }
      const res = await window.SarahLive.checkoutConsumerPlan(sku);
      if (res.error) {
        showProtoToast(res.error);
        return;
      }
      if (res.authorizationUrl && !res.completed) {
        window.location.href = res.authorizationUrl;
        return;
      }
      showProtoToast('Plan updated.');
      await refreshWorkQuotaState();
      renderWorkQuotaBanner();
      void renderMySarahBilling();
    });
  });
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

  void renderSarahHomeIntelligence();

  renderMySarahBilling();
  renderMsDrawerRecents();
  bindMySarahInteractions();
}

function renderThread() {
  const ctx = getActiveThreadContext();
  const isPersonal = ctx.kind === 'personal';
  const titleEl = document.getElementById('threadTitle');
  const rt = getSarahRuntime();
  const thread = rt.activeThreadId ? rt.threads[rt.activeThreadId] : null;
  const heading = isPersonal ? getPersonalThreadHeadline(thread) || 'Personal Sarah' : ctx.name;
  if (titleEl) {
    titleEl.innerHTML = `${escapeHtml(heading)}${!isPersonal && ctx.verified ? ` ${verifiedBadge}` : ''}`;
  }
  document.getElementById('btnThreadBack')?.setAttribute('aria-label', `Back from ${heading}`);
  const subtitleEl = document.getElementById('threadSubtitle');
  if (subtitleEl) {
    if (isPersonal && ctx.work && thread) {
      const ws = getThreadWorkWorkspace(thread);
      const st = WORK_ASSIGNMENT_STATUS_LABEL[ws.assignmentStatus] || 'Assignment';
      const conn =
        personalSarahLiveActive() && window.SarahLive?.getConnectionState?.() === 'connected' ? ' · Connected' : '';
      subtitleEl.textContent = `${ws.capabilityLabel || 'Sarah Work'} · ${st} · ${ws.progressPercent ?? 0}%${conn}`;
    } else if (isPersonal && personalSarahLiveActive()) {
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
    } else if (!isPersonal && ctx.api && consumerChatLiveActive()) {
      subtitleEl.textContent = `Company Sarah · ${ctx.name}`;
    } else {
      subtitleEl.textContent = 'Company Sarah · Prototype (offline)';
    }
  }
  const footnote = document.getElementById('threadFootnote');
  if (footnote) footnote.classList.toggle('hidden', isPersonal);

  const composeForm = document.getElementById('threadComposeForm');
  const composeInput = document.getElementById('threadComposeInput');
  const companyLive = !isPersonal && Boolean(ctx.api);
  composeForm?.classList.toggle('is-disabled', !isPersonal && !companyLive);
  if (composeInput) {
    composeInput.disabled = !isPersonal && !companyLive;
    composeInput.placeholder = isPersonal
      ? 'Ask Sarah anything…'
      : companyLive
        ? `Message ${ctx.name}…`
        : 'Company messaging — Wave 2';
  }

  const log = document.getElementById('threadLog');
  if (!log) return;
  let messages = ctx.messages || [];
  if (!messages.length && thread?.fetching && !isPersonal) {
    messages = [{ thinking: true }];
  }
  log.innerHTML = messages.map((m) => renderThreadMessageMarkup(m, isPersonal, ctx)).join('');
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
  log.querySelectorAll('[data-rec-discover]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sn = btn.getAttribute('data-rec-discover') || '';
      if (!sn) return;
      location.hash = `discover-company/${encodeURIComponent(sn)}`;
    });
  });
  requestAnimationFrame(() => {
    log.scrollTop = log.scrollHeight;
  });
  syncThreadWorkSubmitBar();
  syncWorkWorkspaceUi(ctx);
}

let lastActivatedRoute = '';

function activateView() {
  const { route, msPanel } = parseLocationHash();
  const reopeningChatsFromThread = route === 'chats' && lastActivatedRoute === 'chat-thread';

  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('is-active', v.dataset.view === route);
  });

  document.querySelectorAll('.bottom-nav [data-route]').forEach((btn) => {
    const navActive =
      btn.dataset.route === route ||
      (route === 'discover-company' && btn.dataset.route === 'discover');
    btn.classList.toggle('is-active', navActive);
  });

  const preAuth = route === 'welcome' || route === 'auth' || route === 'register-details';
  showNav(!preAuth && route !== 'chat-thread');

  const paintRoute = () => {
    if (route === 'register-details') renderRegisterDetails();

    if (route === 'chats') void renderChatsList({ force: reopeningChatsFromThread });
    if (route === 'home') {
      syncUserAvatars();
      renderMySarahPage();
      applyMySarahPanel(msPanel);
      updatePersonalSarahLiveUi();
      if (personalSarahLiveActive()) syncPersonalSarahSessionsFromServer({ silent: true });
    }
    if (route === 'chat-thread') {
      const { personalThreadId } = parseLocationHash();
      const rt = getSarahRuntime();
      if (personalThreadId) {
        rt.activeThreadId = personalThreadId;
        if (personalSarahLiveActive()) {
          renderThread();
          loadPersonalThreadFromServer(personalThreadId).then((ok) => {
            if (ok) renderThread();
          });
        } else {
          renderThread();
        }
      } else if (activeThreadNeedsCompanyApiLoad(rt)) {
        renderThread();
        loadCompanyThreadFromApiIfNeeded().finally(() => renderThread());
      } else if (
        personalSarahLiveActive() &&
        rt.activeThreadId &&
        rt.threads[rt.activeThreadId]?.kind === 'personal' &&
        rt.threads[rt.activeThreadId]?.api
      ) {
        renderThread();
        loadPersonalThreadFromServer(rt.activeThreadId).then(() => renderThread());
      } else if (personalSarahLiveActive() && window.SarahLive?.getSessionId?.()) {
        const sid = window.SarahLive.getSessionId();
        rt.activeThreadId = sid;
        renderThread();
        loadPersonalThreadFromServer(sid).then((ok) => {
          if (ok) renderThread();
          else renderThread();
        });
      } else {
        renderThread();
      }
    }

    if (route === 'news' && window.SarahNews?.renderNewsPanel) window.SarahNews.renderNewsPanel();
    if (route === 'discover') renderDiscover();
    if (route === 'discover-company') {
      const { companyId } = parseLocationHash();
      renderCompanyDetail(companyId);
    }
    if (route === 'profile') {
      const { profilePanel, profileKind } = parseLocationHash();
      renderProfile(profilePanel || 'public', profileKind || activeProfileKind);
    }
  };

  const paintNow = route === 'chat-thread' || route === 'welcome' || route === 'auth' || route === 'register-details';
  if (paintNow) {
    paintRoute();
  } else {
    requestAnimationFrame(paintRoute);
  }
  lastActivatedRoute = route;
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
    activeProfileSocialTab = 'photos';
    renderProfileSocialTab();
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
    wireFeedEngageButtons(host);
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
    case 'notif-prefs':
      openSnaPrefsSheet();
      break;
    case 'notifications':
      openMyNotifications();
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

function parsePersonalProfilePayloadClient(content) {
  const raw = String(content || '').trim();
  if (!raw) return { fields: {}, sarahBehavior: {} };
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const { sarahBehavior, ...fields } = j;
      return { fields, sarahBehavior: sarahBehavior && typeof sarahBehavior === 'object' ? sarahBehavior : {} };
    }
  } catch {
    /* plain text legacy */
  }
  return { fields: { narrative: raw }, sarahBehavior: {} };
}

function labelForSarahBehaviorValue(fieldKey, value) {
  const def = window.SARAH_BEHAVIOR_FIELDS?.[fieldKey];
  if (!def) return String(value || '').trim() || '—';
  const v = String(value || '').trim() || def.default || '';
  const opt = (def.options || []).find((o) => o.value === v);
  return opt?.label || v || '—';
}

function renderProfileSarahBehaviorList(behavior = {}) {
  const host = document.getElementById('profileSarahBehaviorList');
  if (!host) return;
  const fields = window.SARAH_BEHAVIOR_FIELDS || {};
  const keys = Object.keys(fields);
  if (!keys.length) {
    host.innerHTML = '<li><span>Preferences will appear when you set them in My Knowledge.</span></li>';
    return;
  }
  host.innerHTML = keys
    .map((key) => {
      const meta = fields[key];
      const label = labelForSarahBehaviorValue(key, behavior[key] ?? meta.default);
      return `<li class="profile-pref-pill">
        <span class="profile-pref-pill-label">${escapeHtml(meta.label || key)}</span>
        <span class="profile-pref-pill-value">${escapeHtml(label)}</span>
      </li>`;
    })
    .join('');
}

function excerptKnowledgeSection(section) {
  const key = section?.sectionKey || '';
  let body = String(section?.content || '').trim();
  if (!body) return '';
  if (key === 'personal_profile' || key === 'identity') {
    const { fields } = parsePersonalProfilePayloadClient(body);
    const lines = Object.entries(fields)
      .filter(([, v]) => v != null && String(v).trim())
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v).slice(0, 120)}`);
    return lines.slice(0, 3).join(' · ') || String(fields.narrative || '').slice(0, 180);
  }
  if (body.startsWith('{')) {
    try {
      const j = JSON.parse(body);
      const flat = Object.entries(j)
        .filter(([, v]) => v != null && String(v).trim())
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`);
      return flat.join(' · ');
    } catch {
      /* fall through */
    }
  }
  return body.replace(/\s+/g, ' ').slice(0, 200);
}

function mockProfileKnowledgeSections() {
  const mk = window.SARAH_PROTOTYPE?.MOCK_MY_KNOWLEDGE;
  const cats = mk?.categories || [];
  const identity = loadPersonalIdentity();
  const narrative = [identity.preferredName, identity.city, identity.narrative].filter(Boolean).join(' · ');
  return cats.map((cat) => {
    let content = '';
    if (cat.key === 'identity' && narrative) content = narrative;
    return {
      sectionKey: cat.key,
      label: cat.label,
      sarahMayUse: cat.sarahMayUse !== false,
      content: content || (cat.blurb || '').slice(0, 120),
      isPlaceholder: !content && Boolean(cat.blurb),
    };
  });
}

function renderProfileKnowledgeCards(sections) {
  const host = document.getElementById('profileKnowledgeSections');
  if (!host) return;
  const rows = (sections || []).sort((a, b) => String(a.label).localeCompare(String(b.label)));
  if (!rows.length) {
    host.innerHTML =
      '<p class="profile-knowledge-excerpt profile-knowledge-excerpt--empty">Open My Knowledge to tell Sarah about yourself.</p>';
    return;
  }
  host.innerHTML = rows
    .map((sec) => {
      const excerpt = excerptKnowledgeSection(sec);
      const empty = !excerpt || sec.isPlaceholder;
      const badge = sec.sarahMayUse
        ? '<span class="profile-knowledge-badge profile-knowledge-badge--on">Sarah may use</span>'
        : '<span class="profile-knowledge-badge profile-knowledge-badge--off">Private</span>';
      return `<article class="profile-knowledge-card">
        <header class="profile-knowledge-card-head">
          <strong>${escapeHtml(sec.label || sec.sectionKey)}</strong>
          ${badge}
        </header>
        <p class="profile-knowledge-excerpt${empty ? ' profile-knowledge-excerpt--empty' : ''}">${
          empty ? 'Not filled in yet — tap Edit to add details.' : escapeHtml(excerpt)
        }</p>
      </article>`;
    })
    .join('');
}

async function refreshProfileSarahKnowledgeUi() {
  let behavior = {};
  let sections = mockProfileKnowledgeSections();

  if (window.SarahLive?.isSignedIn?.() && window.SarahLive?.fetchPersonalKnowledgeSections) {
    const res = await window.SarahLive.fetchPersonalKnowledgeSections();
    if (!res.error && Array.isArray(res.sections)) {
      sections = res.sections.map((s) => ({
        sectionKey: s.sectionKey,
        label: s.label || s.sectionKey,
        sarahMayUse: Boolean(s.sarahMayUse),
        content: s.content || '',
      }));
      const profile = res.sections.find((s) => s.sectionKey === 'personal_profile');
      if (profile?.content) {
        behavior = parsePersonalProfilePayloadClient(profile.content).sarahBehavior;
      }
    }
  } else {
    const id = loadPersonalIdentity();
    if (id.sarahBehavior && typeof id.sarahBehavior === 'object') behavior = id.sarahBehavior;
  }

  renderProfileSarahBehaviorList(behavior);
  renderProfileKnowledgeCards(sections);
}

function renderProfilePersona(profilePanel) {
  activeProfilePanel = profilePanel === 'account' ? 'account' : 'public';
  applyProfileKindAndPanels();

  const p = MOCK_PROFILE || {};
  syncUserAvatars();
  applyStoredProfileMedia();
  const profile = window.SarahLive?.getConsumerProfile?.() || null;
  document.querySelectorAll('[data-profile-name][data-profile-kind="persona"]').forEach((el) => {
    el.textContent = profile?.displayName || profile?.firstName || MOCK_USER.name;
  });
  const contact = document.getElementById('profileContactLine');
  if (contact) {
    const bits = [
      profile?.email || MOCK_USER.email,
      [profile?.city, profile?.country].filter(Boolean).join(', ') || p.location,
    ].filter(Boolean);
    contact.textContent = bits.join(' · ');
  }
  const bio = document.getElementById('profileBio');
  if (bio) {
    const text = p.bio || profile?.locationNote || '';
    bio.textContent = text;
    bio.hidden = !text;
  }

  void refreshProfileSarahKnowledgeUi();
  void refreshSarahPlanUsageUi(['profile', 'account']);
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
  document.getElementById('profileOpenKnowledge')?.addEventListener('click', () => setMySarahPanel('knowledge'));
  document.getElementById('profileOpenBilling')?.addEventListener('click', () => {
    setRoute('home');
    setMySarahPanel('billing');
    closeMsDrawer();
  });
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

/**
 * SNET-01b + public Discover: live mode = the Sarah Network directory (public listed businesses, readable signed
 * out); sample fixtures only render when live mode is unavailable (file://, no Firebase config). Never merged.
 */
function discoverLiveActive() {
  return Boolean(window.SarahLive?.isLiveEnabled?.());
}

/* ---------- SNET-11: follow / subscribe wired to /api/network/v1/connections (keyed by snId) ---------- */

const LIVE_FOLLOWING_STATES = new Set(['following', 'subscribed', 'connect_requested', 'connected']);

/** snId → { state, grantId } for the signed-in user (empty when signed out). */
const liveConnections = { loaded: false, loading: false, bySnId: new Map() };

function liveSnIdForCompany(companyId) {
  if (!discoverLiveActive()) return null;
  return liveDiscover.byId.get(String(companyId || ''))?.snId || null;
}

/** Server relationship state for a live Discover company, or null when the company is a fixture / has no snId. */
function liveRelationState(companyId) {
  const snId = liveSnIdForCompany(companyId);
  if (!snId) return null;
  return liveConnections.bySnId.get(snId)?.state || 'none';
}

/* ---------- Gate 2: My Organisations backed by GET /api/network/v1/my-organisations ---------- */

const liveMyOrgs = { loaded: false, loading: false, error: '', organisations: [], updates: [] };

function resetLiveMyOrgs() {
  liveMyOrgs.loaded = false;
  liveMyOrgs.loading = false;
  liveMyOrgs.error = '';
  liveMyOrgs.organisations = [];
  liveMyOrgs.updates = [];
}

async function refreshLiveMyOrgs() {
  if (!discoverLiveActive() || !window.SarahLive?.isSignedIn?.() || liveMyOrgs.loading) return;
  liveMyOrgs.loading = true;
  const [res, updatesRes] = await Promise.all([
    window.SarahLive.fetchMyOrganisations(),
    // Gate 6: updates are best effort — a failure here must never hide the organisations list.
    window.SarahLive.fetchMyUpdates ? window.SarahLive.fetchMyUpdates(10) : Promise.resolve({ updates: [] }),
  ]);
  liveMyOrgs.loading = false;
  liveMyOrgs.loaded = true;
  liveMyOrgs.error = res.error || '';
  liveMyOrgs.organisations = res.error ? [] : res.organisations || [];
  liveMyOrgs.updates = res.error || updatesRes.error ? [] : updatesRes.updates || [];
  const { route, msPanel } = parseLocationHash();
  if (route === 'home' && msPanel === 'organisations') renderMyOrganisationsPanel();
}

function ensureLiveMyOrgsFresh() {
  if (liveMyOrgs.loaded || liveMyOrgs.loading) return;
  if (!discoverLiveActive() || !window.SarahLive?.isSignedIn?.()) return;
  void refreshLiveMyOrgs();
}

const LIVE_MY_ORG_SECTIONS = [
  { id: 'subscriptions', title: 'My subscriptions', empty: 'No subscriptions yet — use Subscribe on Discover.' },
  { id: 'connections', title: 'Connected', empty: '' },
  { id: 'pending', title: 'Connection requests', empty: '' },
  { id: 'following', title: 'Following', empty: 'You are not following any organisations yet.' },
  { id: 'unavailable', title: 'No longer available', empty: '' },
];

function renderLiveMyOrganisations(root) {
  const signedIn = Boolean(window.SarahLive?.isSignedIn?.());
  const fallbackImg = prototypeAsset(MOCK_PROFILE.avatarFallback || 'assets/discover/green-haven-fallback.svg');
  const header = `
    <header class="ms-organisations-hero">
      <h5 class="ms-headline">My Organisations</h5>
      <p class="ms-organisations-lead">The organisations you follow and subscribe to on Sarah Network. Subscribing shares nothing by default; you can change what each organisation may send you.</p>
    </header>`;
  if (!signedIn) {
    root.innerHTML = `${header}<section class="ms-org-section"><p class="ms-org-empty">Sign in to see your organisations.</p><button type="button" class="btn btn-secondary" id="msOrgSignIn">Sign in</button></section>`;
    root.querySelector('#msOrgSignIn')?.addEventListener('click', () => setRoute('auth'));
    return;
  }
  ensureLiveMyOrgsFresh();
  if (!liveMyOrgs.loaded) {
    root.innerHTML = `${header}<section class="ms-org-section"><p class="ms-org-empty">Loading your organisations…</p></section>`;
    return;
  }
  if (liveMyOrgs.error) {
    root.innerHTML = `${header}<section class="ms-org-section"><p class="ms-org-empty">${escapeHtml(liveMyOrgs.error)}</p><button type="button" class="btn btn-secondary" id="msOrgRetry">Retry</button></section>`;
    root.querySelector('#msOrgRetry')?.addEventListener('click', () => {
      resetLiveMyOrgs();
      renderMyOrganisationsPanel();
    });
    return;
  }

  const prefRow = (o, key, label) =>
    `<label class="ms-org-pref"><input type="checkbox" data-live-org-pref="${escapeHtml(o.snId)}" data-pref-key="${key}" ${o.prefs?.[key] ? 'checked' : ''} /> ${label}</label>`;
  const row = (o) => {
    const org = o.organisation;
    const name = org?.displayName || 'Organisation no longer available';
    const meta = [org?.industry, org?.verified ? 'Verified' : ''].filter(Boolean).join(' · ');
    const img = org?.logoUrl ? org.logoUrl : fallbackImg;
    const canView = o.available && org?.companyId;
    const actions = [];
    if (canView) actions.push(`<button type="button" class="ms-org-btn ms-org-btn--ghost" data-live-org-view="${escapeHtml(org.companyId)}">View</button>`);
    if (o.state === 'subscribed') actions.push(`<button type="button" class="ms-org-btn ms-org-btn--danger" data-live-org-unsub="${escapeHtml(o.snId)}">Unsubscribe</button>`);
    else if (o.state === 'following' || o.state === 'unavailable') actions.push(`<button type="button" class="ms-org-btn ms-org-btn--ghost" data-live-org-unfollow="${escapeHtml(o.snId)}">Unfollow</button>`);
    const prefs =
      o.available && ['subscribed', 'following', 'connected'].includes(o.state)
        ? `<details class="ms-org-manage"><summary>Manage</summary>
            <div class="ms-org-prefs">${prefRow(o, 'notifications', 'Notifications')}${prefRow(o, 'announcements', 'Announcements')}${prefRow(o, 'reminders', 'Reminders')}</div>
          </details>`
        : '';
    return `<li class="ms-org-row" data-org-sn-id="${escapeHtml(o.snId)}">
      <img class="ms-org-row-img" src="${escapeHtml(img)}" alt="" loading="lazy" onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='${escapeHtml(fallbackImg)}';}" />
      <div class="ms-org-row-body">
        <strong class="ms-org-row-name">${escapeHtml(name)}</strong>
        <span class="ms-org-row-meta">${escapeHtml(meta)}</span>
        ${prefs}
      </div>
      <div class="ms-org-row-actions">${actions.join('')}</div>
    </li>`;
  };

  const sections = LIVE_MY_ORG_SECTIONS.map((s) => {
    const rows = liveMyOrgs.organisations.filter((o) => o.section === s.id);
    if (!rows.length && !s.empty) return '';
    return `<section class="ms-org-section"><h3 class="ms-org-section-title">${escapeHtml(s.title)}</h3>
      ${rows.length ? `<ul class="ms-org-list" role="list">${rows.map(row).join('')}</ul>` : `<p class="ms-org-empty">${escapeHtml(s.empty)}</p>`}</section>`;
  }).join('');

  const updatesHtml = liveMyOrgs.updates.length
    ? `<section class="ms-org-section" id="msOrgUpdates"><h3 class="ms-org-section-title">Updates</h3>
        <ul class="ms-org-list" role="list">${liveMyOrgs.updates
          .map(
            (u) => `<li class="ms-org-row"><div class="ms-org-row-body">
              <strong class="ms-org-row-name">${escapeHtml(u.title)}</strong>
              <span class="ms-org-row-meta">${escapeHtml([u.organisation?.displayName, new Date(u.createdAt).toLocaleDateString()].filter(Boolean).join(' · '))}</span>
              ${u.body ? `<p class="ms-org-empty">${escapeHtml(u.body)}</p>` : ''}
            </div></li>`
          )
          .join('')}</ul></section>`
    : '';

  root.innerHTML = `${header}${updatesHtml}${sections}
    <footer class="ms-organisations-foot"><button type="button" class="btn btn-secondary" id="msOrgOpenDiscover">Open Discover</button></footer>`;

  root.querySelector('#msOrgOpenDiscover')?.addEventListener('click', () => setRoute('discover'));
  root.querySelectorAll('[data-live-org-view]').forEach((btn) =>
    btn.addEventListener('click', () => openDiscoverCompany(btn.getAttribute('data-live-org-view')))
  );
  const act = async (snId, fn, toast) => {
    const res = await fn();
    if (res?.error) {
      showProtoToast(res.error);
      return;
    }
    if (res?.connection) applyLiveConnection(res.connection);
    showProtoToast(toast);
    liveMyOrgs.loaded = false;
    void refreshLiveMyOrgs();
    sub01RefreshSurfaces();
  };
  root.querySelectorAll('[data-live-org-unsub]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const snId = btn.getAttribute('data-live-org-unsub');
      const prev = liveConnections.bySnId.get(snId);
      void act(snId, () => window.SarahLive.unsubscribeFromEntity(snId, prev?.grantId || null), 'Unsubscribed');
    })
  );
  root.querySelectorAll('[data-live-org-unfollow]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const snId = btn.getAttribute('data-live-org-unfollow');
      void act(snId, () => window.SarahLive.setEntityRelationship(snId, 'unfollow'), 'Unfollowed');
    })
  );
  root.querySelectorAll('[data-live-org-pref]').forEach((box) =>
    box.addEventListener('change', async () => {
      const snId = box.getAttribute('data-live-org-pref');
      const key = box.getAttribute('data-pref-key');
      const res = await window.SarahLive.updateOrganisationPreferences(snId, { [key]: box.checked });
      if (res.error) {
        box.checked = !box.checked;
        showProtoToast(res.error);
        return;
      }
      const o = liveMyOrgs.organisations.find((x) => x.snId === snId);
      if (o) o.prefs = res.prefs || o.prefs;
      showProtoToast('Preferences saved');
    })
  );
}

function applyLiveConnection(connection) {
  if (!connection?.snId) return;
  // Any relationship change makes the My Organisations view stale.
  liveMyOrgs.loaded = false;
  if (!connection.state || connection.state === 'none' || connection.state === 'discovered') {
    liveConnections.bySnId.delete(connection.snId);
  } else {
    liveConnections.bySnId.set(connection.snId, {
      state: connection.state,
      grantId: connection.consent?.grantId || null,
    });
  }
}

async function refreshLiveConnections() {
  if (!discoverLiveActive() || !window.SarahLive?.isSignedIn?.() || liveConnections.loading) return;
  liveConnections.loading = true;
  const res = await window.SarahLive.fetchConnections();
  liveConnections.loading = false;
  liveConnections.loaded = true;
  if (res.error) return;
  liveConnections.bySnId.clear();
  const myOrgsFresh = liveMyOrgs.loaded; // a bulk reload is not a relationship change
  (res.connections || []).forEach(applyLiveConnection);
  liveMyOrgs.loaded = myOrgsFresh;
  sub01RefreshSurfaces();
}

/** Load relationships once per sign-in (kicked from Discover / detail / My Organisations renders). */
function ensureLiveConnectionsFresh() {
  if (liveConnections.loaded || liveConnections.loading) return;
  if (!discoverLiveActive() || !window.SarahLive?.isSignedIn?.()) return;
  void refreshLiveConnections();
}

function resetLiveConnections() {
  resetLiveMyOrgs();
  liveConnections.loaded = false;
  liveConnections.loading = false;
  liveConnections.bySnId.clear();
}

function requireLiveSignIn(actionLabel) {
  if (window.SarahLive?.isSignedIn?.()) return true;
  showProtoToast(`Sign in to ${actionLabel}`);
  setRoute('auth');
  return false;
}

/** Follow / unfollow. Live companies call the connections API by snId; fixtures keep the local toggle. */
async function handleFollowToggle(btn, companyId) {
  const company = discoverFind(companyId);
  if (!company?.live) {
    const on = toggleCompanyFollow(companyId);
    btn.classList.toggle('is-active', on);
    btn.textContent = on ? 'Following' : 'Follow';
    return;
  }
  if (!company.snId) {
    showProtoToast('This business is not on Sarah Network yet');
    return;
  }
  if (!requireLiveSignIn('follow businesses')) return;
  const wasFollowing = isCompanyFollowed(companyId);
  const wasSubscribed = liveRelationState(companyId) === 'subscribed';
  btn.disabled = true;
  let res;
  if (wasSubscribed) {
    // Unfollowing a subscription first ends the subscription (consent is revoked), then the follow.
    const prev = liveConnections.bySnId.get(company.snId);
    res = await window.SarahLive.unsubscribeFromEntity(company.snId, prev?.grantId || null);
    if (!res.error) res = await window.SarahLive.setEntityRelationship(company.snId, 'unfollow');
  } else {
    res = await window.SarahLive.setEntityRelationship(company.snId, wasFollowing ? 'unfollow' : 'follow');
  }
  btn.disabled = false;
  if (res.error) {
    showProtoToast(res.error);
    return;
  }
  applyLiveConnection(res.connection);
  if (!res.connection?.state || res.connection.state === 'discovered') liveConnections.bySnId.delete(company.snId);
  showProtoToast(wasFollowing ? `Unfollowed ${company.name}` : `Following ${company.name}`);
  sub01RefreshSurfaces();
}

/** Live subscribe: records a standing consent grant for this entity, then subscribes. */
async function handleLiveSubscribe(companyId) {
  const company = discoverFind(companyId);
  if (!company?.snId) {
    showProtoToast('This business is not on Sarah Network yet');
    return false;
  }
  if (!requireLiveSignIn('subscribe to businesses')) return false;
  const res = await window.SarahLive.subscribeToEntity(company.snId);
  if (res.error) {
    showProtoToast(res.error);
    return false;
  }
  applyLiveConnection(res.connection);
  window.SarahLive?.recordDiscoverLead?.(company.snId)?.catch?.(() => {});
  showProtoToast(`Subscribed to ${company.name}`);
  sub01RefreshSurfaces();
  return true;
}

async function handleLiveUnsubscribe(companyId) {
  const company = discoverFind(companyId);
  if (!company?.snId) return false;
  const prev = liveConnections.bySnId.get(company.snId);
  const res = await window.SarahLive.unsubscribeFromEntity(company.snId, prev?.grantId || null);
  if (res.error) {
    showProtoToast(res.error);
    return false;
  }
  applyLiveConnection(res.connection);
  showProtoToast(`Unsubscribed from ${company.name}`);
  sub01RefreshSurfaces();
  return true;
}

/** Map a /api/discover/companies card into the shape the Discover/detail renderers expect. */
function mapLiveDiscoverCard(card) {
  const listingFallback = businessListingAvatarFallback();
  const cover = resolveListingMediaUrl(card.coverUrl || card.logoUrl) || listingFallback;
  const logo = resolveListingMediaUrl(card.logoUrl) || listingFallback;
  return {
    id: card.companyId,
    companyId: card.companyId,
    snId: card.snId || null,
    live: true,
    name: card.displayName || card.companyId,
    categoryLabel: card.industry || '',
    categories: card.categories || [],
    tags: card.tags || [],
    description: card.shortDescription || '',
    address: card.address || card.location || '',
    locationLabel: card.location || '',
    verified: Boolean(card.verified),
    image: cover,
    imageFallback: listingFallback,
    avatar: logo,
    gallery: (card.gallery || [])
      .map((g) => resolveListingMediaUrl(typeof g === 'string' ? g : g.imageUrl))
      .filter(Boolean),
    products: (card.products || []).map((p) => ({
      id: p.id || p.name,
      name: p.name,
      price: p.price || '',
      image: resolveDiscoverProductImage(p.imageUrl, card.logoUrl || card.coverUrl),
      imageFallback: 'assets/dental-products/fallback.svg',
      description: p.description || '',
      promotion: p.promotion || '',
    })),
    hours: Array.isArray(card.hours) ? card.hours.filter((h) => h && h.day && h.time) : [],
    contact:
      card.contact && typeof card.contact === 'object'
        ? {
            phone: card.contact.phone || '',
            email: card.contact.email || '',
            website: card.contact.website || '',
          }
        : null,
    rating: null,
    reviewCount: null,
    distanceKm: null,
    featured: false,
  };
}

/** Companies rendered in the Discover grid. */
function discoverCompaniesSource() {
  return discoverLiveActive() ? liveDiscover.companies : MOCK_DISCOVER_COMPANIES || [];
}

/** Lookup by id (companyId in live mode). Live mode never falls back to fixtures. */
function discoverFind(id) {
  const key = String(id || '');
  if (!key) return undefined;
  if (discoverLiveActive()) return liveDiscover.byId.get(key);
  return (MOCK_DISCOVER_COMPANIES || []).find((c) => c.id === key);
}

function mergeLiveDiscoverCompany(card) {
  if (!card?.companyId) return null;
  const mapped = mapLiveDiscoverCard(card);
  liveDiscover.byId.set(mapped.id, mapped);
  const idx = liveDiscover.companies.findIndex((c) => c.id === mapped.id);
  if (idx >= 0) liveDiscover.companies[idx] = mapped;
  else liveDiscover.companies.push(mapped);
  return mapped;
}

async function fetchLiveDiscoverCompanyDetail(companyId) {
  const id = String(companyId || '').trim();
  if (!id || !discoverLiveActive() || !window.SarahLive?.fetchDiscoverCompany) return null;
  const res = await window.SarahLive.fetchDiscoverCompany(id);
  if (res.error || !res.data?.company) return null;
  return mergeLiveDiscoverCompany(res.data.company);
}

function discoverCategoriesSource() {
  if (!discoverLiveActive()) return MOCK_DISCOVER_CATEGORIES;
  return [{ id: 'all', label: 'All' }, ...liveDiscover.facets.map((f) => ({ id: f.id, label: f.label }))];
}

function liveDiscoverFetchStale() {
  return (
    liveDiscover.query !== discoverSearchQuery ||
    liveDiscover.category !== activeDiscoverCategory ||
    (liveDiscover.place || '') !== discoverPlaceQuery
  );
}

async function refreshLiveDiscover() {
  if (!discoverLiveActive()) return;
  if (liveDiscover.loading) {
    liveDiscover.pendingRefetch = true;
    return;
  }
  liveDiscover.loading = true;
  liveDiscover.pendingRefetch = false;
  liveDiscover.error = '';
  liveDiscover.query = discoverSearchQuery;
  liveDiscover.category = activeDiscoverCategory;
  liveDiscover.place = discoverPlaceQuery;
  const placeKey = discoverPlaceQuery.toLowerCase();
  const isProvince = DISCOVER_PROVINCES.includes(placeKey);
  const res = await window.SarahLive.fetchDiscoverCompanies({
    q: discoverSearchQuery,
    category: activeDiscoverCategory,
    city: discoverPlaceQuery && !isProvince ? discoverPlaceQuery : '',
    region: isProvince ? discoverPlaceQuery : '',
  });
  liveDiscover.loading = false;
  liveDiscover.loaded = true;
  if (res.error) {
    liveDiscover.error = res.error;
    liveDiscover.companies = [];
  } else {
    const cards = (res.data?.companies || []).map(mapLiveDiscoverCard);
    liveDiscover.companies = cards;
    liveDiscover.facets = res.data?.facets || [];
    cards.forEach((c) => liveDiscover.byId.set(c.id, c));
  }
  const route = parseLocationHash().route;
  if (route === 'discover') renderDiscover();
  else if (route === 'discover-company') renderCompanyDetail(parseLocationHash().companyId);
  if (liveDiscover.pendingRefetch || liveDiscoverFetchStale()) {
    liveDiscover.pendingRefetch = false;
    void refreshLiveDiscover();
  }
}

/** Kick a live fetch when the directory has not been loaded or the query/category changed. */
function ensureLiveDiscoverFresh() {
  if (!discoverLiveActive()) return;
  if (liveDiscover.loading) {
    if (liveDiscoverFetchStale()) liveDiscover.pendingRefetch = true;
    return;
  }
  if (!liveDiscover.loaded || liveDiscoverFetchStale()) {
    void refreshLiveDiscover();
  }
}

/** One search box: optional "… in Gauteng" or a province name sets city/region for live Discover. */
function splitDiscoverSearchInput(raw) {
  const q = String(raw || '').trim();
  if (!q) return { q: '', place: '' };
  const lower = q.toLowerCase();
  if (DISCOVER_PROVINCES.includes(lower)) return { q: '', place: q };
  const inMatch = q.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch) {
    const term = inMatch[1].trim();
    const place = inMatch[2].trim();
    if (place.length >= 2) return { q: term, place };
  }
  return { q, place: '' };
}

function bindDiscoverCatsOnce() {
  const host = document.getElementById('discoverCats');
  if (!host || host.dataset.bound === '1') return;
  host.dataset.bound = '1';
  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-discover-cat]');
    if (!btn) return;
    activeDiscoverCategory = btn.dataset.discoverCat || 'all';
    renderDiscover();
  });
}

function bindFeedTabsOnce() {
  const host = document.getElementById('feedTabs');
  if (!host || host.dataset.bound === '1') return;
  host.dataset.bound = '1';
  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-feed-tab]');
    if (!btn) return;
    activeFeedTab = btn.dataset.feedTab || 'for-you';
    renderHome();
  });
}

function bindStatusFeedActionsOnce() {
  const host = document.getElementById('feedList');
  if (!host || host.dataset.statusActionsBound === '1') return;
  host.dataset.statusActionsBound = '1';
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-status-feed-retry]')) {
      resetLiveStatusFeedCache();
      ensureLiveStatusFeed();
      renderHome();
      return;
    }
    const jump = e.target.closest('[data-route-jump]');
    if (jump?.dataset?.routeJump) setRoute(jump.dataset.routeJump);
  });
}

const DISCOVER_NL_KEYWORDS = {
  dentist: ['dental', 'dentist', 'teeth', 'orthodont', 'smile'],
  dental: ['dental', 'dentist', 'teeth'],
  plumber: ['plumb', 'pipe', 'drain', 'leak', 'geyser'],
  plumbing: ['plumb', 'pipe', 'drain', 'leak'],
  restaurant: ['restaurant', 'bistro', 'dining', 'brunch', 'eatery'],
  cafe: ['cafe', 'coffee', 'espresso', 'latte'],
  coffee: ['coffee', 'cafe', 'espresso'],
  gym: ['fitness', 'hiit', 'yoga', 'strength', 'studio'],
  fitness: ['fitness', 'hiit', 'yoga', 'gym'],
  spa: ['spa', 'massage', 'wellness', 'facial'],
  vegan: ['vegan', 'plant-based', 'plant based'],
  car: ['auto', 'motor', 'vehicle', 'dealership', 'test-drive', 'test drive'],
  groceries: ['market', 'grocery', 'groceries', 'produce', 'pantry'],
};

function discoverListingHaystack(company) {
  const parts = [
    company.name,
    company.categoryLabel,
    company.description,
    company.address,
    ...(company.categories || []),
    ...(company.tags || []),
    ...((company.products || []).flatMap((p) => [p.name, p.description].filter(Boolean))),
  ];
  return parts
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function discoverSearchTerms(rawQuery) {
  const q = (rawQuery || '').trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const terms = new Set(tokens);
  tokens.forEach((tok) => {
    const related = DISCOVER_NL_KEYWORDS[tok];
    if (related) related.forEach((r) => terms.add(r));
  });
  return [...terms];
}

function discoverMatchesSearch(company, rawQuery) {
  const terms = discoverSearchTerms(rawQuery);
  if (!terms.length) return true;
  const haystack = discoverListingHaystack(company);
  const phrase = (rawQuery || '').trim().toLowerCase();
  if (phrase.length >= 2 && haystack.includes(phrase)) return true;
  return terms.some((t) => t.length >= 2 && haystack.includes(t));
}

function filterDiscoverListings(companies, categoryId, rawQuery) {
  return companies.filter((c) => {
    const catOk = categoryId === 'all' || (c.categories || []).includes(categoryId);
    if (!catOk) return false;
    return discoverMatchesSearch(c, rawQuery);
  });
}

function renderDiscover() {
  const catsHost = document.getElementById('discoverCats');
  const gridHost = document.getElementById('discoverGrid');
  if (!catsHost || !gridHost) return;

  const searchInput = document.getElementById('discoverSearchInput');
  if (searchInput) {
    if (pendingDiscoverSearchFromOrg) {
      discoverSearchRaw = pendingDiscoverSearchFromOrg;
      searchInput.value = discoverSearchRaw;
      const split = splitDiscoverSearchInput(discoverSearchRaw);
      discoverSearchQuery = split.q;
      discoverPlaceQuery = split.place;
      pendingDiscoverSearchFromOrg = '';
    } else if (document.activeElement !== searchInput && searchInput.value !== discoverSearchRaw) {
      searchInput.value = discoverSearchRaw;
    }
  }

  const live = discoverLiveActive();
  ensureLiveDiscoverFresh();
  ensureLiveConnectionsFresh();

  catsHost.innerHTML = discoverCategoriesSource().map(
    (cat) => `
    <button type="button" class="discover-cat ${cat.id === activeDiscoverCategory ? 'is-active' : ''}" data-discover-cat="${escapeHtml(cat.id)}" role="tab">
      ${escapeHtml(cat.label)}
    </button>`
  ).join('');

  // Live: server already searched/filtered. Fixtures: client-side filter.
  const list = live
    ? discoverCompaniesSource()
    : filterDiscoverListings(discoverCompaniesSource(), activeDiscoverCategory, discoverSearchQuery);

  if (live && liveDiscover.loading && !list.length) {
    gridHost.innerHTML = '<p class="feed-empty-search">Loading businesses on Sarah Network…</p>';
    return;
  }
  if (live && liveDiscover.error) {
    gridHost.innerHTML = `<p class="feed-empty-search">Couldn't load Discover: ${escapeHtml(liveDiscover.error)}</p>`;
    return;
  }

  if (!list.length) {
    const hasQuery = Boolean((discoverSearchQuery || '').trim());
    gridHost.innerHTML = hasQuery
      ? '<p class="feed-empty-search">No businesses match your search. Try another keyword or clear the field.</p>'
      : live
        ? '<p class="feed-empty-search">No businesses are published on Sarah Network yet.</p>'
        : '<p class="feed-empty-search">No businesses in this category yet.</p>';
    return;
  }

  const sampleNote = live
    ? ''
    : '<p class="discover-sample-note">Sample listings — sign in to see live Sarah Network businesses.</p>';

  gridHost.innerHTML = sampleNote + list
    .map(
      (c) => `
    <article class="discover-card" data-company-id="${escapeHtml(c.id)}"${c.snId ? ` data-sn-id="${escapeHtml(c.snId)}"` : ''}>
      <div class="discover-card-media">
        <img ${discoverImgAttrs(c.image, c)} />
        ${c.featured ? `<span class="discover-card-crown">${DISCOVER_SVG.crown}</span>` : ''}
        <button type="button" class="discover-card-fav" data-fav-toggle aria-label="Save">${DISCOVER_SVG.heart}</button>
      </div>
      <div class="discover-card-body">
        <h2 class="discover-card-title">${escapeHtml(c.name)}</h2>
        ${
          c.live
            ? `<p class="discover-card-meta">${DISCOVER_SVG.pin}<span>${escapeHtml(c.address || c.categoryLabel || 'Sarah Network')}</span></p>
        ${c.snId ? `<p class="discover-card-snid" title="Sarah Network ID">${escapeHtml(c.snId)}</p>` : ''}`
            : `<p class="discover-card-meta">
          ${DISCOVER_SVG.star}
          <span>${c.rating}(${c.reviewCount})</span>
          <span class="discover-card-meta-sep" aria-hidden="true">|</span>
          ${DISCOVER_SVG.pin}
          <span>${escapeHtml(String(c.distanceKm))} km</span>
        </p>`
        }
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
      void handleFollowToggle(btn, id);
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

async function renderCompanyDetail(companyId) {
  const root = document.getElementById('companyDetailRoot');
  if (!root) return;
  let company = discoverFind(companyId);
  if (discoverLiveActive() && companyId) {
    if (!company) {
      root.innerHTML = '<div class="company-detail-body"><p>Loading business…</p></div>';
    }
    await fetchLiveDiscoverCompanyDetail(companyId);
    if (!liveDiscover.loaded) await refreshLiveDiscover();
    company = discoverFind(companyId);
  }
  if (!company && discoverLiveActive() && !liveDiscover.loaded) {
    root.innerHTML = '<div class="company-detail-body"><p>Loading business…</p></div>';
    ensureLiveDiscoverFresh();
    return;
  }
  if (!company) {
    root.innerHTML = `<div class="company-detail-body"><p>Company not found.</p><button type="button" class="btn btn-primary" onclick="location.hash='discover'">Back</button></div>`;
    return;
  }

  const snId = company.snId || liveDiscover.byId.get(String(companyId))?.snId;
  if (discoverLiveActive() && snId && window.SarahLive?.recordDiscoverProfileView) {
    window.SarahLive.recordDiscoverProfileView(snId).catch(() => {});
  }

  const hoursHtml = (company.hours || [])
    .map(
      (h, i) => `
    <div class="company-hours-row ${i === 0 ? 'is-today' : ''}">
      <span>${escapeHtml(h.day)}</span>
      <span>${escapeHtml(h.time)}</span>
    </div>`
    )
    .join('');

  const contact = company.contact || {};
  const contactRows = [
    contact.phone ? { label: 'Phone', value: contact.phone, href: `tel:${String(contact.phone).replace(/[^\d+]/g, '')}` } : null,
    contact.email ? { label: 'Email', value: contact.email, href: `mailto:${contact.email}` } : null,
    contact.website ? { label: 'Website', value: contact.website, href: contact.website } : null,
  ].filter(Boolean);
  const contactHtml = contactRows
    .map(
      (row) => `
    <div class="company-contact-row">
      <span class="company-contact-label">${escapeHtml(row.label)}</span>
      <a class="company-contact-value" href="${escapeHtml(row.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.value)}</a>
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
          ${p.promotion ? `<span class="product-card-promo">${escapeHtml(p.promotion)}</span>` : ''}
          <img ${discoverImgAttrs(p.image || p.imageUrl, { imageFallback: p.imageFallback || 'assets/dental-products/fallback.svg' })} />
        </div>
        <div class="product-card-body">
          <h3 class="product-card-title">${escapeHtml(p.name)}</h3>
          ${p.description ? `<p class="product-card-desc">${escapeHtml(p.description)}</p>` : ''}
          <p class="product-card-price">${escapeHtml(formatDiscoverProductPrice(p.price))}</p>
          <div class="product-card-actions">
            <button type="button" class="product-like ${liked ? 'is-active' : ''}" data-product-like="${escapeHtml(p.id)}" aria-label="Like product">${DISCOVER_SVG.heart}</button>
            <button type="button" class="product-buy" data-product-buy="${escapeHtml(p.id)}">Buy</button>
          </div>
        </div>
      </article>`;
    })
    .join('');

  ensureLiveConnectionsFresh();
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
          ${company.live ? (company.snId ? `<p class="company-meta company-snid" title="Sarah Network ID">${escapeHtml(company.snId)}</p>` : '') : `<p class="company-meta">
            ${DISCOVER_SVG.star}
            <span>${company.rating}(${company.reviewCount})</span>
            <span class="discover-card-meta-sep">|</span>
            ${DISCOVER_SVG.pin}
            <span>${escapeHtml(String(company.distanceKm))} km</span>
          </p>`}
          ${company.address ? `<p class="company-address">${escapeHtml(company.address)}</p>` : company.locationLabel ? `<p class="company-address">${escapeHtml(company.locationLabel)}</p>` : ''}
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

      <section class="company-block company-section company-block--description">
        <h2>Description</h2>
        <p class="company-description-text is-clamped" id="companyDescText">${escapeHtml(company.description)}</p>
        <button type="button" class="company-desc-more" id="companyDescToggle" aria-expanded="false">View more</button>
      </section>

      ${
        gallery.length
          ? `<section class="company-block company-section company-gallery-block">
        <h2>Gallery</h2>
        <div class="company-gallery-grid company-gallery-grid--six">${galleryHtml}</div>
        <p class="company-gallery-hint">Tap a photo to view, like, or swipe through the gallery.</p>
      </section>`
          : ''
      }

      ${
        products.length
          ? `<section class="company-block company-section company-products-block">
        <h2>Products</h2>
        <p class="company-section-lead">${company.live ? 'Services and offers published from this business on Sarah Network. Ask Company Sarah to order or book.' : 'Available to order — like items or buy through Sarah (mock checkout).'}</p>
        <div class="product-grid">${productsHtml}</div>
      </section>`
          : ''
      }

      ${
        contactRows.length
          ? `<section class="company-block company-section company-contact">
        <h2>Contact</h2>
        <div class="company-contact-list">${contactHtml}</div>
      </section>`
          : ''
      }

      ${
        (company.hours || []).length
          ? `<section class="company-block company-section company-hours">
        <button type="button" class="company-hours-toggle" id="companyHoursToggle" aria-expanded="true">
          <span>Business Hours</span>
          <svg class="icon-svg icon-svg--xs" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="company-hours-list" id="companyHoursList">${hoursHtml}</div>
      </section>`
          : ''
      }
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
    void handleFollowToggle(btn, id);
  });

  const chatSarahBtn = root.querySelector('[data-chat-company]');
  if (chatSarahBtn) {
    bindAppPrimaryTap(chatSarahBtn, () => {
      openCompanySarahChat(chatSarahBtn.getAttribute('data-chat-company'), chatSarahBtn);
    });
  }

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
  const av = getEffectiveUserAvatar();
  const avSrc = prototypeAsset(av);
  document.querySelectorAll('[data-user-avatar], .feed-comment-compose-avatar').forEach((img) => {
    img.removeAttribute('data-fb');
    img.src = avSrc;
    img.alt = MOCK_USER.name;
    if (!/^data:/i.test(av)) {
      img.onerror = function onUserAvatarErr() {
        if (this.dataset.fb) return;
        this.dataset.fb = '1';
        this.src = prototypeAsset(SARAH_AVATAR_SRC);
      };
    }
  });
}

function renderHome() {
  return;
  syncSarahTimeGreetings();

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
  }

  const feedHost = document.getElementById('feedList');
  if (!feedHost) return;

  ensureLiveStatusFeed();

  const liveMode = statusFeedLiveMode();
  const display = liveMode ? [] : statusFeedMockForTab(activeFeedTab);
  const userOnTab = liveMode
    ? []
    : getUserCreatedPosts().filter((p) => userPostVisibleOnFeedTab(p, activeFeedTab));
  const liveItems = (liveStatusPosts || []).filter((p) => {
    if (activeFeedTab === 'companies') return p.authorType === 'company';
    if (activeFeedTab === 'creators') return p.authorType === 'creator' || p.authorType === 'user';
    if (activeFeedTab === 'videos') return Boolean(p.image || p.video);
    if (activeFeedTab === 'following') return p.tab === 'following';
    return true;
  });
  const q = statusFeedQuery.trim().toLowerCase();
  const merged = [...userOnTab, ...liveItems, ...display].filter((p) => feedMatchesQuery(p, q));

  if (!merged.length && q) {
    feedHost.innerHTML =
      '<p class="feed-empty-search">No posts match your search. Open search and clear the field to see everything again.</p>';
  } else if (!merged.length) {
    const session = statusFeedHasSession();
    const authBoot = window.SarahLive?.isAuthReady?.() === false;
    if (liveMode && !session) {
      feedHost.innerHTML = statusFeedEmptyMarkup(authBoot ? { loading: true } : { signedOut: true });
    } else if (liveMode && (statusFeedLive.loading || authBoot) && liveStatusPosts === null) {
      feedHost.innerHTML = statusFeedEmptyMarkup({ loading: true });
    } else if (liveMode && statusFeedLive.error) {
      feedHost.innerHTML = statusFeedEmptyMarkup({ error: statusFeedLive.error });
    } else if (liveMode) {
      feedHost.innerHTML = statusFeedEmptyMarkup();
    } else {
      feedHost.innerHTML =
        '<p class="feed-empty-search">No posts on this tab yet.</p>';
    }
  } else {
    try {
      feedHost.innerHTML = merged.map((p) => renderFeedCard(p)).join('');
      wireFeedEngageButtons(feedHost);
    } catch (err) {
      console.warn('[Status] feed render failed', err);
      feedHost.innerHTML = statusFeedEmptyMarkup({ error: 'Could not display posts. Refresh and try again.' });
    }
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

  window.SarahLive.onConnectionChange?.((state) => {
    updatePersonalSarahLiveUi();
    if (parseLocationHash().route === 'chat-thread') renderThread();
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
    setAuthStatus('');
    await routeAfterConsumerAuth(res.profile);
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
      lastName: fd.get('lastName'),
      city: fd.get('city'),
      country: fd.get('country'),
    });
    if (res.error) {
      setAuthStatus(res.error);
      return;
    }
    setAuthStatus('');
    await routeAfterConsumerAuth(res.profile);
  });

  document.getElementById('registerDetailsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.SarahLive?.patchConsumerProfile) {
      showProtoToast('Sign in with live mode to save your details.');
      return;
    }
    const status = document.getElementById('registerDetailsStatus');
    const fd = new FormData(e.target);
    const firstName = String(fd.get('firstName') || '').trim();
    const lastName = String(fd.get('lastName') || '').trim();
    const city = String(fd.get('city') || '').trim();
    const country = String(fd.get('country') || '').trim();
    const locationNote = String(fd.get('locationNote') || '').trim();
    const preferredLanguage = String(fd.get('preferredLanguage') || '').trim();
    if (!firstName || !lastName || !city || !country) {
      if (status) status.textContent = 'Please complete all required fields.';
      return;
    }
    if (status) status.textContent = 'Saving…';
    const patch = {
      firstName,
      lastName,
      preferredName: firstName,
      fullName: [firstName, lastName].join(' ').trim(),
      city,
      country,
      onboardingCompletedAt: new Date().toISOString(),
    };
    const res = await window.SarahLive.patchConsumerProfile(patch);
    if (res.error) {
      if (status) status.textContent = res.error;
      return;
    }
    const profile = res.data?.profile || window.SarahLive.getConsumerProfile();
    applyConsumerProfileToUi(profile);
    await syncConsumerProfileToPersonalKnowledge(profile, { locationNote, preferredLanguage });
    if (status) status.textContent = '';
    showProtoToast('Your details are saved.');
    setRoute('home');
    void renderSarahHomeIntelligence();
  });

  window.SarahLive.onAuthChange(async (user, profile) => {
    if (user && profile) applyConsumerProfileToUi(profile);
    if (!user) {
      clearLivePersonalSarahState();
    }
    resetLiveConnections();
    if (user) ensureLiveConnectionsFresh();
    else sub01RefreshSurfaces();
    updatePersonalSarahLiveUi();
    if (user) {
      await window.SarahLive.refreshConsumerProfile?.();
      const remotePhoto = String(window.SarahLive.getConsumerProfile?.()?.photoURL || '').trim();
      if (remotePhoto) {
        saveCachedProfilePhotoUrl(remotePhoto);
        saveStoredProfileDataUrl(PROFILE_AVATAR_STORAGE_KEY, '');
      }
      applyStoredProfileMedia();
      await pullSnaPrefsFromServer();
      await syncPersonalSarahSessionsFromServer({ force: true });
      const route = parseLocationHash().route;
      if (route === 'auth' || route === 'welcome') {
        if (!consumerRegistrationComplete(profile)) setRoute('register-details');
        else setRoute('home');
      }
      if (route === 'chats') renderChatsList();
    }
  });
}

function init() {
  window.__sarahActivate = activateView;

  document.getElementById('btnWelcomeContinue')?.addEventListener('click', () => setRoute('auth'));
  document.getElementById('authMockContinue')?.addEventListener('click', () => setRoute('home'));
  document.getElementById('btnThreadBack')?.addEventListener('click', () => {
    const ctx = getActiveThreadContext();
    const rt = getSarahRuntime();
    if (ctx.kind === 'personal' && ctx.work) {
      showWorkTasksHub('');
      return;
    }
    const fallback = ctx.kind === 'personal' ? 'home' : 'chats';
    const dest = rt.threadReturnRoute || fallback;
    if (dest === 'home') setRoute('home');
    else setRoute(dest);
  });

  document.querySelectorAll('.bottom-nav [data-route]').forEach((btn) => {
    bindAppPrimaryTap(btn, () => {
      markControlTapPending(btn);
      const target = btn.dataset.route || 'welcome';
      if (target === 'home') {
        let panel = 'home';
        try {
          panel = sessionStorage.getItem(MS_LAST_PANEL_KEY) || 'home';
        } catch {
          /* ignore */
        }
        if (panel === 'tasks') {
          showWorkTasksHub('');
          return;
        }
      }
      setRoute(target);
    });
  });

  document.getElementById('personalChatForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('personalChatInput');
    const text = input?.value.trim();
    if (!text && !personalComposePending.items.length) return;
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
    const input = document.getElementById('threadComposeInput');
    const text = input?.value.trim();
    if (!text && !threadComposePending.items.length) return;
    if (ctx.kind === 'personal') {
      await deliverPersonalSarahMessage(text, { threadId: ctx.id, work: ctx.work });
      if (input) input.value = '';
      return;
    }
    if (ctx.kind === 'company' && ctx.api && consumerChatLiveActive()) {
      const companyId = resolveLiveCompanySarahId(ctx.companyId || ctx.id);
      if (!companyId) return;
      const attachments = await uploadComposePending(threadComposePending);
      if (!text && !attachments.length) return;
      const thread = ensureActiveCompanyThreadRecord(companyId);
      thread.messages.push({ role: 'user', content: text, attachments: [...attachments] });
      pushThinkingToThread(companyId);
      if (input) input.value = '';
      clearComposePending(threadComposePending, 'threadComposePending');
      renderThread();
      setPersonalSarahComposeBusy(true);
      try {
        const res = await window.SarahLive.sendCompanyMessage(companyId, { message: text, attachments });
        removeThinkingBubble(companyId);
        if (res.error) {
          showProtoToast(res.error);
          thread.messages.push({
            role: 'assistant',
            markdown: `**Could not reach Sarah** — ${res.error}`,
          });
          renderThread();
          return;
        }
        const payload = res.data || {};
        applyCompanySarahUiHints(payload.uiHints, companyId);
        const rt = getSarahRuntime();
        if (payload.messages && rt.threads[companyId]) {
          rt.threads[companyId].messages = mapApiMessagesToThread(payload.messages);
        } else {
          await loadCompanyThreadFromApiIfNeeded();
        }
        renderThread();
      } finally {
        setPersonalSarahComposeBusy(false);
      }
      return;
    }
    const p2pKinds = new Set(['person_to_person', 'group_personal', 'group_organisation']);
    if (p2pKinds.has(ctx.kind) && ctx.api && ctx.convId && consumerChatLiveActive() && !ctx.readOnly) {
      setPersonalSarahComposeBusy(true);
      try {
        const send =
          ctx.kind === 'person_to_person'
            ? window.SarahLive.sendPersonMessage
            : window.SarahLive.sendGroupMessage;
        const res = await send(ctx.convId, text);
        if (res.error) {
          showProtoToast(res.error);
          return;
        }
        const payload = res.data || {};
        const rt = getSarahRuntime();
        if (payload.messages && rt.threads[ctx.convId]) {
          rt.threads[ctx.convId].messages = mapApiMessagesToThread(payload.messages);
        }
        if (input) input.value = '';
        renderThread();
      } finally {
        setPersonalSarahComposeBusy(false);
      }
    }
  });

  initAuthTabs();
  bindGalleryLightbox();
  bindProfileMediaUiOnce();
  bindMsComposeViewportPin();
  bindProtoSearchAndNotif();
  bindMyNotificationsUi();
  bindSnaPrefsUi();
  bindPushDeliveryChannels();
  import('./sna-reminders.mjs')
    .then((m) => m.initSarahReminders())
    .catch((err) => console.warn('[Sarah] reminders module', err));

  document.getElementById('msWorkNewReminderBtn')?.addEventListener('click', () => {
    goToMySarahWork('Remind me in 15 minutes — ');
  });

  document.getElementById('msTryReminderDemo')?.addEventListener('click', async () => {
    const dueAt = new Date(Date.now() + 60_000).toISOString();
    if (personalSarahLiveActive() && window.SarahLive?.createPersonalReminder) {
      const res = await window.SarahLive.createPersonalReminder({
        title: 'Time to leave for work',
        dueAt,
        notes: 'Server reminder — check My Notifications when due.',
      });
      if (res.error) {
        showProtoToast(res.error);
        return;
      }
      const rem = res.reminder;
      if (rem?.dueAt) {
        import('./sna-reminders.mjs')
          .then((m) => {
            m.syncServerReminderSchedule({
              id: rem.id,
              title: rem.title,
              body: rem.notes,
              dueAt: rem.dueAt,
            });
            m.scheduleReminder({
              id: rem.id || `srv-${Date.now()}`,
              title: rem.title || 'Reminder',
              body: rem.notes || 'Server reminder',
              fireAt: Date.parse(rem.dueAt) || Date.now() + 60_000,
            });
          })
          .catch(() => {});
      }
      showProtoToast('Reminder scheduled — alarm in about 1 minute.');
      return;
    }
    import('./sna-reminders.mjs')
      .then((m) => {
        m.scheduleDemoReminder(1);
        showProtoToast('Reminder set locally for 1 minute.');
      })
      .catch(() => showProtoToast('Reminders are unavailable in this browser.'));
  });

  document.getElementById('threadWorkSubmitBtn')?.addEventListener('click', async () => {
    const ctx = getActiveThreadContext();
    if (ctx.kind !== 'personal' || !ctx.work) return;
    const ok = await submitWorkTaskForThread(ctx.id);
    if (ok) {
      syncThreadWorkSubmitBar();
      renderThread();
    }
  });

  document.getElementById('threadWorkCancelBtn')?.addEventListener('click', async () => {
    const ctx = getActiveThreadContext();
    if (ctx.kind !== 'personal' || !ctx.work) return;
    const ok = await cancelWorkTaskForThread(ctx.id);
    if (ok) {
      syncThreadWorkSubmitBar();
      renderThread();
    }
  });

  if (personalSarahLiveActive() && window.SarahLive?.pollDuePersonalReminders) {
    const pollServerReminders = async () => {
      if (!window.SarahLive?.isSignedIn?.()) return;
      const res = await window.SarahLive.pollDuePersonalReminders();
      if (res.error || !(res.delivered > 0)) return;
      void refreshLiveNotifications();
      const prefs = { ...defaultSnaGlobalPrefs(), ...(loadSnaGlobalPrefs() || {}) };
      try {
        const alarm = await import('./sna-reminders.mjs');
        for (const item of res.items || []) {
          markPushStarred(item.id);
          const title = item.title || 'Reminder';
          const body = item.notes || item.body || title;
          if (prefs.reminders !== false) void tryOsPushAlert('Sarah Reminder', body || title);
          alarm.triggerServerReminderAlarm({ id: item.id, title, body });
        }
      } catch {
        showProtoToast(`${res.delivered} reminder(s) due — check My Notifications.`);
      }
      syncNotificationBadge();
      if (isMyNotificationsOpen()) renderMyNotificationsPanel();
    };
    void pollServerReminders();
    setInterval(pollServerReminders, 15000);
    if (window.SarahLive?.pollSarahNewsDelivery) {
      const pollNewsDelivery = async () => {
        if (!window.SarahLive?.isSignedIn?.()) return;
        const res = await window.SarahLive.pollSarahNewsDelivery();
        if (res.error) return;
        if ((res.briefings?.length || 0) + (res.breaking?.length || 0) > 0) {
          void refreshLiveNotifications();
          syncNotificationBadge();
          if (document.querySelector('.my-sarah-view')?.dataset.msPanel === 'home') {
            void renderSarahHomeIntelligence();
          }
        }
      };
      void pollNewsDelivery();
      setInterval(pollNewsDelivery, 60_000);
    }
    import('./personal-geofence.mjs').then((geo) => {
      geo.startPersonalGeofenceWatch(async (coords) => {
        const res = await window.SarahLive.checkPersonalReminderGeofence(coords);
        if (res.error || !res.delivered) return;
        void refreshLiveNotifications();
        const alarm = await import('./sna-reminders.mjs');
        for (const item of res.items || []) {
          alarm.triggerServerReminderAlarm({ id: item.id, title: item.title, body: item.title });
        }
      });
    });
  }

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
    if (!document.getElementById('snaPrefsSheet')?.classList.contains('hidden')) {
      saveSnaGlobalPrefs(readSnaPrefsForm());
      closeSnaPrefsSheet();
      return;
    }
    if (!document.getElementById('createPostSheet')?.classList.contains('hidden')) {
      closeCreatePostSheet();
      return;
    }
    if (!document.getElementById('feedCommentSheet')?.classList.contains('hidden')) {
      closeFeedCommentSheet();
      return;
    }
    if (document.querySelector('.my-sarah-view.is-drawer-open')) closeMsDrawer();
  });
  window.sarahNavigate = setRoute;

  syncUserAvatars();
  syncNotificationBadge();
  syncSarahTimeGreetings();
  if (!window.__sarahGreetingClock) {
    window.__sarahGreetingClock = window.setInterval(syncSarahTimeGreetings, 60_000);
  }

  if (!location.hash) location.hash = 'welcome';
  activateView();
}

function bootSarahApp() {
  try {
    bindStatusInteractionDelegates();
    if (!window.__sarahAppBooted) {
      window.__sarahAppBooted = true;
      init();
    }
    bindSarahLiveAuth();
    void maybeCompleteCheckoutReturn();
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
}, 500);
