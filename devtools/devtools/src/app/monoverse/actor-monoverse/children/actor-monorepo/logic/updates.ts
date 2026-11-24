import type { UpdatesOf } from '@kestack/kabuki/types';

import type { MonorepoShape } from './shared/index.js';

export const updates: UpdatesOf<typeof MonorepoShape> = {
  Entered: ({ path }) => ({ emit: { _tag: 'Entered', path } }),
  Opened: ({ path }) => ({ emit: { _tag: 'Opened', path } }),
  Viewed: ({ path, files, sourceRoots }) => ({
    emit: { _tag: 'Viewed', path, files, sourceRoots },
  }),
};
