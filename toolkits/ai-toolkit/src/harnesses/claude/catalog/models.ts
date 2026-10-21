import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk';
import type { AvailableModel } from '../../../harness/index.js';

/**
 * Claude Code's model rows as models: each by the id it resolves to, the
 * `default` row only marking which one is the default.
 */
export const toAvailableModels = (
  rows: ReadonlyArray<ModelInfo>,
): ReadonlyArray<AvailableModel> => {
  const fallback = rows.find((row) => row.value === 'default')?.resolvedModel;
  const models = new Map<string, AvailableModel>();
  for (const row of rows) {
    const id = row.resolvedModel ?? row.value;
    if (row.value === 'default' || models.has(id)) continue;
    models.set(id, {
      id,
      name: row.displayName,
      ...(id === fallback ? { isDefault: true } : {}),
    });
  }
  return [...models.values()];
};
