import { initAuthGuard } from './auth-guard.js';
import { registerApiErrorToast } from '../shared/apiRequest.js';

function showBootstrapError(message) {
  const status = document.getElementById('authStatus');
  if (status) status.textContent = message;
}

export async function bootstrap() {
  if (location.protocol === 'file:') {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:sans-serif;color:#fff;">Run HTTP server (npm run dev:users) — modules need http://.</p>';
    return;
  }

  registerApiErrorToast((msg) => showBootstrapError(msg));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  initAuthGuard();
}

bootstrap();
