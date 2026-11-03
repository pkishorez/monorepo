import { Effect } from 'effect';
import { lab } from '../../../live-table/index.ts';
import { settings, table } from './settings.ts';

export const singleEntity = lab({
  table,
  actions: [
    {
      label: 'Switch to dark',
      run: () => settings.getAndUpdate({ theme: 'dark' }),
    },
    {
      label: 'Put sunday, light',
      run: () => settings.put({ theme: 'light', weekStartsOn: 'sunday' }),
    },
    { label: 'Reset settings', run: () => settings.reset() },
  ],
  read: {
    label: 'what settings.get() gives',
    effect: settings.get().pipe(Effect.map((entity) => [entity.value])),
  },
});
