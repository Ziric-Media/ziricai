/**
 * Minimal navigation if app.js fails to load — toggles views from hash only.
 * Defines boot splash dismiss early so it cannot be blocked by deferred app.js or SarahLive.
 */
(function () {
  var BOOT_SPLASH_MIN_MS = 350;
  var BOOT_SPLASH_MAX_MS = 2800;
  var bootSplashShownAt = Date.now();
  var bootSplashDismissQueued = false;

  function actuallyDismissAppBootSplash() {
    if (window.__appBootSplashDismissed) return;
    var el = document.getElementById('appBootSplash');
    if (!el) {
      window.__appBootSplashDismissed = true;
      return;
    }
    window.__appBootSplashDismissed = true;
    try {
      el.classList.add('is-hidden', 'hidden');
      el.hidden = true;
      el.setAttribute('aria-busy', 'false');
      el.setAttribute('aria-hidden', 'true');
      el.removeAttribute('aria-live');
      el.remove();
    } catch (err) {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    }
  }

  function dismissAppBootSplash() {
    if (window.__appBootSplashDismissed || bootSplashDismissQueued) return;
    bootSplashDismissQueued = true;

    requestAnimationFrame(function () {
      var elapsed = Date.now() - bootSplashShownAt;
      var waitMs = Math.max(0, BOOT_SPLASH_MIN_MS - elapsed);
      window.setTimeout(actuallyDismissAppBootSplash, waitMs);
    });
  }
  window.dismissAppBootSplash = dismissAppBootSplash;

  function scheduleBootSplashDismiss() {
    window.addEventListener('sarah-live-ready', dismissAppBootSplash);
    window.addEventListener('sarah-live-skipped', dismissAppBootSplash);
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) dismissAppBootSplash();
    });
    window.addEventListener('load', dismissAppBootSplash);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', dismissAppBootSplash);
    } else {
      dismissAppBootSplash();
    }
    window.setTimeout(dismissAppBootSplash, BOOT_SPLASH_MAX_MS);
  }
  scheduleBootSplashDismiss();

  var VIEWS = ['welcome', 'auth', 'home', 'status', 'discover', 'discover-company', 'chats', 'chat-thread', 'profile'];

  function basicNav(raw) {
    var route = raw.split('/')[0];
    if (raw.indexOf('discover/') === 0 && raw.length > 'discover/'.length) route = 'discover-company';
    if (raw === 'knowledge' || raw.indexOf('home/') === 0 || raw.indexOf('my-sarah/') === 0) route = 'home';
    if (raw === 'my-sarah') route = 'home';
    if (raw === 'profile/account') route = 'profile';
    if (VIEWS.indexOf(route) < 0) route = 'welcome';
    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.view === route);
    });
    var hideNav = route === 'welcome' || route === 'auth';
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.classList.toggle('hidden', hideNav);
  }

  if (!window.sarahNavigate) {
    window.sarahNavigate = function (route) {
      location.hash = route;
      basicNav(route);
    };
  }

  window.addEventListener('hashchange', function () {
    var r = (location.hash || '#welcome').replace(/^#/, '') || 'welcome';
    basicNav(r);
    if (typeof window.__sarahActivate === 'function') window.__sarahActivate();
  });
})();
