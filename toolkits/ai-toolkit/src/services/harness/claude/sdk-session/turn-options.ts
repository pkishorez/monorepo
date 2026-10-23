import type {
  EffortLevel,
  PermissionMode,
  Query,
} from '@anthropic-ai/claude-agent-sdk';

/** What a Turn may change for itself and every Turn after it. */
export interface TurnOptions {
  readonly model: string;
  readonly effort: EffortLevel;
  readonly permissionMode: PermissionMode;
}

/** The options `wanted` changes from `current`; empty when none. */
export const changed = (
  current: TurnOptions,
  wanted: Partial<TurnOptions>,
): Partial<TurnOptions> => ({
  ...(wanted.model !== undefined && wanted.model !== current.model
    ? { model: wanted.model }
    : {}),
  ...(wanted.effort !== undefined && wanted.effort !== current.effort
    ? { effort: wanted.effort }
    : {}),
  ...(wanted.permissionMode !== undefined &&
  wanted.permissionMode !== current.permissionMode
    ? { permissionMode: wanted.permissionMode }
    : {}),
});

/**
 * Applies changes to the live query before the next message: the model
 * and permission mode through their own control requests, effort through
 * the flag settings layer, the inline form of the `effort` option.
 */
export const apply = async (
  live: Query,
  changes: Partial<TurnOptions>,
): Promise<void> => {
  if (changes.model !== undefined) await live.setModel(changes.model);
  if (changes.permissionMode !== undefined) {
    await live.setPermissionMode(changes.permissionMode);
  }
  if (changes.effort !== undefined) {
    await live.applyFlagSettings({ effortLevel: changes.effort });
  }
};
