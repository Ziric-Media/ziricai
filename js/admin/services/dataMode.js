/**
 * Central Mission Control data mode.
 * Production authenticated Super Admin Mission Control must never consume demo-data.js fallbacks.
 */

export const DATA_MODE = {
  PRODUCTION: 'production',
  DEVELOPMENT: 'development',
};

/** @returns {'production'|'development'} */
export function getMissionControlDataMode() {
  if (typeof globalThis !== 'undefined' && globalThis.__ZIRICAI_DATA_MODE__) {
    const mode = globalThis.__ZIRICAI_DATA_MODE__;
    if (mode === DATA_MODE.PRODUCTION || mode === DATA_MODE.DEVELOPMENT) return mode;
  }
  if (typeof process !== 'undefined' && process.env?.MISSION_CONTROL_DATA_MODE) {
    const mode = process.env.MISSION_CONTROL_DATA_MODE;
    if (mode === 'production' || mode === 'development') return mode;
  }
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
      return DATA_MODE.DEVELOPMENT;
    }
    return DATA_MODE.PRODUCTION;
  }
  return DATA_MODE.DEVELOPMENT;
}

export function isProductionMissionControl() {
  return getMissionControlDataMode() === DATA_MODE.PRODUCTION;
}

/** Whether hardcoded demo datasets and localStorage demo stores may be used. */
export function isDemoDataAllowed() {
  return !isProductionMissionControl();
}

/**
 * Standard gate for list endpoints where demo replaced empty Firestore or errors.
 * Empty real data is never permission to show demo in production.
 */
export function shouldUseDemoForEmptyOrError(result) {
  if (!isDemoDataAllowed()) return false;
  return Boolean(result?.error) || !result?.items?.length;
}

/** Demo fallback only when an API request failed — not when it returned zero records. */
export function shouldUseDemoOnApiError(result) {
  if (!isDemoDataAllowed()) return false;
  return Boolean(result?.error);
}

/**
 * Resolve module-level list fallbacks: `result.items?.length ? result.items : DEMO_*`
 */
export function resolveListItems(result, demoItemsOrFn) {
  if (result?.items?.length) return result.items;
  if (!isDemoDataAllowed()) return [];
  const fallback = typeof demoItemsOrFn === 'function' ? demoItemsOrFn() : demoItemsOrFn;
  return Array.isArray(fallback) ? fallback : [];
}

export function emptyChartSeries() {
  return {
    labels: [],
    conversations: [],
    aiHandled: [],
    whatsappMessages: [],
    aiReplies: [],
    messages: [],
  };
}
