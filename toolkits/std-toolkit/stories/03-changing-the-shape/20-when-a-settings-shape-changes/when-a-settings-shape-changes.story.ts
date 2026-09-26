import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema, toSchema } from 'std-toolkit/eschema';

// The theme on its own: one value, not an object. It was free text; v2 narrows it to two words, and the step says which word each old text becomes.
export const Theme = ValueESchema.make('Theme', Schema.String)
  .evolve('v2', Schema.Literals(['light', 'dark']), (text) =>
    text === 'night' ? 'dark' : 'light',
  )
  .build();

// The page size, wrapped as it already is: a plain number with no history yet, so that it can grow one later.
const PerPage = ValueESchema.make('PerPage', Schema.Number).build();

// A label from before versions: an object that happens to have a key called `value`.
const Label = ValueESchema.make(
  'Label',
  Schema.Struct({ value: Schema.String, colour: Schema.String }),
).build();

export const whenASettingsShapeChanges = Story.make({
  title: "When a setting's shape changes",
  description:
    'A single value gets a history of its own: where its version stamp lives, how a value from before versions is read, and what marks an envelope.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The theme was free text and is now one of two words. What happens to stored themes, and where is the version stamp on a bare word?',
      {
        answer:
          'Stored themes move forward as they are read, exactly like a field of a task does. A bare word has no room for a stamp, so storage wraps it in an envelope, `{ _v, _value }`. The `_value` key marks the envelope, so stored data says it belongs to a value schema, and an envelope may carry nothing else. One envelope is all that is ever removed: an envelope inside an envelope is refused.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Read a theme stored as free text; the step maps it onto one of the two words.
            const seen = yield* Schema.decodeUnknownEffect(toSchema(Theme))({
              _v: 'v1',
              _value: 'night',
            });
            // Save a theme; it is written as an envelope stamped with the newest version.
            const written = yield* Schema.encodeEffect(toSchema(Theme))(seen);
            // Read an envelope wrapped in another envelope; the refusal comes back as a value.
            const nested = yield* Schema.decodeUnknownEffect(toSchema(Theme))({
              _v: 'v1',
              _value: { _v: 'v1', _value: 'night' },
            }).pipe(Effect.flip);
            yield* Story.assert(
              'the old text became one of the new words',
              seen === 'dark',
            );
            yield* Story.assert(
              'the stamp lives on an envelope around the value',
              written._v === 'v2' && written._value === 'dark',
            );
            yield* Story.assert(
              'only one envelope is unwrapped',
              nested.message === 'Decode failed',
            );
            return { seen, written, nested: nested.message };
          }),
        ),
      },
    ),
    Story.question(
      'A value was written before versions existed, with no envelope at all. Is it readable, and what is written back?',
      {
        answer:
          'Yes: a value with no envelope is read as v1 and moved forward from there, so wrapping a shape you already have costs nothing and needs no backfill. The next save writes it back as an envelope at the newest version.',
        proof: Story.trace(
          Effect.gen(function* () {
            // A bare theme from before versions: read as v1, then moved forward.
            const oldTheme = yield* Schema.decodeUnknownEffect(toSchema(Theme))(
              'night',
            );
            // A bare page size under a shape with no history: read as it is.
            const oldPerPage = yield* Schema.decodeUnknownEffect(
              toSchema(PerPage),
            )(20);
            // Save both; each comes back wrapped and stamped.
            const themeWritten = yield* Schema.encodeEffect(toSchema(Theme))(
              oldTheme,
            );
            const perPageWritten = yield* Schema.encodeEffect(
              toSchema(PerPage),
            )(oldPerPage);
            yield* Story.assert(
              'bare values read as v1 and move forward',
              oldTheme === 'dark' && oldPerPage === 20,
            );
            yield* Story.assert(
              'the next save wraps them',
              themeWritten._v === 'v2' && perPageWritten._v === 'v1',
            );
            return { oldTheme, oldPerPage, themeWritten, perPageWritten };
          }),
        ),
      },
    ),
    Story.question(
      'What marks a stored value as an envelope, and what happens when one carries something extra?',
      {
        answer:
          'The `_value` key, and nothing else. A value schema may not declare a top-level field starting with `_`, just like an ESchema, so a stored value never has a `_value` of its own. An object with an ordinary `value` key is a bare value from before versions, read as v1. An envelope with anything besides `_v` and `_value` is refused with a `SchemaError`.',
        proof: Story.trace(
          Effect.gen(function* () {
            // A label from before versions; its `value` key is just one of its fields.
            const bare = yield* Schema.decodeUnknownEffect(toSchema(Label))({
              value: 'urgent',
              colour: 'red',
            });
            // Save it, then read it back through the real envelope.
            const stored = yield* Schema.encodeEffect(toSchema(Label))(bare);
            const seen = yield* Schema.decodeUnknownEffect(toSchema(Label))(
              stored,
            );
            // An envelope with an extra key is refused; the refusal comes back as a value.
            const padded = yield* Schema.decodeUnknownEffect(toSchema(Label))({
              ...stored,
              note: 'added by hand',
            }).pipe(Effect.flip);
            yield* Story.assert(
              'an ordinary value key is part of the value',
              bare.value === 'urgent' && bare.colour === 'red',
            );
            yield* Story.assert(
              'once saved, it round-trips',
              seen.value === 'urgent' && seen.colour === 'red',
            );
            yield* Story.assert(
              'an envelope carries nothing but _v and _value',
              padded._tag === 'SchemaError',
            );
            return { bare, stored, seen, padded: padded.message };
          }),
        ),
      },
    ),
  ],
});
