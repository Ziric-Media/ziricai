/**
 * Lightweight UI context sent with Sarah chat requests.
 */
import { state } from './dataStore.js';
import { MODULE_LABELS } from './appShell.js';

/**
 * @returns {{ page: string, label: string }|null}
 */
export function getSarahPageContext() {
    const page = state.currentPage || 'dashboard';
    if (!page) return null;
    return {
        page,
        label: MODULE_LABELS[page] || page,
    };
}
