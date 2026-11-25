import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { tabsOf } from './shared/index.ts';
import type { InspectorShape } from './shared/index.ts';

export const init: InitOf<typeof InspectorShape> = (input) => ({
  state: { _tag: 'Running' },
  model: { ...input, fakes: [] },
});

export const updates: UpdatesOf<typeof InspectorShape> = {
  Viewed: ({ tab }, data) =>
    data.model.presenting || !tabsOf(data).includes(tab)
      ? {}
      : { state: { _tag: tab } },
  Listed: ({ fakes }, { state }) =>
    fakes.length === 0 && state._tag === 'World'
      ? { model: { fakes }, state: { _tag: 'Running' } }
      : { model: { fakes } },
};
