import { Effect, Schema, Stream } from 'effect';
import { Actor } from 'effect-oak';
import { Url } from '../url/index.js';

/*
 * One query parameter as an Actor: the control that edits it (a search box, a
 * filter) keeps a mirror of it in its Model. Its Lifetime listens to the URL,
 * so the value arrives from the address bar at start and after every change;
 * an edit is written to the URL by a Command and comes back the same way.
 *
 * The URL is the one source of truth, as in Foldkit. The mirror exists
 * because the app's Model cannot be read by its Children: each Actor that
 * draws a parameter listens to the URL itself.
 */

export const makeParam = (options: {
  readonly name: string;
  /** The value to keep for what the URL says: '' for anything unknown. */
  readonly parse?: (raw: string) => string;
}) => {
  const parse = options.parse ?? ((raw: string) => raw);
  const write = (value: string) =>
    Effect.gen(function* () {
      yield* (yield* Url).replace({ [options.name]: value });
    });

  return Actor.make(`Param(${options.name})`, {
    requires: { url: Url },
    model: Schema.Struct({ value: Schema.String }),
    message: Schema.TaggedUnion({
      HeardUrl: { value: Schema.String },
      Edited: { value: Schema.String },
    }),
  }).build({
    init: () => ({ model: { value: '' } }),
    lifetime: (self) =>
      Stream.unwrap(
        Effect.gen(function* () {
          return (yield* Url).query;
        }),
      ).pipe(
        Stream.map((query) =>
          parse(new URLSearchParams(query).get(options.name) ?? ''),
        ),
        Stream.changes,
        Stream.runForEach((value) => self.send({ _tag: 'HeardUrl', value })),
      ),
    update: {
      HeardUrl: ({ value }) => ({ model: { value } }),
      Edited: ({ value }) => ({ model: { value }, command: write(value) }),
    },
  });
};
