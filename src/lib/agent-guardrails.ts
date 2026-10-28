// Ground rules every Claude Code handoff from VOLTA carries (Systems fixes, Tasks, Recos). Plain strings, no imports,
// so server prompt builders and client copy-prompt builders share the exact same text.

export const AGENT_GROUND_RULES: readonly string[] = [
  "Read first (logs, configs, the item's sources), find the cause, then make the smallest change that fixes it. Re-check afterwards and say whether it cleared.",
  'Ask Patrick before anything destructive or outward-facing: deleting or moving data, sudo, system or security settings, credentials or .env secrets, git push, sending messages, spending money, installing packages or pulling models/images.',
  'The boot SSD is nearly full: check `df -h /` before writing anything large, and keep bulky output off the boot disk.',
];

/** "Ground rules:" block: the shared rules plus any task-specific ones. */
export function groundRules(extra: readonly string[] = []): string {
  return ['Ground rules:', ...[...AGENT_GROUND_RULES, ...extra].map((r) => `- ${r}`)].join('\n');
}
