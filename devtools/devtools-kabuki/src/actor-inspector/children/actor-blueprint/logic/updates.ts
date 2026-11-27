import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import type { BlueprintShape } from './shared/index.ts';

export const init: InitOf<typeof BlueprintShape> = () => ({
  model: { root: null, opened: [], problem: null },
});

export const updates: UpdatesOf<typeof BlueprintShape> = {
  Printed: ({ root }) => ({ model: { root, problem: null } }),
  Failed: ({ problem }) => ({ model: { problem } }),
  Opened: ({ id, open }, { model }) => {
    const rest = model.opened.filter((one) => one !== id);
    return { model: { opened: open ? [...rest, id] : rest } };
  },
};
