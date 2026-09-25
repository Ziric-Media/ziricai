/** Branded model label shown in Portal/Admin (OpenAI model id stays in `agent.model`). */
export const DEFAULT_AGENT_MODEL_VERSION = '1.0';

export function formatAgentModelLabel(agent = {}) {
  const display = String(agent.modelDisplay || '').trim();
  if (display) return display;

  const version =
    String(agent.modelVersion || DEFAULT_AGENT_MODEL_VERSION).trim() || DEFAULT_AGENT_MODEL_VERSION;
  const name = String(agent.name || 'AI Employee').trim() || 'AI Employee';
  return `${name} ${version}`;
}
