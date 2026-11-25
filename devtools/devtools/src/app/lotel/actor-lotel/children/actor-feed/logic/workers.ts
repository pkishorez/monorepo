import { Effect, Option, Stream } from 'effect';
import type { DataOf, WorkersOf } from '@kestack/kabuki/types';
import { Preferences } from '../../../../services/preferences/contract/index.js';
import { Telemetry } from '../../../../services/telemetry/contract/index.js';
import { FeedPreferences } from './shared/index.js';
import type { FeedShape } from './shared/index.js';

const PREFERENCES_KEY = 'lotel:feed';

const preferencesOf = ({ model }: DataOf<typeof FeedShape>) => ({
  filters: model.filters,
  groupBy: model.groupBy,
  expanded: model.expanded,
});

export const workers: WorkersOf<typeof FeedShape> = {
  watch: {
    run: (self) =>
      Effect.gen(function* () {
        const telemetry = yield* Telemetry;
        yield* telemetry.live.pipe(
          Stream.runForEach(({ spans, ready }) =>
            self.send({ _tag: 'Received', spans, ready }),
          ),
        );
      }),
  },
  restore: {
    while: ({ model }) => !model.restored,
    run: (self) =>
      Effect.gen(function* () {
        const preferences = yield* Preferences;
        const saved = yield* preferences.load(PREFERENCES_KEY, FeedPreferences);
        yield* self.send({
          _tag: 'Restored',
          saved: Option.getOrNull(saved),
        });
      }),
  },
  remember: {
    each: (data) =>
      data.model.restored ? [JSON.stringify(preferencesOf(data))] : [],
    run: (self) =>
      Effect.gen(function* () {
        const preferences = yield* Preferences;
        yield* preferences.save(
          PREFERENCES_KEY,
          FeedPreferences,
          preferencesOf(yield* self.get),
        );
      }),
  },
};
