import { renderModulePlaceholder } from './modules/placeholders.js';
import { renderMySarah } from './modules/mySarah.js';
import { renderProfile } from './modules/profile.js';
import { renderChats } from './modules/chats.js';
import { renderDiscover } from './modules/discover.js';

const routes = {
  chats: { title: 'Chats', module: 'chats' },
  'my-sarah': { title: 'My Sarah', module: 'mySarah' },
  status: { title: 'Status', hint: 'Company timelines arrive in U7.' },
  discover: { title: 'Discover', module: 'discover' },
  profile: { title: 'Profile', module: 'profile' },
};

let current = 'chats';

export function getCurrentRoute() {
  return current;
}

export function navigateTo(route) {
  if (!routes[route]) route = 'chats';
  current = route;
  if (location.hash !== `#${route}`) {
    location.hash = route;
  }
  document.querySelectorAll('.sarah-bottom-nav [data-route]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.route === route);
  });
  const host = document.getElementById('viewHost');
  if (!host) return;
  const meta = routes[route];
  if (meta.module === 'mySarah') {
    renderMySarah(host);
    return;
  }
  if (meta.module === 'profile') {
    renderProfile(host);
    return;
  }
  if (meta.module === 'chats') {
    if (!host.dataset.keepChatThread) {
      host.dataset.activeCompany = '';
      host.dataset.activeCompanyName = '';
      host.dataset.activeThreadKind = '';
      host.dataset.activeConvId = '';
      host.dataset.activeThreadTitle = '';
    }
    host.dataset.keepChatThread = '';
    renderChats(host);
    return;
  }
  if (meta.module === 'discover') {
    renderDiscover(host);
    return;
  }
  renderModulePlaceholder(host, meta);
}

export function initRouter() {
  const fromHash = location.hash.replace(/^#/, '');
  navigateTo(routes[fromHash] ? fromHash : 'chats');
  window.addEventListener('hashchange', () => {
    const r = location.hash.replace(/^#/, '') || 'chats';
    navigateTo(routes[r] ? r : 'chats');
  });
  document.querySelectorAll('.sarah-bottom-nav [data-route]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.route));
  });
}
