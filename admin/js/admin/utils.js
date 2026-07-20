/** Shared utilities for admin modules. */

export function withTimeout(promise, ms = 4000) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve({ timedOut: true, items: [], error: 'Request timed out' }), ms);
    }),
  ]);
}

export function formatRelativeTime(value) {
  if (!value) return '—';
  const date = value?.toDate ? value.toDate() : new Date(value);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}
