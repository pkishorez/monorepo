import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { nameOf } from './shared/index.js';
import type { KabukiShape, State, Summary } from './shared/index.js';

// 4. Inspect
const placed = (
  name: string | null,
  sessions: ReadonlyArray<Summary> | null,
): State => {
  if (name === null) return { _tag: 'Choice' };
  return sessions?.some((one) => one.name === name)
    ? { _tag: 'Inspection', name }
    : { _tag: 'Absence', name };
};

// 2. Pick: the one the Input names, not live until DevTools says it is.
export const init: InitOf<typeof KabukiShape> = ({ session }) => ({
  model: { sessions: null, link: 'connecting' },
  state: placed(session, null),
});

export const updates: UpdatesOf<typeof KabukiShape> = {
  Listed: ({ sessions }, { state }) => ({
    model: { sessions, link: 'live' },
    state: placed(nameOf(state), sessions),
  }),
  Dropped: (_, { model, state }) => ({
    model: { ...model, link: 'reconnecting' },
    ...(state._tag === 'Inspection'
      ? { state: { _tag: 'Absence' as const, name: state.name } }
      : {}),
  }),
  // 2. Pick
  Chosen: ({ name }, { model, state }) =>
    name === nameOf(state)
      ? {}
      : {
          state: placed(name, model.sessions),
          emit: { _tag: 'Picked', name },
        },
  // 3. Follow
  Followed: ({ name }, { model, state }) =>
    name === nameOf(state) ? {} : { state: placed(name, model.sessions) },
};
