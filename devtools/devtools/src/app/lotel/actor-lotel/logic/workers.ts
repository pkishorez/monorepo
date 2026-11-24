import { Effect, Option } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { Preferences } from '../../services/preferences/contract/index.js';
import { TraceLayoutSchema } from './shared/index.js';
import type { LotelShape } from './shared/index.js';

const PREFERENCES_KEY = 'lotel:trace-layout';

export const workers: WorkersOf<typeof LotelShape> = {
  // 2. Open: the layout as it was left, then each change kept.
  restore: {
    while: ({ model }) => !model.restored,
    run: (self) =>
      Effect.gen(function* () {
        const preferences = yield* Preferences;
        const saved = yield* preferences.load(
          PREFERENCES_KEY,
          TraceLayoutSchema,
        );
        yield* self.send({
          _tag: 'Restored',
          layout: Option.getOrNull(saved),
        });
      }),
  },
  remember: {
    each: ({ model }) => (model.restored ? [JSON.stringify(model.layout)] : []),
    run: (self) =>
      Effect.gen(function* () {
        const preferences = yield* Preferences;
        const { model } = yield* self.get;
        yield* preferences.save(
          PREFERENCES_KEY,
          TraceLayoutSchema,
          model.layout,
        );
      }),
  },
};
