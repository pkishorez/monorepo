import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

// The theme on its own: one value, not an object. It was free text; v2 narrows it to two words, and the step says which word each old text becomes.
export const Theme = ValueESchema.make('Theme', Schema.String)
  .evolve('v2', Schema.Literals(['light', 'dark']), (text) =>
    text === 'night' ? 'dark' : 'light',
  )
  .build();

// The page size, wrapped as it already is: a plain number with no history yet, so that it can grow one later.
const PerPage = ValueESchema.make('PerPage', Schema.Number).build();

// A label copied in from another tool, which stamps a `_v` of its own on everything it exports.
const ImportedLabel = ValueESchema.make(
  'ImportedLabel',
  Schema.Struct({ _v: Schema.String, value: Schema.String }),
).build();

export const whenASettingsShapeChanges = Story.make({
  title: "When a setting's shape changes",
  description:
    'A single value gets a history of its own: where its version stamp lives, how a value from before versions is read, and what a foreign stamp does.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The theme was free text and is now one of two words. What happens to stored themes, and where is the version stamp on a bare word?',
      {
        answer:
          'Stored themes move forward as they are read, exactly like a field of a task does. A bare word has no room for a stamp, so storage wraps it in an envelope, `{ _v, value }`, and one envelope is all that is ever removed: an envelope inside an envelope is refused.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Read a theme stored as free text; the step maps it onto one of the two words.
            const seen = yield* Theme.decode({ _v: 'v1', value: 'night' });
            // Save a theme; it is written as an envelope stamped with the newest version.
            const written = yield* Theme.encode(seen);
            // Read an envelope wrapped in another envelope; the refusal comes back as a value.
            const nested = yield* Theme.decode({
              _v: 'v1',
              value: { _v: 'v1', value: 'night' },
            }).pipe(Effect.flip);
            yield* Story.assert(
              'the old text became one of the new words',
              seen === 'dark',
            );
            yield* Story.assert(
              'the stamp lives on an envelope around the value',
              written._v === 'v2' && written.value === 'dark',
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
            const oldTheme = yield* Theme.decode('night');
            // A bare page size under a shape with no history: read as it is.
            const oldPerPage = yield* PerPage.decode(20);
            // Save both; each comes back wrapped and stamped.
            const themeWritten = yield* Theme.encode(oldTheme);
            const perPageWritten = yield* PerPage.encode(oldPerPage);
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
      'A value comes from another service and carries a `_v` of its own. What happens when it is read?',
      {
        answer:
          'An envelope is recognised by its shape, so the foreign `_v` is read as a version this shape does not have and the read is refused. Save the value through `encode` first: it then sits inside a real envelope, and the foreign stamp passes through untouched.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Read the foreign value as it arrived; its stamp is taken for a version.
            const collided = yield* ImportedLabel.decode({
              _v: 'vendor-3',
              value: 'urgent',
            }).pipe(Effect.flip);
            // Save it first, then read it back; the foreign stamp survives inside the real envelope.
            const stored = yield* ImportedLabel.encode({
              _v: 'vendor-3',
              value: 'urgent',
            });
            const seen = yield* ImportedLabel.decode(stored);
            yield* Story.assert(
              'the foreign stamp is mistaken for a version',
              collided.message === 'Unknown schema version: vendor-3',
            );
            yield* Story.assert(
              'once saved properly, it round-trips',
              seen._v === 'vendor-3' && seen.value === 'urgent',
            );
            return { collided: collided.message, stored, seen };
          }),
        ),
      },
    ),
  ],
});
