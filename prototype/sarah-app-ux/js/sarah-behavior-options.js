/** Browser mirror of services/sarah/personal/sarahBehaviorOptions.js */
window.SARAH_BEHAVIOR_FIELDS = {
  responseStyle: {
    label: 'Preferred response style',
    default: 'detailed',
    options: [
      { value: 'short', label: 'Short answers' },
      { value: 'detailed', label: 'Detailed answers' },
      { value: 'formal', label: 'Formal tone' },
      { value: 'casual', label: 'Casual tone' },
      { value: 'step_by_step', label: 'Step-by-step' },
    ],
  },
  communicationTone: {
    label: 'Communication tone',
    default: 'warm_practical',
    options: [
      { value: 'warm_practical', label: 'Warm and practical' },
      { value: 'direct', label: 'Direct and to the point' },
      { value: 'gentle', label: 'Gentle and supportive' },
      { value: 'coaching', label: 'Coaching style' },
    ],
  },
  answerLength: {
    label: 'Typical answer length',
    default: 'medium',
    options: [
      { value: 'brief', label: 'Brief (1–3 sentences)' },
      { value: 'medium', label: 'Medium' },
      { value: 'long', label: 'Long when needed' },
    ],
  },
  proactivity: {
    label: 'How proactive Sarah should be',
    default: 'balanced',
    options: [
      { value: 'wait', label: 'Wait for me to ask' },
      { value: 'balanced', label: 'Balanced suggestions' },
      { value: 'proactive', label: 'Proactive suggestions' },
    ],
  },
  whenUnsure: {
    label: 'When Sarah is unsure',
    default: 'ask',
    options: [
      { value: 'ask', label: 'Ask a clarifying question' },
      { value: 'state_limits', label: 'Say what is missing' },
      { value: 'best_guess', label: 'Best guess with caveats' },
    ],
  },
  citeKnowledge: {
    label: 'Using My Knowledge in answers',
    default: 'when_relevant',
    options: [
      { value: 'when_relevant', label: 'Mention when relevant' },
      { value: 'always', label: 'Prefer My Knowledge first' },
      { value: 'minimal', label: 'Minimal references' },
    ],
  },
  howSarahShouldWeigh: {
    label: 'How Sarah should use your values',
    default: 'flag_conflicts',
    options: [
      { value: 'flag_conflicts', label: 'Flag conflicts with my values' },
      { value: 'silent', label: 'Apply quietly' },
      { value: 'ask_first', label: 'Ask before using values' },
      { value: 'never_moralise', label: 'Never moralise' },
    ],
  },
  civicTopics: {
    label: 'Political or civic topics',
    default: 'neutral_facts',
    options: [
      { value: 'avoid', label: 'Avoid unless I raise them' },
      { value: 'neutral_facts', label: 'Neutral facts only' },
      { value: 'respect_stance', label: 'Respect my stated stance' },
    ],
  },
  sensitiveTopics: {
    label: 'Sensitive topics',
    default: 'tread_lightly',
    options: [
      { value: 'avoid', label: 'Avoid unless I start' },
      { value: 'tread_lightly', label: 'Tread lightly' },
      { value: 'open', label: "I'm open to discuss" },
    ],
  },
  topicsToAvoid: {
    label: 'Topics to minimise',
    default: 'none',
    options: [
      { value: 'none', label: 'No specific limits' },
      { value: 'health_detail', label: 'Detailed health' },
      { value: 'finance_detail', label: 'Detailed finance' },
      { value: 'family_conflict', label: 'Family conflict' },
    ],
  },
};
