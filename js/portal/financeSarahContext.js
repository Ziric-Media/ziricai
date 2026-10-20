/**
 * Finance Sarah — descriptive UI context for /api/sarah/chat (not authorization).
 */
import { FINANCE_WORKSPACES, FINANCE_SUB_TABS } from './financeWorkspaceNav.js';
import { OVERVIEW_PRESET_LABELS } from './financeOverviewCalculations.js';

function workspaceLabel(id) {
  return FINANCE_WORKSPACES.find((w) => w.id === id)?.label || id || 'Overview';
}

function subTabLabel(workspaceId, subTabId) {
  const tabs = FINANCE_SUB_TABS[workspaceId];
  if (!tabs?.length) return '';
  return tabs.find((t) => t.id === subTabId)?.label || subTabId || tabs[0].label;
}

/**
 * @param {{ workspace?: string, subTab?: string, overviewPeriod?: { preset?: string, customStart?: string, customEnd?: string } } | null | undefined} fin
 */
export function buildFinanceSarahPageContext(fin) {
  const workspace = fin?.workspace || 'overview';
  const subTab = fin?.subTab || '';
  const ctx = {
    page: 'finance',
    label: 'Finance',
    module: 'finance',
    financeWorkspace: workspace,
    financeWorkspaceLabel: workspaceLabel(workspace),
    financeSubTab: subTab,
    financeSubTabLabel: subTabLabel(workspace, subTab),
  };

  if (workspace === 'overview' && fin?.overviewPeriod) {
    const preset = fin.overviewPeriod.preset || '90d';
    ctx.financeOverviewPeriod = {
      preset,
      label: OVERVIEW_PRESET_LABELS[preset] || preset,
      customStart: fin.overviewPeriod.customStart || '',
      customEnd: fin.overviewPeriod.customEnd || '',
    };
  }

  return ctx;
}
