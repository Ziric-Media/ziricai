/**
 * Login form processing state — spinner on the submit button and status line.
 * Shared by Mission Control and the Company Portal.
 */

const SPINNER = '<span class="auth-spinner" aria-hidden="true"></span>';

function escapeText(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * @param {HTMLFormElement | null} form
 * @param {HTMLElement | null} status
 */
export function createLoginBusy(form, status) {
  const button = form?.querySelector('button[type="submit"]');
  const idleLabel = button?.innerHTML || 'Sign In';
  const inputs = form ? [...form.querySelectorAll('input')] : [];

  function setStatus(message, { busy = false, error = false } = {}) {
    if (!status) return;
    status.classList.toggle('auth-status-busy', busy);
    status.classList.toggle('auth-status-error', error);
    status.innerHTML = message ? `${busy ? SPINNER : ''}<span>${escapeText(message)}</span>` : '';
  }

  return {
    /** Show spinner and lock the form. */
    start(message = 'Signing in...') {
      form?.setAttribute('aria-busy', 'true');
      inputs.forEach((input) => { input.readOnly = true; });
      if (button) {
        button.disabled = true;
        button.classList.add('is-loading');
        button.innerHTML = `${SPINNER}<span>${escapeText(message)}</span>`;
        setStatus('');
      } else {
        setStatus(message, { busy: true });
      }
    },
    /** Update the step label while still processing. */
    step(message) {
      if (button?.classList.contains('is-loading')) {
        button.innerHTML = `${SPINNER}<span>${escapeText(message)}</span>`;
      } else {
        setStatus(message, { busy: true });
      }
    },
    /** Restore the form; pass an error message to show it. */
    stop(errorMessage = '') {
      form?.removeAttribute('aria-busy');
      inputs.forEach((input) => { input.readOnly = false; });
      if (button) {
        button.disabled = false;
        button.classList.remove('is-loading');
        button.innerHTML = idleLabel;
      }
      setStatus(errorMessage, { error: Boolean(errorMessage) });
    },
  };
}
