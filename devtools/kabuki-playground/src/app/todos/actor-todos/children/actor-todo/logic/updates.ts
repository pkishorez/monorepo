import type { DataOf, InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { save } from './commands.ts';
import type { TodoShape } from './shared/index.ts';

type Data<T extends DataOf<typeof TodoShape>['state']['_tag']> = DataOf<
  typeof TodoShape,
  T
>;

export const init: InitOf<typeof TodoShape> = ({ id, title }) => ({
  state: { _tag: 'Idle' },
  model: { id, title },
});

export const updates: UpdatesOf<typeof TodoShape> = {
  Toggled: () => ({ emit: { _tag: 'Toggled' } }),
  Deleted: () => ({ emit: { _tag: 'Deleted' } }),
};

const saving = (id: string, title: string) => ({
  state: { _tag: 'Saving' as const, title },
  command: save({ id, title }),
});

export const editingStarted = () => ({ state: { _tag: 'Editing' as const } });

export const editingCancelled = () => ({ state: { _tag: 'Idle' as const } });

export const renamed = (
  { title }: { readonly title: string },
  { model }: Data<'Editing'>,
) => {
  const next = title.trim();
  return next === '' || next === model.title
    ? { state: { _tag: 'Idle' as const } }
    : saving(model.id, next);
};

export const saved = (_: unknown, { state }: Data<'Saving'>) => ({
  state: { _tag: 'Idle' as const },
  model: { title: state.title },
});

export const saveFailed = (
  { reason }: { readonly reason: string },
  { state }: Data<'Saving'>,
) => ({
  state: { _tag: 'Failed' as const, title: state.title, reason },
});

export const retried = (_: unknown, { model, state }: Data<'Failed'>) =>
  saving(model.id, state.title);
