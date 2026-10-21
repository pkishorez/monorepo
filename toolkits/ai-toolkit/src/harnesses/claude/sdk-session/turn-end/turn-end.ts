/**
 * Decides when one of our turns is over.
 *
 * Every user message we push into the query carries a uuid. Claude Code
 * answers each one with a `result`, either alone or folded together with
 * others: a steer sent with priority `next` joins the running turn, and that
 * turn's result lists every message it consumed in `user_message_uuids`.
 * A steer that arrives too late to fold in runs as its own SDK turn with its
 * own result. So a turn is over when no message we sent is still waiting for
 * a result:
 *
 * - `sent` adds the uuid to `pending`.
 * - a `result` removes every uuid it lists (`user_message_uuids`, else
 *   `user_message_uuid`); a result that lists none of ours removes the
 *   oldest pending one, so older CLIs still finish.
 * - a `command_lifecycle` frame saying a message was `cancelled` removes it:
 *   it will never get a result.
 *
 * After a cancel, a result that still leaves messages pending means a queued
 * steer started its own SDK turn; the caller interrupts again until none is.
 */
export interface TurnEnd {
  readonly pending: ReadonlyArray<string>;
  readonly cancelling: boolean;
}

export type TurnEndStep = 'continue' | 'end' | 'interrupt';

export interface ResultIds {
  readonly user_message_uuid?: unknown;
  readonly user_message_uuids?: unknown;
}

export const start = (uuid: string): TurnEnd => ({
  pending: [uuid],
  cancelling: false,
});

export const sent = (state: TurnEnd, uuid: string): TurnEnd => ({
  ...state,
  pending: [...state.pending, uuid],
});

export const cancel = (state: TurnEnd): TurnEnd => ({
  ...state,
  cancelling: true,
});

const listed = (result: ResultIds): ReadonlyArray<string> => {
  if (Array.isArray(result.user_message_uuids)) {
    return result.user_message_uuids.filter(
      (id): id is string => typeof id === 'string',
    );
  }
  return typeof result.user_message_uuid === 'string'
    ? [result.user_message_uuid]
    : [];
};

const step = (state: TurnEnd): TurnEndStep => {
  if (state.pending.length === 0) return 'end';
  return state.cancelling ? 'interrupt' : 'continue';
};

export const result = (
  state: TurnEnd,
  ids: ResultIds,
): readonly [TurnEnd, TurnEndStep] => {
  const ours = listed(ids).filter((id) => state.pending.includes(id));
  const pending =
    ours.length > 0
      ? state.pending.filter((id) => !ours.includes(id))
      : state.pending.slice(1);
  const next = { ...state, pending };
  return [next, step(next)];
};

export const dropped = (
  state: TurnEnd,
  uuid: string,
): readonly [TurnEnd, TurnEndStep] => {
  if (!state.pending.includes(uuid)) return [state, 'continue'];
  const next = { ...state, pending: state.pending.filter((id) => id !== uuid) };
  return [next, next.pending.length === 0 ? 'end' : 'continue'];
};
