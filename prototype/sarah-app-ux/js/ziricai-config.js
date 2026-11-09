/**
 * Live API + Firebase for prototype My Sarah.
 * Override apiBase / firebase before this script loads if needed.
 */
(function () {
  var host = typeof location !== 'undefined' ? location.hostname : '';
  function isSarahAppHost(h) {
    if (!h) return false;
    if (h === 'sarah.ziricai.com') return true;
    if (h === 'ziricai-sarah.netlify.app') return true;
    if (h.endsWith('--ziricai-sarah.netlify.app')) return true;
    return false;
  }
  function isDevHost(h) {
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    // Phone/tablet on same Wi‑Fi — prototype opened via PC LAN IP (not localhost).
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    return false;
  }
  var isLocal = isDevHost(host);
  var isSarahHost = isSarahAppHost(host);
  var devApiBase = isLocal ? 'http://' + (host === '127.0.0.1' ? 'localhost' : host) + ':3000' : '';
  var prodApiBase = isSarahHost ? '' : 'https://ziricai-production.up.railway.app';
  var existing = window.__ZIRICAI_CONFIG__ || {};

  window.__ZIRICAI_CONFIG__ = Object.assign(
    {
      /** Set false to force mock-only Personal Sarah */
      prototypeLive: true,
      /** Local API on same host as prototype; Sarah App uses same-origin /api proxy */
      apiBase: isLocal ? devApiBase : prodApiBase,
      sites: {
        api: isLocal ? devApiBase : prodApiBase || 'https://ziricai-production.up.railway.app',
      },
      firebase: {
        apiKey: 'AIzaSyDABe2SMR6x81KI7h_N44biSwLVxzx9yH8',
        authDomain: 'ziricai.firebaseapp.com',
        projectId: 'ziricai',
        storageBucket: 'ziricai.firebasestorage.app',
        messagingSenderId: '482382497730',
        appId: '1:482382497730:web:6bc2f8668a1598fa13f85b',
        measurementId: 'G-92ZVT0731S',
        databaseId: 'default',
      },
    },
    existing
  );
})();
