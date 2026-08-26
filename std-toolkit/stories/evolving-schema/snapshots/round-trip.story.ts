import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';
import { Snapshot } from 'std-toolkit/snapshot';

const Note = ESchema.make('Note', {
  text: Schema.String,
  pinned: Schema.Boolean,
}).build();

export const roundTrip = Story.make({
  title: 'A schema you never shipped',
  description:
    'A Snapshot captures a Note as JSON. From that JSON alone — no source code — a live schema comes back and decodes real data.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does a captured Note look like on the wire?', {
      answer:
        'Plain, serializable JSON: every field, every version, with nothing left that only the original TypeScript could run.',
      proof: Effect.gen(function* () {
        const snapshot = Snapshot.capture(Note);
        const json = JSON.parse(JSON.stringify(snapshot));
        yield* Story.assert(
          'the round trip through JSON changes nothing',
          JSON.stringify(json) === JSON.stringify(snapshot),
        );
        return json;
      }),
    }),
    Story.question(
      'Given only that JSON, can something that never saw `Note` decode a real value?',
      {
        answer:
          'Yes. `Snapshot.restore` rebuilds a live schema from the captured JSON, and that schema decodes and validates data exactly like the original.',
        proof: Effect.gen(function* () {
          const captured = Snapshot.capture(Note);
          const json = JSON.parse(JSON.stringify(captured));
          const [restored] = Snapshot.restore(json.schemas);
          const version = restored!.versions[0]!;

          const decodeNote = Schema.decodeUnknownSync(
            version.decoded as Schema.Codec<{
              readonly text: string;
              readonly pinned: boolean;
            }>,
          );
          const decoded = decodeNote({ text: 'Buy milk', pinned: false });
          const rejected = Effect.try(() =>
            decodeNote({ text: 'Buy milk', pinned: 'nope' }),
          );

          yield* Story.assert(
            'the restored schema decodes a real value',
            decoded.text === 'Buy milk' && decoded.pinned === false,
          );
          yield* Story.assert(
            'the restored schema still rejects the wrong shape',
            (yield* Effect.result(rejected))._tag === 'Failure',
          );
          return decoded;
        }),
      },
    ),
  ],
});
