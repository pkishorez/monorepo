import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { nameOf } from './shared/index.js';
import type { KabukiShape, State, Summary } from './shared/index.js';

const placed = (
  name: string | null,
  sessions: ReadonlyArray<Summary> | null,
): State => {
  if (name === null) return { _tag: 'Choice' };
  return sessions?.some((one) => one.name === name)
    ? { _tag: 'Inspection', name }
    : { _tag: 'Absence', name };
};

export const init: InitOf<typeof KabukiShape> = ({ session }) => ({
  model: { sessions: null, link: 'connecting', tab: 'inspector' },
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
  Chosen: ({ name }, { model, state }) =>
    name === nameOf(state)
      ? {}
      : {
          state: placed(name, model.sessions),
          emit: { _tag: 'Picked', name },
        },
  Followed: ({ name }, { model, state }) =>
    name === nameOf(state) ? {} : { state: placed(name, model.sessions) },
  Tabbed: ({ tab }) => ({ model: { tab } }),
};
