/**
 * Meta WhatsApp Embedded Signup — shared browser flow (portal + marketing onboarding).
 */

let fbSdkPromise = null;

export function loadFacebookSdk(appId, graphVersion) {
  if (window.FB) return Promise.resolve(window.FB);
  if (fbSdkPromise) return fbSdkPromise;

  fbSdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = function fbAsyncInit() {
      try {
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: graphVersion || 'v26.0',
        });
        resolve(window.FB);
      } catch (err) {
        reject(err);
      }
    };

    if (document.getElementById('facebook-jssdk')) {
      const wait = setInterval(() => {
        if (window.FB) {
          clearInterval(wait);
          resolve(window.FB);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(wait);
        if (!window.FB) reject(new Error('Facebook SDK failed to load'));
      }, 15000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onerror = () => reject(new Error('Could not load Facebook SDK'));
    document.body.appendChild(script);
  });

  return fbSdkPromise;
}

function parseEmbeddedSignupMessage(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed?.type === 'WA_EMBEDDED_SIGNUP') return parsed;
    if (parsed?.event && parsed?.data) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function waitForEmbeddedSignupFinish(timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Meta signup timed out — try again'));
    }, timeoutMs);

    function onMessage(event) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
        return;
      }
      const payload = parseEmbeddedSignupMessage(event.data);
      if (!payload) return;

      const eventName = payload.event || payload.data?.event;
      if (eventName === 'CANCEL') {
        cleanup();
        reject(new Error('Meta signup cancelled'));
        return;
      }
      if (eventName === 'ERROR') {
        cleanup();
        const errMsg =
          payload.data?.error_message ||
          payload.error_message ||
          payload.data?.errorMessage ||
          'Meta signup failed';
        reject(new Error(errMsg));
        return;
      }

      const data = payload.data || payload;
      const hasAssets =
        data?.phone_number_id ||
        data?.phoneNumberId ||
        data?.waba_id ||
        data?.wabaId;

      if (eventName === 'FINISH' || (payload.type === 'WA_EMBEDDED_SIGNUP' && hasAssets)) {
        cleanup();
        resolve(data);
      }
    }

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    }

    window.addEventListener('message', onMessage);
  });
}

/**
 * Run Embedded Signup FB.login + finish handler + backend complete call.
 * @param {object} params
 * @param {{ appId: string, configId: string, graphVersion?: string }} params.config
 * @param {string} params.companyId
 * @param {(companyId: string, payload: object) => Promise<{ error?: string, data?: object }>} params.completeSignup
 * @param {(message: string) => void} [params.onStatus]
 */
export async function runMetaEmbeddedSignupConnect({ config, companyId, completeSignup, onStatus }) {
  const setStatus = (msg) => onStatus?.(msg);
  setStatus('Loading Meta…');
  await loadFacebookSdk(config.appId, config.graphVersion);
  setStatus('Complete the steps in the Meta window…');

  let authCode = null;
  const finishPromise = waitForEmbeddedSignupFinish();

  window.FB.login(
    (response) => {
      if (response?.authResponse?.code) {
        authCode = response.authResponse.code;
      }
    },
    {
      config_id: config.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: '',
        sessionInfoVersion: '3',
      },
    }
  );

  const signupData = await finishPromise;
  if (!authCode) {
    for (let i = 0; i < 30 && !authCode; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const phoneNumberId =
    signupData?.phone_number_id ||
    signupData?.phoneNumberId ||
    signupData?.data?.phone_number_id ||
    signupData?.data?.phoneNumberId ||
    null;
  if (!phoneNumberId) {
    throw new Error(
      'Meta did not return a phone number ID. Finish all Meta steps, then try Connect WhatsApp once more.'
    );
  }
  setStatus('Saving your connection…');

  const completeRes = await completeSignup(companyId, {
    ...signupData,
    phone_number_id: phoneNumberId,
    waba_id: signupData?.waba_id || signupData?.wabaId || signupData?.data?.waba_id || null,
    code: authCode,
  });
  if (completeRes?.error) {
    throw new Error(completeRes.error);
  }
  return completeRes?.data || completeRes || {};
}
